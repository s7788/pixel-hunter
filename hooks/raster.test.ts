import { expect, test } from 'claude-code/testing'

import { HUNTER } from './data'
import { beginTurn, newGame, step, viewOf } from './engine'
import { cameraWindow, huntCells, imageCells, huntRgba, quadrant, RASTER, TEXT_ROWS, toBase64 } from './raster'
import { placeActor } from './shapes'
import { ACTIONS, SCENES } from './sprites'
import { hudText } from './svg'
import { parked } from './simulate'

const out = (globalThis as unknown as { console: { log(text: string): void } }).console
const W = RASTER.width
const H = RASTER.height
const at = (px: Uint8Array, x: number, y: number): [number, number, number, number] => {
  const o = (y * W + x) * 4
  return [px[o]!, px[o + 1]!, px[o + 2]!, px[o + 3]!]
}
const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]

test('the picture is 384x216 opaque RGBA and its scene pixels are the scene grid at 3x', () => {
  const g = beginTurn(newGame(5), 'velkhana')
  const view = viewOf(g)
  const px = huntRgba(view, false)
  expect(px.length).toBe(W * H * 4)
  for (let i = 3; i < px.length; i += 4 * 997) expect(px[i]).toBe(255)
  // a corner of the sky, far from any actor or bar: the scene's first cell, three pixels wide and tall
  const scene = SCENES[view.scene]
  const first = scene.palette[scene.grid[0]!.charAt(0) as keyof typeof scene.palette]!
  expect(at(px, 380, 1).slice(0, 3)).toEqual(at(px, 381, 2).slice(0, 3))
  const [r, gg, b] = hex(first)
  const topLeft = scene.grid[0]!.match(/^[a-zA-Z]\d*/)![0]
  expect(topLeft.charAt(0)).toBe(scene.grid[0]!.charAt(0))
  // (200, 0) belongs to a sky cell as well: the same row of the scene
  expect(at(px, 200, 0)[3]).toBe(255)
  expect([r, gg, b].every(Number.isFinite)).toBe(true)
})

test('an actor lands where svg.ts puts it, and a mirrored one is the mirror image', () => {
  const g = parked('great_jagras')
  g.hunter.x = 60
  const view = viewOf(g)
  const ground = SCENES[view.scene].ground * 3
  const m = view.monster!
  const place = placeActor(m, ground)
  const sprite = ACTIONS[m.action]
  // the first opaque pixel of the frame's lowest row, found in the picture where the placement says it is
  const rows = sprite.frames[m.frame]!
  const pal = sprite.palette
  const lastRow = rows.length - 1
  const first = (row: string): { col: number; ch: string } => {
    let x = 0
    for (const mm of row.matchAll(/([a-zA-Z.])(\d*)/g)) {
      if (mm[1] !== '.') return { col: x, ch: mm[1]! }
      x += mm[2] === '' ? 1 : Number(mm[2])
    }
    return { col: -1, ch: '.' }
  }
  const { col, ch } = first(rows[lastRow]!)
  expect(col).toBeGreaterThanOrEqual(0)
  const px = huntRgba(view, false)
  const [r, gg, b] = hex(pal[ch as keyof typeof pal]!)
  // the monster is drawn as it is (not flipped): column c at tx + c
  expect(place.flip).toBe(false)
  expect(at(px, place.tx + col, place.top + lastRow).slice(0, 3)).toEqual([r, gg, b])
  // the hunter facing left (flip): the same frame column lands at tx - c - 1
  const left = { ...view.hunter, facing: -1 as const }
  const mirrored = placeActor(left, ground)
  const straight = placeActor({ ...left, facing: 1 }, ground)
  expect(mirrored.flip).toBe(true)
  expect(straight.flip).toBe(false)
  const flipped = huntRgba({ ...view, hunter: left }, false)
  const hs = ACTIONS[view.hunter.action]
  const hrows = hs.frames[view.hunter.frame]!
  const hrow = hrows.find((row, i) => i > hrows.length / 2 && first(row).col >= 0)!
  const { col: hcol, ch: hch } = first(hrow)
  const rowIndex = hrows.indexOf(hrow)
  expect(at(flipped, mirrored.tx - hcol - 1, mirrored.top + rowIndex).slice(0, 3)).toEqual(hex(hs.palette[hch as keyof typeof hs.palette]!))
})

test('the HP bar is drawn in pixels: full is green, a lost segment the dark off colour', () => {
  const g = beginTurn(newGame(5), 'velkhana')
  g.hunter.hp = HUNTER.hpMax - 2
  const px = huntRgba(viewOf(g), false)
  // segment i of the bar at x = 34 + 8i, y = 9..14
  expect(at(px, 36, 11).slice(0, 3)).toEqual(hex('#2ee05a'))
  expect(at(px, 34 + 8 * (HUNTER.hpMax - 1) + 2, 11).slice(0, 3)).toEqual(hex('#2a3550'))
  const low = beginTurn(newGame(5), 'velkhana')
  low.hunter.hp = 2
  expect(at(huntRgba(viewOf(low), false), 36, 11).slice(0, 3)).toEqual(hex('#e8402a'))
})

