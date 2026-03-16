import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "GRAPHWEAVE_");

  return {
    plugins: [react(), tailwindcss()],
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
    server: {
      port: 3000,
      proxy: {
        "/api": {
          target: "http://localhost:8000",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, "/v1"),
          configure: (proxy) => {
            const apiKey = env.GRAPHWEAVE_API_KEY;
            if (apiKey) {
              proxy.on("proxyReq", (proxyReq) => {
                proxyReq.setHeader("X-API-Key", apiKey);
              });
            }
          },
        },
      },
    },
  };
});
