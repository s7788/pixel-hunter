import type { HuntPhase } from '../types'
import { HUNTER, VELKHANA } from './data'
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

function bar(x: number, y: number, segs: number, filled: number, on: string, off: string): string {
  let out = `<rect x="${x - 2}" y="${y - 2}" width="${segs * 8 + 2}" height="10" fill="#10183a"/>`
  for (let i = 0; i < segs; i += 1) {
    out += `<rect x="${x + i * 8}" y="${y}" width="6" height="6" fill="${i < filled ? on : off}"/>`
  }
  return out
}

/** HUD_GUIDE's bottom row: one selected weapon; switching is closed during a hunt. */
function weapons(isLocked: boolean): string {
  const slots = [
    { label: '大劍', isOn: true, isV2: false },
    { label: '太刀', isOn: false, isV2: true },
    { label: '弓', isOn: false, isV2: true },
  ]
  return slots
    .map((s, i) => {
      const x = 102 + i * 62
      const edge = s.isOn ? '#ffc23a' : '#3a4f8a'
      const text = s.isV2 || (isLocked && !s.isOn) ? '#6f7fa8' : '#f4f8ff'
      return (
        `<rect x="${x}" y="${H - 24}" width="56" height="18" fill="#10183a" stroke="${edge}" stroke-width="2"/>` +
        `<text x="${x + 28}" y="${H - 11}" class="w" fill="${text}">${s.label}${s.isV2 ? ' v2' : ''}</text>`
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
    weapons(phase === 'hunting')
  )
}

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
  `.a{font:bold 13px sans-serif;fill:#f4f8ff;text-anchor:middle;paint-order:stroke;stroke:#10183a;stroke-width:3px}`

/** The picture at one tick; `isFrozen` draws the interrupted hunt under a pause veil. */
export function huntSvg(phase: HuntPhase, view: View, clock: string, isFrozen: boolean): string {
  const ground = SCENES[view.scene].ground * SCENE_SCALE
  const actors = (view.monster === null ? '' : actor(view.monster, ground)) + actor(view.hunter, ground)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges">` +
    `<style>${CSS}</style><g fill="none" stroke-width="1">${scene(view.scene)}${actors}</g>` +
    `${hud(phase, view, clock)}${isFrozen ? PAUSED : ''}</svg>`
  )
}

export const HUNT_SIZE = { width: W, height: H }
