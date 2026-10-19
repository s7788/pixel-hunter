import { expect, test } from 'claude-code/testing'

import { hitboxes, hurtboxes } from './collision'
import { HUNTER, TICK_MS } from './data'
import type { Game } from './engine'
import { beginTurn, liftAt, monsterHpForTarget, newGame, restore, step, viewOf } from './engine'
import { TOBI_KADACHI } from './monsters/registry'
import { huntSvg } from './svg'

const run = (g: Game, ticks: number, working = true): Game => {
  let out = g
  for (let i = 0; i < ticks; i += 1) out = step(out, working)
  return out
}

/** A Tobi-Kadachi fight with both sides parked: nobody decides anything for a long while. */
function parked(seed = 1): Game {
  let g = beginTurn(newGame(seed), 'tobi_kadachi')
  while (g.mode !== 'fight') g = step(g, true)
  g.hunter = { ...g.hunter, move: 'idle', t: 0, x: HUNTER.x, wait: 999, rollIn: -1, intent: null, attack: null, facing: 1 }
  g.monster = { ...g.monster, move: 'idle', t: 0, x: 220, wait: 999, attack: null }
  g.hunt!.monsterHp = 10_000
  g.hunt!.monsterHpMax = 10_000
  return g
}

/** Start charging now: the 12 s are up and the monster is at a decision point. */
function charging(): Game {
  let g = parked()
  g.hunter.x = 20
  g.monster.wait = 1
  g.hunt!.stateT = 96
  g = step(g, true)
  expect(g.monster.move).toBe('charge')
  expect(g.hunt!.state).toBe('charging')
  return g
}

/** A charge swing that meets the monster's hurt boxes on the next tick. */
function swingAt(g: Game): Game {
  g.hunter = { ...g.hunter, x: g.monster.x - 100, move: 'charge', t: 8, attack: { id: `t:hunter:${g.simTick}`, contacts: [] } }
  return g
}

const out = (globalThis as unknown as { console: { log(text: string): void } }).console

test('20 Tobi-Kadachi hunts: median near the 3-minute target (±20%); stats printed', { timeoutMs: 300000 }, () => {
  const minutes: number[] = []
  let carted = 0
  const moves: Record<string, number> = {}
  const landed: Record<string, number> = {}
  const states: Record<string, Set<string>> = { normal: new Set(), charged: new Set() }
  let charges = 0
  let charged = 0
  let broken = 0
  const ms: number[] = []
  for (let seed = 1; seed <= 20; seed += 1) {
    let g = beginTurn(newGame(seed * 104729), 'tobi_kadachi')
    let t = 0
    while (g.slain === 0 && t < 40000) {
      const prev = g
      const t0 = Date.now()
      g = step(g, true)
      ms.push(Date.now() - t0)
      t += 1
      if (g.monster.t === 0 && g.monster.move !== prev.monster.move) moves[g.monster.move] = (moves[g.monster.move] ?? 0) + 1
      if (g.monster.move === 'charge' && prev.monster.move !== 'charge') charges += 1
      if (g.hunt?.state === 'charged' && prev.hunt?.state === 'charging') charged += 1
      if (g.hunt?.state === 'normal' && prev.hunt?.state === 'charging') broken += 1
      const id = g.monster.attack?.id
      if (id !== undefined && id !== prev.monster.attack?.id) states[g.hunt!.state]?.add(g.monster.move)
      for (const hit of g.hits) {
        if (hit.tick !== g.simTick || hit.target !== 'hunter' || hit.outcome !== 'damaged') continue
        landed[prev.monster.move] = (landed[prev.monster.move] ?? 0) + 1
      }
    }
    minutes.push((t * TICK_MS) / 60000)
    if (g.carts > 0) carted += 1
  }
  minutes.sort((a, b) => a - b)
  const median = (minutes[9]! + minutes[10]!) / 2
  ms.sort((a, b) => a - b)
  out.log(
    JSON.stringify({
      hp: monsterHpForTarget('tobi_kadachi'),
      medianMinutes: +median.toFixed(2),
      range: [+minutes[0]!.toFixed(2), +minutes[19]!.toFixed(2)],
      cartRate: carted / 20,
      charges,
      charged,
      chargeBroken: broken,
      moves,
      landedOnHunter: landed,
      tickP95ms: ms[Math.floor(ms.length * 0.95)],
      tickMaxMs: ms[ms.length - 1],
    }),
  )
  expect(median).toBeGreaterThan(TOBI_KADACHI.targetMinutes * 0.8)
  expect(median).toBeLessThan(TOBI_KADACHI.targetMinutes * 1.2)
  // TK04 only while charged; the other three in both states
  expect([...states.normal!].sort()).toEqual(['bite', 'pounce', 'tailSweep'])
  expect(states.charged!.has('chargedSlam')).toBe(true)
  expect(charged).toBeGreaterThan(0)
})

test('M02: a charge broken by 5% of max HP leaves it uncharged, with no TK04, and starts the timer again', () => {
  let g = charging()
  // a gauge nearly spent (5% of max HP when it started): this swing breaks it
  g.hunt!.parts.charge = { durability: 3, broken: false }
  g = step(swingAt(g), true)
  expect(g.hits.at(-1)?.target).toBe('monster')
  expect(g.monster.move).toBe('flinch')
  expect(g.hunt!.state).toBe('normal')
  expect(g.hunt!.stateT).toBe(0)
  expect(g.hunt!.parts.charge!.broken).toBe(true)
  expect(viewOf(g).monsterInfo?.status).toBeNull()
  // after the flinch: plain idle art, and only the normal moves for a long while
  for (let i = 0; i < 60; i += 1) {
    g = step(g, true)
    expect(g.monster.move).not.toBe('chargedSlam')
    expect(g.monster.move).not.toBe('idleCharged')
    expect(g.hunt!.state).toBe('normal')
  }
  // no hidden status on the hunter: hits only take HP
  expect(Object.keys(g.hunter).sort()).toEqual(Object.keys(parked().hunter).sort())
})

