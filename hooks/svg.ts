import type { HuntPhase, HuntWeapon } from '../types'
import { CAMP, HUNTER, VELKHANA, WEAPONS } from './data'
import { attackReach, hitboxes, hurtboxes } from './collision'
import type { Aabb, Placement } from './collision'
import type { ActorView, View } from './engine'
import type { RleRow, SceneId } from './sprites'
import { ACTIONS, SCENES } from './sprites'

type Palette = Readonly<Record<string, string>>

/** Scenes are 128x72 grids shown at 3x; actors are 1:1 board pixels. */
const SCENE_SCALE = 3
const W = 128 * SCENE_SCALE
const H = 72 * SCENE_SCALE

const PHASE_LABEL: Record<HuntPhase, string> = {
  camp: '待機',
  hunting: '狩獵中',
  retreat: '撤退',
  paused: '暫停',
}

/**
 * One stroked path per color: each pixel run is a 1px-tall horizontal line,
 * later runs on the same row moved to relatively to keep the source short.
 */
function gridToPaths(rows: readonly RleRow[], pal: Palette): string {
  const runs = new Map<string, { d: string; row: number; end: number }>()
  rows.forEach((row, y) => {
    let x = 0
    let i = 0
    while (i < row.length) {
      const ch = row.charAt(i)
      i += 1
      let digits = ''
      while (i < row.length && row.charCodeAt(i) >= 48 && row.charCodeAt(i) <= 57) {
        digits += row.charAt(i)
        i += 1
      }
      const len = digits === '' ? 1 : Number(digits)
      const color = pal[ch]
      if (ch !== '.' && color !== undefined) {
        const run = runs.get(color) ?? { d: '', row: -1, end: 0 }
        run.d += run.row === y ? `m${x - run.end} 0h${len}` : `M${x} ${y + 0.5}h${len}`
        run.row = y
        run.end = x + len
        runs.set(color, run)
      }
      x += len
    }
  })
  let out = ''
  for (const [color, run] of runs) out += `<path stroke="${color}" d="${run.d}"/>`
  return out
}

const sceneCache = new Map<string, string>()
function scene(id: SceneId): string {
  let out = sceneCache.get(id)
  if (out === undefined) {
    const s = SCENES[id]
    out = `<g transform="scale(${SCENE_SCALE})">${gridToPaths(s.grid, s.palette)}</g>`
    sceneCache.set(id, out)
  }
  return out
}

/** An actor's frame in local coordinates, placed (and mirrored) per tick. */
const frameCache = new Map<string, string>()
function actor(a: ActorView, ground: number): string {
  const sprite = ACTIONS[a.action]
  const rows = sprite.frames[a.frame] ?? sprite.frames[0] ?? []
  const key = `${a.action}:${a.frame}`
  let paths = frameCache.get(key)
  if (paths === undefined) {
    paths = gridToPaths(rows, sprite.palette)
    frameCache.set(key, paths)
  }
  const top = ground - rows.length
  const place =
    a.facing === 1 ? `translate(${a.x - sprite.anchorX} ${top})` : `translate(${a.x + sprite.anchorX} ${top}) scale(-1 1)`
  return `<g transform="${place}">${paths}</g>`
}

/**
 * Campfire flames, one shape per flicker frame: rows from the top, each a run
 * start (from the fire's centre) and a colour letter per pixel.
 */
const FLAME_COLORS: Record<string, string> = { r: '#e8402a', o: '#ff8a1f', y: '#ffd21f', w: '#fff4c2' }
const FLAMES: readonly (readonly [number, string][])[] = [
  [[0, 'o'], [-1, 'ooo'], [-2, 'oyyo'], [-3, 'royyor'], [-3, 'rowyor'], [-4, 'roywyoor'], [-4, 'rroyyorr']],
  [[1, 'o'], [-1, 'oyo'], [-2, 'royo'], [-3, 'royyor'], [-3, 'oywwyo'], [-4, 'royywyor'], [-4, 'rroyyorr']],
  [[-1, 'o'], [-1, 'oo'], [-2, 'oyyo'], [-2, 'oywyo'], [-3, 'royyyor'], [-4, 'roywwyor'], [-4, 'rroyyorr']],
  [[0, 'r'], [0, 'oo'], [-2, 'oyo'], [-3, 'royyor'], [-3, 'oywyyo'], [-4, 'royywyor'], [-4, 'rroyyorr']],
]

