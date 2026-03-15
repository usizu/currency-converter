import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/currency-converter/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Currency Converter',
        short_name: 'CurrConv',
        description: 'Quick currency converter for travellers',
        theme_color: '#13171f',
        background_color: '#13171f',
        display: 'standalone',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@fawazahmed0\/currency-api.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'currency-api-cdn',
              expiration: { maxEntries: 20, maxAgeSeconds: 86400 },
            },
          },
          {
            urlPattern: /^https:\/\/latest\.currency-api\.pages\.dev\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'currency-api-fallback',
              expiration: { maxEntries: 20, maxAgeSeconds: 86400 },
            },
          },
        ],
      },
    }),
  ],
});
