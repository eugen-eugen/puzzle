import { defineConfig } from "vite";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
} from "fs";
import { resolve } from "path";

export default defineConfig(function ({ command, mode }) {
  const isRestrictedMode = process.env.BUILD_MODE === 'restricted';
  
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
    define: {
      __RESTRICTED_MODE__: isRestrictedMode,
    },
    plugins: [
      // HTML transformation plugin for restricted mode
      {
        name: "transform-html",
        transformIndexHtml(html) {
          if (isRestrictedMode) {
            console.log('[restricted mode] Hiding control bar and removing manifest in HTML');
            // Remove manifest.json link
            html = html.replace(/<link rel="manifest" href="manifest\.json"[^>]*>\s*/gi, '');
            
            // Add CSS to hide the control bar in the head
            const styleTag = '<style>.top-bar { display: none !important; }</style>\n';
            html = html.replace('</head>', styleTag + '</head>');
            
            return html;
          }
        },
      },
      (function () {
        let resolvedConfig;
        return {
          name: "process-manifest",
          configResolved: function (config) {
            resolvedConfig = config;
          },
          closeBundle: function () {
            // Skip manifest processing in restricted mode
            if (isRestrictedMode) {
              return;
            }
            
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
            // Skip asset-manifest generation in restricted mode
            if (isRestrictedMode) {
              console.log('[restricted mode] Skipping asset-manifest.json generation');
              return;
            }
            
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
          // Skip copying local pictures in restricted mode
          if (isRestrictedMode) {
            console.log(`[restricted mode] Skipping local pictures`);
            
            // Still copy remote-pictures.json and LICENSE
            const outDir = resolve(__dirname, "dist/pictures");
            mkdirSync(outDir, { recursive: true });
            
            const remotePicturesPath = resolve(__dirname, "pictures", "remote-pictures.json");
            try {
              copyFileSync(
                remotePicturesPath,
                resolve(outDir, "remote-pictures.json")
              );
              console.log(`Copied remote-pictures.json to dist/pictures`);
            } catch (e) {
              console.warn(`Could not copy remote-pictures.json:`, e.message);
            }

            // Copy LICENSE file to dist
            try {
              const licensePath = resolve(__dirname, "LICENSE");
              copyFileSync(licensePath, resolve(__dirname, "dist/LICENSE"));
              console.log(`Copied LICENSE to dist`);
            } catch (e) {
              console.warn(`Could not copy LICENSE:`, e.message);
            }
            
            return;
          }

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

            // Copy pictures.json if it exists (don't generate it)
            const picturesJsonPath = resolve(srcDir, "pictures.json");
            try {
              copyFileSync(picturesJsonPath, resolve(outDir, "pictures.json"));
              console.log(`Copied pictures.json to dist/pictures`);
            } catch (e) {
              console.warn(`Could not copy pictures.json:`, e.message);
            }

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

            // Copy LICENSE file to dist
            try {
              const licensePath = resolve(__dirname, "LICENSE");
              copyFileSync(licensePath, resolve(__dirname, "dist/LICENSE"));
              console.log(`Copied LICENSE to dist`);
            } catch (e) {
              console.warn(`Could not copy LICENSE:`, e.message);
            }

            console.log(
              `Copied ${files.length} picture files to dist/pictures`
            );
          } catch (e) {
            console.warn(`Could not copy pictures:`, e.message);
          }
        },
      },
      {
        name: "remove-pwa-files-restricted",
        closeBundle: function () {
          if (isRestrictedMode) {
            console.log('[restricted mode] Removing PWA files');
            const distDir = resolve(__dirname, "dist");
            
            // Remove service-worker.js
            try {
              const swPath = resolve(distDir, "service-worker.js");
              if (existsSync(swPath)) {
                unlinkSync(swPath);
                console.log('Removed service-worker.js');
              }
            } catch (e) {
              console.warn('Could not remove service-worker.js:', e.message);
            }
            
            // Remove manifest.json
            try {
              const manifestPath = resolve(distDir, "manifest.json");
              if (existsSync(manifestPath)) {
                unlinkSync(manifestPath);
                console.log('Removed manifest.json');
              }
            } catch (e) {
              console.warn('Could not remove manifest.json:', e.message);
            }
            
            // Remove asset-manifest.json (should not be generated, but just in case)
            try {
              const assetManifestPath = resolve(distDir, "asset-manifest.json");
              if (existsSync(assetManifestPath)) {
                unlinkSync(assetManifestPath);
                console.log('Removed asset-manifest.json');
              }
            } catch (e) {
              console.warn('Could not remove asset-manifest.json:', e.message);
            }
          }
        },
      },
      {
        name: "generate-pictures-dev",
        configureServer: function (server) {
          // Check if pictures.json already exists - don't overwrite it
          const picturesJsonPath = resolve(
            __dirname,
            "pictures",
            "pictures.json"
          );

          try {
            if (existsSync(picturesJsonPath)) {
              console.log(`pictures.json already exists, skipping generation`);
              return;
            }

            // Only generate if it doesn't exist
            const srcDir = resolve(__dirname, "pictures");
            const files = readdirSync(srcDir).filter(function (file) {
              return /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file);
            });

            const picturesJson = { pictures: files };
            writeFileSync(
              picturesJsonPath,
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
