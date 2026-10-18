import type { LocalBox, Part } from './collision-data'
import { BOXES } from './collision-data'
import type { ActionId } from './sprites'

/**
 * Pure geometry in the 384x216 world: local boxes placed at an actor's foot
 * anchor, mirrored by its render flip. No game state is read or changed here.
 */

export type Aabb = { minX: number; minY: number; maxX: number; maxY: number }
export type PlacedBox = { part: Part; box: Aabb }

/** Where an actor stands and how its sprite is flipped (1 = as drawn). */
export type Placement = { x: number; groundY: number; renderFlip: 1 | -1 }

export function toWorld([x0, y0, x1, y1]: LocalBox, at: Placement): Aabb {
  const a = at.x + at.renderFlip * x0
  const b = at.x + at.renderFlip * x1
  return { minX: Math.min(a, b), minY: at.groundY + y0, maxX: Math.max(a, b), maxY: at.groundY + y1 }
}

/** Edges and corners touching count as contact. */
export const overlaps = (a: Aabb, b: Aabb): boolean =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY

export function hurtboxes(action: ActionId, pose: number, at: Placement): PlacedBox[] {
  const hurt = BOXES[action].hurt
  const set = hurt[pose] ?? hurt[0] ?? {}
  return (Object.entries(set) as [Part, LocalBox][]).map(([part, box]) => ({ part, box: toWorld(box, at) }))
}

/** The attack's boxes on this pose; empty off its active pose. */
export function hitboxes(action: ActionId, pose: number, at: Placement): Aabb[] {
  const hit = BOXES[action].hit
  return hit === undefined || hit.pose !== pose ? [] : hit.boxes.map(b => toWorld(b, at))
}

/** Every box of an attack action regardless of pose, for the wind-up preview. */
export function attackReach(action: ActionId, at: Placement): Aabb[] {
  return (BOXES[action].hit?.boxes ?? []).map(b => toWorld(b, at))
}

export const activePose = (action: ActionId): number | undefined => BOXES[action].hit?.pose

/** Would this attack, thrown from here, touch the target as it stands now? */
export function reaches(attack: ActionId, from: Placement, target: ActionId, pose: number, at: Placement): boolean {
  const hurt = hurtboxes(target, pose, at)
  return attackReach(attack, from).some(a => hurt.some(h => overlaps(a, h.box)))
}

const PRIORITY: Record<Part, number> = { hunter_body: 0, head: 0, body: 1, tail: 2 }

/** The part this tick's live hit boxes touch first by priority, or undefined. */
export function contactPart(hits: Aabb[], hurt: PlacedBox[]): Part | undefined {
  const touched = hurt.filter(h => hits.some(a => overlaps(a, h.box))).map(h => h.part)
  touched.sort((a, b) => PRIORITY[a] - PRIORITY[b] || a.localeCompare(b))
  return touched[0]
}
