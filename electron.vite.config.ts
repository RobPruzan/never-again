import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'index-projects': resolve('src/utility/index-projects.ts')
        }
      },
      watch: process.argv.includes('--watch') ? {} : undefined
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      watch: process.argv.includes('--watch') ? {} : undefined
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
