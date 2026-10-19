import { expect, test } from 'claude-code/testing'

import { BOXES } from './collision-data'
import { hitboxes, hurtboxes, overlaps, toWorld } from './collision'
import { HUNTER } from './data'
import { MONSTERS, VELKHANA } from './monsters/registry'
import type { Move } from './data'
import { ACTIONS } from './sprites'
import type { ActionId } from './sprites'

const box = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY })

test('every action has valid boxes for each of its poses', () => {
  for (const [id, sprite] of Object.entries(ACTIONS) as [ActionId, (typeof ACTIONS)[ActionId]][]) {
    const data = BOXES[id]
    expect(data).toBeDefined()
    expect(data.hurt.length === 1 || data.hurt.length === sprite.frames.length).toBe(true)
    const all = [...data.hurt.flatMap(set => Object.values(set)), ...(data.hit?.boxes ?? [])]
    for (const [x0, y0, x1, y1] of all) {
      expect([x0, y0, x1, y1].every(Number.isFinite)).toBe(true)
      expect(x1 > x0 && y1 > y0).toBe(true)
      expect(y1 <= 0).toBe(true)
    }
  }
})

test('the hit pose of each attack is the active pose in data.ts', () => {
  const moves: Move[] = [...Object.values(HUNTER.moves), ...Object.values(MONSTERS).flatMap(def => Object.values(def!.moves))]
  for (const move of moves) expect(BOXES[move.action].hit?.pose).toBe(move.active)
})

test('edges and corners touching count as contact; a 1px gap does not', () => {
  expect(overlaps(box(0, 0, 10, 10), box(10, 10, 20, 20))).toBe(true)
  expect(overlaps(box(0, 0, 10, 10), box(10, 0, 20, 10))).toBe(true)
  expect(overlaps(box(0, 0, 10, 10), box(11, 0, 20, 10))).toBe(false)
})

test('mirroring flips a box around the foot anchor and keeps its width positive', () => {
  const at = { x: 96, groundY: 174, renderFlip: 1 as const }
  expect(toWorld([20, -34, 30, -20], at)).toEqual(box(116, 140, 126, 154))
  expect(toWorld([20, -34, 30, -20], { ...at, renderFlip: -1 })).toEqual(box(66, 140, 76, 154))
})

test('the hit boxes exist only on the active pose', () => {
  const at = { x: 238, groundY: 174, renderFlip: 1 as const }
  expect(hitboxes('V14', 1, at)).toEqual([])
  expect(hitboxes('V14', 2, at).length).toBe(1)
})

test('at today\'s stances the tail stab reaches the idle hunter and the charge reaches the head', () => {
  const hunter = { x: HUNTER.x, groundY: 174, renderFlip: 1 as const }
  const monster = { x: VELKHANA.minX, groundY: 174, renderFlip: 1 as const }
  const body = hurtboxes('C01', 0, hunter)[0]!.box
  expect(hitboxes('V14', 2, monster).some(b => overlaps(b, body))).toBe(true)
  const head = hurtboxes('V01', 0, monster).find(p => p.part === 'head')!.box
  expect(hitboxes('G03', 2, hunter).some(b => overlaps(b, head))).toBe(true)
})
