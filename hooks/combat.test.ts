import { expect, test } from 'claude-code/testing'

import type { HuntAttack } from '../types'
import { HUNTER, TICK_MS, VELKHANA } from './data'
import type { Game } from './engine'
import { beginTurn, endTurn, migrate, newGame, restore, step, viewOf } from './engine'
import { huntSvg } from './svg'

/** A fight with both sides parked: nobody decides anything for a long while. */
function parked(seed = 1): Game {
  let g = beginTurn(newGame(seed))
  while (g.mode !== 'fight') g = step(g, true)
  g.hunter = { ...g.hunter, move: 'idle', t: 0, x: HUNTER.x, wait: 999, rollIn: -1, intent: null, attack: null, facing: 1 }
  g.monster = { ...g.monster, move: 'idle', t: 0, x: VELKHANA.minX + 38, wait: 999, attack: null }
  g.hunt!.monsterHp = 10_000
  g.hunt!.monsterHpMax = 10_000
  return g
}

const attack = (id: string): HuntAttack => ({ id, contacts: [] })

/** Put the monster's tail stab `before` ticks ahead of its first active tick. */
function tailStabIn(g: Game, before: number): Game {
  // tailStab ticks 5,3,3,3: the active pose (F3) is ticks 8..10
  g.monster = { ...g.monster, move: 'tailStab', t: 8 - before - 1, attack: attack('t:monster:0') }
  return g
}

const run = (g: Game, ticks: number): Game => {
  let out = g
  for (let i = 0; i < ticks; i += 1) out = step(out, true)
  return out
}

test('C01/C07: a tail stab in reach lands once, however long it stays in contact', () => {
  let g = tailStabIn(parked(), 0)
  g = step(g, true)
  expect(g.hunter.hp).toBe(HUNTER.hpMax - 2)
  const hunter = g.hunter.hp
  g.hunter = { ...g.hunter, move: 'idle', t: 0, wait: 999 }
  g = run(g, 2)
  expect(g.hunter.hp).toBe(hunter)
  expect(g.hits.filter(h => h.target === 'hunter').length).toBe(1)
})

test('C02: a hunter 1px out of the stab\'s reach takes nothing', () => {
  const g = parked()
  // stab box [-135..-75] from the monster; hunter body [-18..22]
  g.hunter.x = g.monster.x - 135 - 22 - 1
  const after = run(tailStabIn(g, 0), 3)
  expect(after.hunter.hp).toBe(HUNTER.hpMax)
  expect(after.monster.attack?.contacts ?? []).toEqual([])
})

test('C04/C05/C06: no damage on the wind-up; the first active tick lands; past the window nothing', () => {
  let g = tailStabIn(parked(), 1)
  g = step(g, true)
  expect(g.hunter.hp).toBe(HUNTER.hpMax)
  g = step(g, true)
  expect(g.hunter.hp).toBe(HUNTER.hpMax - 2)

  // a hunter that steps in only after the window closes is safe
  let late = parked()
  late.hunter.x = late.monster.x - 200
  late = tailStabIn(late, 0)
  late = run(late, 3)
  late.hunter.x = HUNTER.x
  late = step(late, true)
  expect(late.hunter.hp).toBe(HUNTER.hpMax)
})

test('C09/C10/C12: a contact inside the roll\'s invulnerable poses is evaded, and the group is spent', () => {
  let g = tailStabIn(parked(), 0)
  // roll ticks 2,4,4,2: invulnerable on ticks 2..9
  g.hunter = { ...g.hunter, move: 'roll', t: 1, facing: -1 }
  g = step(g, true)
  expect(g.hunter.hp).toBe(HUNTER.hpMax)
  expect(g.hits.at(-1)?.outcome).toBe('evaded')
  g.hunter = { ...g.hunter, move: 'idle', t: 0, wait: 999, x: HUNTER.x, facing: 1 }
  g = run(g, 2)
  expect(g.hunter.hp).toBe(HUNTER.hpMax)

  // the same contact one tick past the invulnerability hurts
  let after = tailStabIn(parked(), 0)
  after.hunter = { ...after.hunter, move: 'roll', t: 9, facing: -1, x: HUNTER.x + 3 }
  after = step(after, true)
  expect(after.hunter.hp).toBe(HUNTER.hpMax - 2)
})

test('C11: with no stamina the hunter never rolls', () => {
  let g = parked()
  g.hunter.stamina = 0
  g.hunter.wait = 999
  g.monster.wait = 1
  for (let i = 0; i < 40; i += 1) {
    g = step(g, true)
    g.hunter.stamina = 0
    expect(g.hunter.move).not.toBe('roll')
  }
})

test('C19: a hit on the hunter cancels the hunter\'s own swing', () => {
  let g = tailStabIn(parked(), 0)
  g.hunter = { ...g.hunter, move: 'charge', t: 2, attack: attack('t:hunter:1') }
  g = step(g, true)
  expect(g.hunter.move).toBe('hit')
  expect(g.hunter.attack).toBeNull()
})

test('C20/C21: blows on the same tick both land; a double KO is one slain and one cart', () => {
  let g = tailStabIn(parked(), 0)
  g.hunter.x = g.monster.x - 140
  // charge ticks 3,6,3,4: the active pose (F3) starts on tick 9
  g.hunter = { ...g.hunter, move: 'charge', t: 8, attack: attack('t:hunter:1'), hp: 2 }
  g.hunt!.monsterHp = 30
  const slain = g.slain
  const carts = g.carts
  g = step(g, true)
  expect(g.hits.length).toBe(2)
  expect(g.mode).toBe('slain')
  expect(g.slain).toBe(slain + 1)
  expect(g.carts).toBe(carts + 1)
  expect(g.lastOutcome).toBe('mutual_ko')
  g = run(g, 80)
  expect(g.mode).toBe('camp')
  expect(g.carts).toBe(carts + 1)
})

