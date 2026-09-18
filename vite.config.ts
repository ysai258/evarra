import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Deep links on a static host.
 *
 * `/room/AB7K9Q` is a real URL people paste into group chats, but there is no file at
 * that path — the app is one `index.html` that reads the path itself. A CDN asked for
 * a file it does not have serves its 404 page, so the fix is to make the 404 page the
 * app: GitHub Pages serves `404.html` for anything missing, which loads the game,
 * which reads the path and opens the room.
 *
 * Vercel does the same job with the rewrite in `vercel.json`. Between them every host
 * this project targets can serve an invite link.
 */
function spaFallback(): Plugin {
  return {
    name: 'evarra-spa-fallback',
    apply: 'build',
    closeBundle() {
      const dist = resolve(process.cwd(), 'dist');
      copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'));
    },
  };
}

// GitHub Pages serves a project site from /<repo>/; everywhere else the app sits at
// the domain root. BASE_PATH lets the same build target both.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), spaFallback()],
  build: { target: 'es2022', assetsInlineLimit: 2048 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