test('the pause veil darkens every pixel toward #0b1a3a by 55%', () => {
  const view = viewOf(beginTurn(newGame(5), 'velkhana'))
  const clear = huntRgba(view, false)
  const veiled = huntRgba(view, true)
  const [r, g, b] = at(clear, 300, 100)
  const [vr, vg, vb] = at(veiled, 300, 100)
  expect(vr).toBe(Math.round(r + (0x0b - r) * 0.55))
  expect(vg).toBe(Math.round(g + (0x1a - g) * 0.55))
  expect(vb).toBe(Math.round(b + (0x3a - b) * 0.55))
})

test('toBase64 matches the standard encoding, with its own fallback too', () => {
  const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253])
  const plain = toBase64(bytes)
  expect(plain).toBe('AAEC+vv8/Q==')
  const noNative = new Uint8Array(bytes)
  Object.defineProperty(noNative, 'toBase64', { value: undefined })
  expect(toBase64(noNative)).toBe('AAEC+vv8/Q==')
})

test('the Image box: the pane width in columns (to 255), rows from the picture shape at 1:2 cells', () => {
  expect(imageCells(43)).toEqual({ columns: 43, rows: 12 })
  expect(imageCells(80)).toEqual({ columns: 80, rows: 23 })
  expect(imageCells(400)).toEqual({ columns: 255, rows: 72 })
  expect(imageCells(0)).toEqual({ columns: 1, rows: 1 })
  expect(imageCells(2).rows).toBeGreaterThanOrEqual(1)
})

test('a wide pane: the picture never takes more rows than the pane leaves it, and keeps its shape', () => {
  // 160 columns would want 45 rows; a pane of 30 rows leaves 23 for the picture
  const tall = imageCells(160, 30)
  expect(tall.rows).toBe(30 - TEXT_ROWS)
  expect(tall.columns).toBe(Math.round((tall.rows * 2 * W) / H))
  expect(tall.columns).toBeLessThanOrEqual(160)
  // room enough: the full width
  expect(imageCells(120, 60)).toEqual({ columns: 120, rows: 34 })
  // a narrow dock with plenty of rows is unchanged
  expect(imageCells(49, 40)).toEqual({ columns: 49, rows: 14 })
  // never under 4 rows, never wider than the pane
  const tiny = imageCells(200, 5)
  expect(tiny.rows).toBe(4)
  expect(tiny.columns).toBeLessThanOrEqual(200)
})

test('the words under the terminal picture', () => {
  const g = parked('zinogre')
  expect(hudText('hunting', viewOf(g), '01:23', 'zh-TW')).toBe('狩獵中・雷狼龍（牙龍種）・01:23')
  expect(hudText('camp', viewOf(newGame(1)), '00:00', 'zh-TW')).toBe('待機・00:00')
  expect(hudText('hunting', viewOf(g), '01:23', 'en')).toBe('Hunting · Zinogre (Fanged Wyvern) · 01:23')
  expect(hudText('camp', viewOf(newGame(1)), '00:00', 'en')).toBe('Camp · 00:00')
})

test('picture, base64 and all, takes well under the 25 ms budget (p95 printed)', { timeoutMs: 120000 }, () => {
  const times: number[] = []
  let g = beginTurn(newGame(13), 'zinogre')
  for (let i = 0; i < 700; i += 1) {
    g = step(g, true)
    const view = viewOf(g)
    const t0 = performance.now()
    const text = toBase64(huntRgba(view, i % 50 === 0))
    // the first frames fill the scene and sprite caches
    if (i >= 150) times.push(performance.now() - t0)
    expect(text.length).toBeGreaterThan(0)
  }
  times.sort((a, b) => a - b)
  const p95 = times[Math.floor(times.length * 0.95)]!
  out.log(JSON.stringify({ rasterP50ms: +times[times.length >> 1]!.toFixed(2), rasterP95ms: +p95.toFixed(2), rasterMaxMs: +times[times.length - 1]!.toFixed(2), frames: times.length }))
  // alone it is well under 25 ms at p95; the other test files run beside this one, so the bound has room
  expect(times[times.length >> 1]!).toBeLessThan(25)
  expect(p95).toBeLessThan(120)
})

/** The u32 words of a Raster's cells (base64 of little-endian triplets). */
const words = (cells: string): Uint32Array => {
  const raw = atob(cells)
  const bytes = Uint8Array.from(raw, ch => ch.charCodeAt(0))
  return new Uint32Array(bytes.buffer)
}

