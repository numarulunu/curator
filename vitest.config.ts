import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environmentMatchGlobs: [["tests/renderer/**/*.test.tsx", "jsdom"]],
  },
  resolve: {
    alias: {
      "@main": resolve("src/main"),
      "@shared": resolve("src/shared"),
    },
  },
});
