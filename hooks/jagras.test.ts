import { expect, test } from 'claude-code/testing'

import { HUNTER, TICK_MS } from './data'
import type { Game } from './engine'
import { beginTurn, debugHunt, endTurn, migrate, monsterHpForTarget, newGame, restore, step, viewOf } from './engine'
import { GREAT_JAGRAS, MONSTERS } from './monsters/registry'
import { huntSvg } from './svg'

const run = (g: Game, ticks: number, working = true): Game => {
  let out = g
  for (let i = 0; i < ticks; i += 1) out = step(out, working)
  return out
}

/** A Great Jagras fight with both sides parked: nobody decides anything for a long while. */
function parked(seed = 1): Game {
  let g = beginTurn(newGame(seed), 'great_jagras')
  while (g.mode !== 'fight') g = step(g, true)
  g.hunter = { ...g.hunter, move: 'idle', t: 0, x: HUNTER.x, wait: 999, rollIn: -1, intent: null, attack: null, facing: 1 }
  g.monster = { ...g.monster, move: 'idle', t: 0, x: 220, wait: 999, attack: null }
  g.hunt!.monsterHp = 10_000
  g.hunt!.monsterHpMax = 10_000
  return g
}

const out = (globalThis as unknown as { console: { log(text: string): void } }).console

test('20 Great Jagras hunts: median near the 2-minute target (±20%); stats printed', { timeoutMs: 300000 }, () => {
  const minutes: number[] = []
  let carted = 0
  const moves: Record<string, number> = {}
  const landed: Record<string, number> = {}
  let inflations = 0
  let bursts = 0
  const ms: number[] = []
  for (let seed = 1; seed <= 20; seed += 1) {
    let g = beginTurn(newGame(seed * 104729), 'great_jagras')
    let t = 0
    while (g.slain === 0 && t < 40000) {
      const prev = g
      const t0 = Date.now()
      g = step(g, true)
      ms.push(Date.now() - t0)
      t += 1
      if (g.monster.move !== prev.monster.move || g.monster.t === 0) {
        if (g.monster.t === 0 && g.monster.move !== prev.monster.move) moves[g.monster.move] = (moves[g.monster.move] ?? 0) + 1
        if (g.monster.move === 'inflate' && prev.monster.move !== 'inflate') inflations += 1
        if (g.monster.move === 'burst' && prev.monster.move !== 'burst') bursts += 1
      }
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
      hp: monsterHpForTarget('great_jagras'),
      medianMinutes: +median.toFixed(2),
      range: [+minutes[0]!.toFixed(2), +minutes[19]!.toFixed(2)],
      cartRate: carted / 20,
      inflations,
      bursts,
      moves,
      landedOnHunter: landed,
      tickP95ms: ms[Math.floor(ms.length * 0.95)],
      tickMaxMs: ms[ms.length - 1],
    }),
  )
  expect(median).toBeGreaterThan(GREAT_JAGRAS.targetMinutes * 0.8)
  expect(median).toBeLessThan(GREAT_JAGRAS.targetMinutes * 1.2)
})

test('M01: normal only bites and spits, inflated only slams and rolls; both states are seen', { timeoutMs: 120000 }, () => {
  const seen: Record<string, Set<string>> = { normal: new Set(), inflated: new Set() }
  for (let seed = 1; seed <= 6; seed += 1) {
    let g = beginTurn(newGame(seed), 'great_jagras')
    for (let i = 0; i < 4000 && g.slain === 0; i += 1) {
      const prev = g
      g = step(g, true)
      const id = g.monster.attack?.id
      if (id !== undefined && id !== prev.monster.attack?.id) seen[g.hunt!.state]!.add(g.monster.move)
    }
  }
  expect([...seen.normal!].sort()).toEqual(['bite', 'spit'])
  expect([...seen.inflated!].sort()).toEqual(['roll', 'slam'])
})

