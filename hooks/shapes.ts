import { CAMP } from './data'
import type { Aabb } from './collision'
import type { ActorView, View } from './engine'
import { ACTIONS } from './sprites'

/**
 * The small drawn things (camp props, bars, effects) as lists of flat
 * rectangles, so the Svg (svg.ts) and the pixel picture for the terminal
 * (raster.ts) draw exactly the same shapes from one description.
 */
export type Rect = { x: number; y: number; w: number; h: number; fill: string; alpha?: number }

const r = (x: number, y: number, w: number, h: number, fill: string, alpha?: number): Rect =>
  alpha === undefined ? { x, y, w, h, fill } : { x, y, w, h, fill, alpha }

/** Where an actor's frame goes: its origin and whether it is mirrored (pixel column c lands at `tx + c`, or `tx - c - 1` mirrored). */
export type ActorPlace = { tx: number; top: number; flip: boolean; rows: number }
export function placeActor(a: ActorView, ground: number): ActorPlace {
  const sprite = ACTIONS[a.action]
  const rows = (sprite.frames[a.frame] ?? sprite.frames[0] ?? []).length
  const flip = a.facing !== 1
  return { tx: flip ? a.x + sprite.anchorX : a.x - sprite.anchorX, top: ground - rows, flip, rows }
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

function flameRects(rows: readonly (readonly [number, string])[], x: number, y: number, size: number): Rect[] {
  const out: Rect[] = []
  rows.forEach(([start, run], row) => {
    for (let i = 0; i < run.length; i += 1) {
      const c = FLAME_COLORS[run.charAt(i)]
      if (c !== undefined) out.push(r(x + (start + i) * size, y + row * size, size, size, c))
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
export function campRects(camp: NonNullable<View['camp']>): Rect[] {
  const x = CAMP.fireX
  const base = CAMP.fireY
  const flame = FLAMES[camp.flicker % FLAMES.length]!
  const out = [
    r(x - 12, base - 2, 24, 4, '#5a3418'),
    r(x - 9, base - 4, 18, 3, '#7a4a24'),
    ...flameRects(flame, x - 1, base - 4 - flame.length * 2, 2),
    r(x - 15, base - 24, 2, 24, '#4a2c14'),
    r(x + 13, base - 24, 2, 24, '#4a2c14'),
    r(x - 17, base - 25, 34, 2, '#6b4020'),
  ]
  if (camp.cook !== null) {
    const meat = meatColor(camp.cook)
    out.push(
      r(x - 6, base - 29, 12, 8, meat),
      r(x - 8, base - 27, 16, 4, meat),
      r(x - 10, base - 26, 2, 2, '#f4f0e0'),
      r(x + 8, base - 26, 2, 2, '#f4f0e0'),
    )
  }
  return out
}

/** A segmented bar: a dark plate, then each segment on or off. */
export function barRects(x: number, y: number, segs: number, filled: number, on: string, off: string): Rect[] {
  const out = [r(x - 2, y - 2, segs * 8 + 2, 10, '#10183a')]
  for (let i = 0; i < segs; i += 1) out.push(r(x + i * 8, y, 6, 6, i < filled ? on : off))
  return out
}

/** A ball of stomach fluid on its live hit box: a dark rim, green body, a light glint. */
function spit(b: Aabb): Rect[] {
  const x = b.minX
  const y = b.minY
  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  return [
    r(x + 2, y, w - 4, h, '#4a5a12'),
    r(x, y + 2, w, h - 4, '#4a5a12'),
    r(x + 2, y + 2, w - 4, h - 4, '#a8c42a'),
    r(x + 4, y + 4, 4, 3, '#e8f27a'),
    r(x + w, y + h / 2 - 1, 6, 2, '#a8c42a', 0.6),
  ]
}

/** One piece of a fire breath on its live hit box: red rim, orange body, yellow core; clipped at the screen's left edge. */
function flame(b: Aabb): Rect[] {
  const x = Math.max(0, b.minX)
  const w = b.maxX - x
  const h = b.maxY - b.minY
  if (w <= 0) return []
  const y = b.minY
  const q = Math.max(2, Math.round(h / 4))
  return [
    r(x, y + q, w, h - 2 * q, '#c8361a'),
    r(x + 2, y, Math.max(0, w - 4), h, '#e8582a', 0.85),
    r(x + 2, y + q, Math.max(0, w - 4), h - 2 * q, '#ff8a1f'),
    r(x + 4, y + q + 2, Math.max(0, w - 8), Math.max(0, h - 2 * q - 4), '#ffd21f'),
  ]
}

/** An ice whirlwind standing on its live hit box: stacked bands, wider at the top, pale core. */
function tornado(b: Aabb): Rect[] {
  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  const cx = (b.minX + b.maxX) / 2
  const out: Rect[] = []
  const bands = 8
  for (let i = 0; i < bands; i += 1) {
    const bw = Math.max(6, Math.round((w * (4 + i)) / (bands + 3)))
    const y = b.maxY - ((i + 1) * h) / bands
    const shift = i % 2 === 0 ? -2 : 2
    out.push(r(cx - bw / 2 + shift, y, bw, h / bands - 1, i % 2 === 0 ? '#9fd4ff' : '#e8f6ff', 0.8))
  }
  out.push(r(cx - 2, b.minY + 4, 4, h - 8, '#ffffff', 0.7))
  return out
}

/** A thrown spike on its live hit box: a dark-edged silver shard pointing the way it flies (left). */
function spike(b: Aabb): Rect[] {
  const cy = (b.minY + b.maxY) / 2
  return [r(b.minX, cy - 1, b.maxX - b.minX + 6, 3, '#3a3f4a'), r(b.minX + 1, cy, b.maxX - b.minX + 4, 1, '#e6ecf4')]
}

/** A dive's locked landing spot: a dashed red line on the ground. */
function mark(b: Aabb): Rect[] {
  const out: Rect[] = []
  for (let x = Math.max(0, b.minX); x < b.maxX; x += 8) out.push(r(x, b.minY, 5, 2, '#ff4030'))
  return out
}

const EFFECTS: Record<View['effects'][number]['fx'], (b: Aabb) => Rect[]> = { spit, flame, tornado, spikes: spike, mark }

export const effectRects = (list: View['effects']): Rect[] => list.flatMap(e => EFFECTS[e.fx](e.box))

/** Three-tick impact spark anchored to the actual contact, never the sprite origin. */
export function impactRects(list: View['marks']): Rect[] {
  return list.flatMap(m => {
    const age = m.age ?? 0
    if (m.outcome !== 'damaged' || age >= 3) return []
    const size = 5 - age
    return [r(m.x - size, m.y - 1, size * 2 + 1, 2, '#ffd21f'),
      r(m.x - 1, m.y - size, 2, size * 2 + 1, '#fff4c2')]
  })
}
