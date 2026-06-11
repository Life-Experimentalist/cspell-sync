#!/usr/bin/env node
// Builds VSIX and source zip into releases/{version}/
// Usage: node scripts/package.js

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const ROOT = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const { version } = pkg;
const releaseDir = path.join(ROOT, "releases", version);

// On Windows, npx is a .cmd file and requires the .cmd extension
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

fs.mkdirSync(releaseDir, { recursive: true });

// ── 1. Build production bundle ───────────────────────────────────────────────
console.log("Building production bundle…");
run(process.execPath, ["./esbuild.js", "--production"]);

// ── 2. Package VSIX ──────────────────────────────────────────────────────────
const vsixName = `cspell-sync-v${version}.vsix`;
const vsixPath = path.join(releaseDir, vsixName);
console.log(`\nPackaging VSIX → releases/${version}/${vsixName}`);
run(npx, ["@vscode/vsce", "package", "--out", vsixPath]);

// ── 3. Create source zip ─────────────────────────────────────────────────────
const zipName = `cspell-sync-source-v${version}.zip`;
const zipPath = path.join(releaseDir, zipName);
console.log(`\nCreating source zip → releases/${version}/${zipName}`);

const IGNORE_PATTERNS = [
  "node_modules/**",
  "dist/**",
  "out/**",
  "releases/**",
  ".git/**",
  ".vscode-test/**",
  "test-workspace/**",
  "test-fixtures/**",
  "icon_og.png",
  "*.vsix",
];

const output = fs.createWriteStream(zipPath);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  const kb = (archive.pointer() / 1024).toFixed(1);
  console.log(`\n✓ Source zip: ${kb} KB`);
  console.log(`\nRelease artifacts:`);
  fs.readdirSync(releaseDir).forEach((f) =>
    console.log(`  releases/${version}/${f}`)
  );
});

archive.on("error", (err) => {
  throw err;
});

archive.pipe(output);
archive.glob("**", { cwd: ROOT, ignore: IGNORE_PATTERNS, dot: true });
archive.finalize();
