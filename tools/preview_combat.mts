/** Write reproducible scene frames and layer samples for visual review. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beginTurn, chooseWeapon, newGame, step, viewOf } from '../hooks/engine'
import { huntRgba } from '../hooks/raster'
import { huntSvg } from '../hooks/svg'
import { actorLayers } from '../hooks/visuals'
import { ACTIONS } from '../hooks/sprites'

const out = process.argv[2]
if (!out) throw new Error('Usage: npx tsx tools/preview_combat.mts <output directory>')
mkdirSync(out, { recursive: true })
const samples = []
for (const weapon of ['longsword', 'bow'] as const) {
  for (const move of ['run', 'hit', 'down'] as const) {
    let g = beginTurn(chooseWeapon(newGame(9), weapon), 'nargacuga')
    while (g.mode !== 'fight') g = step(g, true)
    g.hunter.x = 115
    g.hunter.move = move
    const ticks = move === 'run' ? [0, 2, 4, 6] : move === 'hit' ? [0, 2, 5, 9] : [0, 8, 13, 17]
    for (const [frame, tick] of ticks.entries()) {
      g.hunter.t = tick
      const view = viewOf(g)
      const name = `${weapon}-${move}-${frame}`
      writeFileSync(join(out, `${name}.rgba`), huntRgba(view, false))
      writeFileSync(join(out, `${name}.svg`), huntSvg('hunting', view, '00:00'))
      samples.push({ name, actor: view.hunter, ...actorLayers(view.hunter) })
    }
  }
}
for (const action of ['L02', 'G05', 'V17'] as const) {
  const actor = { action, frame: action === 'L02' ? 1 : action === 'G05' ? 3 : 2, x: 190, facing: 1 as const }
  samples.push({ name: action, actor, ...actorLayers(actor) })
}
writeFileSync(join(out, 'layers.json'), JSON.stringify(samples))
writeFileSync(join(out, 'originals.json'), JSON.stringify(ACTIONS))
