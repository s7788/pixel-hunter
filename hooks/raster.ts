import { HUNTER } from './data'
import type { View } from './engine'
import type { Rect } from './shapes'
import { barRects, campRects, effectRects, placeActor } from './shapes'
import { ACTIONS, SCENES } from './sprites'
import type { RleRow, SceneId } from './sprites'

/**
 * The hunt as pixels for the terminal (its `Image` shows an RGBA picture), with
 * no Svg in between: the scene's grid at 3x, the actors' RLE frames placed as
 * svg.ts places them (shared `placeActor`), the same camp props, effects and
 * bars from shapes.ts. Text (names, clock, labels) is the pane's own Text rows,
 * and the debug boxes are Desktop only.
 */
export const RASTER = { width: 384, height: 216 } as const
const W = RASTER.width
const H = RASTER.height
const SCENE_SCALE = 3

const colorCache = new Map<string, readonly [number, number, number]>()
function rgb(hex: string): readonly [number, number, number] {
  let c = colorCache.get(hex)
  if (c === undefined) {
    c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
    colorCache.set(hex, c)
  }
  return c
}

/** A row of RLE as palette letters (or '.') one per pixel, visited without building strings. */
function eachRun(row: RleRow, fn: (ch: string, x: number, len: number) => void): void {
  let x = 0
  let i = 0
  while (i < row.length) {
    const ch = row.charAt(i)
    i += 1
    let n = 0
    let has = false
    while (i < row.length && row.charCodeAt(i) >= 48 && row.charCodeAt(i) <= 57) {
      n = n * 10 + (row.charCodeAt(i) - 48)
      has = true
      i += 1
    }
    const len = has ? n : 1
    fn(ch, x, len)
    x += len
  }
}

/** An RGBA buffer the size of the picture (or smaller, for a decoded frame). */
type Pixels = { w: number; h: number; data: Uint8Array }

function decode(rows: readonly RleRow[], palette: Readonly<Record<string, string>>): Pixels {
  let w = 0
  for (const row of rows) eachRun(row, (_, x, len) => (w = Math.max(w, x + len)))
  const data = new Uint8Array(w * rows.length * 4)
  rows.forEach((row, y) =>
    eachRun(row, (ch, x, len) => {
      const hex = palette[ch]
      if (ch === '.' || hex === undefined) return
      const [r, g, b] = rgb(hex)
      for (let k = 0; k < len; k += 1) {
        const o = (y * w + x + k) * 4
        data[o] = r
        data[o + 1] = g
        data[o + 2] = b
        data[o + 3] = 255
      }
    }),
  )
  return { w, h: rows.length, data }
}

const sceneCache = new Map<SceneId, Uint8Array>()
/** The scene at 3x, opaque. */
function sceneBase(id: SceneId): Uint8Array {
  let base = sceneCache.get(id)
  if (base === undefined) {
    const s = SCENES[id]
    const small = decode(s.grid, s.palette)
    base = new Uint8Array(W * H * 4)
    for (let y = 0; y < H; y += 1) {
      const sy = Math.min(small.h - 1, Math.floor(y / SCENE_SCALE))
      for (let x = 0; x < W; x += 1) {
        const sx = Math.min(small.w - 1, Math.floor(x / SCENE_SCALE))
        const from = (sy * small.w + sx) * 4
        const to = (y * W + x) * 4
        base[to] = small.data[from]!
        base[to + 1] = small.data[from + 1]!
        base[to + 2] = small.data[from + 2]!
        base[to + 3] = 255
      }
    }
    sceneCache.set(id, base)
  }
  return base
}

const frameCache = new Map<string, Pixels>()
function frame(action: keyof typeof ACTIONS, index: number): Pixels {
  const key = `${action}:${index}`
  let px = frameCache.get(key)
  if (px === undefined) {
    const sprite = ACTIONS[action]
    px = decode(sprite.frames[index] ?? sprite.frames[0] ?? [], sprite.palette)
    frameCache.set(key, px)
  }
  return px
}

