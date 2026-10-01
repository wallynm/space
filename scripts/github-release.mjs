import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const architectures = ["aarch64", "x86_64"];
const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const run = (binary, args) => execFileSync(binary, args, {
  encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"],
});

export function releasePlan({ productName, versions, ref = "", event = "" }) {
  const version = versions[0];
  const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/;
  const match = version?.match(semver);
  if (!match || match[4]?.split(".").some((part) => /^0\d+$/.test(part)))
    throw new Error("A versão deve seguir SemVer.");
  if (versions.length !== 4 || versions.some((value) => value !== version))
    throw new Error("package.json, Tauri, Cargo.toml e Cargo.lock devem ter a mesma versão.");
  if (!/^[a-zA-Z][a-zA-Z\d-]*$/.test(productName))
    throw new Error("Nome do produto inválido para os artefatos.");
  const tag = ref.startsWith("refs/tags/") ? ref.slice("refs/tags/".length) : "";
  if (tag && tag !== `v${version}`)
    throw new Error(`A tag deve ser v${version}; recebido ${tag}.`);
  const publish = Boolean(tag && ["push", "workflow_dispatch"].includes(event));
  return { productName, version, tag, publish, prerelease: Boolean(match[4]), prefix: `${productName}_${version}` };
}

export function projectPlan(env = process.env) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const config = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
  const cargo = readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8")
    .split("[package]")[1]?.split(/^\[/m)[0] ?? "";
  const cargoName = cargo.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const lock = readFileSync(join(root, "src-tauri/Cargo.lock"), "utf8")
    .split("[[package]]").find((block) => block.match(/^name = "([^"]+)"/m)?.[1] === cargoName);
  return releasePlan({
    productName: config.productName,
    versions: [pkg.version, config.version, cargoVersion, lock?.match(/^version = "([^"]+)"/m)?.[1]],
    ref: env.GITHUB_REF,
    event: env.GITHUB_EVENT_NAME,
  });
}

function dmgName(plan, arch) {
  if (!architectures.includes(arch)) throw new Error("Arquitetura de release inválida.");
  return `${plan.prefix}_${arch}.dmg`;
}

export function writeChecksum(directory, plan, arch) {
  const name = dmgName(plan, arch);
  writeFileSync(join(directory, `${name}.sha256`), `${digest(join(directory, name))}  ${name}\n`);
}

export function verifiedAssets(directory, plan) {
  return architectures.flatMap((arch) => {
    const name = dmgName(plan, arch);
    const file = join(directory, name);
    const checksum = `${file}.sha256`;
    const expected = `${digest(file)}  ${name}\n`;
    if (readFileSync(checksum, "utf8") !== expected)
      throw new Error(`Checksum inválido: ${name}.`);
    return [file, checksum];
  });
}

export function publishRelease({ directory, plan, repository, execute = run }) {
  if (!plan.publish || plan.tag !== `v${plan.version}`)
    throw new Error("Publicação exige uma tag de versão válida.");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? ""))
    throw new Error("Repositório GitHub inválido.");
  const files = verifiedAssets(directory, plan);
  let existing;
  try {
    existing = JSON.parse(execute("gh", ["release", "view", plan.tag, "--repo", repository, "--json", "isDraft"]));
  } catch (error) {
    // A retry may complete a draft, but network/authentication errors must never be hidden.
    if (!/release not found/i.test(String(error.stderr ?? error.message))) throw error;
  }
  if (existing && !existing.isDraft)
    throw new Error("Esta Release já foi publicada. Use uma nova versão; artefatos publicados não são substituídos.");
  if (existing) {
    execute("gh", ["release", "upload", plan.tag, ...files, "--repo", repository, "--clobber"]);
  } else {
    const notes = `Instaladores para macOS 12 ou superior: Apple Silicon (aarch64) e Intel (x86_64).\n\n` +
      `Os arquivos .sha256 permitem conferir os downloads.\n\n` +
      `Esta edição usa assinatura ad hoc e não tem notarização Apple; o macOS pode exigir autorização de segurança ao abrir. ` +
      `O canal de atualização dentro do app permanece inativo nesta edição.`;
    execute("gh", ["release", "create", plan.tag, ...files, "--repo", repository,
      "--verify-tag", "--draft", "--title", `${plan.productName} ${plan.version}`,
      "--generate-notes", "--notes", notes, ...(plan.prerelease ? ["--prerelease"] : [])]);
  }
  // The release only becomes visible after both installers and checksums have uploaded.
  execute("gh", ["release", "edit", plan.tag, "--repo", repository,
    "--draft=false", `--prerelease=${plan.prerelease}`]);
  return execute("gh", ["release", "view", plan.tag, "--repo", repository, "--json", "url", "--jq", ".url"]).trim();
}

