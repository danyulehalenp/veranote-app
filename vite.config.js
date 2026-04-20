import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue'; // Assuming Vue is in use, if not, adjust to match your framework

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
  }
});