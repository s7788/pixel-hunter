/** Deterministic survival/commitment report: npx tsx tools/analyze_nargacuga.mts */
import { beginTurn, newGame, step } from '../hooks/engine'
import { HUNTER, TICK_MS } from '../hooks/data'

const hits: Record<string, number> = {}
let carted = 0
let duration = 0
for (let seed = 1; seed <= 20; seed += 1) {
  let g = beginTurn(newGame(seed * 104729), 'nargacuga')
  let ticks = 0
  while (g.slain === 0 && ticks < 40000) {
    const prev = g
    g = step(g, true)
    ticks += 1
    for (const hit of g.hits) {
      if (hit.tick !== g.simTick || hit.target !== 'hunter' || hit.outcome !== 'damaged') continue
      const key = `${prev.monster.move}/${prev.hunter.move}/${prev.hunter.stamina === 0 ? 'empty' : 'stamina'}`
      hits[key] = (hits[key] ?? 0) + 1
    }
  }
  if (g.carts > 0) carted += 1
  duration += ticks * TICK_MS / 60000
}
console.log(JSON.stringify({ hunts: 20, carted, meanMinutes: duration / 20, hp: HUNTER.hpMax,
  hits: Object.fromEntries(Object.entries(hits).sort((a, b) => b[1] - a[1])) }, null, 2))
if (process.argv.includes('--check') && carted > 8) process.exitCode = 1
