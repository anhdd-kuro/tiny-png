import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import stylex from '@stylexjs/unplugin';

export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL('./src/renderer', import.meta.url)),
  base: './',
  publicDir: false,
  plugins: [
    stylex.vite({
      useCSSLayers: true,
      runtimeInjection: false,
      dev: mode === 'development',
    }),
    react(),
  ],
  build: {
    outDir: fileURLToPath(new URL('./build/renderer', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    license: { fileName: 'licenses.json' },
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./src/renderer/index.html', import.meta.url)),
        corner: fileURLToPath(new URL('./src/renderer/features/corner-drop/index.html', import.meta.url)),
        settings: fileURLToPath(new URL('./src/renderer/features/settings/index.html', import.meta.url)),
      },
    },
  },
}));