function rowsToRects(rows: readonly (readonly [number, string])[], x: number, y: number, size: number, colors: Record<string, string>): string {
  let out = ''
  rows.forEach(([start, run], r) => {
    for (let i = 0; i < run.length; i += 1) {
      const c = colors[run.charAt(i)]
      if (c !== undefined) out += `<rect x="${x + (start + i) * size}" y="${y + r * size}" width="${size}" height="${size}" fill="${c}"/>`
    }
  })
  return out
}

const mix = (a: number, b: number, k: number): number => Math.round(a + (b - a) * k)
const meatColor = (cook: number): string => {
  const raw = [0xd8, 0x4a, 0x5a]
  const done = [0x8a, 0x48, 0x22]
  return '#' + raw.map((v, i) => mix(v, done[i]!, cook).toString(16).padStart(2, '0')).join('')
}

/** The camp's fire (flickering), its logs, and the meat on a spit over it. */
function campProps(camp: NonNullable<View['camp']>): string {
  const x = CAMP.fireX
  const base = CAMP.fireY
  const flame = FLAMES[camp.flicker % FLAMES.length]!
  let out =
    `<rect x="${x - 12}" y="${base - 2}" width="24" height="4" fill="#5a3418"/>` +
    `<rect x="${x - 9}" y="${base - 4}" width="18" height="3" fill="#7a4a24"/>` +
    rowsToRects(flame, x - 1, base - 4 - flame.length * 2, 2, FLAME_COLORS) +
    `<rect x="${x - 15}" y="${base - 24}" width="2" height="24" fill="#4a2c14"/>` +
    `<rect x="${x + 13}" y="${base - 24}" width="2" height="24" fill="#4a2c14"/>` +
    `<rect x="${x - 17}" y="${base - 25}" width="34" height="2" fill="#6b4020"/>`
  if (camp.cook !== null) {
    out +=
      `<rect x="${x - 6}" y="${base - 29}" width="12" height="8" fill="${meatColor(camp.cook)}"/>` +
      `<rect x="${x - 8}" y="${base - 27}" width="16" height="4" fill="${meatColor(camp.cook)}"/>` +
      `<rect x="${x - 10}" y="${base - 26}" width="2" height="2" fill="#f4f0e0"/>` +
      `<rect x="${x + 8}" y="${base - 26}" width="2" height="2" fill="#f4f0e0"/>`
  }
  return out
}

function bar(x: number, y: number, segs: number, filled: number, on: string, off: string): string {
  let out = `<rect x="${x - 2}" y="${y - 2}" width="${segs * 8 + 2}" height="10" fill="#10183a"/>`
  for (let i = 0; i < segs; i += 1) {
    out += `<rect x="${x + i * 8}" y="${y}" width="6" height="6" fill="${i < filled ? on : off}"/>`
  }
  return out
}

/** HUD_GUIDE's bottom row: the weapon in hand lit; the others dim while hunting (the camp's buttons pick). */
function weapons(inHand: HuntWeapon, isLocked: boolean): string {
  return (Object.keys(WEAPONS) as HuntWeapon[])
    .map((id, i) => {
      const x = 102 + i * 62
      const isOn = id === inHand
      const edge = isOn ? '#ffc23a' : '#3a4f8a'
      const text = isLocked && !isOn ? '#6f7fa8' : '#f4f8ff'
      return (
        `<rect x="${x}" y="${H - 24}" width="56" height="18" fill="#10183a" stroke="${edge}" stroke-width="2"/>` +
        `<text x="${x + 28}" y="${H - 11}" class="w" fill="${text}">${WEAPONS[id].label}</text>`
      )
    })
    .join('')
}

function hud(phase: HuntPhase, view: View, clock: string): string {
  const low = view.hp <= HUNTER.hpMax / 4
  return (
    `<text x="8" y="17" class="t">HP</text>${bar(34, 9, HUNTER.hpMax, view.hp, low ? '#e8402a' : '#2ee05a', '#2a3550')}` +
    `<text x="8" y="33" class="t">ST</text>${bar(34, 25, HUNTER.staminaMax, view.stamina, '#ffd21f', '#2a3550')}` +
    `<rect x="284" y="6" width="94" height="58" fill="#10183a" stroke="#f0a020" stroke-width="2"/>` +
    `<text x="331" y="21" class="n">${view.monster === null ? '—' : VELKHANA.name}</text>` +
    `<text x="331" y="31" class="p">${view.monster === null ? '' : VELKHANA.species}</text>` +
    `<text x="331" y="45" class="c">${clock}</text>` +
    `<text x="331" y="59" class="s">${PHASE_LABEL[phase]}</text>` +
    (view.label === '' ? '' : `<text x="192" y="${H - 34}" class="a">${view.label}</text>`) +
    weapons(view.weapon, phase === 'hunting')
  )
}

