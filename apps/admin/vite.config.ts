import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { headers: { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' } },
});
