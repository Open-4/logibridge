import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  build: {
    // Vite 8 (Rolldown) chunk size warning limit
    chunkSizeWarningLimit: 1200,
  },

  // 开发服务器代理 API
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
