/**
 * FNV-1a — small, dependency-free and stable across runtimes, which is what a
 * "same date must always give the same star" selector needs.
 */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Deterministic 0..1 value for a seed — used for weighted difficulty picks. */
export function seededUnit(seed: string): number {
  return hashString(seed) / 0x100000000;
}
