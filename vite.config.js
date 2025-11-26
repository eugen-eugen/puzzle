import { defineConfig } from "vite";
import { copyFileSync, mkdirSync, readdirSync } from "fs";
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
          console.log(`Copied ${files.length} picture files to dist/pictures`);
        } catch (e) {
          console.warn(`Could not copy pictures:`, e.message);
        }
      },
    },
  ],
  server: {
    port: 3000,
    open: true,
  },
});
