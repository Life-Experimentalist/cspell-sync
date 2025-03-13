const esbuild = require("esbuild");
const { join } = require("path");
const args = process.argv.slice(2);

const isProduction = args.includes("--production");
const isWatch = args.includes("--watch");

// Base configuration for extension
const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  sourcemap: !isProduction,
  minify: isProduction,
  target: ["node14"],
};

async function build() {
  try {
    // Build extension
    const extensionResult = await esbuild.build(extensionConfig);
    console.log(
      `Extension build ${
        isProduction ? "production" : "development"
      } completed.`
    );

    if (isWatch) {
      console.log("Watching for changes...");
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

build();

if (isWatch) {
  // Re-run build when files change
  require("fs").watch("src", { recursive: true }, (eventType, filename) => {
    if (!filename.includes("test")) {
      // Only rebuild the extension when non-test files change
      console.log(`File changed: ${filename}. Rebuilding...`);
      build();
    }
  });
}
