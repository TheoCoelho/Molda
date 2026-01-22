// Add these to your vite.config.ts

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // Enable image optimization
  ],
  
  build: {
    assetsInlineLimit: 4096, // Inline small images as base64
    rollupOptions: {
      output: {
        // Create asset manifest for image optimization
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          
          if (/png|jpe?g|gif|svg|webp/.test(ext)) {
            return `images/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
      },
    },
  },

  // Optimize images in public folder
  ssr: {
    noExternal: ['sharp'], // If using image processing
  },
});
