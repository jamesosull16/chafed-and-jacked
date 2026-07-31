import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          charts: ['recharts'],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Chafed & Jacked',
        short_name: 'C&J',
        description: 'Because your nipples bleed but your deadlift doesn\'t.',
        // Must track the light theme — an orange splash into a white app reads
        // as a different product loading.
        theme_color: '#FFFFFF',
        background_color: '#FFFFFF',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        // `any` and `maskable` are separate images on purpose. They were the
        // same file declared 'any maskable', which asks one icon to satisfy
        // two incompatible layouts: `any` is drawn as supplied, while
        // `maskable` gets an arbitrary launcher shape cut out of it and only
        // guarantees the central 80%. The maskable source shrinks the mark to
        // clear that safe zone; using it for both would look needlessly inset
        // everywhere else. Regenerate both with `npm run icons`.
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com/,
            handler: 'NetworkFirst',
            options: { cacheName: 'firestore-cache', expiration: { maxEntries: 50, maxAgeSeconds: 86400 } }
          }
        ]
      }
    })
  ]
})
