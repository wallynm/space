import { execFileSync } from "node:child_process";
import { validateRelease } from "./release-config.mjs";
validateRelease(process.env);
execFileSync("pnpm", ["tauri", "build", "--bundles", "app"], {
  stdio: "inherit",
  env: process.env,
});
await import("./package-macos.mjs");