const rect = (b: Aabb, cls: string): string =>
  `<rect class="${cls}" x="${b.minX}" y="${b.minY}" width="${b.maxX - b.minX}" height="${b.maxY - b.minY}"/>`

/** Debug overlay: hurt (green), live hit (red), wind-up reach (grey dashed), foot anchor (cyan). */
function boxes(a: ActorView, ground: number, assetFacing: 1 | -1): string {
  const at: Placement = { x: a.x, groundY: ground, renderFlip: a.facing }
  let out = hurtboxes(a.action, a.frame, at).map(p => rect(p.box, 'bh')).join('')
  const live = hitboxes(a.action, a.frame, at)
  out += (live.length > 0 ? live.map(b => rect(b, 'bx')) : attackReach(a.action, at).map(b => rect(b, 'bw'))).join('')
  // the way the actor really faces: the hunter is drawn facing right, the monster left
  const dir = assetFacing * a.facing
  const tip = a.x + dir * 12
  out += `<path class="bd" d="M${a.x} ${ground + 5}H${tip}M${tip - dir * 3} ${ground + 2}L${tip} ${ground + 5}L${tip - dir * 3} ${ground + 8}"/>`
  return out + `<path class="ba" d="M${a.x - 3} ${ground}h6M${a.x} ${ground - 3}v6"/>`
}

/** Debug: a white cross where a hit met (grey when rolled through). */
const marks = (list: View['marks']): string =>
  list
    .map(m => `<path class="${m.outcome === 'evaded' ? 'bm bv' : 'bm'}" d="M${m.x - 4} ${m.y - 4}l8 8M${m.x + 4} ${m.y - 4}l-8 8"/>`)
    .join('')

const PAUSED =
  `<rect width="${W}" height="${H}" fill="#0b1a3a" fill-opacity="0.55"/>` +
  `<text x="${W / 2}" y="${H / 2 + 8}" class="z">暫停</text>`

const CSS =
  `.t{font:bold 13px monospace;fill:#f4f8ff}` +
  `.n{font:bold 14px sans-serif;fill:#f4f8ff;text-anchor:middle}` +
  `.p{font:10px sans-serif;fill:#a9c8ef;text-anchor:middle}` +
  `.c{font:bold 14px monospace;fill:#ffd21f;text-anchor:middle}` +
  `.s{font:bold 12px sans-serif;fill:#ffc23a;text-anchor:middle}` +
  `.w{font:bold 11px sans-serif;text-anchor:middle}` +
  `.z{font:bold 28px sans-serif;fill:#ffc23a;text-anchor:middle}` +
  `.bh{fill:#2ee05a;fill-opacity:.2;stroke:#2ee05a}` +
  `.bx{fill:#ff3030;fill-opacity:.3;stroke:#ff3030}` +
  `.bw{fill:none;stroke:#9aa3b5;stroke-dasharray:2 2}` +
  `.ba{stroke:#28e0ff}` +
  `.bd{stroke:#28e0ff;fill:none}` +
  `.bm{stroke:#ffffff;stroke-width:2}` +
  `.bv{stroke:#9aa3b5}` +
  `.a{font:bold 13px sans-serif;fill:#f4f8ff;text-anchor:middle;paint-order:stroke;stroke:#10183a;stroke-width:3px}`

/** The picture at one tick; `isFrozen` draws the interrupted hunt under a pause veil, `showBoxes` the collision overlay. */
export function huntSvg(phase: HuntPhase, view: View, clock: string, isFrozen: boolean, showBoxes = false): string {
  const ground = SCENES[view.scene].ground * SCENE_SCALE
  let actors =
    (view.camp === null ? '' : campProps(view.camp)) + (view.monster === null ? '' : actor(view.monster, ground)) + actor(view.hunter, ground)
  if (showBoxes) actors += (view.monster === null ? '' : boxes(view.monster, ground, -1)) + boxes(view.hunter, ground, 1) + marks(view.marks)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges">` +
    `<style>${CSS}</style><g fill="none" stroke-width="1">${scene(view.scene)}${actors}</g>` +
    `${hud(phase, view, clock)}${isFrozen ? PAUSED : ''}</svg>`
  )
}

export const HUNT_SIZE = { width: W, height: H }
