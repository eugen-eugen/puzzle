import { defineConfig } from "vite";
import { copyFileSync, mkdirSync } from "fs";
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
        const outDir = resolve(__dirname, "dist/i18n");
        mkdirSync(outDir, { recursive: true });
        ["en.json", "de.json", "ru.json", "ua.json"].forEach((file) => {
          try {
            copyFileSync(
              resolve(__dirname, `i18n/${file}`),
              resolve(outDir, file)
            );
          } catch (e) {
            console.warn(`Could not copy i18n/${file}:`, e.message);
          }
        });
      },
    },
  ],
  server: {
    port: 3000,
    open: true,
  },
});
