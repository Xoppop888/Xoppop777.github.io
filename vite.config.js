import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Relative asset paths make the build work both for a GitHub user site
  // (username.github.io) and for a project site (username.github.io/repository).
  // HashRouter is used, so the app does not need server-side route rewrites.
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
