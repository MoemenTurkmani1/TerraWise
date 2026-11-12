import { localAgronomistPlugin } from './scripts/localAgronomist'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { assertNoBrowserSecrets } from './src/services/supabaseConfigGuard'

export default defineConfig(({ mode }) => {
  assertNoBrowserSecrets(loadEnv(mode, process.cwd(), ''))
  return {
  server: { port: 5173, strictPort: true },
  plugins: [react(), tailwindcss(), localAgronomistPlugin(), {
    name: 'terrawise-offline-assets',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter(name => /\.(?:js|css|woff2?)$/.test(name)).map(name => `/${name}`)
      this.emitFile({ type: 'asset', fileName: 'offline-assets.json', source: JSON.stringify(assets) })
    },
  }],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          'supabase-vendor': ['@supabase/supabase-js'],
          maps: ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
  }
})
