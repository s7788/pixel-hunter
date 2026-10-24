import { expect, mock, test } from 'claude-code/testing'

import { HUNTER, TICK_MS, VELKHANA } from './data'
import type { Game } from './engine'
import { beginTurn, chooseWeapon, endTurn, newGame, restore, step, viewOf } from './engine'
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
  let g = beginTurn(newGame(7))
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
    let g = beginTurn(newGame(seed))
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
  let g = run(beginTurn(newGame(3)), 400)
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
  let g = beginTurn(newGame(5))
  const first = g.hunt!.scene
  g.hunt!.monsterHp = 1
  g = run(g, 200)
  expect(g.slain).toBe(1)
  expect(g.mode).toBe('camp')
  expect(g.hunt).toBeNull()
  g = run(g, 100)
  expect(g.mode).toBe('camp')
  g = beginTurn(g)
  expect(g.hunt!.scene).not.toBe(first)
})

test('a save from a session that ended mid-fight comes back at camp, hunt kept', () => {
  const g = run(beginTurn(newGame(9)), 300)
  const back = restore(JSON.parse(JSON.stringify(g)) as Game)
  expect(back.mode).toBe('camp')
  expect(back.hunt!.monsterHp).toBe(g.hunt!.monsterHp)
  expect(back.hunt!.isFresh).toBe(false)
})

test('main turns hunt, answers retreat, interrupts pause; subagent turns change nothing', async ($, on) => {
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

test('the terminal draws the pane without the Svg scene', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /hunt scene skipped/ })).toBeDefined()
  await ui.unmount()
})

test('/hunt-demo toggles the hunt without a turn', async ($, on) => {
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

test('a new session picks the stored hunt back up at camp', async ($, on) => {
  const midFight = run(beginTurn(newGame(11)), 300)
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

test('camp shows the weapon buttons; a press takes the weapon up; a hunt locks them', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.findAll({ type: 'Button', text: /^[●○] / })).toHaveLength(4)
  await ui.press({ key: 'weapon-longsword' })
  await ui.unmount()
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /mode camp \/ longsword/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'weapon-longsword', text: /● 太刀/ })).toBeDefined()
  await ui.unmount()
  await $.turn.start({ text: 'go', turnId: 't1' })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.findAll({ type: 'Button', text: /^[●○] / })).toHaveLength(0)
  expect(await ui.find({ type: 'Text', text: /武器 太刀/ })).toBeDefined()
  await ui.unmount()
})

test('a long hunt with each weapon fits the Svg source limit', () => {
  for (const weapon of ['longsword', 'bow'] as const) {
    let g = beginTurn(chooseWeapon(newGame(7), weapon))
    let largest = 0
    for (let i = 0; i < 3000; i += 1) {
      g = step(g, true)
      largest = Math.max(largest, huntSvg('hunting', viewOf(g), '88:88:88', i % 2 === 0, true).length)
    }
    expect(largest).toBeLessThan(131072)
  }
})

test('a press in camp after a real turn, with the clock ticking, changes the weapon', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on, { save: run(beginTurn(newGame(11)), 300) })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(5000)
  await $.turn.complete({ reason: 'answer', turnId: 't1', answer: '' } as never)
  await clock.advance(5000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /mode camp \/ greatsword/ })).toBeDefined()
  await ui.press({ key: 'weapon-bow' })
  await clock.advance(1000)
  expect(await ui.find({ type: 'Text', text: /mode camp \/ bow/ })).toBeDefined()
  await ui.unmount()
})

test('the picture names the weapon in hand as text, with no boxes that look like buttons', () => {
  const picked = viewOf(chooseWeapon(newGame(3), 'longsword'))
  const svg = huntSvg('camp', picked, '00:00', false)
  expect(svg).toContain('武器 太刀</text>')
  expect(svg).not.toContain('大劍</text>')
  expect(huntSvg('camp', viewOf(chooseWeapon(newGame(3), 'random')), '00:00', false)).toContain('（隨機）</text>')
})
