import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true,
    host: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "safari14",
    rollupOptions: {
      input: {
        main: "index.html",
        harness: "harness.html",
      },
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
