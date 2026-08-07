import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const single = process.env.BUILD_SINGLE === '1';

export default defineConfig({
  root: 'web',
  base: './',
  plugins: [react(), tailwindcss(), ...(single ? [viteSingleFile()] : [])],
  server: { port: 5273, fs: { allow: ['..'] } },
  build: {
    outDir: single ? '../dist-single' : '../dist',
    emptyOutDir: true,
    // The single-file build must inline everything, including the workbook writer,
    // so the page opens from a mail attachment with no network at all.
    assetsInlineLimit: single ? 100_000_000 : 4096,
    ...(single ? { cssCodeSplit: false } : {}),
  },
});
