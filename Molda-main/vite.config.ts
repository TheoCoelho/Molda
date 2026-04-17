import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import uploadModelPlugin from "./vite-plugin-upload-model";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
    uploadModelPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      three: path.resolve(__dirname, "./node_modules/three"),
    },
  },
  optimizeDeps: {
    include: ["three"],
    exclude: ["@imgly/background-removal"],
  },
}));
