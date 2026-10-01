import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releasePlan, writeChecksum, verifiedAssets, publishRelease } from "./github-release.mjs";

const input = { productName: "Space", versions: Array(4).fill("0.5.1"), ref: "refs/tags/v0.5.1", event: "push" };
const plan = releasePlan(input);

test("only matching version tags publish; branch dispatch and PR verification do not", () => {
  assert.equal(plan.publish, true);
  assert.equal(releasePlan({ ...input, event: "workflow_dispatch" }).publish, true);
  assert.equal(releasePlan({ ...input, ref: "refs/heads/main", event: "workflow_dispatch" }).publish, false);
  assert.equal(releasePlan({ ...input, ref: "refs/pull/1/merge", event: "pull_request" }).publish, false);
  assert.throws(() => releasePlan({ ...input, ref: "refs/tags/v0.6.0" }), /tag/);
  assert.throws(() => releasePlan({ ...input, versions: ["0.5.1", "0.5.1", "0.5.0", "0.5.1"] }), /mesma versão/);
});

test("prereleases are identified and unsafe or noncanonical versions are rejected", () => {
  assert.equal(releasePlan({ ...input, versions: Array(4).fill("0.6.0-beta.1"), ref: "refs/tags/v0.6.0-beta.1" }).prerelease, true);
  for (const version of ["01.2.3", "1.2.3-beta.01", "1.2", "1.2.3\ninvalid"])
    assert.throws(() => releasePlan({ ...input, versions: Array(4).fill(version) }));
  assert.throws(() => releasePlan({ ...input, productName: "../Space" }));
});

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "space-release-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const arch of ["aarch64", "x86_64"]) {
    writeFileSync(join(directory, `${plan.prefix}_${arch}.dmg`), `simulated ${arch} installer`);
    writeChecksum(directory, plan, arch);
  }
  return directory;
}

test("both architectures and matching checksums are required before any GitHub mutation", (t) => {
  const directory = fixture(t);
  assert.equal(verifiedAssets(directory, plan).length, 4);
  writeFileSync(join(directory, `${plan.prefix}_aarch64.dmg`), "tampered");
  assert.throws(() => publishRelease({ directory, plan, repository: "wallynm/space", execute: () => assert.fail("GitHub must not be called") }), /Checksum/);
  writeChecksum(directory, plan, "aarch64");
  rmSync(join(directory, `${plan.prefix}_x86_64.dmg`));
  assert.throws(() => verifiedAssets(directory, plan), /ENOENT/);
});

test("published releases are never overwritten, and authentication failures stop publication", (t) => {
  const directory = fixture(t);
  assert.throws(() => publishRelease({ directory, plan, repository: "wallynm/space", execute: () => JSON.stringify({ isDraft: false }) }), /já foi publicada/);
  assert.throws(() => publishRelease({ directory, plan, repository: "wallynm/space", execute: () => { throw new Error("authentication failed"); } }), /authentication/);
  assert.throws(() => publishRelease({ directory, plan: { ...plan, publish: false }, repository: "wallynm/space" }), /tag/);
});

test("fresh releases stay in draft until all assets have uploaded; retries only update drafts", (t) => {
  const directory = fixture(t);
  const calls = [];
  const execute = (binary, args) => {
    calls.push(args);
    if (args[1] === "view" && args.includes("isDraft")) throw new Error("release not found");
    return "https://github.com/wallynm/space/releases/tag/v0.5.1";
  };
  publishRelease({ directory, plan, repository: "wallynm/space", execute });
  const create = calls.find((args) => args[1] === "create");
  assert.ok(create.includes("--draft"));
  assert.ok(create.includes("--verify-tag"));
  assert.equal(create.filter((arg) => arg.endsWith(".dmg") || arg.endsWith(".sha256")).length, 4);
  assert.ok(calls.findIndex((args) => args[1] === "edit") > calls.indexOf(create));
  const retry = [];
  publishRelease({ directory, plan, repository: "wallynm/space", execute: (binary, args) => {
    retry.push(args); return args.includes("isDraft") ? JSON.stringify({ isDraft: true }) : "url";
  } });
  assert.ok(retry.some((args) => args[1] === "upload"));
  assert.equal(retry.some((args) => args[1] === "create"), false);
});