/**
 * Source-over one pixel; the destination is opaque. On a layer (transparent
 * until painted) a pixel is painted whole and marked opaque, or left alone
 * when mostly see-through (alpha under a half).
 */
function put(dst: Uint8Array, x: number, y: number, r: number, g: number, b: number, a: number, layer = false): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const o = (y * W + x) * 4
  if (layer) {
    if (a < 0.5) return
    dst[o] = r
    dst[o + 1] = g
    dst[o + 2] = b
    dst[o + 3] = 255
  } else if (a >= 1) {
    dst[o] = r
    dst[o + 1] = g
    dst[o + 2] = b
  } else {
    dst[o] = Math.round(dst[o]! + (r - dst[o]!) * a)
    dst[o + 1] = Math.round(dst[o + 1]! + (g - dst[o + 1]!) * a)
    dst[o + 2] = Math.round(dst[o + 2]! + (b - dst[o + 2]!) * a)
  }
}

function fillRects(dst: Uint8Array, list: readonly Rect[], layer = false): void {
  for (const q of list) {
    const [r, g, b] = rgb(q.fill)
    const a = q.alpha ?? 1
    const x1 = Math.round(q.x + q.w)
    const y1 = Math.round(q.y + q.h)
    for (let y = Math.max(0, Math.round(q.y)); y < Math.min(H, y1); y += 1) {
      for (let x = Math.max(0, Math.round(q.x)); x < Math.min(W, x1); x += 1) put(dst, x, y, r, g, b, a, layer)
    }
  }
}

function drawActor(dst: Uint8Array, a: Parameters<typeof placeActor>[0], ground: number, layer = false): void {
  const at = placeActor(a, ground)
  const px = frame(a.action, a.frame)
  for (let y = 0; y < px.h; y += 1) {
    const dy = at.top + y
    if (dy < 0 || dy >= H) continue
    for (let x = 0; x < px.w; x += 1) {
      const from = (y * px.w + x) * 4
      if (px.data[from + 3] === 0) continue
      put(dst, at.flip ? at.tx - x - 1 : at.tx + x, dy, px.data[from]!, px.data[from + 1]!, px.data[from + 2]!, 1, layer)
    }
  }
}

/** The picture at one tick: W x H x 4 bytes of RGBA; `isFrozen` lays the pause veil over it. */
export function huntRgba(view: View, isFrozen: boolean): Uint8Array {
  const ground = SCENES[view.scene].ground * SCENE_SCALE
  const out = sceneBase(view.scene).slice()
  if (view.camp !== null) fillRects(out, campRects(view.camp))
  if (view.monster !== null) drawActor(out, view.monster, ground + (view.monster.lift ?? 0))
  drawActor(out, view.hunter, ground)
  fillRects(out, effectRects(view.effects))
  const low = view.hp <= HUNTER.hpMax / 4
  fillRects(out, [
    ...barRects(34, 9, HUNTER.hpMax, view.hp, low ? '#e8402a' : '#2ee05a', '#2a3550'),
    ...barRects(34, 25, HUNTER.staminaMax, view.stamina, '#ffd21f', '#2a3550'),
  ])
  if (isFrozen) fillRects(out, [{ x: 0, y: 0, w: W, h: H, fill: '#0b1a3a', alpha: 0.55 }])
  return out
}

/** Everything but the scene on a transparent layer: camp props, the actors, the effects. */
function actorLayer(view: View): Uint8Array {
  const ground = SCENES[view.scene].ground * SCENE_SCALE
  const out = new Uint8Array(W * H * 4)
  if (view.camp !== null) fillRects(out, campRects(view.camp), true)
  if (view.monster !== null) drawActor(out, view.monster, ground + (view.monster.lift ?? 0), true)
  drawActor(out, view.hunter, ground, true)
  fillRects(out, effectRects(view.effects), true)
  return out
}

