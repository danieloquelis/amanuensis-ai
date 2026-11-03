/** FNV-1a (32-bit): a short, stable fingerprint of a prompt; not for security. */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const KEY_RADIX = 36;

function fingerprint(text: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(KEY_RADIX);
}

/**
 * The prompt cache key for calls that begin with `prefix` (a system prompt, the tools offered).
 * Meta's prompt caching guide asks for one stable key per shared prefix: every turn and every
 * musician that starts the same way sends the same key and reaches the server that already holds
 * that beginning. A key per turn scatters them and misses the cache. The fingerprint changes when
 * the prompt does, so a new prompt version gets a key of its own.
 */
export function promptCacheKey(role: string, ...prefix: string[]): string {
  return `amanuensis-${role}-${fingerprint(prefix.join("\n"))}`;
}
