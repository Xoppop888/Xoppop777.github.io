import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Относительный base — работает и в корне домена, и в подпапке
  // (репозиторий Xoppop777.github.io не совпадает с именем аккаунта Xoppop888,
  // поэтому GitHub Pages отдаёт сайт по пути /Xoppop777.github.io/, не с корня).
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
  build: {
    modulePreload: {
      // Отключает полифилл модуля предзагрузки — убирает предупреждение в консоли
      // "cross-world service worker resource mismatch" на GitHub Pages.
      polyfill: false,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          pdf: ["jspdf", "html2canvas"],
          charts: ["recharts"],
          dnd: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
          vendor: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