/**
 * The part of the picture the terminal cells show: the fight (the hunter and
 * the monster's head-to-hips, or the hunter and the fire at camp), at least
 * MIN_WINDOW wide, in the cells' shape, its foot a little under the ground.
 */
// the whole scene (the person chose it over closer framings); a smaller minimum zooms in on the fight
const MIN_WINDOW: number = W
export function cameraWindow(view: View, columns: number, rows: number, minWidth = MIN_WINDOW): { x: number; y: number; w: number; h: number } {
  const ground = SCENES[view.scene].ground * SCENE_SCALE
  const hx = view.hunter.x
  const [from, to] =
    view.monster !== null ? [Math.min(hx - 30, view.monster.x - 110), Math.max(hx + 40, view.monster.x + 115)] : [Math.min(hx - 40, 70), Math.max(hx + 40, 140)]
  const shape = (rows * 2) / columns
  let w = Math.min(W, Math.max(minWidth, to - from))
  let h = w * shape
  if (h > H) {
    h = H
    w = h / shape
  }
  const x = Math.max(0, Math.min(W - w, (from + to) / 2 - w / 2))
  const bottom = Math.min(H, ground + 14)
  const y = Math.max(0, bottom - h)
  return { x, y, w, h: Math.min(h, H - y) }
}

/**
 * The picture as terminal cells (the `Raster` element) for terminals that draw
 * no images, made to stay crisp at a few dozen columns: the camera window
 * sampled to `columns * 2` x `rows * 2` pixels (2 x 2 a cell), each pixel the
 * most common colour under it (never a blend), an actor or effect winning
 * wherever it covers a quarter of the pixel, a dark rim round the actors, the
 * scene behind dimmed so the fight stands out. Each cell then becomes the
 * quadrant glyph (▘▝▀▖▌▞▛▗▚▐▜▄▙▟█) splitting its four pixels between the two
 * of their colours that fit them best. Returns the element's `cells`: base64
 * of little-endian u32 triplets [code point, foreground, background], 0x00RRGGBB.
 */
/**
 * How the cells draw: `minWidth` of the camera window (the whole scene by
 * default), `backdrop` the scene itself or two flat bands (sky and ground, the
 * scene's own most common colours), `sceneDim` how far it is pulled to black,
 * `boost` extra saturation and light on the actors (0 = as drawn).
 */
export type CellStyle = { minWidth?: number; backdrop?: 'scene' | 'flat'; sceneDim?: number; boost?: number }

const flatCache = new Map<SceneId, { sky: number; ground: number; line: number }>()
/** A scene as two flat bands: the most common colour above its ground line and below it. */
function flatBands(id: SceneId): { sky: number; ground: number; line: number } {
  let bands = flatCache.get(id)
  if (bands === undefined) {
    const base = sceneBase(id)
    const groundY = SCENES[id].ground * SCENE_SCALE
    const most = (y0: number, y1: number): number => {
      const n = new Map<number, number>()
      for (let y = y0; y < y1; y += 3) {
        for (let x = 0; x < W; x += 3) {
          const o = (y * W + x) * 4
          const c = (base[o]! << 16) | (base[o + 1]! << 8) | base[o + 2]!
          n.set(c, (n.get(c) ?? 0) + 1)
        }
      }
      return [...n.entries()].sort((a, b) => b[1] - a[1])[0]![0]
    }
    const ground = most(groundY, H)
    bands = { sky: most(0, groundY), ground, line: lighten(ground, 0.35) }
    flatCache.set(id, bands)
  }
  return bands
}

const lighten = (c: number, k: number): number =>
  (Math.round(((c >> 16) & 255) + (255 - ((c >> 16) & 255)) * k) << 16) |
  (Math.round(((c >> 8) & 255) + (255 - ((c >> 8) & 255)) * k) << 8) |
  Math.round((c & 255) + (255 - (c & 255)) * k)