function verifyDmg(plan, arch) {
  if (process.platform !== "darwin") throw new Error("Verificação do DMG requer macOS.");
  const expected = arch === "aarch64" ? "arm64" : "x64";
  assert.equal(process.arch, expected, "O runner deve compilar sua arquitetura nativa.");
  const directory = join(root, "releases");
  const dmg = join(directory, dmgName(plan, arch));
  const scratch = mkdtempSync("/private/tmp/space-ci-verify-");
  const mount = join(scratch, "mount");
  mkdirSync(mount);
  let mounted = false;
  try {
    run("/usr/bin/hdiutil", ["verify", dmg]);
    run("/usr/bin/hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, dmg]);
    mounted = true;
    const app = join(mount, `${plan.productName}.app`);
    run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
    const info = JSON.parse(run("/usr/bin/plutil", ["-convert", "json", "-o", "-", join(app, "Contents/Info.plist")]));
    const config = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
    assert.equal(info.CFBundleName, plan.productName);
    assert.equal(info.CFBundleIdentifier, config.identifier);
    assert.equal(info.CFBundleShortVersionString, plan.version);
    assert.match(info.CFBundleExecutable, /^[a-zA-Z\d_-]+$/);
    const executable = join(app, "Contents/MacOS", info.CFBundleExecutable);
    assert.equal(run("/usr/bin/lipo", ["-archs", executable]).trim(), arch === "aarch64" ? "arm64" : "x86_64");
    assert.deepEqual(readFileSync(join(app, "Contents/Resources/icon.icns")), readFileSync(join(root, "src-tauri/icons/icon.icns")));
    const fixture = join(scratch, "fixture");
    mkdirSync(fixture);
    writeFileSync(join(fixture, "sample.txt"), "Space CI disposable fixture.");
    assert.deepEqual(JSON.parse(run(executable, ["--folga-worker-names", fixture])).Ok, ["sample.txt"]);
    const catalog = JSON.parse(run(executable, ["--folga-worker-catalog", fixture]));
    assert.ok(catalog.Ok, JSON.stringify(catalog));
    assert.equal(catalog.Ok.report.visited, 2);
    assert.deepEqual(catalog.Ok.report.warnings, []);
    writeChecksum(directory, plan, arch);
    console.log(`DMG, assinatura, arquitetura, ícone e workers conferidos: ${dmg}`);
  } finally {
    if (mounted) run("/usr/bin/hdiutil", ["detach", mount]);
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const plan = projectPlan();
  switch (process.argv[2]) {
    case "prepare":
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(process.env.GITHUB_OUTPUT, `publish=${plan.publish}\nprefix=${plan.prefix}\n`);
      console.log(JSON.stringify(plan));
      break;
    case "verify-dmg":
      verifyDmg(plan, process.argv[3]);
      break;
    case "publish":
      console.log(publishRelease({ directory: join(root, "releases"), plan, repository: process.env.GITHUB_REPOSITORY }));
      break;
    default:
      throw new Error("Use prepare, verify-dmg <aarch64|x86_64> ou publish.");
  }
}
