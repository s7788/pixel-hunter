import { expect, mock, test } from 'claude-code/testing'

import { HUNTER, TICK_MS } from './data'
import { VELKHANA } from './monsters/registry'
import type { Game } from './engine'
import { beginTurn, endTurn, newGame, restore, step, viewOf } from './engine'
import { huntSvg } from './svg'

const PANE = {
  plugin: 'hunt-8bit',
  component: 'Pane',
  requestId: 'hunt-8bit',
  props: {
    title: 'Hunt',
    isFocused: false,
    bodyColumns: 43,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const run = (g: Game, ticks: number, working = true): Game => {
  let out = g
  for (let i = 0; i < ticks; i += 1) out = step(out, working)
  return out
}

test('every frame of a long hunt fits the Svg source limit, paused veil and collision boxes included', () => {
  let g = beginTurn(newGame(7), 'velkhana')
  let largest = 0
  for (let i = 0; i < 3000; i += 1) {
    g = step(g, true)
    largest = Math.max(largest, huntSvg('hunting', viewOf(g), '88:88:88', i % 2 === 0, true).length)
  }
  expect(largest).toBeLessThan(131072)
})

test('a hunt lasts about the target minutes and about a third of hunts see a faint', { timeoutMs: 60000 }, () => {
  const minutes: number[] = []
  let carted = 0
  for (let seed = 1; seed <= 12; seed += 1) {
    let g = beginTurn(newGame(seed), 'velkhana')
    let t = 0
    while (g.slain === 0 && t < 20000) {
      g = step(g, true)
      t += 1
    }
    minutes.push((t * TICK_MS) / 60000)
    if (g.carts > 0) carted += 1
  }
  const avg = minutes.reduce((a, b) => a + b, 0) / minutes.length
  expect(avg).toBeGreaterThan(VELKHANA.targetMinutes * 0.8)
  expect(avg).toBeLessThan(VELKHANA.targetMinutes * 1.2)
  expect(carted / minutes.length).toBeGreaterThan(0.1)
  expect(carted / minutes.length).toBeLessThan(0.6)
})

test('the answer retreats to camp and keeps the monster wounded for the next turn', () => {
  let g = run(beginTurn(newGame(3), 'velkhana'), 400)
  expect(g.mode).toBe('fight')
  const wounded = g.hunt!.monsterHp
  expect(wounded).toBeLessThan(g.hunt!.monsterHpMax)
  g = run(endTurn(g), 30, false)
  expect(g.mode).toBe('camp')
  expect(viewOf(g).monster).toBeNull()
  expect(g.hunter.hp).toBe(HUNTER.hpMax)
  expect(g.hunt!.monsterHp).toBe(wounded)
  g = run(beginTurn(g), 40)
  expect(g.hunt!.monsterHp).toBeLessThanOrEqual(wounded)
  expect(viewOf(g).scene).toBe(g.hunt!.scene)
})

test('new hunts alternate between the two grounds and a slain hunt waits for the next turn', () => {
  let g = beginTurn(newGame(5), 'velkhana')
  const first = g.hunt!.scene
  g.hunt!.monsterHp = 1
  g = run(g, 200)
  expect(g.slain).toBe(1)
  expect(g.mode).toBe('camp')
  expect(g.hunt).toBeNull()
  g = run(g, 100)
  expect(g.mode).toBe('camp')
  g = beginTurn(g, 'velkhana')
  expect(g.hunt!.scene).not.toBe(first)
})

test('a save from a session that ended mid-fight comes back at camp, hunt kept', () => {
  const g = run(beginTurn(newGame(9), 'velkhana'), 300)
  const back = restore(JSON.parse(JSON.stringify(g)) as Game)
  expect(back.mode).toBe('camp')
  expect(back.hunt!.monsterHp).toBe(g.hunt!.monsterHp)
  expect(back.hunt!.isFresh).toBe(false)
})

test('main turns hunt, answers retreat, interrupts pause; subagent turns change nothing', { timeoutMs: 60000 }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const mount = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const svg = await ui.find({ type: 'Svg' })
    await ui.unmount()
    return svg?.props.alt
  }
  expect(await mount()).toBe('8-bit hunt: camp')
  await $.turn.start({ text: 'go', turnId: 't1' })
  expect(await mount()).toBe('8-bit hunt: hunting')
  await $.turn.start({ text: 'sub', turnId: 's1', agentId: 'a1' })
  await $.turn.complete({ reason: 'answer', turnId: 's1', agentId: 'a1' } as never)
  expect(await mount()).toBe('8-bit hunt: hunting')
  await $.turn.complete({ reason: 'answer', turnId: 't1' } as never)
  expect(await mount()).toBe('8-bit hunt: retreat')
  await $.turn.start({ text: 'again', turnId: 't2' })
  await $.turn.complete({ reason: 'aborted', turnId: 't2' } as never)
  expect(await mount()).toBe('8-bit hunt: paused')
})

