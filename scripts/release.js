#!/usr/bin/env node
// Full local release: build artifacts, commit to releases/{version}/, create git tag.
// Usage:
//   node scripts/release.js          -- build, commit, tag (no push)
//   node scripts/release.js --push   -- also push branch + tag to origin

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const { version } = pkg;
const tag = `v${version}`;
const releaseDir = path.join(ROOT, "releases", version);
const doPush = process.argv.includes("--push");

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function capture(cmd, args) {
  return (spawnSync(cmd, args, { encoding: "utf8", cwd: ROOT }).stdout || "").trim();
}

// ── 1. Clean working tree (outside the target release dir) ──────────────────
console.log("Checking git status…");
const dirty = capture("git", ["status", "--porcelain"])
  .split("\n")
  .filter((l) => l.trim() && !l.includes(`releases/${version}`));
if (dirty.length) {
  console.error("Uncommitted changes outside releases/ — commit or stash first:");
  dirty.forEach((l) => console.error(" ", l));
  process.exit(1);
}

// ── 2. Tag must not already exist ────────────────────────────────────────────
if (capture("git", ["tag", "-l", tag]) === tag) {
  console.error(`Tag ${tag} already exists. Bump version in package.json first.`);
  process.exit(1);
}

// ── 3. Build VSIX + source zip ───────────────────────────────────────────────
console.log(`\nBuilding release artifacts for v${version}…`);
run(process.execPath, ["scripts/package.js"]);

// ── 4. Verify expected artifacts are present ─────────────────────────────────
const vsixPath = path.join(releaseDir, `cspell-sync-v${version}.vsix`);
const zipPath  = path.join(releaseDir, `cspell-sync-source-v${version}.zip`);
if (!fs.existsSync(vsixPath) || !fs.existsSync(zipPath)) {
  console.error("Expected artifacts missing after build — aborting.");
  process.exit(1);
}

// ── 5. Stage the release directory ───────────────────────────────────────────
console.log(`\nStaging releases/${version}/…`);
run("git", ["add", `releases/${version}`]);

// Bail if nothing actually staged (already committed)
const staged = capture("git", ["diff", "--cached", "--name-only"]);
if (!staged) {
  console.log("Nothing new to commit — artifacts already tracked.");
} else {
  // ── 6. Commit ──────────────────────────────────────────────────────────────
  console.log("Committing release artifacts…");
  run("git", ["commit", "-m", `chore: add release artifacts for v${version}`]);
}

// ── 7. Annotated tag ─────────────────────────────────────────────────────────
console.log(`Creating tag ${tag}…`);
run("git", ["tag", "-a", tag, "-m", `Release ${tag}`]);

const sha = capture("git", ["rev-parse", "--short", "HEAD"]);
console.log(`\n✓ Local release ready:`);
console.log(`  Commit : ${sha}`);
console.log(`  Tag    : ${tag}`);
console.log(`  VSIX   : releases/${version}/cspell-sync-v${version}.vsix`);
console.log(`  Zip    : releases/${version}/cspell-sync-source-v${version}.zip`);

// ── 8. Optionally push (triggers GitHub Actions release workflow) ─────────────
if (doPush) {
  console.log("\nPushing branch and tag to origin…");
  run("git", ["push", "origin", "main"]);
  run("git", ["push", "origin", tag]);
  console.log(`\n✓ Pushed. GitHub Actions will publish to VS Code Marketplace.`);
} else {
  console.log(`\nTo publish, push the tag:`);
  console.log(`  git push origin main && git push origin ${tag}`);
  console.log(`  — or run with --push next time`);
}
