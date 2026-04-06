import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const LEGACY_COPY_PATHS = [
  ["src/js", "js"],
  ["src/vendor", "vendor"],
  ["src/data", "data"],
  ["src/images", "images"],
];

function copyLegacyRuntimeFiles() {
  return {
    name: "copy-legacy-runtime-files",
    closeBundle() {
      const projectRoot = process.cwd();
      const distDir = resolve(projectRoot, "dist");

      for (const [fromPath, toPath] of LEGACY_COPY_PATHS) {
        const from = resolve(projectRoot, fromPath);
        const to = resolve(distDir, toPath);

        if (!existsSync(from)) continue;

        cpSync(from, to, {
          recursive: true,
          force: true,
        });
      }
    },
  };
}

export default defineConfig({
  root: "src",
  publicDir: "../public",
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    assetsDir: "css",
  },
  plugins: [copyLegacyRuntimeFiles()],
});
