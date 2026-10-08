import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [wasm(), topLevelAwait()],
  base: './', // Ensure correct relative paths for GitHub Pages deployment
  build: {
    target: 'esnext'
  }
});
