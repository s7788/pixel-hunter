import { expect, test } from 'claude-code/testing'

import type { Game } from './engine'
import { beginTurn, newGame, restore, step, viewOf } from './engine'
import { metersOf } from './monsters/common'
import { ZINOGRE } from './monsters/registry'
import { parked, run, simulate, summary } from './simulate'
import { huntSvg } from './svg'

const out = (globalThis as unknown as { console: { log(text: string): void } }).console

test('20 Zinogre hunts: median near the 6-minute target (±20%); stats printed', { timeoutMs: 300000 }, () => {
  let chargeUps = 0
  let supers = 0
  const s = simulate('zinogre', 20, (prev, next) => {
    if (next.monster.move === 'chargeUp' && prev.monster.move !== 'chargeUp') chargeUps += 1
    if (next.hunt?.state === 'super' && prev.hunt?.state !== 'super') supers += 1
  })
  out.log(summary(s, { chargeUps, supers }))
  expect(s.median).toBeGreaterThan(ZINOGRE.targetMinutes * 0.8)
  expect(s.median).toBeLessThan(ZINOGRE.targetMinutes * 1.2)
  expect(supers).toBeGreaterThan(0)
  expect(s.thrownIn.normal ?? []).not.toContain('burst')
  expect(s.thrownIn.super ?? []).toContain('burst')
})

function chargingUp(): Game {
  let g = parked('zinogre')
  g.hunter.x = 20
  g.monster.wait = 1
  g.hunt!.stateT = 96
  g = step(g, true)
  expect(g.monster.move).toBe('chargeUp')
  return g
}

/** A swing that meets the monster on the next tick. */
function swingAt(g: Game): Game {
  g.hunter = { ...g.hunter, x: g.monster.x - 120, move: 'charge', t: 8, attack: { id: `t:hunter:${g.simTick}`, contacts: [] } }
  return g
}

test('M07: a broken charge-up adds nothing; two finished ones make 100 and super charge', () => {
  let g = chargingUp()
  g.hunt!.parts.charge = { durability: 3, broken: false }
  g = step(swingAt(g), true)
  expect(g.monster.move).toBe('chargeBreak')
  expect(metersOf(g).charge ?? 0).toBe(0)
  expect(g.hunt!.state).toBe('normal')
  g = run(chargingUp(), 16)
  expect(metersOf(g).charge).toBe(50)
  expect(g.hunt!.state).toBe('normal')
  expect(viewOf(g).monsterInfo?.status).toBe('蓄電 50')
  g.monster = { ...g.monster, move: 'idle', t: 0, wait: 1 }
  g.hunt!.stateT = 96
  g = run(step(g, true), 16)
  expect(metersOf(g).charge).toBe(100)
  expect(g.hunt!.state).toBe('super')
  expect(g.monster.move).toBe('idleSuper')
  expect(ZINOGRE.mechanic.allows(g, 'burst')).toBe(true)
})

test('M07: super charge ends after 24 s or 20% of max HP, with a 12-tick discharge, charge back to 0', () => {
  let g = run(chargingUp(), 16)
  metersOf(g).charge = 100
  g.hunt!.state = 'super'
  g.hunt!.parts.charge = { durability: 3, broken: false }
  g = step(swingAt(g), true)
  expect(g.monster.move).toBe('discharge')
  expect(metersOf(g).charge).toBe(0)
  g = run(g, 12)
  expect(g.monster.move).toBe('idle')
  let t = parked('zinogre')
  t.hunter.x = 20
  t.hunt!.state = 'super'
  t.hunt!.stateT = 192
  metersOf(t).charge = 100
  t.monster = { ...t.monster, move: 'idleSuper', wait: 1 }
  t = step(t, true)
  expect(t.monster.move).toBe('discharge')
})

test('M07: three paws are three groups, each one damage; a hit still respects the hunter being knocked back', () => {
  let g = parked('zinogre')
  g.hunter.stamina = 0
  g.hunter.x = g.monster.x - 120
  g.monster = { ...g.monster, move: 'paws', t: 0, attack: { id: 't:monster:2', contacts: [] } }
  const groups = new Set<string>()
  for (let i = 0; i < 31; i += 1) {
    g = step(g, true)
    if (g.monster.attack !== null) groups.add(g.monster.attack.id)
  }
  expect(groups.size).toBe(3)
  const hits = g.hits.filter(h => h.target === 'hunter')
  expect(hits.every(h => h.damage <= 1)).toBe(true)
  expect(new Set(hits.map(h => h.attackId)).size).toBe(hits.length)
})

test('a super-charged Zinogre keeps its charge across a new session', () => {
  const g = parked('zinogre')
  g.hunt!.state = 'super'
  metersOf(g).charge = 100
  const back = restore(JSON.parse(JSON.stringify(g)) as Game)
  expect(back.hunt!.meters!.charge).toBe(100)
  expect(viewOf(run(beginTurn(back), 60)).scene).toBe('S01')
})

test('every frame of a Zinogre hunt fits the Svg source limit, boxes included', () => {
  let g = beginTurn(newGame(13), 'zinogre')
  let largest = 0
  for (let i = 0; i < 4000; i += 1) {
    g = step(g, true)
    largest = Math.max(largest, huntSvg('hunting', viewOf(g), '88:88:88', i % 2 === 0, true).length)
  }
  out.log(JSON.stringify({ largestSvg: largest }))
  expect(largest).toBeLessThan(131072)
})

test('the hunter never stands inside Zinogre', () => {
  let g = beginTurn(newGame(11), 'zinogre')
  for (let i = 0; i < 3000; i += 1) {
    g = step(g, true)
    if (g.mode === 'fight') expect(g.hunter.x + 22).toBeLessThanOrEqual(g.monster.x + ZINOGRE.bounds[0])
  }
})
