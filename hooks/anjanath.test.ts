import { expect, test } from 'claude-code/testing'

import { contactPart, hitboxes, hurtboxes } from './collision'
import { HUNTER, TICK_MS } from './data'
import type { Game } from './engine'
import { beginTurn, monsterHpForTarget, newGame, restore, step, viewOf } from './engine'
import { ANJANATH } from './monsters/registry'
import { huntSvg } from './svg'

const run = (g: Game, ticks: number, working = true): Game => {
  let out = g
  for (let i = 0; i < ticks; i += 1) out = step(out, working)
  return out
}

/** An Anjanath fight with both sides parked: nobody decides anything for a long while. */
function parked(seed = 1): Game {
  let g = beginTurn(newGame(seed), 'anjanath')
  while (g.mode !== 'fight') g = step(g, true)
  g.hunter = { ...g.hunter, move: 'idle', t: 0, x: HUNTER.x, wait: 999, rollIn: -1, intent: null, attack: null, facing: 1 }
  g.monster = { ...g.monster, move: 'idle', t: 0, x: 240, wait: 999, attack: null }
  g.hunt!.monsterHp = 10_000
  g.hunt!.monsterHpMax = 10_000
  return g
}

/** Start readying now: the 20 s are up and the monster is at a decision point. */
function readying(): Game {
  let g = parked()
  g.hunter.x = 20
  g.monster.wait = 1
  g.hunt!.stateT = 160
  g = step(g, true)
  expect(g.monster.move).toBe('fireReady')
  expect(g.hunt!.state).toBe('readying')
  return g
}

/** A charge swing that meets the monster's hurt boxes on the next tick. */
function swingAt(g: Game): Game {
  g.hunter = { ...g.hunter, x: g.monster.x - 130, move: 'charge', t: 8, attack: { id: `t:hunter:${g.simTick}`, contacts: [] } }
  return g
}

const out = (globalThis as unknown as { console: { log(text: string): void } }).console

test('20 Anjanath hunts: median near the 4-minute target (±20%); stats printed', { timeoutMs: 300000 }, () => {
  const minutes: number[] = []
  let carted = 0
  const moves: Record<string, number> = {}
  const landed: Record<string, number> = {}
  const states: Record<string, Set<string>> = { normal: new Set(), fire: new Set() }
  let readies = 0
  let ready = 0
  let broken = 0
  const ms: number[] = []
  for (let seed = 1; seed <= 20; seed += 1) {
    let g = beginTurn(newGame(seed * 104729), 'anjanath')
    let t = 0
    while (g.slain === 0 && t < 40000) {
      const prev = g
      const t0 = Date.now()
      g = step(g, true)
      ms.push(Date.now() - t0)
      t += 1
      if (g.monster.t === 0 && g.monster.move !== prev.monster.move) moves[g.monster.move] = (moves[g.monster.move] ?? 0) + 1
      if (g.monster.move === 'fireReady' && prev.monster.move !== 'fireReady') readies += 1
      if (g.hunt?.state === 'fire' && prev.hunt?.state === 'readying') ready += 1
      if (g.hunt?.state === 'normal' && prev.hunt?.state === 'readying') broken += 1
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
      hp: monsterHpForTarget('anjanath'),
      medianMinutes: +median.toFixed(2),
      range: [+minutes[0]!.toFixed(2), +minutes[19]!.toFixed(2)],
      cartRate: carted / 20,
      readies,
      ready,
      readyBroken: broken,
      moves,
      landedOnHunter: landed,
      tickP95ms: ms[Math.floor(ms.length * 0.95)],
      tickMaxMs: ms[ms.length - 1],
    }),
  )
  expect(median).toBeGreaterThan(ANJANATH.targetMinutes * 0.8)
  expect(median).toBeLessThan(ANJANATH.targetMinutes * 1.2)
  // the breath only once ready; the other three in both states
  expect([...states.normal!].sort()).toEqual(['bite', 'charge', 'tailSweep'])
  expect(states.fire!.has('flame')).toBe(true)
  expect(ready).toBeGreaterThan(0)
})

test('M03: a ready broken by 5% of max HP leaves it unready, with no breath, and starts the timer again', () => {
  let g = readying()
  // a gauge nearly spent (5% of max HP when it started): this swing breaks it
  g.hunt!.parts.ready = { durability: 3, broken: false }
  g = step(swingAt(g), true)
  expect(g.hits.at(-1)?.target).toBe('monster')
  expect(g.monster.move).toBe('flinch')
  expect(g.hunt!.state).toBe('normal')
  expect(g.hunt!.stateT).toBe(0)
  expect(g.hunt!.parts.ready!.broken).toBe(true)
  for (let i = 0; i < 60; i += 1) {
    g = step(g, true)
    expect(g.monster.move).not.toBe('flame')
    expect(g.hunt!.state).toBe('normal')
  }
})

test('M03: a ready cut by an ordinary flinch does not complete either', () => {
  let g = readying()
  g.hunt!.stagger = 1_000
  g = step(swingAt(g), true)
  expect(g.monster.move).toBe('flinch')
  g = run(g, 20)
  expect(g.hunt!.state).toBe('normal')
})

