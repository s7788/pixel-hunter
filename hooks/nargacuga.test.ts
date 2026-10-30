import { expect, test } from 'claude-code/testing'

import { hitboxes } from './collision'
import type { Game } from './engine'
import { beginTurn, newGame, restore, step, viewOf } from './engine'
import { metersOf } from './monsters/common'
import { NARGACUGA } from './monsters/registry'
import { parked, run, simulate, summary } from './simulate'
import { huntSvg } from './svg'

const out = (globalThis as unknown as { console: { log(text: string): void } }).console

test('20 Nargacuga hunts: median near the 5-minute target (±20%); stats printed', { timeoutMs: 300000 }, () => {
  let rages = 0
  const s = simulate('nargacuga', 20, (prev, next) => {
    if (next.monster.move === 'roar' && prev.monster.move !== 'roar') rages += 1
  })
  out.log(summary(s, { rages }))
  expect(s.median).toBeGreaterThan(NARGACUGA.targetMinutes * 0.8)
  expect(s.median).toBeLessThan(NARGACUGA.targetMinutes * 1.2)
  expect(rages).toBeGreaterThan(0)
  expect(s.moves.tailSlam2 ?? 0).toBeGreaterThan(0)
  // Fixed seeds previously carted in 15/20 hunts despite meeting the time target.
  expect(s.carted).toBeLessThanOrEqual(8)
})

/** Enraged or not, on the hunter's side of a tail slam (both groups in reach). */
function slamming(enraged: boolean): Game {
  const g = parked('nargacuga')
  g.hunter.stamina = 0
  g.hunter.x = g.monster.x - 120
  if (enraged) metersOf(g).rageT = 50
  const key = enraged ? 'tailSlam2' : 'tailSlam'
  g.monster = { ...g.monster, move: key, t: 0, attack: { id: 't:monster:5', contacts: [] } }
  return g
}

test('M05: the plain slam lands once; the enraged one twice, each group once, the second after a raise', () => {
  let g = slamming(false)
  const ids = new Set<string>()
  for (let i = 0; i < 24; i += 1) {
    g = step(g, true)
    if (g.monster.attack !== null) ids.add(g.monster.attack.id)
    g.hunter.hp = 12
  }
  expect(ids.size).toBe(1)
  let e = slamming(true)
  const groups: string[] = []
  const hitTicks: number[] = []
  for (let i = 0; i < 32; i += 1) {
    e = step(e, true)
    const id = e.monster.attack?.id
    if (id !== undefined && !groups.includes(id)) groups.push(id)
    for (const h of e.hits) if (h.tick === e.simTick && h.target === 'hunter') hitTicks.push(e.monster.t)
    // a hit sends the hunter reeling; stand it back up so both slams find it
    e.hunter = { ...e.hunter, hp: 12, move: 'idle', t: 0, x: e.monster.x - 120, rollIn: -1, intent: null, attack: null }
  }
  expect(groups.length).toBe(2)
  expect(hitTicks.length).toBe(2)
  expect(hitTicks[1]! - hitTicks[0]!).toBeGreaterThanOrEqual(6)
})

test('M05: the stuck tail is an opening: the hunter takes its strongest swing there', () => {
  let g = slamming(false)
  g = run(g, 13)
  expect(g.monster.move).toBe('tailSlam')
  g.hunter = { ...g.hunter, move: 'idle', wait: 1, stamina: 8, x: g.monster.x - 110 }
  g = step(g, true)
  expect(['trueCharge', 'run']).toContain(g.hunter.move === 'run' ? 'run' : g.hunter.move)
})

test('M05: the plain slam is never chosen enraged, the double never calm', () => {
  const s = simulate('nargacuga', 4)
  expect(s.moves.tailSlam ?? 0).toBeGreaterThan(0)
  const g = parked('nargacuga')
  expect(NARGACUGA.mechanic.allows(g, 'tailSlam2')).toBe(false)
  metersOf(g).rageT = 10
  expect(NARGACUGA.mechanic.allows(g, 'tailSlam')).toBe(false)
  expect(NARGACUGA.mechanic.allows(g, 'tailSlam2')).toBe(true)
})

test('NA04: three spikes leave the tail together and spread; one volley lands at most once', () => {
  const at = { x: 240, groundY: 171, renderFlip: 1 as const }
  expect(hitboxes('NA04', 2, at, -24 * 4, [-16, 0, 16]).map(b => b.minY)).toEqual([171 - 53 - 16, 171 - 53, 171 - 53 + 16])
  let g = parked('nargacuga')
  g.hunter.stamina = 0
  g.hunter.x = 40
  g.monster = { ...g.monster, move: 'spikes', t: 0, attack: { id: 't:monster:4', contacts: [] } }
  let shown = 0
  for (let i = 0; i < 28; i += 1) {
    g = step(g, true)
    shown = Math.max(shown, viewOf(g).effects.filter(e => e.fx === 'spikes').length)
  }
  expect(shown).toBe(3)
  expect(g.hits.filter(h => h.attackId === 't:monster:4').length).toBeLessThanOrEqual(1)
})

test('rage: 25% of max HP taken roars at the next decision point, lasts 12 s, then 10 s without', () => {
  let g = parked('nargacuga')
  g.hunter.x = 20
  metersOf(g).rageDmg = 2_500
  g.monster.wait = 1
  g = step(g, true)
  expect(g.monster.move).toBe('roar')
  expect(viewOf(g).monsterInfo?.status).toBe('憤怒')
  g = run(g, 104)
  expect(metersOf(g).rageT).toBe(0)
  expect(metersOf(g).rageLock).toBeGreaterThan(70)
  metersOf(g).rageDmg = 9_999
  g.monster.wait = 1
  g = step(g, true)
  expect(g.monster.move).not.toBe('roar')
})

test('a Nargacuga hunt keeps its rage across a new session', () => {
  const g = parked('nargacuga')
  metersOf(g).rageT = 40
  const back = restore(JSON.parse(JSON.stringify(g)) as Game)
  expect(back.hunt!.meters!.rageT).toBe(40)
  expect(viewOf(run(beginTurn(back), 60)).scene).toBe('S01')
})

test('every frame of a Nargacuga hunt fits the Svg source limit, boxes and spikes included', () => {
  let g = beginTurn(newGame(13), 'nargacuga')
  let largest = 0
  for (let i = 0; i < 4000; i += 1) {
    g = step(g, true)
    largest = Math.max(largest, huntSvg('hunting', viewOf(g), '88:88:88', true).length)
  }
  out.log(JSON.stringify({ largestSvg: largest }))
  expect(largest).toBeLessThan(131072)
})

test('the hunter never stands inside Nargacuga', () => {
  let g = beginTurn(newGame(11), 'nargacuga')
  for (let i = 0; i < 3000; i += 1) {
    g = step(g, true)
    if (g.mode === 'fight') expect(g.hunter.x + 22).toBeLessThanOrEqual(g.monster.x + NARGACUGA.bounds[0])
  }
})