test('M01: breaking the belly deflates it and puts it down for 24 ticks, once', () => {
  let g = parked()
  g.hunt!.state = 'inflated'
  g.hunt!.parts.belly = { durability: 1, broken: false }
  g.monster = { ...g.monster, move: 'idleFat', t: 0 }
  g.hunter.x = g.monster.x - 60
  // charge ticks 3,6,3,4: its active pose starts on tick 9; the blade meets the belly first
  g.hunter = { ...g.hunter, move: 'charge', t: 8, attack: { id: 't:hunter:1', contacts: [] } }
  g = step(g, true)
  expect(g.hits.at(-1)?.part).toBe('belly')
  expect(g.monster.move).toBe('burst')
  expect(g.hunt!.state).toBe('normal')
  expect(g.hunt!.parts.belly).toEqual({ durability: 0, broken: true })
  g = run(g, 8)
  expect(g.monster.move).toBe('down')
  const downs = [g.monster.move]
  for (let i = 0; i < 24; i += 1) {
    g = step(g, true)
    downs.push(g.monster.move)
  }
  expect(downs.filter(m => m === 'down').length).toBe(24)
  expect(g.monster.move).toBe('getup')
})

test('M01: it inflates after 20 s of fighting and deflates after 20 s more', () => {
  let g = parked()
  g.monster.wait = 1
  g.hunter.x = 20
  g.hunt!.stateT = 160
  g = step(g, true)
  expect(g.monster.move).toBe('inflate')
  expect(g.hunt!.state).toBe('inflated')
  g = run(g, 12)
  expect(g.monster.move).toBe('idleFat')
  g.monster.wait = 1
  g.hunt!.stateT = 160
  g = step(g, true)
  expect(g.monster.move).toBe('deflate')
  expect(g.hunt!.state).toBe('normal')
})

test('JG04: the spit flies from the mouth, lands once, and is gone when its window ends', () => {
  let g = parked()
  g.hunter.x = 40
  g.hunter.stamina = 0
  // spit ticks 4,4,12,8: the ball is live on ticks 8..19
  g.monster = { ...g.monster, move: 'spit', t: 7, attack: { id: 't:monster:0', contacts: [] } }
  const mouth = g.monster.x - 56
  let shown = 0
  for (let i = 0; i < 20; i += 1) {
    g = step(g, true)
    shown += viewOf(g).effects.length
  }
  const spit = g.hits.filter(h => h.attackId === 't:monster:0')
  expect(spit.length).toBe(1)
  expect(spit[0]!.x!).toBeLessThan(mouth - 60)
  expect(g.hunter.hp).toBeGreaterThanOrEqual(HUNTER.hpMax - 1)
  expect(shown).toBeGreaterThan(0)
  expect(viewOf(g).effects).toEqual([])
})

test('a hunt keeps its species, state, parts and cooldowns across a retreat and a new session', () => {
  let g = beginTurn(newGame(8), 'great_jagras')
  while (g.hunt!.state !== 'inflated' || g.mode !== 'fight') g = step(g, true)
  g.hunt!.cooldowns.slam = g.hunt!.fightTicks + 30
  const saved = JSON.parse(JSON.stringify(g)) as Game
  const back = restore(saved)
  expect(back.mode).toBe('camp')
  expect(back.hunt!.monsterId).toBe('great_jagras')
  expect(back.hunt!.state).toBe('inflated')
  expect(back.hunt!.parts).toEqual(g.hunt!.parts)
  expect(back.hunt!.cooldowns).toEqual(g.hunt!.cooldowns)
  const again = run(beginTurn(run(endTurn(g), 30, false)), 60)
  expect(again.hunt!.monsterId).toBe('great_jagras')
  expect(viewOf(again).scene).toBe('S01')
})