test('C25/C26: a saved attack that already hit does not hit again after a reload', () => {
  let g = tailStabIn(parked(), 0)
  g = step(g, true)
  const reloaded = JSON.parse(JSON.stringify(g)) as Game
  reloaded.hunter = { ...reloaded.hunter, move: 'idle', t: 0, wait: 999 }
  const after = run(reloaded, 2)
  expect(after.hunter.hp).toBe(g.hunter.hp)
})

test('C27/C28: an old save migrates to camp, HP kept, nothing under way', () => {
  const g = run(beginTurn(newGame(4)), 300)
  const old = JSON.parse(JSON.stringify(g)) as Record<string, unknown>
  for (const key of ['saveSchemaVersion', 'simTick', 'nextAttackSerial', 'lastOutcome', 'hits']) delete old[key]
  const back = migrate(old as unknown as Game)
  expect(back.saveSchemaVersion).toBe(2)
  expect(back.mode).toBe('camp')
  expect(back.hunt?.monsterHp).toBe(g.hunt?.monsterHp)
  expect(back.hunter.attack).toBeNull()
  expect(back.monster.attack).toBeNull()
  expect(restore(old as unknown as Game).hunt?.monsterHpMax).toBe(g.hunt?.monsterHpMax)
})

test('C29/C30: travel, retreat and camp never deal damage', () => {
  let g = beginTurn(newGame(6))
  for (let i = 0; i < 20; i += 1) {
    g = step(g, true)
    if (g.mode === 'fight') break
    expect(g.hunter.hp).toBe(HUNTER.hpMax)
  }
  g = tailStabIn(parked(6), 0)
  g = endTurn(g)
  for (let i = 0; i < 30; i += 1) {
    g = step(g, false)
    expect(g.hunter.hp).toBe(HUNTER.hpMax)
    expect(g.hunt!.monsterHp).toBe(10_000)
  }
})

test('C31/C35: the same seed replays the same hits; drawing boxes changes nothing', () => {
  const play = (draw: boolean): Game => {
    let g = beginTurn(newGame(21))
    for (let i = 0; i < 1500; i += 1) {
      g = step(g, true)
      if (draw) huntSvg('hunting', viewOf(g), '00:00', false, true)
    }
    return g
  }
  const a = play(false)
  const b = play(true)
  expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  expect(a.hits.length).toBeGreaterThan(0)
})

test('C36: from the usual stances the hunter runs in and lands all three swings', { timeoutMs: 60000 }, () => {
  const landed = new Set<string>()
  let tried = 0
  for (let seed = 1; seed <= 6 && landed.size < 3; seed += 1) {
    let g = beginTurn(newGame(seed))
    for (let i = 0; i < 4000; i += 1) {
      const move = g.hunter.move
      g = step(g, true)
      for (const hit of g.hits) if (hit.tick === g.simTick && hit.target === 'monster' && hit.outcome === 'damaged') landed.add(move)
      tried += 1
    }
  }
  expect([...landed].sort()).toEqual(['charge', 'tackle', 'trueCharge'])
  expect(tried).toBeGreaterThan(0)
})

test('40 hunts average the target minutes (±20%); stats and tick time printed', { timeoutMs: 300000 }, () => {
  const minutes: number[] = []
  let carted = 0
  const tally = { swings: 0, landed: 0, monsterAttacks: 0, hunterHit: 0, evaded: 0, rolls: 0 }
  const ms: number[] = []
  for (let seed = 1; seed <= 40; seed += 1) {
    let g = beginTurn(newGame(seed * 7919))
    let t = 0
    while (g.slain === 0 && t < 40000) {
      const prev = g
      const t0 = Date.now()
      g = step(g, true)
      ms.push(Date.now() - t0)
      t += 1
      if (g.hunter.attack !== null && g.hunter.attack.id !== prev.hunter.attack?.id) tally.swings += 1
      if (g.hunter.move === 'roll' && prev.hunter.move !== 'roll') tally.rolls += 1
      if (g.monster.attack !== null && g.monster.attack.id !== prev.monster.attack?.id) tally.monsterAttacks += 1
      for (const hit of g.hits) {
        if (hit.tick !== g.simTick) continue
        if (hit.target === 'monster') tally.landed += 1
        else if (hit.outcome === 'evaded') tally.evaded += 1
        else tally.hunterHit += 1
      }
    }
    minutes.push((t * TICK_MS) / 60000)
    if (g.carts > 0) carted += 1
  }
  const avg = minutes.reduce((a, b) => a + b, 0) / minutes.length
  ms.sort((a, b) => a - b)
  const p95 = ms[Math.floor(ms.length * 0.95)]
  const out = (globalThis as unknown as { console: { log(text: string): void } }).console
  out.log(
    JSON.stringify({ avgMinutes: +avg.toFixed(2), cartRate: carted / 40, ...tally, tickP95ms: p95, tickMaxMs: ms[ms.length - 1] }),
  )
  expect(avg).toBeGreaterThan(VELKHANA.targetMinutes * 0.8)
  expect(avg).toBeLessThan(VELKHANA.targetMinutes * 1.2)
})
