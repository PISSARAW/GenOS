import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (id.includes('@xyflow') || id.includes('d3-')) return 'vendor-graph';
          if (id.includes('@react-three') || id.includes('/three/')) return 'vendor-3d';
          if (id.includes('recharts')) return 'vendor-charts';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('/react/') || id.includes('react-dom') || id.includes('zustand')) return 'vendor-react';
          return 'vendor';
        },
      },
    },
  },
})
