import {
  mkdtempSync,
  cpSync,
  mkdirSync,
  symlinkSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

if (process.platform !== "darwin")
  throw new Error("Este instalador requer macOS.");
const project = fileURLToPath(new URL("..", import.meta.url));
const { productName, version } = JSON.parse(
  readFileSync(join(project, "src-tauri/tauri.conf.json"), "utf8"),
);
const appName = `${productName}.app`;
if (version !== JSON.parse(readFileSync(join(project, "package.json"), "utf8")).version)
  throw new Error("As versões do app e do frontend devem ser iguais.");
if (process.env.FOLGA_UPDATE_URL || process.env.FOLGA_UPDATE_PUBLIC_KEY) {
  const { validateRelease } = await import("./release-config.mjs");
  validateRelease(process.env);
}
if (
  process.env.FOLGA_NOTARY_PROFILE &&
  (!process.env.APPLE_SIGNING_IDENTITY ||
    process.env.APPLE_SIGNING_IDENTITY === "-")
)
  throw new Error("Notarização exige uma identidade Apple válida.");

const target = resolve(
  project,
  process.env.CARGO_TARGET_DIR || "src-tauri/target",
);
const source = join(target, "release/bundle/macos", appName);
if (!existsSync(source))
  throw new Error("Execute pnpm tauri build --bundles app primeiro.");
const output = join(project, "releases");
mkdirSync(output, { recursive: true });
const arch =
  process.arch === "arm64"
    ? "aarch64"
    : process.arch === "x64"
      ? "x86_64"
      : process.arch;
const dmg = resolve(
  output,
  `${productName}_${version}_${arch}.dmg`,
);
const stage = mkdtempSync(join(tmpdir(), "space-package-"));
const run = (binary, args) => execFileSync(binary, args, { stdio: "inherit" });
try {
  const app = join(stage, appName);
  cpSync(source, app, { recursive: true });
  // Stage outside synced Documents: Finder/cloud metadata must not invalidate the signature.
  run("/usr/bin/xattr", ["-crs", app]);
  run("/usr/bin/codesign", [
    "--force",
    "--sign",
    process.env.APPLE_SIGNING_IDENTITY || "-",
    "--options",
    "runtime",
    app,
  ]);
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
  if (process.env.FOLGA_NOTARY_PROFILE) {
    const zip = join(stage, `${productName}-notarize.zip`);
    run("/usr/bin/ditto", ["-c", "-k", "--keepParent", app, zip]);
    run("/usr/bin/xcrun", [
      "notarytool",
      "submit",
      zip,
      "--keychain-profile",
      process.env.FOLGA_NOTARY_PROFILE,
      "--wait",
    ]);
    run("/usr/bin/xcrun", ["stapler", "staple", app]);
    rmSync(zip);
  }
  if (process.env.FOLGA_UPDATE_URL && process.env.FOLGA_UPDATE_PUBLIC_KEY) {
    const archive = join(
      output,
      `${productName}_${version}_${arch}.app.tar.gz`,
    );
    run("/usr/bin/tar", ["-czf", archive, "-C", stage, appName]);
    run("pnpm", [
      "tauri",
      "signer",
      "sign",
      "--app-version",
      version,
      archive,
    ]);
    const signature = readFileSync(archive + ".sig", "utf8").trim();
    const { releaseManifest } = await import("./release-config.mjs");
    const manifest = releaseManifest({
      version,
      arch,
      filename: archive.split("/").at(-1),
      signature,
      downloadBase: process.env.FOLGA_UPDATE_DOWNLOAD_BASE,
      notes: process.env.FOLGA_RELEASE_NOTES || `Melhorias no ${productName}.`,
    });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      join(output, "latest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
  }
  symlinkSync("/Applications", join(stage, "Applications"));
  run("/usr/bin/hdiutil", [
    "create",
    "-ov",
    "-volname",
    productName,
    "-srcfolder",
    stage,
    "-format",
    "UDZO",
    "-fs",
    "HFS+",
    dmg,
  ]);
  run("/usr/bin/hdiutil", ["verify", dmg]);
  if (process.env.FOLGA_NOTARY_PROFILE) {
    run("/usr/bin/xcrun", [
      "notarytool",
      "submit",
      dmg,
      "--keychain-profile",
      process.env.FOLGA_NOTARY_PROFILE,
      "--wait",
    ]);
    run("/usr/bin/xcrun", ["stapler", "staple", dmg]);
  }
  console.log("Instalador pronto: " + dmg);
} finally {
  // Only remove the temporary staging directory created by this process.
  rmSync(stage, { recursive: true, force: true });
}
