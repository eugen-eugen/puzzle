import { defineConfig } from "vite";
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { resolve } from "path";

export default defineConfig({
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
    {
      name: "copy-i18n",
      closeBundle() {
        const srcDir = resolve(__dirname, "i18n");
        const outDir = resolve(__dirname, "dist/i18n");
        mkdirSync(outDir, { recursive: true });

        try {
          const files = readdirSync(srcDir).filter((file) =>
            file.endsWith(".json")
          );
          files.forEach((file) => {
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
      closeBundle() {
        const srcDir = resolve(__dirname, "pictures");
        const outDir = resolve(__dirname, "dist/pictures");
        mkdirSync(outDir, { recursive: true });

        try {
          const files = readdirSync(srcDir).filter((file) =>
            /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file)
          );
          files.forEach((file) => {
            copyFileSync(resolve(srcDir, file), resolve(outDir, file));
          });
          
          // Generate pictures.json with list of all available pictures
          const picturesJson = { pictures: files };
          writeFileSync(
            resolve(outDir, "pictures.json"),
            JSON.stringify(picturesJson, null, 2)
          );
          
          console.log(`Copied ${files.length} picture files to dist/pictures`);
          console.log(`Generated pictures.json with ${files.length} entries`);
        } catch (e) {
          console.warn(`Could not copy pictures:`, e.message);
        }
      },
    },
    {
      name: "generate-pictures-dev",
      configureServer(server) {
        // Generate pictures.json in dev mode
        const srcDir = resolve(__dirname, "pictures");
        const picturesDir = resolve(__dirname, "pictures");
        
        try {
          const files = readdirSync(srcDir).filter((file) =>
            /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file)
          );
          
          const picturesJson = { pictures: files };
          writeFileSync(
            resolve(picturesDir, "pictures.json"),
            JSON.stringify(picturesJson, null, 2)
          );
          
          console.log(`Generated pictures.json for dev with ${files.length} entries`);
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
});
