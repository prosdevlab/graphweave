import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@store": path.resolve(__dirname, "./src/store"),
      "@ui": path.resolve(__dirname, "./src/components/ui"),
      "@shared": path.resolve(__dirname, "../../packages/shared/src"),
      "@api": path.resolve(__dirname, "./src/api"),
      "@contexts": path.resolve(__dirname, "./src/contexts"),
      "@styles": path.resolve(__dirname, "./src/styles"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    css: false,
  },
});
