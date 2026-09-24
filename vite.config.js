import { defineConfig } from 'vite';

// Relative base so the build works from any folder (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  test: { environment: 'node' },
});
