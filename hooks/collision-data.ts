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
 * Great Jagras (JG_*) boxes are this project's grey-box values (spec 3.4),
 * fitted to each extracted pose on a 10px grid; `belly` exists only on the
 * poses drawn inflated. Its spit (JG04) is a projectile: the box is where the
 * ball leaves the mouth, moved by the engine as it flies.
 *
 * The object below is plain JSON so tools can read it without TypeScript.
 */
export type LocalBox = readonly [number, number, number, number]
export type Part = 'hunter_body' | 'head' | 'body' | 'tail' | 'belly'
export type PoseHurt = Readonly<Partial<Record<Part, LocalBox>>>
export type ActionBoxes = { hurt: readonly PoseHurt[]; hit?: { pose: number; boxes: readonly LocalBox[] } }

/** The hunter's simplified body width [minX, maxX], for spacing only (each monster has its own `bounds`). */
export const MOVE_BOUNDS = { hunter: [-18, 22] } as const

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
  ] },
  "JG_IDLE": { "hurt": [{ "head": [-72, -52, -30, -16], "body": [-36, -64, 46, 0], "tail": [44, -34, 72, -8] }] },
  "JG_WALK": { "hurt": [{ "head": [-72, -52, -30, -16], "body": [-36, -64, 46, 0], "tail": [44, -34, 74, -8] }] },
  "JG01": { "hurt": [
    { "head": [-66, -40, -30, -8], "body": [-34, -58, 48, 0], "tail": [46, -30, 76, -6] },
    { "head": [-56, -82, -22, -46], "body": [-34, -70, 44, 0], "tail": [42, -34, 74, -6] },
    { "head": [-62, -60, -26, -18], "body": [-30, -62, 48, 0], "tail": [46, -32, 72, -6] },
    { "head": [-60, -58, -24, -20], "body": [-30, -64, 52, 0], "tail": [50, -34, 76, -6] }
  ], "hit": { "pose": 2, "boxes": [[-78, -52, -40, -14]] } },
  "JG02": { "hurt": [
    { "belly": [-30, -36, 10, 0], "head": [-62, -44, -30, -10], "body": [-30, -66, 48, 0], "tail": [46, -34, 76, -6] },
    { "belly": [-58, -46, -10, 0], "head": [-58, -88, -26, -58], "body": [-30, -80, 40, 0], "tail": [40, -34, 74, -6] },
    { "belly": [-10, -30, 40, 0], "head": [-70, -40, -40, -8], "body": [-40, -66, 50, 0], "tail": [52, -58, 70, -20] },
    { "belly": [-4, -30, 38, 0], "head": [-70, -46, -40, -14], "body": [-40, -66, 50, 0], "tail": [50, -40, 72, -12] }
  ], "hit": { "pose": 2, "boxes": [[-74, -30, 60, 0]] } },
  "JG03": { "hurt": [
    { "head": [-70, -44, -34, -12], "body": [-36, -70, 48, 0], "tail": [44, -34, 72, -6] },
    { "head": [-66, -50, -30, -14], "body": [-30, -74, 40, 0], "tail": [36, -50, 70, -6] },
    { "belly": [-40, -62, 16, -6], "head": [-70, -54, -40, -10], "body": [-60, -62, 40, 0], "tail": [40, -76, 66, -20] },
    { "head": [-62, -56, -26, -18], "body": [-28, -70, 50, 0], "tail": [48, -36, 74, -6] }
  ], "hit": { "pose": 2, "boxes": [[-68, -52, 60, 0]] } },
  "JG04": { "hurt": [
    { "head": [-72, -58, -32, -20], "body": [-36, -68, 44, 0], "tail": [42, -30, 70, -6] },
    { "head": [-62, -84, -28, -48], "body": [-32, -72, 40, 0], "tail": [40, -34, 66, -6] },
    { "head": [-54, -70, -24, -40], "body": [-30, -64, 40, 0], "tail": [40, -36, 64, -8] },
    { "head": [-72, -56, -34, -18], "body": [-36, -70, 48, 0], "tail": [46, -34, 66, -6] }
  ], "hit": { "pose": 2, "boxes": [[-64, -58, -48, -42]] } },
  "JG_INFLATE": { "hurt": [
    { "head": [-70, -46, -32, -12], "body": [-36, -68, 46, 0], "tail": [44, -32, 74, -6] },
    { "belly": [-34, -34, 0, 0], "head": [-70, -60, -34, -24], "body": [-34, -74, 50, 0], "tail": [46, -34, 74, -6] },
    { "belly": [-60, -60, -4, 0], "head": [-62, -100, -30, -70], "body": [-34, -98, 40, 0], "tail": [40, -38, 76, -6] },
    { "belly": [-62, -60, -4, 0], "head": [-56, -100, -22, -70], "body": [-30, -98, 40, 0], "tail": [40, -40, 72, -6] }
  ] },
  "JG_DEFLATE": { "hurt": [
    { "belly": [-60, -62, -4, 0], "head": [-58, -100, -24, -72], "body": [-30, -98, 40, 0], "tail": [40, -36, 74, -6] },
    { "belly": [-46, -44, 0, 0], "head": [-70, -74, -36, -44], "body": [-36, -90, 46, 0], "tail": [46, -38, 72, -6] },
    { "belly": [-36, -40, 0, 0], "head": [-62, -94, -28, -62], "body": [-30, -90, 44, 0], "tail": [44, -40, 74, -6] },
    { "head": [-62, -60, -26, -22], "body": [-28, -74, 52, 0], "tail": [50, -36, 74, -6] }
  ] },
  "JG_FLINCH": { "hurt": [
    { "head": [-72, -54, -32, -16], "body": [-36, -72, 46, 0], "tail": [44, -34, 70, -6] },
    { "head": [-62, -74, -28, -36], "body": [-28, -80, 44, 0], "tail": [44, -34, 62, -6] },
    { "head": [-72, -40, -34, -6], "body": [-34, -70, 50, 0], "tail": [48, -38, 72, -6] },
    { "head": [-70, -56, -32, -20], "body": [-32, -72, 46, 0], "tail": [46, -34, 66, -6] }
  ] },
  "JG_TOPPLE": { "hurt": [
    { "head": [-74, -56, -36, -20], "body": [-36, -76, 46, 0], "tail": [44, -38, 68, -6] },
    { "head": [-80, -58, -46, -26], "body": [-46, -74, 30, 0], "tail": [30, -72, 60, -20] },
    { "head": [-80, -36, -46, 0], "body": [-60, -60, 40, 0], "tail": [40, -38, 66, -8] },
    { "head": [-66, -30, -30, 0], "body": [-32, -58, 50, 0], "tail": [50, -26, 74, -4] }
  ] },
  "JG_GETUP": { "hurt": [
    { "head": [-66, -30, -30, 0], "body": [-30, -58, 50, 0], "tail": [50, -26, 76, -4] },
    { "head": [-66, -46, -30, -12], "body": [-30, -68, 54, 0], "tail": [54, -44, 70, -8] },
    { "head": [-72, -54, -34, -16], "body": [-36, -80, 46, 0], "tail": [46, -44, 68, -6] },
    { "head": [-70, -54, -32, -16], "body": [-34, -80, 46, 0], "tail": [46, -40, 70, -6] }
  ] },
  "JG_DEATH": { "hurt": [
    { "head": [-74, -56, -36, -16], "body": [-36, -74, 44, 0], "tail": [44, -38, 68, -6] },
    { "head": [-74, -52, -36, -12], "body": [-36, -72, 44, 0], "tail": [44, -36, 68, -6] },
    { "head": [-74, -30, -36, 0], "body": [-36, -50, 56, 0], "tail": [56, -22, 74, 0] },
    { "head": [-74, -30, -36, 0], "body": [-36, -50, 56, 0], "tail": [56, -22, 74, 0] }
  ] }
}