test('the terminal draws the scene as cells (an Image on request) with its words under it, and no Svg', { timeoutMs: 60000 }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  // cells work in any terminal, so they are the default: 43 columns, 12 rows, 3 u32 words a cell
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  const raster = await ui.find({ type: 'Raster' })
  expect(raster).toBeDefined()
  const cells = raster!.props as { columns: number; rows: number; cells: string }
  expect(cells.columns).toBe(43)
  expect(cells.rows).toBe(12)
  expect(cells.cells.length).toBe(Math.ceil((43 * 12 * 12) / 3) * 4)
  expect(await ui.find({ type: 'Text', text: /待機・00:00/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /HP 12\/12/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^討伐 0/ })).toBeDefined()
  // the button swaps to the Image: 384 x 216 RGBA, alt, the same box
  await ui.press({ key: 'picture' })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  const image = await ui.find({ type: 'Image' })
  expect(image).toBeDefined()
  expect(image!.props.alt).toBe('8-bit hunt: camp')
  const { columns, rows, source } = image!.props as { columns: number; rows: number; source: { rgba: string; width: number; height: number } }
  expect(columns).toBe(43)
  expect(rows).toBe(12)
  expect(source.width).toBe(384)
  expect(source.height).toBe(216)
  // 384 x 216 x 4 bytes, base64: well under the 2 MiB the terminal takes
  expect(source.rgba.length).toBe(Math.ceil((384 * 216 * 4) / 3) * 4)
  await ui.unmount()
})

test('a wide, short inline pane: the cells fill the width the rows allow', { timeoutMs: 60000 }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const wide = { ...PANE, props: { ...PANE.props, bodyColumns: 160, placement: 'inline' as const, scroll: { offset: 0, bodyRows: 30 } } }
  const ui = await $.ui.mount({ ...wide, surface: 'terminal' })
  const raster = (await ui.find({ type: 'Raster' }))!.props as { columns: number; rows: number }
  // 30 rows less 7 for the words: 23 rows, and the 384:216 shape gives 82 columns
  expect(raster.rows).toBe(23)
  expect(raster.columns).toBe(82)
  await ui.unmount()
})

test('/hunt-demo toggles the hunt without a turn', { timeoutMs: 60000 }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'hunt-demo', args: '' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('8-bit hunt: hunting')
  await ui.unmount()
})

test('a new session picks the stored hunt back up at camp', { timeoutMs: 60000 }, async ($, on) => {
  const midFight = run(beginTurn(newGame(11), 'velkhana'), 300)
  mock.clock(on)
  mock.store(on, { save: midFight })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /save restored/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /mode camp/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: new RegExp(`hunt #${midFight.huntNo}`) })).toBeDefined()
  await ui.unmount()
})

test('/hunt-demo <monster> starts a fresh hunt of that species; an unknown id is refused', { timeoutMs: 60000 }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const bad = await $.command.run({ command: 'hunt-demo', args: 'rathalos' } as never)
  expect(bad.text).toMatch(/Unknown monster "rathalos"/)
  const ok = await $.command.run({ command: 'hunt-demo', args: ' great_jagras ' } as never)
  expect(ok.text).toMatch(/great_jagras/)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('8-bit hunt: hunting')
  expect(await ui.find({ type: 'Text', text: /great_jagras \/ state normal/ })).toBeDefined()
  await ui.unmount()
})
