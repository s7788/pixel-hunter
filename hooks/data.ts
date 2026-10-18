import type { ActionId, SceneId } from './sprites'

/**
 * Tuning data for v1. Every number here is this project's pixel-adaptation
 * design, not data measured from the original game.
 */

/** One frame per tick: the hooks advance the game and send the frame on show. */
export const TICK_MS = 125

export type Move = {
  action: ActionId
  /** Ticks each key pose shows; the last pose holds when the move outlasts them. */
  ticks: readonly number[]
  /** The pose whose first tick lands the hit (attack moves only). */
  active?: number
  damage?: number
  stamina?: number
  /** Decision weight among the attacks of the same actor. */
  weight?: number
}

export const HUNTER = {
  hpMax: 12,
  staminaMax: 8,
  /** Idle ticks per stamina point regained, and per HP point regained. */
  staminaRegenTicks: 6,
  hpRegenTicks: 42,
  /** Where the hunter enters a fight; from there it runs in and rolls back as needed. */
  x: 96,
  campX: 208,
  /** Fight moves: run speed, roll distance (backwards), leftmost stance. */
  runStep: 4,
  rollDistance: 30,
  minX: 16,
  /** Chance to roll when a monster attack is predicted to reach; drawn once per attack. */
  dodgeRate: 0.7,
  idleTicks: [4, 10] as const,
  /** Chance to stand and wait instead of attacking when a normal opening comes. */
  waitWeight: 20,
  moves: {
    idle: { action: 'C01', ticks: [3, 3, 3, 3] },
    run: { action: 'C03', ticks: [2, 2, 2, 2] },
    roll: { action: 'C08', ticks: [2, 4, 4, 2], stamina: 1 },
    hit: { action: 'C15', ticks: [2, 3, 4, 3] },
    down: { action: 'C17', ticks: [8, 5, 4, 3] },
    charge: { action: 'G03', ticks: [3, 6, 3, 4], active: 2, damage: 30, stamina: 2, weight: 50 },
    trueCharge: { action: 'G05', ticks: [4, 3, 4, 4], active: 3, damage: 55, stamina: 3 },
    tackle: { action: 'G06', ticks: [3, 3, 3, 3], active: 2, damage: 12, stamina: 1, weight: 30 },
  } satisfies Record<string, Move>,
  /** Poses of the roll during which a hit passes through. */
  rollInvulnerable: [1, 2] as const,
} as const

export type HunterMove = keyof typeof HUNTER.moves

export const VELKHANA = {
  name: '冰呪龍',
  species: '古龍',
  /** Minutes of Claude's work one hunt is tuned to last; damage scales to it. */
  targetMinutes: 5,
  /** New hunts alternate between these grounds; a hunt never changes ground. */
  scenes: ['S02', 'S04'] as const satisfies readonly SceneId[],
  x: 262,
  /** Leftmost the monster walks in to reach the hunter. */
  minX: 200,
  enterFromX: 440,
  walkStep: 12,
  idleTicks: [16, 40] as const,
  /** Damage taken between flinches, and between topples. */
  flinchEvery: 70,
  toppleEvery: 200,
  moves: {
    idle: { action: 'V01', ticks: [3, 3, 3, 3] },
    walk: { action: 'V02', ticks: [3, 3, 3, 3], weight: 15 },
    tailStab: { action: 'V14', ticks: [5, 3, 3, 3], active: 2, damage: 2, weight: 50 },
    iceBeam: { action: 'V17', ticks: [3, 4, 6, 3], active: 2, damage: 2, weight: 35 },
    flinch: { action: 'V23', ticks: [3, 3, 3, 3] },
    topple: { action: 'V25', ticks: [3, 3, 3, 40] },
    getup: { action: 'V26', ticks: [3, 4, 4, 3] },
  } satisfies Record<string, Move>,
} as const

export type MonsterMove = keyof typeof VELKHANA.moves

/** The two bodies never overlap: the gap kept between their body boxes. */
export const BODY_GAP = 2

/** Where the camp idles and where the hunts are fought. */
export const CAMP_SCENE: SceneId = 'S03'
