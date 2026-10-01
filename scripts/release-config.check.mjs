import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRelease, releaseManifest } from "./release-config.mjs";
const env = {
  FOLGA_UPDATE_URL: "https://updates.example.com/latest.json",
  FOLGA_UPDATE_DOWNLOAD_BASE: "https://updates.example.com/releases",
  FOLGA_UPDATE_PUBLIC_KEY: "public-key",
  TAURI_SIGNING_PRIVATE_KEY_PATH: "/private/key",
};
test("release refuses insecure endpoints and unsigned packages", () => {
  assert.throws(() =>
    validateRelease({
      ...env,
      FOLGA_UPDATE_URL: "http://updates.example.com/latest.json",
    }),
  );
  assert.throws(() =>
    validateRelease({ ...env, TAURI_SIGNING_PRIVATE_KEY_PATH: undefined }),
  );
  assert.throws(() =>
    validateRelease({ ...env, FOLGA_NOTARY_PROFILE: "profile" }),
  );
  assert.doesNotThrow(() => validateRelease(env));
});
test("manifest identifies the signed package for the target without changing the release path", () => {
  const m = releaseManifest({
    version: "0.5.1",
    arch: "aarch64",
    filename: "Space_0.5.1_aarch64.app.tar.gz",
    signature: "signature",
    downloadBase: env.FOLGA_UPDATE_DOWNLOAD_BASE,
    notes: "Release",
  });
  assert.equal(
    m.platforms["darwin-aarch64"].url,
    "https://updates.example.com/releases/Space_0.5.1_aarch64.app.tar.gz",
  );
  assert.equal(m.platforms["darwin-aarch64"].signature, "signature");
  assert.throws(() =>
    releaseManifest({
      version: "0.5.1",
      arch: "aarch64",
      filename: "../other",
      signature: "signature",
      downloadBase: env.FOLGA_UPDATE_DOWNLOAD_BASE,
    }),
  );
});
