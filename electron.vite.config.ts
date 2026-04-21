import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: "out/main" },
    resolve: { alias: { "@main": resolve("src/main"), "@shared": resolve("src/shared") } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: "out/preload" },
    resolve: { alias: { "@shared": resolve("src/shared") } },
  },
  renderer: {
    plugins: [react()],
    build: { outDir: "out/renderer" },
    resolve: { alias: { "@renderer": resolve("src/renderer"), "@shared": resolve("src/shared") } },
    root: "src/renderer",
  },
});
