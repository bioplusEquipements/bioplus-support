import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'],
      manifest: {
        name: 'BioPlus Support Automates',
        short_name: 'BioPlus',
        description: 'Support technique des automates Horiba ABX',
        lang: 'fr',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './dashboard',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        cacheId: 'bioplus-v3',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin.endsWith('.supabase.co') && url.pathname.includes('/rest/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'bioplus-api-cache',
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 }
            }
          },
          {
            urlPattern: ({ url }) =>
              url.origin.endsWith('.supabase.co') && url.pathname.includes('/storage/v1/object/sign/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'bioplus-images-cache',
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 }
            }
          },
          {
            urlPattern: /\/index\.html$/,
            handler: 'NetworkFirst',
            options: {
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 1 }
            }
          }
        ]
      }
    })
  ]
});