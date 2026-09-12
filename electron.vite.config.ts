import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// electron-vite leaves `minify` off by default; the packaged renderer was
// shipping 2.2 MB of readable JavaScript instead of ~1 MB minified.
const shared = {
  resolve: {
    alias: {
      '@shared': resolve('src/shared')
    }
  },
  build: {
    minify: 'esbuild' as const
  }
}

export default defineConfig({
  main: {
    ...shared,
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    ...shared,
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    build: {
      minify: 'esbuild'
    },
    plugins: [react(), tailwindcss()]
  }
})
