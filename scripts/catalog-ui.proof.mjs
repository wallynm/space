// Exercises the real React/TanStack UI with Tauri's official IPC mock.
// All cleanup responses are simulated; this test cannot delete system files.
import { chromium, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const base = process.env.FOLGA_UI_URL || "http://127.0.0.1:1421";
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, timezoneId: "America/Sao_Paulo" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
const bootstrap = `
import { mockIPC, mockWindows } from "/__tests/mocks.js";
import { emit } from "/__tests/event.js";
window.isTauri = true;
mockWindows("main");
const now = Date.now() / 1000;
const file = id => ({ id, path: "/fixture/" + id + ".bin", name: id + ".bin", bytes: 64e6, logicalBytes: 64e6, modified: now, accessed: null, kind: "bin", blocked: null });
let catalog = JSON.parse(localStorage.getItem("folga.test.catalog") || "null") || { id: "100", revision: 1, root: "/fixture", createdAt: now, updatedAt: now, verifiedAt: now, files: [file("a"), file("b"), file("c")], projects: [], warnings: [], visited: 4, bytes: 192e6, incomplete: false };
catalog.cached = true;
const calls = [];
let cleanCount = 0;
let folders = ["folder-one", "folder-two"];
const persist = () => localStorage.setItem("folga.test.catalog", JSON.stringify(catalog));
const publish = async () => { persist(); await emit("catalog-changed", structuredClone(catalog)); };
window.__fixture = { calls, async change(oldId, newId) {
  catalog.files = catalog.files.filter(f => f.id !== oldId);
  catalog.files.push(file(newId)); catalog.revision++; catalog.bytes = catalog.files.length * 64e6; await publish();
}, snapshot: () => structuredClone(catalog) };
mockIPC(async (command, args) => {
  calls.push({ command, args });
  switch (command) {
    case "get_operation": return { id: "", running: false, label: "", startedAt: 0, revision: 0, progress: { visited: 0, path: "" } };
    case "get_disk_info": return { total: 500e9, free: 100e9, used: 400e9, home: "/fixture", volume: "Fixture de teste" };
    case "get_default_roots": return ["/fixture"];
    case "get_last_scan": return { id: "selection-test", createdAt: now, scannedDirs: 4, elapsedMs: 1, roots: ["/fixture"], warnings: [], candidates: [
      { id: "npm-a", path: "/fixture/npm-a", label: "Cache npm A", category: "npm", bytes: 64e6, files: 1, risk: "cache", blocked: null },
      { id: "protected", path: "/fixture/protected", label: "Protegido", category: "npm", bytes: 64e6, files: 1, risk: "cache", blocked: "Pasta protegida" },
      { id: "npm-b", path: "/fixture/npm-b", label: "Cache npm B", category: "npm", bytes: 64e6, files: 1, risk: "cache", blocked: null },
      { id: "dependencies", path: "/fixture/project/node_modules", label: "Dependências node_modules", category: "node_modules", bytes: 64e6, files: 1, risk: "cache", blocked: null }
    ] };
    case "reveal_path": return null;
    case "get_applications": case "get_docker": case "get_duplicates": return null;
    case "get_history": return [];
    case "get_catalog": return structuredClone(catalog);
    case "catalog_children": {
      if (args.path !== catalog.root) return [{ path: args.path + "/nested", name: "nested", bytes: 128e6, directory: true, incomplete: false }];
      return [...folders.map(name => ({ path: catalog.root + "/" + name, name, bytes: 128e6, directory: true, incomplete: false })), ...catalog.files.map(f => ({ path: f.path, name: f.name, bytes: f.bytes, directory: false, incomplete: false }))];
    }
    case "review_folder": return { scanId: catalog.id, revision: catalog.revision, path: args.path, bytes: 128e6, files: 2 };
    case "trash_folder": {
      if (args.revision !== catalog.revision) throw new Error("O mapa mudou. Revise a pasta novamente.");
      folders = folders.filter(name => catalog.root + "/" + name !== args.path);
      catalog.revision++; await publish();
      return { id: "folder-cleanup", createdAt: now, mode: "trash", removed: [args.path], skipped: [], recovery: [], movedBytes: 128e6, removedBytes: 128e6, freedBytes: 0 };
    }
    case "get_index_status": return { watching: true, refreshing: false, phase: "", checkedAt: now, error: null };
    case "get_monitor": return { settings: { enabled: true, notifications: false, threshold: 15 }, samples: [], growth: [] };
    case "get_protection": return { paths: [] };
    case "get_updates": return { currentVersion: ${JSON.stringify(version)}, configured: false, checkOnLaunch: false, phase: "idle", version: null, notes: null, downloaded: 0, total: null, error: null };
    case "trash_files": {
      cleanCount++;
      const removedIds = cleanCount === 1 ? args.ids.filter(id => id === "a") : args.ids;
      const removed = catalog.files.filter(f => removedIds.includes(f.id));
      catalog.files = catalog.files.filter(f => !removedIds.includes(f.id)); catalog.revision++; catalog.bytes = catalog.files.length * 64e6; catalog.cached = false;
      await publish();
      return { id: "cleanup-" + cleanCount, createdAt: now, mode: "trash", removed: removed.map(f => f.path), skipped: args.ids.filter(id => !removedIds.includes(id)).map(id => id + ": preservado na fixture"), recovery: [], movedBytes: removed.length * 64e6, removedBytes: removed.length * 64e6, freedBytes: 0 };
    }
    default: throw new Error("IPC inesperado: " + command);
  }
}, { shouldMockEvents: true });
await import("__FOLGA_ENTRY__");
`;
await page.route(base + "/__tests/**", async (route) => {
  const name = new URL(route.request().url()).pathname.slice("/__tests/".length);
  if (!["mocks.js", "event.js", "core.js", "external/tslib/tslib.es6.js"].includes(name)) throw new Error("Module de teste inesperado");
  await route.fulfill({ contentType: "text/javascript", body: readFileSync(fileURLToPath(new URL("../node_modules/@tauri-apps/api/" + name, import.meta.url)), "utf8") });
});
await page.route(base + "/", async (route) => {
  const response = await route.fetch();
  const original = await response.text();
  const entry = original.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
  if (!entry) throw new Error("Entrada do build não encontrada");
  const html = original.replace(entry[0], '<script type="module">' + bootstrap.replace("__FOLGA_ENTRY__", entry[1]) + '</script>');
  await route.fulfill({ response, body: html });
});
const box = (id) => page.getByRole("checkbox", { name: "Selecionar /fixture/" + id + ".bin", exact: true });
const clean = async () => {
  await page.getByRole("button", { name: "Enviar à Lixeira", exact: true }).click();
  await page.getByRole("checkbox", { name: "Revisei os arquivos selecionados e quero movê-los à Lixeira." }).check();
  await page.getByRole("button", { name: "Confirmar seleção", exact: true }).click();
};
try {
  await page.goto(base + "/#/");
  const candidate = (path) => page.getByRole("checkbox", { name: "Selecionar /fixture/" + path, exact: true });
  await page.getByText("Cache npm A", { exact: true }).click();
  await expect(candidate("npm-a")).toBeChecked();
  await candidate("npm-b").click({ modifiers: ["Shift"] });
  await expect(candidate("npm-b")).toBeChecked();
  await expect(candidate("protected")).not.toBeChecked();
  await expect(candidate("protected")).toBeDisabled();
  await candidate("npm-b").click({ modifiers: ["Shift"] });
  await expect(candidate("npm-a")).not.toBeChecked();
  await expect(candidate("npm-b")).not.toBeChecked();
  await page.getByRole("button", { name: "Pacotes npm", exact: true }).click();
  await page.getByRole("button", { name: "Selecionar todos", exact: true }).click();
  await expect(candidate("npm-a")).toBeChecked();
  await expect(candidate("npm-b")).toBeChecked();
  await page.getByRole("checkbox", { name: "Selecionar todos os itens visíveis", exact: true }).uncheck();
  await expect(candidate("npm-a")).not.toBeChecked();
  await expect(candidate("npm-b")).not.toBeChecked();
  await page.getByRole("button", { name: "node_modules", exact: true }).click();
  await expect(candidate("project/node_modules")).not.toBeChecked();
  await page.getByText("Dependências node_modules", { exact: true }).click();
  await expect(candidate("project/node_modules")).toBeChecked();
  await page.getByRole("button", { name: "Limpar seleção", exact: true }).click();
  await candidate("project/node_modules").focus();
  await page.keyboard.press("Control+a");
  await expect(candidate("project/node_modules")).toBeChecked();
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await expect(candidate("npm-a")).not.toBeChecked();
  await page.getByRole("button", { name: "Limpar seleção", exact: true }).click();
  await page.getByRole("textbox", { name: "Buscar pastas", exact: true }).fill("npm-a");
  await page.getByRole("button", { name: "Selecionar todos", exact: true }).click();
  await expect(candidate("npm-a")).toBeChecked();
  await page.getByRole("textbox", { name: "Buscar pastas", exact: true }).fill("");
  await expect(candidate("npm-b")).not.toBeChecked();
  await candidate("npm-a").locator("..").getByRole("button", { name: "Mostrar /fixture/npm-a no Finder" }).click();
  await expect(candidate("npm-a")).toBeChecked();
  await page.getByRole("button", { name: "Limpar seleção", exact: true }).click();
  await candidate("npm-a").locator("..").focus();
  await page.keyboard.press("Space");
  await expect(candidate("npm-a")).toBeChecked();
  await page.keyboard.press("Meta+a");
  await expect(candidate("npm-b")).toBeChecked();
  await page.getByRole("checkbox", { name: "Selecionar todos os itens visíveis", exact: true }).uncheck();
  await candidate("npm-a").check();
  await expect(page.getByRole("checkbox", { name: "Selecionar todos os itens visíveis", exact: true })).toHaveJSProperty("indeterminate", true);
  const search = page.getByRole("textbox", { name: "Buscar pastas", exact: true });
  await search.fill("npm");
  await search.press("Control+a");
  await expect(candidate("npm-b")).not.toBeChecked();
  await search.fill("");
  await page.setViewportSize({ width: 840, height: 650 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(840);
  await page.setViewportSize({ width: 1280, height: 850 });
  mkdirSync(fileURLToPath(new URL("../screenshots", import.meta.url)), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL("../screenshots/space-selection.jpg", import.meta.url)), fullPage: true, type: "jpeg", quality: 85 });
  await page.getByRole("link", { name: "Explorador", exact: true }).click();
  const currentFolderAction = page.getByRole("button", { name: "Enviar esta pasta à Lixeira", exact: true });
  await expect(currentFolderAction).toBeDisabled();
  await page.getByRole("button", { name: "Enviar folder-one à Lixeira", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("/fixture/folder-one");
  await expect(page.getByRole("dialog").getByRole("button", { name: "Confirmar seleção" })).toBeDisabled();
  await page.getByRole("dialog").getByRole("button", { name: "Voltar", exact: true }).click();
  expect(await page.evaluate(() => window.__fixture.calls.filter(c => c.command === "trash_folder").length)).toBe(0);
  await page.locator(".tool-list .row-link").filter({ hasText: "folder-one" }).click();
  await expect(currentFolderAction).toBeEnabled();
  await page.locator(".tool-list .row-link").filter({ hasText: "nested" }).click();
  await page.setViewportSize({ width: 840, height: 650 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(840);
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.screenshot({ path: fileURLToPath(new URL("../screenshots/space-folder-actions.jpg", import.meta.url)), fullPage: true, type: "jpeg", quality: 85 });
  await currentFolderAction.click();
  await expect(page.getByRole("dialog")).toContainText("/fixture/folder-one/nested");
  await page.getByRole("dialog").getByRole("button", { name: "Voltar", exact: true }).click();
  await page.getByRole("button", { name: "Voltar à pasta anterior" }).click();
  await currentFolderAction.click();
  await page.getByRole("checkbox", { name: "Revisei a pasta e seu conteúdo e quero movê-la à Lixeira.", exact: true }).check();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar seleção" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enviar folder-one à Lixeira", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enviar folder-two à Lixeira", exact: true })).toBeEnabled();
  await expect(currentFolderAction).toBeDisabled();
  const folderRemovals = await page.evaluate(() => window.__fixture.calls.filter(c => c.command === "trash_folder"));
  expect(folderRemovals).toHaveLength(1);
  expect(folderRemovals[0].args.path).toBe("/fixture/folder-one");
  await page.getByRole("tab", { name: "Grandes e antigos", exact: true }).click();
  await expect(box("a")).toBeEnabled(); // A persisted catalog can be used before background audit finishes.
  await box("a").check(); await box("b").check();
  await clean();
  await expect(box("a")).toHaveCount(0);
  await expect(box("b")).toBeChecked(); // Partial success preserves still-valid pending selection.
  await expect(box("c")).not.toBeChecked();
  await clean();
  await expect(box("b")).toHaveCount(0);
  await expect(box("c")).toBeEnabled();
  const cleaningIds = await page.evaluate(() => window.__fixture.calls.filter(c => c.command === "trash_files").map(c => c.args.ids));
  expect(cleaningIds).toEqual([["a", "b"], ["b"]]);
  await page.reload();
  await page.getByRole("tab", { name: "Grandes e antigos", exact: true }).click();
  await expect(box("a")).toHaveCount(0); await expect(box("b")).toHaveCount(0); await expect(box("c")).toBeEnabled();
  await box("c").check();
  await page.evaluate(() => window.__fixture.change("c", "c-new"));
  await expect(box("c")).toHaveCount(0); await expect(box("c-new")).not.toBeChecked();
  await box("c-new").check();
  await page.evaluate(() => window.__fixture.change("absent", "d"));
  await expect(box("c-new")).toBeChecked(); await expect(box("d")).not.toBeChecked();
  expect(await page.evaluate(() => window.__fixture.calls.some(c => c.command === "scan_catalog"))).toBe(false);
  await page.setViewportSize({ width: 840, height: 650 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(840);
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.evaluate(() => {
    const note = document.createElement("div"); note.textContent = "Conferência da interface • IPC simulado • arquivos de teste";
    Object.assign(note.style, { position: "fixed", bottom: "12px", right: "12px", background: "#153e35", color: "white", padding: "8px 14px", borderRadius: "12px", fontSize: "12px", zIndex: "99999" }); document.body.appendChild(note);
  });
  const screenshot = fileURLToPath(new URL(`../screenshots/space-${version}-indice.jpg`, import.meta.url));
  mkdirSync(fileURLToPath(new URL("../screenshots", import.meta.url)), { recursive: true });
  await page.screenshot({ path: screenshot, fullPage: true, type: "jpeg", quality: 85 });
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ tests: ["folder-review-from-row", "folder-review-at-deep-map-level", "cancel-does-not-remove-folder", "folder-cleanup-returns-to-parent-and-keeps-siblings", "row-click-selection", "shift-range-select-and-clear", "blocked-items-preserved", "select-all-filter-and-search", "keyboard-select-all", "node-modules-filter", "finder-does-not-toggle", "persisted-catalog-selectable", "partial-cleanup-preserves-selection", "second-cleanup-only-remaining-selection", "reload-does-not-resurrect-records", "changed-identity-drops-selection", "unrelated-change-keeps-selection", "no-full-scan-required", "minimum-width-840", "no-console-errors"], screenshot, cleaningIds, errors }));
} finally { await browser.close(); }
