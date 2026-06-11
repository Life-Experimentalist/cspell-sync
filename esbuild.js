// @ts-check
const esbuild = require("esbuild");
const args = process.argv.slice(2);

const isProduction = args.includes("--production");
const isWatch = args.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const config = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  sourcemap: !isProduction,
  minify: isProduction,
  target: ["node20"],
};

async function main() {
  if (isWatch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
    console.log("Watching for changes… (Ctrl+C to stop)");
  } else {
    await esbuild.build(config);
    console.log(
      `Build (${isProduction ? "production" : "development"}) complete.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
