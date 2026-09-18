/// <reference types="vite/client" />

/**
 * The room server's address, baked in at build time.
 *
 * The daily game needs no configuration at all — it is files. Multiplayer needs to
 * know where the process lives, and that differs per deployment, so it arrives as an
 * environment variable rather than a constant. Left unset, the multiplayer screens say
 * so instead of hanging on a connection that cannot open.
 */
interface ImportMetaEnv {
  readonly VITE_MULTIPLAYER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
