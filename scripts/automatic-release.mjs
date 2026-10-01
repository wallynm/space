import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { projectPlan } from "./github-release.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const versionFiles = ["package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"];
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const execute = (binary, args, directory) => execFileSync(binary, args, {
  cwd: directory, encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"],
}).trim();

function parts(version) {
  if (!stableVersion.test(version)) throw new Error("A publicação automática exige uma versão estável; use tags manuais para prereleases.");
  return version.split(".").map(BigInt);
}

function compare(left, right) {
  const a = parts(left), b = parts(right);
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

export function nextAutomaticVersion(version, tags) {
  parts(version);
  const latest = tags.filter((tag) => tag.startsWith("v") && stableVersion.test(tag.slice(1)))
    .map((tag) => tag.slice(1)).sort(compare).at(-1);
  // Respect an explicitly increased major/minor version when it has no tag yet.
  if (!latest || compare(version, latest) > 0) return version;
  const [major, minor, patch] = parts(latest);
  return `${major}.${minor}.${patch + 1n}`;
}

export function updateProjectVersions(directory, version) {
  parts(version);
  const previous = projectPlan({}, directory).version;
  const sources = versionFiles.map((file) => readFileSync(join(directory, file), "utf8"));
  const cargoSections = sources[2].split(/(?=^\[)/m);
  const packageIndex = cargoSections.findIndex((section) => section.startsWith("[package]"));
  const cargoName = cargoSections[packageIndex]?.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  const replaceVersion = (section) => {
    let count = 0;
    const result = section.replace(/^version\s*=\s*"([^"]+)"/gm, (line, old) => {
      if (old !== previous) throw new Error("A versão mudou durante a preparação.");
      count++;
      return `version = "${version}"`;
    });
    if (count !== 1) throw new Error("O manifesto deve ter exatamente uma versão do aplicativo.");
    return result;
  };
  cargoSections[packageIndex] = replaceVersion(cargoSections[packageIndex] ?? "");
  const lockSections = sources[3].split("[[package]]");
  const matches = lockSections.map((section, index) => ({ section, index }))
    .filter(({ section }) => section.match(/^name\s*=\s*"([^"]+)"/m)?.[1] === cargoName);
  if (matches.length !== 1) throw new Error("Cargo.lock deve identificar exatamente um pacote do aplicativo.");
  lockSections[matches[0].index] = replaceVersion(matches[0].section);
  const updated = [
    ...sources.slice(0, 2).map((source) => {
      const json = JSON.parse(source);
      json.version = version;
      return `${JSON.stringify(json, null, 2)}\n`;
    }),
    cargoSections.join(""), lockSections.join("[[package]]"),
  ];
  // Validate the whole batch before replacing any manifest; preserve dependency versions.
  for (let index = 0; index < versionFiles.length; index++) {
    const file = join(directory, versionFiles[index]);
    writeFileSync(`${file}.space-release-tmp`, updated[index]);
    renameSync(`${file}.space-release-tmp`, file);
  }
  if (projectPlan({}, directory).version !== version) throw new Error("Os manifestos não ficaram sincronizados.");
}

export function prepareAutomaticRelease({ directory = root, sourceSha }) {
  if (!/^[a-f\d]{40}$/.test(sourceSha ?? "")) throw new Error("Commit de origem inválido.");
  const git = (...args) => execute("git", args, directory);
  if (git("status", "--porcelain")) throw new Error("A preparação exige um checkout limpo.");
  git("fetch", "origin", "refs/heads/main:refs/remotes/origin/main", "--tags");
  const latest = git("rev-parse", "origin/main");
  const parent = git("show", "-s", "--format=%P", latest);
  const marker = `Space-Source-Commit: ${sourceSha}`;
  const retry = parent === sourceSha && git("show", "-s", "--format=%B", latest).split("\n").includes(marker);
  if (latest !== sourceSha && !retry)
    return { skipped: true, reason: "main avançou; aguarde o CI do commit atual." };
  git("checkout", "--detach", latest);
  const current = projectPlan({}, directory);
  parts(current.version);
  const tag = `v${current.version}`;
  const matching = git("tag", "--points-at", latest).split("\n").includes(tag);
  if (retry) {
    const changed = git("diff", "--name-only", sourceSha, latest).split("\n").sort();
    if (!matching || JSON.stringify(changed) !== JSON.stringify([...versionFiles].sort()))
      throw new Error("A retentativa deve apontar para a tag e o commit de versão já preparados.");
  }
  if (matching) return { tag, sha: latest, created: false };
  const tags = git("tag", "--list", "v*").split("\n");
  const version = nextAutomaticVersion(current.version, tags);
  git("config", "user.name", "github-actions[bot]");
  git("config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com");
  if (version !== current.version) {
    updateProjectVersions(directory, version);
    git("add", "--", ...versionFiles);
    git("commit", "-m", `chore(release): Publish Space ${version}`, "-m", marker);
  }
  const releaseTag = `v${version}`;
  git("tag", "-a", releaseTag, "-m", `Space ${version}\n\n${marker}`);
  // No force push: a concurrent merge rejects both refs instead of losing user changes.
  git("push", "--atomic", "origin", "HEAD:refs/heads/main", `refs/tags/${releaseTag}`);
  return { tag: releaseTag, sha: git("rev-parse", "HEAD"), created: true };
}

export function dispatchAutomaticRelease({ tag, repository, run = execute }) {
  if (!tag?.startsWith("v") || !stableVersion.test(tag.slice(1))) throw new Error("Tag automática inválida.");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? "")) throw new Error("Repositório GitHub inválido.");
  try {
    const existing = JSON.parse(run("gh", ["release", "view", tag, "--repo", repository, "--json", "isDraft"]));
    if (!existing.isDraft) return { skipped: true, reason: "Release já publicada.", tag };
  } catch (error) {
    if (!/release not found/i.test(String(error.stderr ?? error.message))) throw error;
  }
  const runs = JSON.parse(run("gh", ["run", "list", "--repo", repository, "--workflow", "release.yml",
    "--branch", tag, "--limit", "20", "--json", "status"]));
  if (runs.some(({ status }) => status !== "completed"))
    return { skipped: true, reason: "Publicação desta tag já está em andamento.", tag };
  run("gh", ["workflow", "run", "release.yml", "--repo", repository, "--ref", tag]);
  return { tag, dispatched: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.env.GITHUB_EVENT_NAME !== "workflow_run") throw new Error("Automação executada apenas após o CI da main.");
  let result;
  switch (process.argv[2]) {
    case "prepare":
      result = prepareAutomaticRelease({ sourceSha: process.env.SPACE_SOURCE_SHA });
      if (process.env.GITHUB_OUTPUT && result.tag) appendFileSync(process.env.GITHUB_OUTPUT, `tag=${result.tag}\n`);
      break;
    case "dispatch":
      result = dispatchAutomaticRelease({ tag: process.env.SPACE_RELEASE_TAG, repository: process.env.GITHUB_REPOSITORY });
      break;
    default:
      throw new Error("Use prepare ou dispatch.");
  }
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${result.tag ? `### ${result.tag}` : "### Publicação ignorada"}\n\n${result.reason ?? "Versão preparada e publicação solicitada automaticamente."}\n`);
}
