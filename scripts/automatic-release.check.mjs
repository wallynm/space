import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nextAutomaticVersion, updateProjectVersions, prepareAutomaticRelease, dispatchAutomaticRelease } from "./automatic-release.mjs";
import { projectPlan } from "./github-release.mjs";

test("automatic versions advance patches numerically and respect explicit major/minor changes", () => {
  assert.equal(nextAutomaticVersion("0.5.1", ["v0.5.1"]), "0.5.2");
  assert.equal(nextAutomaticVersion("0.5.1", ["v0.5.9", "v0.5.10", "v0.5.2", "v1.0.0-beta.1", "unrelated"]), "0.5.11");
  assert.equal(nextAutomaticVersion("1.0.0", ["v0.5.9"]), "1.0.0");
  assert.equal(nextAutomaticVersion("0.5.1", []), "0.5.1");
  assert.throws(() => nextAutomaticVersion("0.6.0-beta.1", []), /estável/);
  assert.throws(() => nextAutomaticVersion("00.5.1", []), /estável/);
});

function fixture(t) {
  const scratch = mkdtempSync(join(tmpdir(), "space-auto-release-test-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const origin = join(scratch, "origin.git");
  const directory = join(scratch, "checkout");
  const git = (cwd, ...args) => execFileSync("git", args, {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  git(scratch, "init", "--bare", "--initial-branch=main", origin);
  git(scratch, "clone", origin, directory);
  git(directory, "config", "user.name", "Space test");
  git(directory, "config", "user.email", "space-test@example.com");
  mkdirSync(join(directory, "src-tauri"));
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "space", version: "0.5.1" }, null, 2) + "\n");
  writeFileSync(join(directory, "src-tauri/tauri.conf.json"), JSON.stringify({ productName: "Space", version: "0.5.1" }, null, 2) + "\n");
  writeFileSync(join(directory, "src-tauri/Cargo.toml"), '[package]\nname = "folga"\nversion = "0.5.1"\n\n[dependencies]\nexample = "0.5.1"\n');
  writeFileSync(join(directory, "src-tauri/Cargo.lock"), 'version = 4\n\n[[package]]\nname = "example"\nversion = "0.5.1"\n\n[[package]]\nname = "folga"\nversion = "0.5.1"\ndependencies = ["example"]\n');
  git(directory, "add", ".");
  git(directory, "commit", "-m", "Add fixture");
  git(directory, "tag", "-a", "v0.5.1", "-m", "Space 0.5.1");
  writeFileSync(join(directory, "CHANGELOG.md"), "A merged change after the published version.\n");
  git(directory, "add", "CHANGELOG.md");
  git(directory, "commit", "-m", "Merge fixture change");
  git(directory, "push", "origin", "main", "v0.5.1");
  const sourceSha = git(directory, "rev-parse", "HEAD");
  const collaborator = () => {
    const other = join(scratch, "collaborator");
    git(scratch, "clone", origin, other);
    git(other, "config", "user.name", "Collaborator");
    git(other, "config", "user.email", "collaborator@example.com");
    writeFileSync(join(other, "README.md"), "A concurrent user change.\n");
    git(other, "add", "README.md");
    git(other, "commit", "-m", "Preserve user change");
    return other;
  };
  return { scratch, origin, directory, sourceSha, git, collaborator };
}

test("a real Git release synchronizes all manifests, pushes an annotated tag and retries without another version", (t) => {
  const f = fixture(t);
  const result = prepareAutomaticRelease(f);
  assert.equal(result.tag, "v0.5.2");
  assert.equal(result.created, true);
  assert.equal(projectPlan({}, f.directory).version, "0.5.2");
  assert.equal(f.git(f.origin, "rev-parse", "main"), result.sha);
  assert.equal(f.git(f.origin, "rev-parse", "v0.5.2^{}"), result.sha);
  assert.equal(f.git(f.origin, "cat-file", "-t", "v0.5.2"), "tag");
  assert.equal(f.git(f.directory, "rev-parse", "HEAD^"), f.sourceSha);
  assert.match(readFileSync(join(f.directory, "src-tauri/Cargo.lock"), "utf8"), /name = "example"\nversion = "0\.5\.1"/);
  assert.match(readFileSync(join(f.directory, "src-tauri/Cargo.toml"), "utf8"), /example = "0\.5\.1"/);
  const retry = prepareAutomaticRelease(f);
  assert.deepEqual(retry, { tag: result.tag, sha: result.sha, created: false });
  assert.equal(f.git(f.origin, "tag", "--list"), "v0.5.1\nv0.5.2");
});

test("an unreleased explicit version tags the tested source without an empty version commit", (t) => {
  const f = fixture(t);
  updateProjectVersions(f.directory, "0.6.0");
  f.git(f.directory, "add", ".");
  f.git(f.directory, "commit", "-m", "Set next minor version");
  f.git(f.directory, "push", "origin", "main");
  f.sourceSha = f.git(f.directory, "rev-parse", "HEAD");
  const result = prepareAutomaticRelease(f);
  assert.equal(result.tag, "v0.6.0");
  assert.equal(result.sha, f.sourceSha);
  assert.deepEqual(prepareAutomaticRelease(f), { tag: "v0.6.0", sha: f.sourceSha, created: false });
});

test("superseded CI runs leave current main and existing tags unchanged", (t) => {
  const f = fixture(t);
  const other = f.collaborator();
  f.git(other, "push", "origin", "main");
  const current = f.git(f.origin, "rev-parse", "main");
  assert.equal(prepareAutomaticRelease(f).skipped, true);
  assert.equal(f.git(f.origin, "rev-parse", "main"), current);
  assert.equal(f.git(f.origin, "tag", "--list"), "v0.5.1");
});

test("an atomic push rejects a merge racing with versioning and publishes neither ref", (t) => {
  const f = fixture(t);
  const other = f.collaborator();
  const hook = join(f.directory, ".git/hooks/pre-push");
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  writeFileSync(hook, `#!/bin/sh\nexec git -C ${quote(other)} push origin HEAD:refs/heads/main\n`);
  chmodSync(hook, 0o755);
  assert.throws(() => prepareAutomaticRelease(f), /atomic|failed|rejected/i);
  assert.equal(f.git(f.origin, "rev-parse", "main"), f.git(other, "rev-parse", "HEAD"));
  assert.equal(f.git(f.origin, "tag", "--list"), "v0.5.1");
});

test("inconsistent versions or dirty local work prevent automatic changes", (t) => {
  const f = fixture(t);
  const cargo = readFileSync(join(f.directory, "src-tauri/Cargo.toml"), "utf8");
  writeFileSync(join(f.directory, "src-tauri/tauri.conf.json"), '{"productName":"Space","version":"0.4.0"}\n');
  assert.throws(() => updateProjectVersions(f.directory, "0.5.2"), /mesma versão/);
  assert.equal(readFileSync(join(f.directory, "src-tauri/Cargo.toml"), "utf8"), cargo);
  assert.throws(() => prepareAutomaticRelease(f), /limpo/);
  assert.equal(f.git(f.origin, "tag", "--list"), "v0.5.1");
});

const dispatchInput = { tag: "v0.5.2", repository: "wallynm/space" };
test("dispatch skips public releases and propagates authentication/network failures", () => {
  const calls = [];
  const result = dispatchAutomaticRelease({ ...dispatchInput, run: (binary, args) => {
    calls.push(args); return '{"isDraft":false}';
  } });
  assert.equal(result.skipped, true);
  assert.equal(calls.length, 1);
  assert.throws(() => dispatchAutomaticRelease({ ...dispatchInput, run: () => { throw new Error("authentication failed"); } }), /authentication/);
  assert.throws(() => dispatchAutomaticRelease({ ...dispatchInput, run: () => { throw new Error("network failed"); } }), /network/);
});

test("dispatch avoids duplicate active builds and explicitly starts the tag workflow on retries", () => {
  const calls = [];
  const run = (binary, args) => {
    calls.push(args);
    if (args[0] === "release") throw new Error("release not found");
    if (args[0] === "run") return '[{"status":"completed"}]';
    return "";
  };
  assert.equal(dispatchAutomaticRelease({ ...dispatchInput, run }).dispatched, true);
  assert.deepEqual(calls.at(-1), ["workflow", "run", "release.yml", "--repo", "wallynm/space", "--ref", "v0.5.2"]);
  assert.equal(dispatchAutomaticRelease({ ...dispatchInput, run: (binary, args) =>
    args[0] === "release" ? '{"isDraft":true}' : '[{"status":"in_progress"}]',
  }).skipped, true);
});
