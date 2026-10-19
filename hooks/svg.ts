import type { HuntGame, HuntPhase, MonsterId } from '../types'
import { HUNTER } from './data'
import { attackReach, hitboxes, hurtboxes } from './collision'
import type { Aabb, Placement } from './collision'
import type { ActorView, View } from './engine'
import type { RleRow, SceneId } from './sprites'
import { ACTIONS, SCENES } from './sprites'
import { HEADS } from './gen/heads'
import type { Rect } from './shapes'
import { barRects, campRects, effectRects, placeActor } from './shapes'
import { MONSTERS } from './monsters/registry'

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
  const at = placeActor(a, ground)
  return `<g transform="translate(${at.tx} ${at.top})${at.flip ? ' scale(-1 1)' : ''}">${paths}</g>`
}

/** Flat rectangles as Svg. */
const rects = (list: readonly Rect[]): string =>
  list
    .map(q => `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="${q.fill}"${q.alpha === undefined ? '' : ` fill-opacity="${q.alpha}"`}/>`)
    .join('')

/** The bottom row: the greatsword, the only weapon in this version, centred (the longsword and bow are not scheduled). */
function weapons(): string {
  const x = (W - 56) / 2
  return (
    `<rect x="${x}" y="${H - 24}" width="56" height="18" fill="#10183a" stroke="#ffc23a" stroke-width="2"/>` +
    `<text x="${x + 28}" y="${H - 11}" class="w" fill="#f4f8ff">大劍</text>`
  )
}

function hud(phase: HuntPhase, view: View, clock: string): string {
  const low = view.hp <= HUNTER.hpMax / 4
  return (
    `<text x="8" y="17" class="t">HP</text>${rects(barRects(34, 9, HUNTER.hpMax, view.hp, low ? '#e8402a' : '#2ee05a', '#2a3550'))}` +
    `<text x="8" y="33" class="t">ST</text>${rects(barRects(34, 25, HUNTER.staminaMax, view.stamina, '#ffd21f', '#2a3550'))}` +
    `<rect x="284" y="6" width="94" height="58" fill="#10183a" stroke="#f0a020" stroke-width="2"/>` +
    `<text x="331" y="21" class="n">${view.monsterInfo?.name ?? '—'}</text>` +
    `<text x="331" y="31" class="p">${view.monsterInfo?.status ?? view.monsterInfo?.species ?? ''}</text>` +
    `<text x="331" y="45" class="c">${clock}</text>` +
    `<text x="331" y="59" class="s">${PHASE_LABEL[phase]}</text>` +
    (view.label === '' ? '' : `<text x="192" y="${H - 34}" class="a">${view.label}</text>`) +
    weapons()
  )
}

const rect = (b: Aabb, cls: string): string =>
  `<rect class="${cls}" x="${b.minX}" y="${b.minY}" width="${b.maxX - b.minX}" height="${b.maxY - b.minY}"/>`

/** Debug overlay: hurt (green), live hit (red), wind-up reach (grey dashed), foot anchor (cyan). */
function boxes(a: ActorView, ground: number, assetFacing: 1 | -1): string {
  const at: Placement = { x: a.x, groundY: ground, renderFlip: a.facing }
  let out = hurtboxes(a.action, a.frame, at).map(p => rect(p.box, 'bh')).join('')
  const live = hitboxes(a.action, a.frame, at, a.hitShift ?? 0, a.hitSpread)
  out += (live.length > 0 ? live.map(b => rect(b, 'bx')) : attackReach(a.action, at).map(b => rect(b, 'bw'))).join('')
  // the way the actor really faces: the hunter is drawn facing right, the monster left
  const dir = assetFacing * a.facing
  const tip = a.x + dir * 12
  out += `<path class="bd" d="M${a.x} ${ground + 5}H${tip}M${tip - dir * 3} ${ground + 2}L${tip} ${ground + 5}L${tip - dir * 3} ${ground + 8}"/>`
  return out + `<path class="ba" d="M${a.x - 3} ${ground}h6M${a.x} ${ground - 3}v6"/>`
}

const effects = (list: View['effects']): string => rects(effectRects(list))

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
    (view.camp === null ? '' : rects(campRects(view.camp))) +
    (view.monster === null ? '' : actor(view.monster, ground + (view.monster.lift ?? 0))) +
    actor(view.hunter, ground) +
    effects(view.effects)
  if (showBoxes) actors += (view.monster === null ? '' : boxes(view.monster, ground + (view.monster.lift ?? 0), -1)) + boxes(view.hunter, ground, 1) + marks(view.marks)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges">` +
    `<style>${CSS}</style><g fill="none" stroke-width="1">${scene(view.scene)}${actors}</g>` +
    `${hud(phase, view, clock)}${isFrozen ? PAUSED : ''}</svg>`
  )
}

export const HUNT_SIZE = { width: W, height: H }

/**
 * The words the terminal shows under the picture, where the Svg's HUD draws
 * them: phase, the species (and its state, or its kind), the clock.
 */
export function hudText(phase: HuntPhase, view: View, clock: string): string {
  const info = view.monsterInfo
  const who = info === null ? '' : `・${info.name}（${info.status ?? info.species}）`
  return `${PHASE_LABEL[phase]}${who}・${clock}`
}

/** The monsters in the order the tally lists them (the registry's). */
const roster = (): MonsterId[] => Object.keys(MONSTERS) as MonsterId[]

/** One line of text for a surface without Svg: 討伐 7：冰呪龍×3 大凶豺龍×4 (only species slain). */
export function statsText(g: HuntGame): string {
  const parts = roster()
    .filter(id => (g.slainBy[id] ?? 0) > 0)
    .map(id => `${MONSTERS[id]!.name}×${g.slainBy[id]}`)
  return `討伐 ${g.slain}${parts.length > 0 ? '：' + parts.join(' ') : ''}`
}

const STATS_H = 24
const STATS_CELL = 36
const headCache = new Map<string, string>()
function head(id: MonsterId): string {
  let paths = headCache.get(id)
  if (paths === undefined) {
    const h = HEADS[id as keyof typeof HEADS]
    paths = gridToPaths(h.rows, h.palette)
    headCache.set(id, paths)
  }
  return paths
}

/**
 * The tally strip under the scene: 討伐 N, then each species' 16x16 head and
 * ×count in registry order, a species not yet slain dimmed. Its own small Svg,
 * so the scene's source limit is untouched.
 */
export function statsSvg(g: HuntGame): string {
  let cells = ''
  roster().forEach((id, i) => {
    const n = g.slainBy[id] ?? 0
    const x = 54 + i * STATS_CELL
    cells +=
      `<g transform="translate(${x} 4)"${n === 0 ? ' opacity=".3"' : ''}><g fill="none" stroke-width="1">${head(id)}</g></g>` +
      `<text x="${x + 17}" y="16" class="k${n === 0 ? ' d' : ''}">×${n}</text>`
  })
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${STATS_H}" width="${W}" height="${STATS_H}" shape-rendering="crispEdges">` +
    `<style>.k{font:bold 11px monospace;fill:#f4f8ff}.d{fill:#6f7c99}.t{font:bold 12px sans-serif;fill:#ffc23a}</style>` +
    `<rect width="${W}" height="${STATS_H}" fill="#10183a"/>` +
    `<text x="4" y="16" class="t">討伐 ${g.slain}</text>${cells}</svg>`
  )
}
