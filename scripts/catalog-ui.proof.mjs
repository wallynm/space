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
    case "get_last_scan": case "get_applications": case "get_docker": case "get_duplicates": return null;
    case "get_history": return [];
    case "get_catalog": return structuredClone(catalog);
    case "catalog_children": return catalog.files.map(f => ({ path: f.path, name: f.name, bytes: f.bytes, directory: false, incomplete: false }));
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
  await page.goto(base + "/#/explore");
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
  console.log(JSON.stringify({ tests: ["persisted-catalog-selectable", "partial-cleanup-preserves-selection", "second-cleanup-only-remaining-selection", "reload-does-not-resurrect-records", "changed-identity-drops-selection", "unrelated-change-keeps-selection", "no-full-scan-required", "minimum-width-840", "no-console-errors"], screenshot, cleaningIds, errors }));
} finally { await browser.close(); }
