import type { HitDef, LocalBox, Part } from './collision-data'
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

/** A local box moved `dx` pixels along the local x axis. */
export const shifted = ([x0, y0, x1, y1]: LocalBox, dx: number): LocalBox => [x0 + dx, y0, x1 + dx, y1]

/** Every attack pose of an action: the first, then a combo's others. */
export const hitDefs = (action: ActionId): HitDef[] => {
  const own = BOXES[action]
  return own.hit === undefined ? [] : [own.hit, ...(own.more ?? [])]
}

/**
 * The attack's boxes on this pose, moved `dx` local pixels (a projectile in
 * flight) and box i `dys[i]` pixels down (a spread volley); empty off its attack poses.
 */
export function hitboxes(action: ActionId, pose: number, at: Placement, dx = 0, dys?: readonly number[]): Aabb[] {
  const hit = hitDefs(action).find(h => h.pose === pose)
  if (hit === undefined) return []
  return hit.boxes.map((b, i) => {
    const moved = dx === 0 ? b : shifted(b, dx)
    const dy = dys?.[i] ?? 0
    return toWorld(dy === 0 ? moved : [moved[0], moved[1] + dy, moved[2], moved[3] + dy], at)
  })
}

/** Every box of an attack action regardless of pose, for the wind-up preview. */
export function attackReach(action: ActionId, at: Placement): Aabb[] {
  return hitDefs(action).flatMap(h => h.boxes.map(b => toWorld(b, at)))
}

export const activePose = (action: ActionId): number | undefined => BOXES[action].hit?.pose

/** Would this attack, thrown from here, touch the target as it stands now? */
export function reaches(attack: ActionId, from: Placement, target: ActionId, pose: number, at: Placement): boolean {
  return touchesAny(attackReach(attack, from), target, pose, at)
}

/** Do any of these (world) boxes touch the target as it stands now? */
export function touchesAny(boxes: Aabb[], target: ActionId, pose: number, at: Placement): boolean {
  const hurt = hurtboxes(target, pose, at)
  return boxes.some(a => hurt.some(h => overlaps(a, h.box)))
}

/** Special parts first, then head, body, tail (spec 4.9). */
const PRIORITY: Record<Part, number> = {
  belly: -1,
  wing_near: -1,
  wing_far: -1,
  spike_head: -1,
  spike_arm_near: -1,
  spike_arm_far: -1,
  hunter_body: 0,
  head: 0,
  body: 1,
  tail: 2,
}

export type Touch = { part: Part; point: { x: number; y: number } }

/**
 * The part this tick's live hit boxes touch first by priority, and the centre
 * of where they meet (the first touching hit box), or undefined.
 */
export function contactPart(hits: Aabb[], hurt: PlacedBox[]): Touch | undefined {
  const touched = hurt.filter(h => hits.some(a => overlaps(a, h.box)))
  touched.sort((a, b) => PRIORITY[a.part] - PRIORITY[b.part] || a.part.localeCompare(b.part))
  const first = touched[0]
  if (first === undefined) return undefined
  const a = hits.find(b => overlaps(b, first.box))!
  const minX = Math.max(a.minX, first.box.minX)
  const maxX = Math.min(a.maxX, first.box.maxX)
  const minY = Math.max(a.minY, first.box.minY)
  const maxY = Math.min(a.maxY, first.box.maxY)
  return { part: first.part, point: { x: Math.round((minX + maxX) / 2), y: Math.round((minY + maxY) / 2) } }
}
