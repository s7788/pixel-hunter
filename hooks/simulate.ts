import type { HuntGame as Game, MonsterId } from '../types'
import { HUNTER, TICK_MS } from './data'
import { beginTurn, monsterHpForTarget, newGame, step } from './engine'

/**
 * Fixed-seed batch hunts of one species for the tests (spec 8.1): the minutes
 * each took, faints, every move started, which moves landed on the hunter,
 * which attacks were thrown in which species state, and the tick times.
 * `watch` sees every tick (prev, next) for species-specific counts.
 */
export type SimStats = {
  hp: number
  minutes: number[]
  median: number
  carted: number
  moves: Record<string, number>
  landed: Record<string, number>
  thrownIn: Record<string, string[]>
  tickP95: number
  tickMax: number
}

export function simulate(id: MonsterId, seeds = 20, watch?: (prev: Game, next: Game) => void): SimStats {
  const minutes: number[] = []
  let carted = 0
  const moves: Record<string, number> = {}
  const landed: Record<string, number> = {}
  const thrownIn: Record<string, Set<string>> = {}
  const ms: number[] = []
  for (let seed = 1; seed <= seeds; seed += 1) {
    let g = beginTurn(newGame(seed * 104729), id)
    let t = 0
    while (g.slain === 0 && t < 40000) {
      const prev = g
      const t0 = Date.now()
      g = step(g, true)
      ms.push(Date.now() - t0)
      t += 1
      if (g.monster.t === 0 && g.monster.move !== prev.monster.move) moves[g.monster.move] = (moves[g.monster.move] ?? 0) + 1
      const attack = g.monster.attack?.id
      if (attack !== undefined && attack !== prev.monster.attack?.id && g.monster.t === 0) {
        ;(thrownIn[g.hunt!.state] ??= new Set()).add(g.monster.move)
      }
      for (const hit of g.hits) {
        if (hit.tick !== g.simTick || hit.target !== 'hunter' || hit.outcome !== 'damaged') continue
        landed[prev.monster.move] = (landed[prev.monster.move] ?? 0) + 1
      }
      watch?.(prev, g)
    }
    minutes.push((t * TICK_MS) / 60000)
    if (g.carts > 0) carted += 1
  }
  minutes.sort((a, b) => a - b)
  ms.sort((a, b) => a - b)
  const mid = Math.floor(minutes.length / 2)
  return {
    hp: monsterHpForTarget(id),
    minutes,
    median: minutes.length % 2 === 0 ? (minutes[mid - 1]! + minutes[mid]!) / 2 : minutes[mid]!,
    carted,
    moves,
    landed,
    thrownIn: Object.fromEntries(Object.entries(thrownIn).map(([k, v]) => [k, [...v].sort()])),
    tickP95: ms[Math.floor(ms.length * 0.95)] ?? 0,
    tickMax: ms[ms.length - 1] ?? 0,
  }
}

/** A fight of this species with both sides parked: nobody decides anything for a long while. */
export function parked(id: MonsterId, x = 240, seed = 1): Game {
  let g = beginTurn(newGame(seed), id)
  while (g.mode !== 'fight') g = step(g, true)
  g.hunter = { ...g.hunter, move: 'idle', t: 0, x: HUNTER.x, wait: 999, rollIn: -1, intent: null, attack: null, facing: 1 }
  g.monster = { ...g.monster, move: 'idle', t: 0, x, wait: 999, attack: null }
  g.hunt!.monsterHp = 10_000
  g.hunt!.monsterHpMax = 10_000
  return g
}

export const run = (g: Game, ticks: number, working = true): Game => {
  let out = g
  for (let i = 0; i < ticks; i += 1) out = step(out, working)
  return out
}

/** The stats line the tests print (minutes rounded). */
export const summary = (s: SimStats, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    hp: s.hp,
    medianMinutes: +s.median.toFixed(2),
    range: [+s.minutes[0]!.toFixed(2), +s.minutes[s.minutes.length - 1]!.toFixed(2)],
    cartRate: s.carted / s.minutes.length,
    ...extra,
    moves: s.moves,
    landedOnHunter: s.landed,
    tickP95ms: s.tickP95,
    tickMaxMs: s.tickMax,
  })
