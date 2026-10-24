import type { ActionId } from './sprites'

/**
 * Hand-measured collision boxes, in each action's local frame: x = u - anchorX
 * on the unmirrored sprite, y = v - height (feet at 0, body at negative y).
 * Each box is [minX, minY, maxX, maxY]. Measured from the extracted frames
 * (hooks/gen) on a grid; they are this project's adaptation, not game data.
 *
 * `hurt` lists, per pose, the parts that can be hit; one entry stands for
 * every pose. `hit` is the attack's box on its active pose (data.ts `active`).
 *
 * The object below is plain JSON so tools can read it without TypeScript.
 */
export type LocalBox = readonly [number, number, number, number]
export type Part = 'hunter_body' | 'head' | 'body' | 'tail'
export type PoseHurt = Readonly<Partial<Record<Part, LocalBox>>>
export type ActionBoxes = { hurt: readonly PoseHurt[]; hit?: { pose: number; boxes: readonly LocalBox[] } }

/** Simplified body widths [minX, maxX] for spacing only; they never deal damage. */
export const MOVE_BOUNDS = { hunter: [-18, 22], monster: [-62, 25] } as const

export const BOXES: Readonly<Record<ActionId, ActionBoxes>> = {
  "C01": { "hurt": [{ "hunter_body": [-18, -64, 22, 0] }] },
  "C02": { "hurt": [{}] },
  "C03": { "hurt": [{ "hunter_body": [0, -70, 45, 0] }] },
  "C08": { "hurt": [
    { "hunter_body": [-15, -58, 25, 0] },
    { "hunter_body": [-10, -52, 45, 0] },
    { "hunter_body": [-25, -50, 40, 0] },
    { "hunter_body": [-8, -68, 32, 0] }
  ] },
  "C15": { "hurt": [{ "hunter_body": [-30, -70, 18, 0] }] },
  "C17": { "hurt": [{}] },
  "C21": { "hurt": [{}] },
  "G03": { "hurt": [{ "hunter_body": [-22, -55, 32, 0] }], "hit": { "pose": 2, "boxes": [[8, -72, 40, -45], [35, -92, 65, -65]] } },
  "G05": { "hurt": [
    { "hunter_body": [-25, -55, 30, 0] },
    { "hunter_body": [-25, -55, 30, 0] },
    { "hunter_body": [-25, -85, 60, -25] },
    { "hunter_body": [-25, -55, 30, 0] }
  ], "hit": { "pose": 3, "boxes": [[42, -34, 80, -2]] } },
  "G06": { "hurt": [{ "hunter_body": [-20, -58, 40, 0] }], "hit": { "pose": 2, "boxes": [[25, -60, 55, -15]] } },
  "L01": { "hurt": [{ "hunter_body": [-20, -60, 22, 0] }] },
  "L02": { "hurt": [{ "hunter_body": [-20, -62, 24, 0] }], "hit": { "pose": 1, "boxes": [[40, -100, 78, -50], [25, -50, 78, -2]] } },
  "L03": { "hurt": [{ "hunter_body": [-20, -60, 24, 0] }], "hit": { "pose": 1, "boxes": [[20, -34, 62, -8]] } },
  "L05": { "hurt": [
    { "hunter_body": [-18, -62, 24, 0] },
    { "hunter_body": [-10, -52, 30, 0] },
    { "hunter_body": [-10, -58, 32, 0] },
    { "hunter_body": [-12, -72, 24, 0] }
  ], "hit": { "pose": 1, "boxes": [[-60, -92, 92, -8]] } },
  "L06": { "hurt": [{ "hunter_body": [-20, -60, 24, 0] }] },
  "B07": { "hurt": [{ "hunter_body": [-22, -72, 22, 0] }] },
  "B01": { "hurt": [{ "hunter_body": [-22, -72, 22, 0] }] },
  "B04": { "hurt": [{ "hunter_body": [-22, -72, 22, 0] }], "hit": { "pose": 2, "boxes": [[55, -50, 150, -34]] } },
  "B05": { "hurt": [{ "hunter_body": [-22, -72, 22, 0] }], "hit": { "pose": 2, "boxes": [[55, -76, 142, -12]] } },
  "B06": { "hurt": [{ "hunter_body": [-22, -72, 22, 0] }], "hit": { "pose": 2, "boxes": [[50, -80, 152, -8]] } },
  "V01": { "hurt": [{ "head": [-108, -85, -60, -22], "body": [-62, -80, 25, 0], "tail": [25, -36, 92, 0] }] },
  "V02": { "hurt": [{ "head": [-115, -82, -75, -20], "body": [-75, -88, 15, 0], "tail": [15, -40, 97, 0] }] },
  "V14": { "hurt": [
    { "head": [-100, -75, -60, -25], "body": [-60, -90, 30, 0], "tail": [30, -30, 88, 0] },
    { "head": [-100, -75, -60, -25], "body": [-60, -90, 40, 0], "tail": [40, -62, 98, -40] },
    { "head": [-90, -75, -55, -45], "body": [-55, -92, 40, 0], "tail": [-100, -44, 40, -26] },
    { "head": [-95, -80, -55, -25], "body": [-55, -92, 40, 0], "tail": [50, -45, 82, 0] }
  ], "hit": { "pose": 2, "boxes": [[-135, -44, -75, -26]] } },
  "V17": { "hurt": [{ "head": [-105, -72, -50, -15], "body": [-55, -90, 40, 0], "tail": [40, -32, 88, 0] }],
    "hit": { "pose": 2, "boxes": [[-172, -52, -90, -20]] } },
  "V23": { "hurt": [
    { "head": [-110, -88, -70, -45], "body": [-75, -112, 30, 0], "tail": [30, -45, 85, 0] },
    { "head": [-110, -88, -70, -45], "body": [-75, -112, 30, 0], "tail": [30, -45, 85, 0] },
    { "head": [-125, -95, -75, -55], "body": [-75, -112, 30, 0], "tail": [30, -55, 95, 0] },
    { "head": [-110, -88, -70, -45], "body": [-75, -112, 30, 0], "tail": [30, -45, 85, 0] }
  ] },
  "V25": { "hurt": [
    { "head": [-110, -78, -70, -40], "body": [-65, -98, 50, 0], "tail": [50, -45, 95, 0] },
    { "head": [-118, -65, -75, -15], "body": [-75, -95, 40, 0], "tail": [40, -45, 100, 0] },
    { "head": [-125, -60, -60, 0], "body": [-60, -90, 85, 0] },
    { "head": [-125, -60, -60, 0], "body": [-60, -90, 85, 0] }
  ] },
  "V26": { "hurt": [
    { "head": [-145, -50, -90, 0], "body": [-90, -82, 55, 0], "tail": [55, -45, 90, 0] },
    { "head": [-120, -70, -85, -20], "body": [-85, -100, 15, 0], "tail": [15, -45, 90, 0] },
    { "head": [-120, -70, -85, -20], "body": [-85, -100, 15, 0], "tail": [15, -45, 90, 0] },
    { "head": [-120, -70, -85, -20], "body": [-85, -100, 15, 0], "tail": [15, -45, 90, 0] }
  ] }
}
