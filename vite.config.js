import { defineConfig } from "vite";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  readFileSync,
} from "fs";
import { resolve } from "path";

export default defineConfig(function ({ command, mode }) {
  return {
    base: "/puzzle/",
    build: {
      outDir: "dist",
      rollupOptions: {
        input: {
          main: "./index.html",
        },
      },
    },
    plugins: [
      (function () {
        let resolvedConfig;
        return {
          name: "process-manifest",
          configResolved: function (config) {
            resolvedConfig = config;
          },
          closeBundle: function () {
            const manifestPath = resolve(__dirname, "dist/manifest.json");

            try {
              const manifestContent = readFileSync(manifestPath, "utf-8");
              const manifest = JSON.parse(manifestContent);

              // Get base from config (defaults to "/puzzle/" but can be overridden by CLI)
              const base = resolvedConfig?.base || "/puzzle/";

              // Update start_url and scope with the base path
              manifest.start_url = base;
              manifest.scope = base;

              writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
              console.log(`Processed manifest.json with base: ${base}`);
            } catch (e) {
              console.warn(`Could not process manifest.json:`, e.message);
            }
          },
        };
      })(),
      (function () {
        let resolvedConfig;
        return {
          name: "generate-asset-manifest",
          configResolved: function (config) {
            resolvedConfig = config;
          },
          closeBundle: function () {
            const distDir = resolve(__dirname, "dist");
            const assetsDir = resolve(distDir, "assets");

            try {
              const files = readdirSync(assetsDir);
              const assets = {
                js: files.filter(function (f) {
                  return f.endsWith(".js");
                }),
                css: files.filter(function (f) {
                  return f.endsWith(".css");
                }),
              };

              // Get base from config (defaults to "/puzzle/" but can be overridden by CLI)
              const base = resolvedConfig?.base || "/puzzle/";
              // Ensure trailing slash for consistency
              const baseNormalized = base.endsWith("/") ? base : base + "/";

              const assetManifest = {
                version: Date.now(),
                base: baseNormalized,
                assets: assets,
              };

              writeFileSync(
                resolve(distDir, "asset-manifest.json"),
                JSON.stringify(assetManifest, null, 2)
              );
              console.log(
                `Generated asset-manifest.json with base: ${baseNormalized}, ${assets.js.length} JS and ${assets.css.length} CSS files`
              );
            } catch (e) {
              console.warn(
                `Could not generate asset-manifest.json:`,
                e.message
              );
            }
          },
        };
      })(),
      {
        name: "copy-i18n",
        closeBundle: function () {
          const srcDir = resolve(__dirname, "i18n");
          const outDir = resolve(__dirname, "dist/i18n");
          mkdirSync(outDir, { recursive: true });

          try {
            const files = readdirSync(srcDir).filter(function (file) {
              return file.endsWith(".json");
            });
            files.forEach(function (file) {
              copyFileSync(resolve(srcDir, file), resolve(outDir, file));
            });
            console.log(`Copied ${files.length} i18n files to dist/i18n`);
          } catch (e) {
            console.warn(`Could not copy i18n files:`, e.message);
          }
        },
      },
      {
        name: "copy-pictures",
        closeBundle: function () {
          const srcDir = resolve(__dirname, "pictures");
          const outDir = resolve(__dirname, "dist/pictures");
          mkdirSync(outDir, { recursive: true });

          try {
            const files = readdirSync(srcDir).filter(function (file) {
              return /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file);
            });
            files.forEach(function (file) {
              copyFileSync(resolve(srcDir, file), resolve(outDir, file));
            });

            // Generate pictures.json with list of all available pictures
            const picturesJson = { pictures: files };
            writeFileSync(
              resolve(outDir, "pictures.json"),
              JSON.stringify(picturesJson, null, 2)
            );

            // Copy remote-pictures.json if it exists
            const remotePicturesPath = resolve(srcDir, "remote-pictures.json");
            try {
              copyFileSync(
                remotePicturesPath,
                resolve(outDir, "remote-pictures.json")
              );
              console.log(`Copied remote-pictures.json to dist/pictures`);
            } catch (e) {
              console.warn(`Could not copy remote-pictures.json:`, e.message);
            }

            console.log(
              `Copied ${files.length} picture files to dist/pictures`
            );
            console.log(`Generated pictures.json with ${files.length} entries`);
          } catch (e) {
            console.warn(`Could not copy pictures:`, e.message);
          }
        },
      },
      {
        name: "generate-pictures-dev",
        configureServer: function (server) {
          // Generate pictures.json in dev mode
          const srcDir = resolve(__dirname, "pictures");
          const picturesDir = resolve(__dirname, "pictures");

          try {
            const files = readdirSync(srcDir).filter(function (file) {
              return /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file);
            });

            const picturesJson = { pictures: files };
            writeFileSync(
              resolve(picturesDir, "pictures.json"),
              JSON.stringify(picturesJson, null, 2)
            );

            console.log(
              `Generated pictures.json for dev with ${files.length} entries`
            );
          } catch (e) {
            console.warn(`Could not generate pictures.json:`, e.message);
          }
        },
      },
    ],
    server: {
      port: 3000,
      open: true,
    },
  };
});
