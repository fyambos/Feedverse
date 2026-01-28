import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'legal/privacy.html'),
        terms: resolve(__dirname, 'legal/terms.html'),
        dataDeletion: resolve(__dirname, 'legal/data-deletion.html'),
        contact: resolve(__dirname, 'legal/contact.html'),
      },
    },
  },
})