test('G09: a schema-2 save is Velkhana, HP and the fight under way kept', () => {
  const g = run(beginTurn(newGame(4), 'velkhana'), 300)
  const old = JSON.parse(JSON.stringify(g)) as Game
  old.saveSchemaVersion = 2
  for (const key of ['monsterId', 'definitionVersion', 'state', 'stateT', 'parts', 'cooldowns']) delete (old.hunt as Record<string, unknown>)[key]
  const back = migrate(old)
  expect(back.saveSchemaVersion).toBe(5)
  expect(back.hunt!.monsterId).toBe('velkhana')
  expect(back.hunt!.monsterHp).toBe(g.hunt!.monsterHp)
  expect(back.mode).toBe(g.mode)
  // the fight goes on exactly as before (the species timer starts from zero; Velkhana has none)
  const [a, b] = [step(back, true), step(g, true)]
  expect(JSON.stringify([a.hunter, a.monster, a.seed, a.hits, a.hunt!.monsterHp])).toBe(JSON.stringify([b.hunter, b.monster, b.seed, b.hits, b.hunt!.monsterHp]))
})

test('new hunts draw an enabled species from the seed; a hunt never changes species', { timeoutMs: 120000 }, () => {
  const drawn = new Set<string>()
  for (let seed = 1; seed <= 80; seed += 1) {
    const g = beginTurn(newGame(seed))
    drawn.add(g.hunt!.monsterId)
    expect(MONSTERS[g.hunt!.monsterId]!.scenes as readonly string[]).toContain(g.hunt!.scene)
    expect(run(g, 200).hunt!.monsterId).toBe(g.hunt!.monsterId)
  }
  expect([...drawn].sort()).toEqual(['anjanath', 'barioth', 'great_jagras', 'nargacuga', 'ruiner_nergigante', 'tigrex', 'tobi_kadachi', 'velkhana', 'zinogre'])
})

test('a saved hunt whose species is not registered waits at camp, kept as it was', () => {
  const g = run(beginTurn(newGame(5), 'great_jagras'), 200)
  const saved = JSON.parse(JSON.stringify(g)) as Game
  ;(saved.hunt as { monsterId: string }).monsterId = 'not_yet'
  const back = restore(saved)
  expect(back.mode).toBe('camp')
  const tried = run(beginTurn(back), 20)
  expect(tried.mode).toBe('camp')
  expect(tried.hunt!.monsterHp).toBe(g.hunt!.monsterHp)
  expect(huntSvg('camp', viewOf(tried), '00:00', true).length).toBeGreaterThan(0)
})

test('every frame of a Great Jagras hunt fits the Svg source limit, boxes and spit included', () => {
  let g = beginTurn(newGame(13), 'great_jagras')
  let largest = 0
  for (let i = 0; i < 3000; i += 1) {
    g = step(g, true)
    largest = Math.max(largest, huntSvg('hunting', viewOf(g), '88:88:88', true).length)
  }
  expect(largest).toBeLessThan(131072)
})

test('debugHunt drops the hunt under way and heads out after the species asked for', () => {
  const g = run(beginTurn(newGame(4), 'velkhana'), 300)
  expect(g.mode).toBe('fight')
  const d = debugHunt(g, 'great_jagras')
  expect(d.mode).toBe('leaving')
  expect(d.hunt!.monsterId).toBe('great_jagras')
  expect(d.hunt!.monsterHp).toBe(d.hunt!.monsterHpMax)
  expect(d.hunter.hp).toBe(HUNTER.hpMax)
  expect(d.slain).toBe(g.slain)
  const there = run(d, 60)
  expect(there.mode).toBe('fight')
  expect(viewOf(there).monsterInfo?.name).toBe('大凶豺龍')
})

test('the hunter never stands inside Great Jagras: not under its head, not in its inflated belly', () => {
  let g = beginTurn(newGame(11), 'great_jagras')
  let fightTicks = 0
  for (let i = 0; i < 3000; i += 1) {
    g = step(g, true)
    if (g.mode !== 'fight') continue
    fightTicks += 1
    const front = g.hunt!.state === 'inflated' ? -64 : -58
    expect(g.hunter.x + 22).toBeLessThanOrEqual(g.monster.x + front)
  }
  expect(fightTicks).toBeGreaterThan(500)
})
