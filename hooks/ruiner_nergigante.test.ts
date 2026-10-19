import { expect, test } from 'claude-code/testing'

import type { Game } from './engine'
import { beginTurn, newGame, restore, step, viewOf } from './engine'
import { metersOf } from './monsters/common'
import { RUINER_NERGIGANTE } from './monsters/registry'
import { parked, run, simulate, summary } from './simulate'
import { huntSvg } from './svg'

const out = (globalThis as unknown as { console: { log(text: string): void } }).console
const SPOTS = ['spike_head', 'spike_arm_near', 'spike_arm_far']

test('20 Ruiner Nergigante hunts: median near the 7-minute target (±20%); stats printed', { timeoutMs: 300000 }, () => {
  let whiteBreaks = 0
  let blackBreaks = 0
  let dives = 0
  const s = simulate('ruiner_nergigante', 20, (prev, next) => {
    if (next.monster.move === 'spikeDown' && prev.monster.move !== 'spikeDown') whiteBreaks += 1
    if (next.monster.move === 'spikeStagger' && prev.monster.move !== 'spikeStagger') blackBreaks += 1
    if (next.monster.move === 'dive' && prev.monster.move !== 'dive') dives += 1
  })
  out.log(summary(s, { whiteBreaks, blackBreaks, dives }))
  expect(s.median).toBeGreaterThan(RUINER_NERGIGANTE.targetMinutes * 0.8)
  expect(s.median).toBeLessThan(RUINER_NERGIGANTE.targetMinutes * 1.2)
  expect(dives).toBeGreaterThan(0)
  expect(whiteBreaks + blackBreaks).toBeGreaterThan(0)
})

/** A swing that meets the monster's head spikes first on the next tick. */
function swingAt(g: Game): Game {
  g.hunter = { ...g.hunter, x: g.monster.x - 120, move: 'charge', t: 8, attack: { id: `t:hunter:${g.simTick}`, contacts: [] } }
  return g
}

test('M08: a white spike broken by hits on it goes bare and puts it down 24 ticks; black staggers 8', () => {
  let g = parked('ruiner_nergigante')
  g.hunter.x = 20
  for (const s of SPOTS) g.hunt!.parts[s] = { durability: 1, broken: false }
  g = step(swingAt(g), true)
  const part = g.hits.at(-1)!.part
  expect(SPOTS).toContain(part)
  expect(metersOf(g)[`${part}:stage`]).toBe(0)
  expect(g.monster.move).toBe('spikeDown')
  // only the spot hit broke
  expect(SPOTS.filter(s => g.hunt!.parts[s]!.broken).length).toBe(1)
  let b = parked('ruiner_nergigante')
  b.hunter.x = 20
  for (const s of SPOTS) {
    metersOf(b)[`${s}:stage`] = 2
    b.hunt!.parts[s] = { durability: 1, broken: false }
  }
  b = step(swingAt(b), true)
  expect(b.monster.move).toBe('spikeStagger')
  b = run(b, 8)
  expect(b.monster.move).not.toBe('spikeStagger')
})

test('M08: white hardens to black after 20 s, bare grows white after 12 s, both at a safe point', () => {
  let g = parked('ruiner_nergigante')
  g.hunter.x = 20
  metersOf(g)['spike_head:t'] = 160
  g.monster.wait = 1
  g = step(g, true)
  expect(g.monster.move).toBe('harden')
  expect(metersOf(g)['spike_head:stage']).toBe(2)
  expect(viewOf(g).monsterInfo?.status).toBe('白棘 2・黑棘 1')
  g = run(g, 12)
  metersOf(g)['spike_arm_far:stage'] = 0
  metersOf(g)['spike_arm_far:t'] = 96
  g.monster = { ...g.monster, move: g.monster.move, wait: 1 }
  g = step(g, true)
  expect(g.monster.move).toBe('grow')
  expect(metersOf(g)['spike_arm_far:stage']).toBe(1)
})

test('M08: the dive needs a black spike, locks its landing spot, never follows, lands once for at most 4, and spends the black', () => {
  let g = parked('ruiner_nergigante')
  expect(RUINER_NERGIGANTE.mechanic.allows(g, 'dive')).toBe(false)
  metersOf(g)['spike_head:stage'] = 2
  expect(RUINER_NERGIGANTE.mechanic.allows(g, 'dive')).toBe(true)
  g.hunter.stamina = 0
  g.hunter.x = 80
  g.monster = { ...g.monster, move: 'dive', t: 0, attack: { id: 't:monster:9', contacts: [] } }
  g = run(g, 10)
  const locked = metersOf(g).seekX!
  expect(locked).toBeDefined()
  expect(viewOf(g).effects.some(e => e.fx === 'mark')).toBe(true)
  // the hunter moves away after the lock: the dive still falls where it was locked
  g.hunter.x = 20
  g = run(g, 7)
  expect(Math.abs(g.monster.x - locked)).toBeLessThanOrEqual(1)
  const hits = g.hits.filter(h => h.attackId === 't:monster:9')
  expect(hits.length).toBeLessThanOrEqual(1)
  expect(hits.every(h => h.damage <= 4)).toBe(true)
  g = run(g, 20)
  expect(metersOf(g)['spike_head:stage']).toBe(0)
})

test('S05: the crystal ruins exist, and a Ruiner Nergigante hunt keeps its spikes across a new session', () => {
  const g = parked('ruiner_nergigante')
  metersOf(g)['spike_arm_near:stage'] = 2
  const back = restore(JSON.parse(JSON.stringify(g)) as Game)
  expect(back.hunt!.meters!['spike_arm_near:stage']).toBe(2)
  expect(viewOf(run(beginTurn(back), 60)).scene).toBe('S05')
})

test('every frame of a Ruiner Nergigante hunt fits the Svg source limit, boxes, spikes and mark included', () => {
  let g = beginTurn(newGame(13), 'ruiner_nergigante')
  let largest = 0
  for (let i = 0; i < 4000; i += 1) {
    g = step(g, true)
    largest = Math.max(largest, huntSvg('hunting', viewOf(g), '88:88:88', i % 2 === 0, true).length)
  }
  out.log(JSON.stringify({ largestSvg: largest }))
  expect(largest).toBeLessThan(131072)
})

test('the hunter never stands inside Ruiner Nergigante', () => {
  let g = beginTurn(newGame(11), 'ruiner_nergigante')
  for (let i = 0; i < 3000; i += 1) {
    g = step(g, true)
    if (g.mode === 'fight') expect(g.hunter.x + 22).toBeLessThanOrEqual(g.monster.x + RUINER_NERGIGANTE.bounds[0])
  }
})
