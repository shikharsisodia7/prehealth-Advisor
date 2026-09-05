import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// PORT and BASE_PATH only matter for the local dev server / preview server;
// a production build (Vercel, `vite build`) never binds a port and should
// serve from the domain root by default. Only the dev server below requires
// PORT to actually be set.
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;
if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}
const basePath = process.env.BASE_PATH || '/';

// Replit-only plugins: never load them outside a Replit dev environment, so
// a Vercel/production build has zero Replit dependency at build time.
const isReplitDev = process.env.NODE_ENV !== 'production' && process.env.REPL_ID !== undefined;

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    ...(isReplitDev
      ? [
          await import('@replit/vite-plugin-runtime-error-modal').then((m) => m.default()),
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      '/api': 'http://localhost:8080',
      '/__clerk': 'http://localhost:8080',
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