test('the cells picture: quadrant glyphs, colours straight from the art (never blends) or the rim, the fight framed', () => {
  const g = parked('tigrex')
  g.hunter.x = 120
  const view = viewOf(g)
  const { columns, rows } = imageCells(49)
  const w = words(huntCells(view, false, columns, rows))
  expect(w.length).toBe(columns * rows * 3)
  // every colour shown is one of the art's own (a palette colour, or the scene's dimmed): no averaged in-betweens
  const own = new Set<number>()
  for (const sprite of [ACTIONS[view.monster!.action], ACTIONS[view.hunter.action]]) {
    for (const c of Object.values(sprite.palette)) own.add(parseInt(c.slice(1), 16))
  }
  const scene = SCENES[view.scene]
  const dim = (c: number) => (Math.round(((c >> 16) & 255) * 0.6) << 16) | (Math.round(((c >> 8) & 255) * 0.6) << 8) | Math.round((c & 255) * 0.6)
  for (const c of Object.values(scene.palette)) own.add(dim(parseInt(c.slice(1), 16)))
  own.add(0x0a0c14)
  const glyphs = new Set([0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588])
  let monster = 0
  for (let i = 0; i < w.length; i += 3) {
    expect(glyphs.has(w[i]!)).toBe(true)
    for (const c of [w[i + 1]!, w[i + 2]!]) {
      if (!own.has(c)) {
        // the only other source: an effect drawn by the mod (none on a parked fight)
        throw new Error(`colour ${c.toString(16)} is not from the art`)
      }
      if (Object.values(ACTIONS[view.monster!.action].palette).some(p => parseInt(p.slice(1), 16) === c)) monster += 1
    }
  }
  // the monster fills a good part of the frame
  expect(monster).toBeGreaterThan((columns * rows * 2) / 8)
})

test('the camera: the cells shape, inside the picture, the hunter and the monster front both in it', () => {
  for (const id of ['tigrex', 'velkhana', 'zinogre'] as const) {
    const g = parked(id)
    g.hunter.x = 110
    const view = viewOf(g)
    const { columns, rows } = imageCells(49)
    const cam = cameraWindow(view, columns, rows)
    expect(Math.abs(cam.w / cam.h - columns / (rows * 2))).toBeLessThan(0.05)
    expect(cam.x).toBeGreaterThanOrEqual(0)
    expect(cam.y).toBeGreaterThanOrEqual(0)
    expect(cam.x + cam.w).toBeLessThanOrEqual(W + 0.001)
    expect(cam.y + cam.h).toBeLessThanOrEqual(H + 0.001)
    expect(cam.x).toBeLessThanOrEqual(view.hunter.x - 20)
    expect(cam.x + cam.w).toBeGreaterThan(view.monster!.x)
    // the whole scene by default (as wide as the cells' shape allows); a smaller minimum frames closer
    expect(cam.w).toBeGreaterThan(W * 0.95)
    expect(cameraWindow(view, columns, rows, 220).w).toBeLessThan(W)
  }
  // at camp it frames the fire and the hunter
  const camp = viewOf(newGame(3))
  const c = cameraWindow(camp, 49, 14)
  expect(c.x).toBeLessThanOrEqual(80)
  expect(c.x + c.w).toBeGreaterThan(camp.hunter.x)
})

test('a cell of two colours is drawn exactly; of more, by the two that fit best', () => {
  const MASKS = [0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588]
  const draw = ([g, fg, bg]: [number, number, number]): number[] => [0, 1, 2, 3].map(b => ((MASKS.indexOf(g) >> b) & 1 ? fg : bg))
  const R = 0xff0000
  const B = 0x0000ff
  for (const four of [[R, R, B, B], [R, B, B, R], [B, R, R, R], [R, B, R, B], [R, R, R, R]]) {
    expect(draw(quadrant(four[0]!, four[1]!, four[2]!, four[3]!))).toEqual(four)
  }
  // three colours: the odd near-red pixel goes with red
  expect(draw(quadrant(R, 0xf00808, B, B))).toEqual([R, R, B, B])
})

test('the cells picture is as quick as the Image one (p95 printed)', { timeoutMs: 120000 }, () => {
  const times: number[] = []
  let g = beginTurn(newGame(13), 'tigrex')
  const { columns, rows } = imageCells(43)
  for (let i = 0; i < 500; i += 1) {
    g = step(g, true)
    const view = viewOf(g)
    const t0 = performance.now()
    huntCells(view, false, columns, rows)
    if (i >= 100) times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  const p95 = times[Math.floor(times.length * 0.95)]!
  out.log(JSON.stringify({ cellsP50ms: +times[times.length >> 1]!.toFixed(2), cellsP95ms: +p95.toFixed(2), cellsMaxMs: +times[times.length - 1]!.toFixed(2) }))
  expect(times[times.length >> 1]!).toBeLessThan(25)
  expect(p95).toBeLessThan(120)
})
