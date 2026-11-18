import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CacheHit } from '../types'

const last = atom({ plugin: 'cache-warm', key: 'last' } as const, null)
const now = atom({ plugin: 'cache-warm', key: 'now' } as const, 0)
const isHidden = atom({ plugin: 'cache-warm', key: 'isHidden' } as const, false)

const TTL_MS = { '5m': 300_000, '1h': 3_600_000 } as const

function leftMs(hit: CacheHit, at: number): number {
  return hit.at + TTL_MS[hit.ttl] - at
}

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  const pad = (n: number) => String(n).padStart(2, '0')

  return m >= 60 ? `${Math.floor(m / 60)}:${pad(m % 60)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

function tokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

// The status line is only a fallback for when the band is hidden: showing the
// countdown in both places at once is redundant.
async function showStatus($: EngineInterface): Promise<void> {
  const hit = await read($, last)

  if (hit === null || !(await read($, isHidden))) {
    $.ui.status(undefined)
    return
  }

  const left = leftMs(hit, await read($, now))
  $.ui.status(left > 0 ? `cache ${clock(left)}` : 'cache cold')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cache-warm',
      description: 'Show or hide the prompt cache countdown above the prompt',
    })

    // Tick once a second while the cache is warm, so the countdown moves.
    $.clock.every(1000, async () => {
      const hit = await read($, last)
      const t = await $.clock.now()
      const prev = await read($, now)
      const wasWarm = hit !== null && leftMs(hit, prev) > 0

      if (wasWarm) {
        await update($, now, () => t)
        await showStatus($)
      }
    })

    await showStatus($)
    return next(e)
  })

  on('command.run', { command: 'cache-warm' }, async $ => {
    const hidden = await update($, isHidden, h => !h)
    await showStatus($)

    return { text: hidden ? 'Cache countdown hidden.' : 'Cache countdown shown.' }
  })

  // Every model request of the main thread: when it was sent and what it did to the cache.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId) {
      return yield* next(e)
    }

    const sentAt = await $.clock.now()
    const res = yield* next(e)
    const u = res.usage

    if (u && (u.cache_read_input_tokens > 0 || u.cache_creation_input_tokens > 0)) {
      const prev = await read($, last)
      const ttl: CacheHit['ttl'] =
        (u.ephemeral_1h_input_tokens ?? 0) > 0
          ? '1h'
          : (u.ephemeral_5m_input_tokens ?? 0) > 0
            ? '5m'
            : (prev?.ttl ?? '5m')
      const hit: CacheHit = {
        at: sentAt,
        ttl,
        model: u.model,
        readTokens: u.cache_read_input_tokens,
        writeTokens: u.cache_creation_input_tokens,
      }
      await update($, last, () => hit)
      await update($, now, () => sentAt)
      await showStatus($)
    }

    return res
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const hit = await read($, last)

    if (e.props.hasSurvey || hit === null || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const left = leftMs(hit, await read($, now))
    const isWarm = left > 0
    const isLow = isWarm && left < 60_000

    return (
      <Box>
        <Text color={isWarm ? (isLow ? 'yellow' : 'green') : 'gray'}>
          {isWarm ? '● ' : '○ '}
        </Text>
        <Text dimColor={!isWarm}>
          {isWarm
            ? `Cache warm · ${clock(left)} (${hit.ttl} TTL)`
            : `Cache cold · next request re-writes it`}
        </Text>
        <Text dimColor>
          {`  read ${tokens(hit.readTokens)} · write ${tokens(hit.writeTokens)}  `}
        </Text>
        <Button
          key="hide"
          label="Hide"
          onPress={async () => {
            await update($, isHidden, () => true)
            await showStatus($)
          }}
        />
      </Box>
    )
  })
}
