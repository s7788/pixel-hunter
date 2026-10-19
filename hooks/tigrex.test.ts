import { expect, test } from 'claude-code/testing'

import { hitboxes } from './collision'
import type { Game } from './engine'
import { beginTurn, newGame, restore, step, viewOf } from './engine'
import { metersOf } from './monsters/common'
import { TIGREX } from './monsters/registry'
import { parked, run, simulate, summary } from './simulate'
import { huntSvg } from './svg'

const out = (globalThis as unknown as { console: { log(text: string): void } }).console

test('20 Tigrex hunts: median near the 5-minute target (±20%); stats printed', { timeoutMs: 300000 }, () => {
  let rages = 0
  let tired = 0
  const s = simulate('tigrex', 20, (prev, next) => {
    if (next.monster.move === 'roar' && prev.monster.move !== 'roar') rages += 1
    if (next.hunt?.state === 'tired' && prev.hunt?.state !== 'tired') tired += 1
  })
  out.log(summary(s, { rages, tired }))
  expect(s.median).toBeGreaterThan(TIGREX.targetMinutes * 0.8)
  expect(s.median).toBeLessThan(TIGREX.targetMinutes * 1.2)
  expect(tired).toBeGreaterThan(0)
})

/** A dash from x, the hunter far to the left with no stamina to roll; returns every tick's root x and frame. */
function dash(key: 'dash' | 'dash3', x = 250): { xs: number[]; frames: number[]; groups: Set<string>; g: Game } {
  let g = parked('tigrex', x)
  g.hunter.stamina = 0
  g.hunter.x = 16
  if (key === 'dash3') metersOf(g).rageT = 80
  g.monster = { ...g.monster, move: key, t: 0, attack: { id: 't:monster:1', contacts: [] } }
  const xs: number[] = []
  const frames: number[] = []
  const groups = new Set<string>()
  const total = key === 'dash' ? 32 : 42
  for (let i = 0; i < total; i += 1) {
    g = step(g, true)
    xs.push(g.monster.x)
    frames.push(viewOf(g).monster!.frame)
    if (g.monster.attack !== null) groups.add(g.monster.attack.id)
  }
  return { xs, frames, groups, g }
}

test('M06: runs and brakes are continuous (no jump), two groups calm and three enraged, turns shown between runs', () => {
  const calm = dash('dash')
  const enraged = dash('dash3')
  for (const d of [calm, enraged]) {
    for (let i = 1; i < d.xs.length; i += 1) expect(Math.abs(d.xs[i]! - d.xs[i - 1]!)).toBeLessThanOrEqual(28)
  }
  expect(calm.groups.size).toBe(2)
  expect(enraged.groups.size).toBe(3)
  // frame 1 (brake turning right) comes between the first and second run, frame 3 before the last
  const f = enraged.frames
  expect(f.indexOf(1)).toBeGreaterThan(f.indexOf(0))
  expect(f.indexOf(2)).toBeGreaterThan(f.indexOf(1))
  expect(f.lastIndexOf(4)).toBeGreaterThan(f.indexOf(3))
})

test('M06: a run toward the edge stops at the arena, never past it', () => {
  // from 300: the first run comes left 112 px, the run back would end at 300 but stops at the edge
  const d = dash('dash', 300)
  const right = Math.max(...d.xs.slice(14))
  // facing right its push box is [-48, 96]: the root stops at 368 - 96
  expect(right).toBeLessThanOrEqual(368 - 96)
  expect(Math.min(...d.xs)).toBeGreaterThanOrEqual(16 + 22 + 96 + 2)
})

test('M06: after three dashes it tires for 8 s: slower, no dash', () => {
  let g = parked('tigrex')
  g.hunter.x = 20
  metersOf(g).dashes = 3
  g.monster.wait = 1
  g = step(g, true)
  expect(g.hunt!.state).toBe('tired')
  expect(viewOf(g).monsterInfo?.status).toBe('疲勞')
  expect(TIGREX.mechanic.allows(g, 'dash')).toBe(false)
  expect(TIGREX.mechanic.speed(g)).toBe(0.8)
  g.hunt!.stateT = 64
  g.monster = { ...g.monster, move: 'idleTired', wait: 1 }
  g = step(g, true)
  expect(g.hunt!.state).toBe('normal')
  expect(metersOf(g).dashes).toBe(0)
})

test('M06: the roar blast hurts only close by', () => {
  const box = hitboxes('TI04', 2, { x: 240, groundY: 174, renderFlip: 1 })[0]!
  expect(box.minX).toBeGreaterThan(100)
  expect(box.maxX - box.minX).toBeLessThan(220)
})

test('a tired, enraged Tigrex keeps both across a new session', () => {
  const g = parked('tigrex')
  g.hunt!.state = 'tired'
  metersOf(g).rageT = 30
  const back = restore(JSON.parse(JSON.stringify(g)) as Game)
  expect(back.hunt!.state).toBe('tired')
  expect(back.hunt!.meters!.rageT).toBe(30)
  expect(viewOf(run(beginTurn(back), 60)).scene).toBe('S02')
})

test('every frame of a Tigrex hunt fits the Svg source limit, boxes included', () => {
  let g = beginTurn(newGame(13), 'tigrex')
  let largest = 0
  for (let i = 0; i < 4000; i += 1) {
    g = step(g, true)
    largest = Math.max(largest, huntSvg('hunting', viewOf(g), '88:88:88', i % 2 === 0, true).length)
  }
  out.log(JSON.stringify({ largestSvg: largest }))
  expect(largest).toBeLessThan(131072)
})

test('the hunter never stands inside Tigrex while it faces the hunter', () => {
  let g = beginTurn(newGame(11), 'tigrex')
  for (let i = 0; i < 3000; i += 1) {
    g = step(g, true)
    const turned = ['dash', 'dash3'].includes(g.monster.move) && [2, 3].includes(viewOf(g).monster?.frame ?? -1)
    if (g.mode === 'fight' && !turned) expect(g.hunter.x + 22).toBeLessThanOrEqual(g.monster.x + TIGREX.bounds[0])
  }
})
