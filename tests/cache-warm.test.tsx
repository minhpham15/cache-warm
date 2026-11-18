import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'cache-warm',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const usage = (ttl: '5m' | '1h') => ({
  model: 'claude-opus-5-5',
  input_tokens: 10,
  output_tokens: 20,
  cache_read_input_tokens: 12_000,
  cache_creation_input_tokens: 3_000,
  ephemeral_5m_input_tokens: ttl === '5m' ? 3_000 : 0,
  ephemeral_1h_input_tokens: ttl === '1h' ? 3_000 : 0,
})

for (const ttl of ['5m', '1h'] as const) {
  test(`counts down a ${ttl} cache and goes cold`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    on('command.register', () => ({ value: { command: 'cache-warm' } }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('turn.step', async function* (_, e) {
      return {
        turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [],
        stopReason: 'end_turn' as const, usage: usage(ttl),
      }
    })

    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    const stream = $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 })
    for await (const _ of stream) { /* drain */ }
    await stream.result

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      const text = (await ui.find({ type: 'Text', text: /Cache warm/ }))?.text
      expect(text).toBe(`Cache warm · ${ttl === '5m' ? '5:00' : '1:00:00'} (${ttl} TTL)`)
      await ui.unmount()
    }

    await clock.advance(61_000)
    let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect((await ui.find({ type: 'Text', text: /Cache warm/ }))?.text).toBe(
      `Cache warm · ${ttl === '5m' ? '3:59' : '58:59'} (${ttl} TTL)`,
    )
    await ui.unmount()

    await clock.advance(ttl === '5m' ? 300_000 : 3_600_000)
    ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect((await ui.find({ type: 'Text', text: /Cache cold/ }))?.text).toBe(
      'Cache cold · next request re-writes it',
    )
    await ui.unmount()
  })
}

test('subagent steps do not touch the countdown', async ($, on) => {
  mock.clock(on, { now: 0 })
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId, index: e.index, answer: '', toolUses: [],
      stopReason: 'end_turn' as const, usage: usage('5m'),
    }
  })

  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1, agentId: 'a1' })
  for await (const _ of stream) { /* drain */ }
  await stream.result

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Cache/ })).toBe(undefined)
  await ui.unmount()
})

test('status line shows the countdown only while the band is hidden', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const statuses: (string | undefined)[] = []
  on('ui.status', (_, e) => { statuses.push(e.text); return { value: undefined } })
  on('command.register', () => ({ value: { command: 'cache-warm' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [],
      stopReason: 'end_turn' as const, usage: usage('1h'),
    }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 })
  for await (const _ of stream) { /* drain */ }
  await stream.result

  // Band shown: the status line stays empty while the clock ticks.
  await clock.advance(9_000)
  expect(statuses.every(s => s === undefined)).toBe(true)

  // Hide the band with its button: the countdown moves to the status line.
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'hide' })
  await ui.unmount()
  expect(statuses.at(-1)).toBe('cache 59:51')

  // Show it again with the command: the status line clears.
  await $.command.run({ command: 'cache-warm', args: '' })
  expect(statuses.at(-1)).toBe(undefined)
})
