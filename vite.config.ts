import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 2323,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
});
