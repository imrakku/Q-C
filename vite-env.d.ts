// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Set the base path for deployment to GitHub Pages
  // Replace 'Q-C' with your actual repository name if it's different.
  // This ensures that asset paths (CSS, JS, images) are correct
  // when the site is served from a subdirectory like your-username.github.io/Q-C/
  base: '/Q-C/',
  build: {
    // The output directory for the build. Default is 'dist'.
    // This is the folder whose contents you will deploy.
    outDir: 'dist',
  }
})
