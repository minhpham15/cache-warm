<p align="center">
  <img src="assets/icon.svg" width="96" height="96" alt="cache-warm icon">
</p>

<h1 align="center">cache-warm</h1>

<p align="center">
  A Claude Code mod that shows whether the prompt cache is still warm, and how long it has left, right above the prompt.
</p>

---

## Why

Claude Code reuses a cached prefix of your conversation between requests. Reads from the cache are cheap and fast; once the cache expires (5 minutes or 1 hour after it was last written, depending on its TTL), the next request has to write the whole prefix again.

`cache-warm` makes that invisible timer visible, so you know whether replying now is cheap or whether the cache has already gone cold.

## What it shows

A row above the prompt, updated every second:

```
● Cache warm · 3:59 (5m TTL)  read 12.0k · write 3.0k  [Hide]
```

| State | Look |
| --- | --- |
| Warm, more than a minute left | green `●` with the countdown |
| Warm, under a minute left | yellow `●` |
| Cold | grey `○` · `Cache cold · next request re-writes it` |

- **Countdown** starts from when the last main-thread request that read or wrote the cache was sent.
- **TTL** (`5m` or `1h`) is detected from the request's usage; if a request doesn't say, the previous TTL is kept.
- **read / write** are the cache-read and cache-write token counts of that request.
- Subagent requests are ignored: only the main conversation's cache is tracked.

When the row is hidden, the countdown moves to the status line instead (`cache 3:59` or `cache cold`), so it is never shown twice.

## Usage

| Action | How |
| --- | --- |
| Hide the row | click **Hide**, or run `/cache-warm` |
| Show it again | run `/cache-warm` |

The hidden/shown choice lasts for the session.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install cache-warm --marketplace minhpham15/cache-warm
```

Answer `y` to add the marketplace, then pick a scope (user scope is first; press Enter). The mod is active right away.

From a shell:

```bash
claude plugin install cache-warm --marketplace minhpham15/cache-warm
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `minhpham15/cache-warm` → **Add plugin**.

### From a local folder (development)

```bash
claude --plugin-dir /path/to/cache-warm
```

or name the folder in `CLAUDE_CODE_PLUGIN_DIRS` so every session loads it.

## Development

```
cache-warm/
├── .claude-plugin/plugin.json   manifest
├── .claude-plugin/marketplace.json  marketplace listing
├── hooks/hooks.json             module list
├── hooks/register.tsx           the hooks module
├── types/index.d.ts             $.state contract (CacheHit)
├── tests/cache-warm.test.tsx    tests
└── assets/icon.svg, icon.png    icon
```

Check and test it:

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

## License

[MIT](LICENSE) © 2026 minhpham15
