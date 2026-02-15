import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime']
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: /^phaser$/, replacement: 'phaser/dist/phaser-arcade-physics.min.js' },
      { find: /^phaser3spectorjs$/, replacement: '/src/shims/phaser3spectorjs.ts' }
    ]
  },
  server: {
    port: 4173,
    strictPort: true,
    host: '127.0.0.1'
  }
});
