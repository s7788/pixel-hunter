import type { ActorView } from './engine'
import { ACTIONS } from './sprites'
import type { Sprite } from './sprites'
import { BOXES } from './collision-data'

/** Visual-only layers. Collision continues to use the original measured actions. */
export type ActorLayers = { body: Sprite; effect: Sprite }
const cache = new Map<string, ActorLayers>()
const EMBEDDED_EFFECTS = new Set(['G03', 'G05', 'L02', 'L03', 'L05', 'B04', 'B05', 'B06', 'V17'])

export function unpack(row: string): string[] {
  return [...row.matchAll(/([^0-9])([0-9]*)/g)].flatMap(m => Array(Number(m[2] || 1)).fill(m[1]))
}
export function pack(row: readonly string[]): string {
  let out = ''
  for (let i = 0; i < row.length;) {
    let end = i + 1
    while (end < row.length && row[end] === row[i]) end += 1
    out += row[i] + (end - i > 1 ? end - i : '')
    i = end
  }
  return out
}

/** Hand positions authored against the common run, recoil, and get-up key poses. */
const HANDS: Record<string, readonly (readonly [number, number])[]> = {
  C03: [[109, 46], [108, 48], [109, 44], [108, 50]],
  C15: [[91, 42], [70, 42], [87, 28], [91, 42]],
  C17: [[99, 66], [92, 65], [82, 54], [99, 42]],
}

function heldWeapon(grid: string[][], a: ActorView): void {
  const [hx, hy] = HANDS[a.action]![a.frame % 4]!
  const dot = (x: number, y: number, color: string): void => {
    if (y < 0 || y >= grid.length || x < 0) return
    while (grid[y]!.length <= x) grid[y]!.push('.')
    grid[y]![x] = color
  }
  const line = (x: number, y: number, ex: number, ey: number, color: string, width = 1): void => {
    const steps = Math.max(Math.abs(ex - x), Math.abs(ey - y), 1)
    for (let i = 0; i <= steps; i += 1) for (let d = 0; d < width; d += 1) {
      dot(Math.round(x + (ex - x) * i / steps) + d, Math.round(y + (ey - y) * i / steps), color)
    }
  }
  // The first down pose holds the weapon along the ground; later poses raise it.
  if (a.weapon === 'longsword') {
    const dx = a.action === 'C17' && a.frame < 2 ? 43 : 31
    const dy = a.action === 'C17' && a.frame < 2 ? 0 : -27
    line(hx - 7, hy + 5, hx + dx, hy + dy, 'u', 4)
    line(hx, hy, hx + dx, hy + dy, 'v', 2)
    line(hx + 1, hy - 4, hx + 7, hy + 3, 'w', 2)
    line(hx - 5, hy + 4, hx, hy, 'x', 2)
  } else {
    const points = [[0, -23], [7, -17], [11, -8], [7, 0], [11, 8], [7, 17], [0, 23]]
    for (let i = 1; i < points.length; i += 1) {
      const p = points[i - 1]!, q = points[i]!
      line(hx + p[0]!, hy + p[1]!, hx + q[0]!, hy + q[1]!, 'u', 4)
      line(hx + p[0]! + 1, hy + p[1]!, hx + q[0]! + 1, hy + q[1]!, 'w', 2)
    }
    line(hx, hy - 23, hx, hy + 23, 'v')
    line(hx + 5, hy - 3, hx + 5, hy + 3, 'x', 3)
  }
}

/** Split bright attack pixels outside the body into a separately placed layer.
 * Geometry, rather than a global color replacement, protects scarves and armor.
 * Recombining the two layers reproduces the source art exactly.
 */
export function actorLayers(a: ActorView): ActorLayers {
  const key = `${a.action}:${a.frame}:${a.weapon ?? ''}`
  const existing = cache.get(key)
  if (existing !== undefined) return existing
  const source = ACTIONS[a.action]
  const rows = source.frames[a.frame] ?? source.frames[0]!
  const body = rows.map(unpack)
  const effect = body.map(row => row.map(() => '.'))
  if (a.weapon !== undefined && HANDS[a.action] !== undefined) {
    const original = body.map(row => [...row])
    body.forEach((row, y) => row.forEach((_, x) => {
      // Remove the great sword carried on the run board and the ground blade
      // on the get-up board before attaching this weapon to its animated hand.
      if (a.action === 'C03') {
        if ((x < 78 && y < 22) || (x < 84 && y < 10)) row[x] = '.'
        const nearBody = [-2, -1, 0, 1, 2].some(dy => [-2, -1, 0, 1, 2].some(dx => ['g', 'l', 'j', 'k', 'h', 'i'].includes(original[y + dy]?.[x + dx] ?? '.')))
        if (x < 62 && y > 30 && x + y >= 70 && x + y <= 102 &&
          (!nearBody || ['a', 'b', 'd', 'e'].includes(row[x]!))) row[x] = '.'
      }
      if (a.action === 'C17' && y >= 72) row[x] = '.'
    }))
    heldWeapon(body, a)
  }
  const def = BOXES[a.action]
  // The recoil board's impact star is a visual flash, not part of the body.
  if (a.action === 'C15' && a.frame === 1) {
    body.forEach((row, y) => row.forEach((c, x) => {
      if (x >= 74 && y < 56) { effect[y]![x] = c; row[x] = '.' }
    }))
  }
  const hit = def.hit
  if (hit !== undefined && EMBEDDED_EFFECTS.has(a.action)) {
    const hurt = def.hurt[a.frame] ?? def.hurt[0] ?? {}
    const attacks = [hit, ...(def.more ?? [])].flatMap(h => h.boxes)
    body.forEach((row, y) => row.forEach((c, x) => {
      const lx = x - source.anchorX, ly = y - body.length
      const within = (b: readonly number[], margin = 0): boolean => lx >= b[0]! - margin && lx <= b[2]! + margin && ly >= b[1]! - margin && ly <= b[3]! + margin
      if (c === '.' || !attacks.some(b => within(b)) || Object.values(hurt).some(b => within(b, 4))) return
      const hex = source.palette[c] ?? '#000000'
      const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
      if (Math.max(...rgb) < 175) return
      effect[y]![x] = c
      row[x] = '.'
    }))
  }
  const palette = { ...source.palette, u: '#101020', v: '#e0ecf3', w: '#b47a34', x: '#593421' }
  const sprite = (grid: string[][]): Sprite => ({ palette, anchorX: source.anchorX, frames: [grid.map(pack)] })
  const result = { body: sprite(body), effect: sprite(effect) }
  cache.set(key, result)
  return result
}
