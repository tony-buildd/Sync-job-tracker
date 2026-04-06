import * as esbuild from "esbuild";
import { cpSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, "dist");
const srcDir = resolve(__dirname, "src");

const isWatch = process.argv.includes("--watch");

// Ensure dist/ exists
mkdirSync(distDir, { recursive: true });

// Copy static assets to dist/
function copyStatic() {
  // Copy manifest.json
  cpSync(resolve(__dirname, "manifest.json"), resolve(distDir, "manifest.json"));

  // Copy popup.html
  cpSync(resolve(srcDir, "popup.html"), resolve(distDir, "popup.html"));

  // Copy popup.css
  cpSync(resolve(srcDir, "popup.css"), resolve(distDir, "popup.css"));

  // Copy icons if they exist
  const iconsDir = resolve(__dirname, "icons");
  if (existsSync(iconsDir)) {
    cpSync(iconsDir, resolve(distDir, "icons"), { recursive: true });
  }
}

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: [
    resolve(srcDir, "popup.ts"),
    resolve(srcDir, "background.ts"),
  ],
  bundle: true,
  outdir: distDir,
  format: "esm",
  target: "es2020",
  minify: !isWatch,
  sourcemap: isWatch ? "inline" : false,
  logLevel: "info",
};

async function build() {
  try {
    copyStatic();

    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log("Watching for changes...");
    } else {
      await esbuild.build(buildOptions);
      console.log("Build complete: extension/dist/");
    }
  } catch (err) {
    console.error("Build failed:", err);
    process.exit(1);
  }
}

build();