test('M03: a finished ready lasts 18 s with the sail up; each breath is followed by a 12-tick cool-down', () => {
  let g = run(readying(), 12)
  expect(g.hunt!.state).toBe('fire')
  expect(viewOf(g).monsterInfo?.status).toBe('火焰準備')
  expect(g.monster.move).toBe('idleFire')
  // breath: 6+6+8+16 ticks, then the cool-down, then fire-ready again
  g.hunter.stamina = 0
  g.monster = { ...g.monster, move: 'flame', t: 0, attack: { id: 't:monster:9', contacts: [] } }
  g = run(g, 36)
  expect(g.monster.move).toBe('coolDown')
  g = run(g, 12)
  expect(g.monster.move).toBe('idleFire')
  expect(g.hunt!.state).toBe('fire')
  g.monster.wait = 1
  g.hunt!.stateT = 144
  g = step(g, true)
  expect(g.hunt!.state).toBe('normal')
  expect(g.monster.move).not.toBe('flame')
})

test('M03: the breath goes straight ahead only, lands once from its three boxes, and leaves nothing behind', () => {
  const at = { x: 240, groundY: 171, renderFlip: 1 as const }
  const fire = hitboxes('AN04', 2, at)
  expect(fire.length).toBe(3)
  for (const box of fire) expect(box.maxX).toBeLessThan(at.x)
  // a hunter standing behind it is never touched
  const behind = hurtboxes('C01', 0, { x: at.x + 70, groundY: 171, renderFlip: -1 })
  expect(contactPart(fire, behind)).toBeUndefined()

  let g = parked()
  g.hunter.stamina = 0
  g.hunter.x = g.monster.x - 150
  g.monster = { ...g.monster, move: 'flame', t: 0, attack: { id: 't:monster:0', contacts: [] } }
  let shown = 0
  for (let i = 0; i < 36; i += 1) {
    g = step(g, true)
    shown += viewOf(g).effects.length
  }
  const hits = g.hits.filter(h => h.attackId === 't:monster:0')
  expect(hits.length).toBe(1)
  expect(hits[0]!.damage === 3 || hits[0]!.outcome === 'evaded').toBe(true)
  expect(shown).toBeGreaterThan(0)
  expect(viewOf(g).effects).toEqual([])
  const hp = g.hunter.hp
  g = run(g, 12)
  expect(g.hits.filter(h => h.attackId === 't:monster:0').length).toBe(1)
  expect(g.hunter.hp).toBeGreaterThanOrEqual(hp)
})

test('AN02: the charge runs up to the hunter and stops at the body, never through it', () => {
  let g = parked()
  // backed against the left edge, no stamina to roll: the charge must stop at the body
  g.hunter.stamina = 0
  g.hunter.x = HUNTER.minX
  // close enough that the active window (ticks 9..14) still meets the hunter once it stops
  g.monster = { ...g.monster, move: 'charge', t: 0, x: 200, attack: { id: 't:monster:1', contacts: [] } }
  for (let i = 0; i < 27; i += 1) {
    g = step(g, true)
    expect(g.hunter.x + 22).toBeLessThanOrEqual(g.monster.x + ANJANATH.bounds[0])
  }
  const stop = HUNTER.minX + 22 - ANJANATH.bounds[0] + 2
  expect(g.monster.x).toBe(stop)
  // stopped there, its box still meets a hunter standing at the body (one who runs off shrinks out of it)
  const hit = hitboxes('AN02', 2, { x: stop, groundY: 171, renderFlip: 1 })
  expect(contactPart(hit, hurtboxes('C01', 0, { x: HUNTER.minX, groundY: 171, renderFlip: 1 }))).toBeDefined()
})

test('a fire-ready hunt keeps its state across a new session', () => {
  const g = run(readying(), 12)
  const back = restore(JSON.parse(JSON.stringify(g)) as Game)
  expect(back.hunt!.monsterId).toBe('anjanath')
  expect(back.hunt!.state).toBe('fire')
  expect(viewOf(run(beginTurn(back), 60)).scene).toBe('S01')
})

test('every frame of an Anjanath hunt fits the Svg source limit, boxes and fire included', () => {
  let g = beginTurn(newGame(13), 'anjanath')
  let largest = 0
  for (let i = 0; i < 4000; i += 1) {
    g = step(g, true)
    largest = Math.max(largest, huntSvg('hunting', viewOf(g), '88:88:88', i % 2 === 0, true).length)
  }
  out.log(JSON.stringify({ largestSvg: largest }))
  expect(largest).toBeLessThan(131072)
})

test('the hunter never stands inside Anjanath: not under its nose crest', () => {
  let g = beginTurn(newGame(11), 'anjanath')
  let fightTicks = 0
  for (let i = 0; i < 3000; i += 1) {
    g = step(g, true)
    if (g.mode !== 'fight') continue
    fightTicks += 1
    expect(g.hunter.x + 22).toBeLessThanOrEqual(g.monster.x + ANJANATH.bounds[0])
  }
  expect(fightTicks).toBeGreaterThan(500)
})
