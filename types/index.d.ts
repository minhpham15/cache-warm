/** The main thread's last request that read or wrote the prompt cache. */
export type CacheHit = {
  /** When the request was sent, ms since the epoch: the TTL counts from here. */
  at: number
  ttl: '5m' | '1h'
  model: string
  readTokens: number
  writeTokens: number
}

declare module 'claude-code' {
  interface PluginState {
    'cache-warm': { last: CacheHit | null; now: number; isHidden: boolean }
  }
}