test('M02: a charge cut by an ordinary flinch does not complete either', () => {
  let g = charging()
  g.hunt!.stagger = 1_000
  g = step(swingAt(g), true)
  expect(g.monster.move).toBe('flinch')
  expect(g.hunt!.state).toBe('normal')
  g = run(g, 20)
  expect(g.hunt!.state).toBe('normal')
})

test('M02: a completed charge lasts 16 s, opens TK04 and lights the art; then an 8-tick discharge', () => {
  let g = charging()
  g = run(g, 12)
  expect(g.hunt!.state).toBe('charged')
  expect(viewOf(g).monsterInfo?.status).toBe('帶電')
  expect(g.monster.move).toBe('idleCharged')
  expect(viewOf(g).monster!.action).toBe('TK_CHARGE')
  g.monster.wait = 1
  g.hunt!.stateT = 128
  g = step(g, true)
  expect(g.monster.move).toBe('discharge')
  expect(g.hunt!.state).toBe('normal')
  g = run(g, 8)
  expect(g.monster.move).toBe('idle')
  expect(viewOf(g).monster!.action).toBe('TK_IDLE')
})

test('M02: 15% of max HP taken while charged ends it at once', () => {
  let g = run(charging(), 12)
  g.hunt!.parts.charge = { durability: 3, broken: false }
  g = step(swingAt(g), true)
  expect(g.monster.move).toBe('discharge')
  expect(g.hunt!.state).toBe('normal')
})

test('TK02: the pounce leaps 28 px and lands 80 px on; drawing and boxes follow the root', () => {
  const move = TOBI_KADACHI.moves.pounce
  const heights = Array.from({ length: 23 }, (_, t) => liftAt(move, t))
  expect(Math.min(...heights)).toBe(-28)
  expect(heights[4]).toBe(0)
  expect(heights[12]).toBe(0)
  expect(heights[22]).toBe(0)
  let g = parked()
  g.hunter.x = 20
  g.hunter.stamina = 0
  g.monster = { ...g.monster, move: 'pounce', t: 0, attack: { id: 't:monster:0', contacts: [] } }
  const startX = g.monster.x
  let airborne = false
  for (let i = 0; i < 9; i += 1) {
    g = step(g, true)
    const view = viewOf(g)
    const lift = view.monster!.lift ?? 0
    if (lift < 0) airborne = true
    const ground = 57 * 3
    const hurt = hurtboxes(view.monster!.action, view.monster!.frame, { x: g.monster.x, groundY: ground + lift, renderFlip: 1 })
    const flat = hurtboxes(view.monster!.action, view.monster!.frame, { x: g.monster.x, groundY: ground, renderFlip: 1 })
    expect(hurt[0]!.box.minY - flat[0]!.box.minY).toBe(lift)
  }
  expect(airborne).toBe(true)
  const live = hitboxes('TK02', 2, { x: g.monster.x, groundY: 171 + (viewOf(g).monster!.lift ?? 0), renderFlip: 1 })
  expect(live.length).toBe(1)
  g = run(g, 4)
  expect(startX - g.monster.x).toBe(80)
  expect(viewOf(g).monster!.lift ?? 0).toBe(0)
})

test('TK03 sweeps both sides; TK04 slams in front only', () => {
  const at = { x: 200, groundY: 171, renderFlip: 1 as const }
  const sweep = hitboxes('TK03', 2, at)[0]!
  expect(sweep.minX).toBeLessThan(200 - 90)
  expect(sweep.maxX).toBeGreaterThan(200 + 90)
  const slam = hitboxes('TK04', 2, at)[0]!
  expect(slam.maxX).toBeLessThan(200)
})

test('a charged hunt keeps its state and gauge across a new session', () => {
  let g = run(charging(), 12)
  const back = restore(JSON.parse(JSON.stringify(g)) as Game)
  expect(back.hunt!.monsterId).toBe('tobi_kadachi')
  expect(back.hunt!.state).toBe('charged')
  expect(back.hunt!.parts).toEqual(g.hunt!.parts)
  g = run(beginTurn(back), 60)
  expect(g.hunt!.monsterId).toBe('tobi_kadachi')
  expect(viewOf(g).scene).toBe('S01')
})

test('every frame of a Tobi-Kadachi hunt fits the Svg source limit, boxes included', () => {
  let g = beginTurn(newGame(13), 'tobi_kadachi')
  let largest = 0
  for (let i = 0; i < 3000; i += 1) {
    g = step(g, true)
    largest = Math.max(largest, huntSvg('hunting', viewOf(g), '88:88:88', i % 2 === 0, true).length)
  }
  out.log(JSON.stringify({ largestSvg: largest }))
  expect(largest).toBeLessThan(131072)
})

test('the hunter never stands inside Tobi-Kadachi: not under its head', () => {
  let g = beginTurn(newGame(11), 'tobi_kadachi')
  let fightTicks = 0
  for (let i = 0; i < 3000; i += 1) {
    g = step(g, true)
    if (g.mode !== 'fight') continue
    fightTicks += 1
    expect(g.hunter.x + 22).toBeLessThanOrEqual(g.monster.x + TOBI_KADACHI.bounds[0])
  }
  expect(fightTicks).toBeGreaterThan(500)
})