/** More saturated and a little lighter by `k` (0 = unchanged). */
function boosted(c: number, k: number): number {
  if (k === 0) return c
  const ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255]
  const mean = (ch[0]! + ch[1]! + ch[2]!) / 3
  const [r, g, b] = ch.map(v => Math.max(0, Math.min(255, Math.round((mean + (v - mean) * (1 + k)) * (1 + k / 3)))))
  return (r! << 16) | (g! << 8) | b!
}

export function huntCells(view: View, isFrozen: boolean, columns: number, rows: number, style: CellStyle = {}): string {
  const scene = sceneBase(view.scene)
  const layer = actorLayer(view)
  const cam = cameraWindow(view, columns, rows, style.minWidth ?? MIN_WINDOW)
  const sceneDim = style.sceneDim ?? SCENE_DIM
  const boost = style.boost ?? 0
  const flat = style.backdrop === 'flat' ? flatBands(view.scene) : null
  const groundY = SCENES[view.scene].ground * SCENE_SCALE
  const gw = columns * 2
  const gh = rows * 2
  const color = new Uint32Array(gw * gh)
  const actor = new Uint8Array(gw * gh)
  const counts = new Map<number, number>()
  const mode = (): number => {
    let best = 0
    let most = -1
    for (const [c, n] of counts) {
      if (n > most) {
        most = n
        best = c
      }
    }
    return best
  }
  for (let py = 0; py < gh; py += 1) {
    const y0 = Math.floor(cam.y + (py * cam.h) / gh)
    const y1 = Math.min(H, Math.max(y0 + 1, Math.floor(cam.y + ((py + 1) * cam.h) / gh)))
    for (let px = 0; px < gw; px += 1) {
      const x0 = Math.floor(cam.x + (px * cam.w) / gw)
      const x1 = Math.min(W, Math.max(x0 + 1, Math.floor(cam.x + ((px + 1) * cam.w) / gw)))
      // the most common actor colour when actors cover a quarter, else the most common scene colour, dimmed
      let covered = 0
      counts.clear()
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const o = (y * W + x) * 4
          if (layer[o + 3] === 0) continue
          covered += 1
          const c = (layer[o]! << 16) | (layer[o + 1]! << 8) | layer[o + 2]!
          counts.set(c, (counts.get(c) ?? 0) + 1)
        }
      }
      const k = py * gw + px
      if (covered * 4 >= (x1 - x0) * (y1 - y0)) {
        actor[k] = 1
        color[k] = boosted(mode(), boost)
        continue
      }
      if (flat !== null) {
        const mid = (y0 + y1) / 2
        color[k] = darken(y1 <= groundY ? flat.sky : y0 <= groundY && mid >= groundY - 1 ? flat.line : flat.ground, sceneDim)
        continue
      }
      counts.clear()
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const o = (y * W + x) * 4
          const c = (scene[o]! << 16) | (scene[o + 1]! << 8) | scene[o + 2]!
          counts.set(c, (counts.get(c) ?? 0) + 1)
        }
      }
      color[k] = darken(mode(), sceneDim)
    }
  }
  // a dark rim on the scene round every actor pixel (left, right, above, below)
  for (let py = 0; py < gh; py += 1) {
    for (let px = 0; px < gw; px += 1) {
      const k = py * gw + px
      if (actor[k] === 1) continue
      const near =
        (px > 0 && actor[k - 1] === 1) || (px < gw - 1 && actor[k + 1] === 1) || (py > 0 && actor[k - gw] === 1) || (py < gh - 1 && actor[k + gw] === 1)
      if (near) color[k] = RIM
    }
  }
  if (isFrozen) for (let k = 0; k < color.length; k += 1) color[k] = darken(color[k]!, 0.55)
  const words = new Uint32Array(columns * rows * 3)
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const k = row * 2 * gw + col * 2
      const [glyph, fg, bg] = quadrant(color[k]!, color[k + 1]!, color[k + gw]!, color[k + gw + 1]!)
      const o = (row * columns + col) * 3
      words[o] = glyph
      words[o + 1] = fg
      words[o + 2] = bg
    }
  }
  return toBase64(new Uint8Array(words.buffer))
}

