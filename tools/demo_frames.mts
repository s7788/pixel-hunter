/**
 * Writes the frames of the README's demo: the camp, then a short fight with
 * each weapon, then the run home. Each frame is the pane's own SVG (huntSvg),
 * so the demo is the game as drawn, not a mock-up.
 *
 * Usage: npx -y tsx tools/demo_frames.mts <out dir> [en | zh-TW]   (then tools/svg_to_gif.py)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { HuntLang, HuntPhase, HuntWeapon } from '../types'
import { TICK_MS } from '../hooks/data'
import type { Game } from '../hooks/engine'
import { beginTurn, chooseWeapon, endTurn, newGame, step, viewOf } from '../hooks/engine'
import { huntSvg } from '../hooks/svg'

const out = process.argv[2] ?? 'demo-frames'
const lang: HuntLang = process.argv[3] === 'zh-TW' ? 'zh-TW' : 'en'
mkdirSync(out, { recursive: true })

let n = 0
let elapsed = 0
const clock = (): string => {
  const s = Math.floor(elapsed / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
function frame(phase: HuntPhase, g: Game): void {
  writeFileSync(join(out, `f${String(n).padStart(4, '0')}.svg`), huntSvg(phase, viewOf(g), clock(), false, lang))
  n += 1
}

// the camp: roasting meat between turns
let g = chooseWeapon(newGame(20261024), 'greatsword')
for (let i = 0; i < 60; i += 1) g = step(g, false)
for (let i = 0; i < 20; i += 1) {
  g = step(g, false)
  frame('camp', g)
}

const weapons: HuntWeapon[] = ['greatsword', 'longsword', 'bow']
weapons.forEach((weapon, w) => {
  g = beginTurn(chooseWeapon(g, weapon))
  // the first trip runs out of camp and the monster walks in; later ones cut to the fight
  while (g.mode !== 'fight') {
    g = step(g, true)
    elapsed += TICK_MS
    if (w === 0) frame('hunting', g)
  }
  // a stretch of the fight that opens with this weapon's first landed blow
  let start = 0
  while (start < 400 && !g.hits.some(h => h.tick === g.simTick && h.target === 'monster')) {
    g = step(g, true)
    elapsed += TICK_MS
    start += 1
  }
  for (let i = 0; i < 4; i += 1) g = step(g, true)
  for (let i = 0; i < 44; i += 1) {
    g = step(g, true)
    elapsed += TICK_MS
    frame('hunting', g)
  }
  // the turn is answered: run home
  g = endTurn(g)
  while (g.mode !== 'camp') {
    g = step(g, false)
    if (w === weapons.length - 1) frame('retreat', g)
  }
})
for (let i = 0; i < 12; i += 1) {
  g = step(g, false)
  frame('camp', g)
}
console.log(`${n} frames in ${out}`)
