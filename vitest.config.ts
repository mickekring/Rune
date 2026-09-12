import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Unit tests for the pure and filesystem-only modules. Electron-bound
// modules mock the `electron` package where a test needs to import them.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@': resolve('src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