/** The rim drawn round the actors in the cells. */
const RIM = 0x0a0c14
/** Quadrant glyphs by which of the four pixels (bit 0 upper left, 1 upper right, 2 lower left, 3 lower right) take the foreground. */
const QUADRANTS = [0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588]

const distance = (a: number, b: number): number => {
  const dr = ((a >> 16) & 255) - ((b >> 16) & 255)
  const dg = ((a >> 8) & 255) - ((b >> 8) & 255)
  const db = (a & 255) - (b & 255)
  return dr * dr + dg * dg + db * db
}

/**
 * One cell from its four pixels (upper left, upper right, lower left, lower
 * right): the two of their colours that fit them best, each pixel taking the
 * nearer; returns [glyph, foreground, background]. Exact when they have at most
 * two colours.
 */
export function quadrant(ul: number, ur: number, ll: number, lr: number): [number, number, number] {
  const px = [ul, ur, ll, lr]
  const colors = [...new Set(px)]
  if (colors.length === 1) return [0x2588, ul, ul]
  let best: [number, number, number] = [0x2580, ul, ll]
  let bestErr = Infinity
  for (let i = 0; i < colors.length; i += 1) {
    for (let j = i + 1; j < colors.length; j += 1) {
      const fg = colors[i]!
      const bg = colors[j]!
      let mask = 0
      let err = 0
      px.forEach((c, b) => {
        const df = distance(c, fg)
        const dbg = distance(c, bg)
        if (df <= dbg) mask |= 1 << b
        err += Math.min(df, dbg)
      })
      if (err < bestErr) {
        bestErr = err
        best = [QUADRANTS[mask]!, fg, bg]
      }
    }
  }
  return best
}

/** How much the scene behind the fight is pulled toward black in the cells. */
const SCENE_DIM = 0.4
const darken = (c: number, k: number): number =>
  (Math.round(((c >> 16) & 255) * (1 - k)) << 16) | (Math.round(((c >> 8) & 255) * (1 - k)) << 8) | Math.round((c & 255) * (1 - k))

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
/** Base64 of bytes (the runtime's own `toBase64` when it has one). */
export function toBase64(bytes: Uint8Array): string {
  const native = (bytes as unknown as { toBase64?: () => string }).toBase64
  if (typeof native === 'function') return native.call(bytes)
  let out = ''
  const n = bytes.length
  for (let i = 0; i < n; i += 3) {
    const a = bytes[i]!
    const b = i + 1 < n ? bytes[i + 1]! : 0
    const c = i + 2 < n ? bytes[i + 2]! : 0
    out += B64[a >> 2]! + B64[((a & 3) << 4) | (b >> 4)]! + (i + 1 < n ? B64[((b & 15) << 2) | (c >> 6)]! : '=') + (i + 2 < n ? B64[c & 63]! : '=')
  }
  return out
}

/** Rows the pane keeps under the picture for its words (status, HP, label, picture button, tally, debug). */
export const TEXT_ROWS = 7

/**
 * The terminal's box of cells for the picture: as many columns as the pane has
 * (to 255), rows from the 384:216 shape with cells about twice as tall as wide;
 * when that is taller than the pane leaves room for (its rows less TEXT_ROWS,
 * at least 4), the rows stop there and the columns shrink to keep the shape.
 */
export function imageCells(bodyColumns: number, bodyRows = Infinity): { columns: number; rows: number } {
  let columns = Math.max(1, Math.min(255, Math.floor(bodyColumns)))
  let rows = Math.max(1, Math.min(255, Math.round((columns * H) / W / 2)))
  const room = Math.max(4, Math.floor(bodyRows) - TEXT_ROWS)
  if (rows > room) {
    rows = room
    columns = Math.max(1, Math.min(columns, Math.round((rows * 2 * W) / H)))
  }
  return { columns, rows }
}
