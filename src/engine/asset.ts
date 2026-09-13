/**
 * Resolves a dataset image path against the app's base URL.
 *
 * The dataset stores root-relative paths ("/celebrities/x.webp"). Those are correct
 * when the site is served from a domain root, but wrong under a subdirectory — as on
 * GitHub Pages, where the app lives at /<repo>/ — and Vite only rewrites the base for
 * assets it bundles, not for strings inside JSON.
 */
export function assetUrl(path: string): string {
  // The first stage is an inlined data URI, not a file to resolve.
  if (path.startsWith('data:')) return path;
  const base = import.meta.env.BASE_URL || '/';
  if (!path.startsWith('/')) return `${base}${path}`;
  return `${base.replace(/\/$/, '')}${path}`;
}
