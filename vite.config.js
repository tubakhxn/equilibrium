// dev/creator=tubakhxn
import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  server: { host: true }
});
