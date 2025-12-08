import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.js"],
    include: ["test/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["js/**/*.js"],
      exclude: [
        "test/**/*.test.js",
        "test/**/*.spec.js",
        "node_modules/**",
        "dist/**",
      ],
    },
  },
});
