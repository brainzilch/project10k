import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: { input: { main: 'index.html', staff: 'staff.html', audio: 'audio.html', audioSetup: 'audio_setup.html' } },
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
});
