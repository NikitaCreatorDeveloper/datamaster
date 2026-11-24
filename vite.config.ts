import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: {
    format: "iife",
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  server: { allowedHosts: true },
  build: { assetsInlineLimit: 0, chunkSizeWarningLimit: 1100 },
});
