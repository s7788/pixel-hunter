import { expect, test } from 'claude-code/testing'

import { hitboxes } from './collision'
import type { Game } from './engine'
import { beginTurn, newGame, restore, step, viewOf } from './engine'
import { BARIOTH } from './monsters/registry'
import { parked, run, simulate, summary } from './simulate'
import { huntSvg } from './svg'

const out = (globalThis as unknown as { console: { log(text: string): void } }).console

test('20 Barioth hunts: median near the 5-minute target (±20%); stats printed', { timeoutMs: 300000 }, () => {
  let wingsBroken = 0
  let stumbles = 0
  const s = simulate('barioth', 20, (prev, next) => {
    for (const w of ['wing_near', 'wing_far']) if (next.hunt?.parts[w]?.broken === true && prev.hunt?.parts[w]?.broken !== true) wingsBroken += 1
    if (next.monster.move.startsWith('stumble') && !prev.monster.move.startsWith('stumble')) stumbles += 1
  })
  out.log(summary(s, { wingsBroken, stumbles }))
  expect(s.median).toBeGreaterThan(BARIOTH.targetMinutes * 0.8)
  expect(s.median).toBeLessThan(BARIOTH.targetMinutes * 1.2)
  expect(s.moves.tornado ?? 0).toBeGreaterThan(0)
  expect(wingsBroken).toBeGreaterThan(0)
})

/** A swing that meets the monster on the next tick, landing on `part` first (wings come before the body). */
function swingAt(g: Game): Game {
  g.hunter = { ...g.hunter, x: g.monster.x - 110, move: 'charge', t: 8, attack: { id: `t:hunter:${g.simTick}`, contacts: [] } }
  return g
}

test('M04: a wing breaks only from hits on it; one broken wing adds 8 ticks to the landing, both 12, never stacked', () => {
  let g = parked('barioth')
  g.hunter.x = 20
  g.hunt!.parts.wing_near = { durability: 1, broken: false }
  g = step(swingAt(g), true)
  const part = g.hits.at(-1)!.part
  expect(part.startsWith('wing_')).toBe(true)
  expect(g.hunt!.parts[part]!.broken).toBe(part === 'wing_near')
  // with exactly one broken wing the pounce chosen is the 8-tick stumble one
  g.hunt!.parts.wing_near = { durability: 0, broken: true }
  g.hunt!.parts.wing_far = { durability: 999, broken: false }
  const one = BARIOTH.mechanic.allows
  expect(one(g, 'pounce')).toBe(false)
  expect(one(g, 'pounceStumble')).toBe(true)
  expect(one(g, 'pounceStumble2')).toBe(false)
  g.hunt!.parts.wing_far = { durability: 0, broken: true }
  expect(one(g, 'pounceStumble')).toBe(false)
  expect(one(g, 'pounceStumble2')).toBe(true)
  // the landing: 23 ticks of pounce, then 12 of stumble, then idle
  g.hunter.stamina = 0
  g.hunter.x = 20
  g.monster = { ...g.monster, move: 'pounceStumble2', t: 0, attack: { id: 't:monster:7', contacts: [] } }
  g = run(g, 23)
  expect(g.monster.move).toBe('stumble12')
  g = run(g, 12)
  expect(g.monster.move).toBe('idle')
})

test('M04: the whirlwind stands 100 px ahead, and lands once (a roll through spends it)', () => {
  const at = { x: 240, groundY: 174, renderFlip: 1 as const }
  const box = hitboxes('BA04', 2, at)[0]!
  expect(240 - (box.minX + box.maxX) / 2).toBe(100)
  expect(box.maxX - box.minX).toBe(28)
  let g = parked('barioth')
  g.hunter.stamina = 0
  g.hunter.x = 240 - 100 - 2
  g.monster = { ...g.monster, move: 'tornado', t: 0, attack: { id: 't:monster:3', contacts: [] } }
  let shown = 0
  for (let i = 0; i < 36; i += 1) {
    g = step(g, true)
    shown += viewOf(g).effects.filter(e => e.fx === 'tornado').length
  }
  expect(g.hits.filter(h => h.attackId === 't:monster:3').length).toBeLessThanOrEqual(1)
  expect(shown).toBe(16)
})

test('a Barioth hunt keeps its broken wings across a new session', () => {
  let g = parked('barioth')
  g.hunt!.parts.wing_far = { durability: 0, broken: true }
  const back = restore(JSON.parse(JSON.stringify(g)) as Game)
  expect(back.hunt!.parts.wing_far!.broken).toBe(true)
  g = run(beginTurn(back), 60)
  expect(viewOf(g).scene).toBe('S02')
  expect(viewOf(g).monsterInfo?.status).toBe('破翼 1/2')
})

test('every frame of a Barioth hunt fits the Svg source limit, boxes and whirlwind included', () => {
  let g = beginTurn(newGame(13), 'barioth')
  let largest = 0
  for (let i = 0; i < 4000; i += 1) {
    g = step(g, true)
    largest = Math.max(largest, huntSvg('hunting', viewOf(g), '88:88:88', i % 2 === 0, true).length)
  }
  out.log(JSON.stringify({ largestSvg: largest }))
  expect(largest).toBeLessThan(131072)
})

test('the hunter never stands inside Barioth', () => {
  let g = beginTurn(newGame(11), 'barioth')
  let fightTicks = 0
  for (let i = 0; i < 3000; i += 1) {
    g = step(g, true)
    if (g.mode !== 'fight') continue
    fightTicks += 1
    expect(g.hunter.x + 22).toBeLessThanOrEqual(g.monster.x + BARIOTH.bounds[0])
  }
  expect(fightTicks).toBeGreaterThan(500)
})
