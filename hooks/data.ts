import type { HuntWeapon, HuntWeaponChoice } from '../types'
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
  /** What the HUD calls out when the move starts (hunter attacks). */
  label?: string
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
  dodgeRate: 0.4,
  idleTicks: [4, 10] as const,
  /** Chance to stand and wait instead of attacking when a normal opening comes. */
  waitWeight: 20,
  moves: {
    idle: { action: 'C01', ticks: [3, 3, 3, 3] },
    run: { action: 'C03', ticks: [2, 2, 2, 2] },
    roll: { action: 'C08', ticks: [2, 4, 4, 2], stamina: 1 },
    hit: { action: 'C15', ticks: [2, 3, 4, 3] },
    down: { action: 'C17', ticks: [8, 5, 4, 3] },
    charge: { action: 'G03', ticks: [3, 6, 3, 4], active: 2, damage: 30, stamina: 2, weight: 50, label: '蓄力斬' },
    trueCharge: { action: 'G05', ticks: [4, 3, 4, 4], active: 3, damage: 55, stamina: 3, label: '真蓄力斬' },
    tackle: { action: 'G06', ticks: [3, 3, 3, 3], active: 2, damage: 12, stamina: 1, weight: 30, label: '肩撞' },
    // long sword: quick cuts; the spirit roundslash for openings
    lsChain: { action: 'L02', ticks: [3, 3, 3, 3], active: 1, damage: 16, stamina: 1, weight: 50, label: '縱斬連段' },
    lsFade: { action: 'L03', ticks: [3, 3, 4, 3], active: 1, damage: 12, stamina: 1, weight: 30, label: '袈裟斬' },
    lsRound: { action: 'L05', ticks: [3, 4, 3, 5], active: 1, damage: 36, stamina: 3, label: '氣刃大迴旋斬' },
    // bow: shots from range; the power shot for openings
    bowShot: { action: 'B04', ticks: [3, 3, 3, 3], active: 2, damage: 10, stamina: 1, weight: 50, label: '通常射擊' },
    bowQuick: { action: 'B05', ticks: [2, 2, 3, 2], active: 2, damage: 7, stamina: 1, weight: 30, label: '快速射擊' },
    bowPower: { action: 'B06', ticks: [3, 4, 3, 4], active: 2, damage: 28, stamina: 3, label: '剛射' },
    // camp only: walk to the fire, kneel by it (C21 F1), eat the meat (C21 F4)
    walk: { action: 'C02', ticks: [3, 3, 3, 3] },
    roast: { action: 'C21', ticks: [1] },
    eat: { action: 'C21', ticks: [0, 0, 0, 1] },
  } satisfies Record<string, Move>,
  /** Poses of the roll during which a hit passes through. */
  rollInvulnerable: [1, 2] as const,
} as const

export type HunterMove = keyof typeof HUNTER.moves

/** The shared moves a weapon draws its own way (C01/C02/C03/C08 show the great sword). */
export type WeaponMove = 'idle' | 'run' | 'walk' | 'roll'

type Weapon = {
  label: string
  /** In place of the shared moves, in camp too; same timing as the move they replace. */
  moves?: Readonly<Partial<Record<WeaponMove, Move>>>
  /** The dodge is a slide back facing the monster, not a roll turned away from it. */
  dodgeFacesFoe?: boolean
  /** Picked by weight when a normal opening comes. */
  attacks: readonly HunterMove[]
  /** On a flinch or topple: the first one the stamina allows. */
  openers: readonly HunterMove[]
}

/**
 * The three weapons. Each one's damage is scaled by a fixed-seed run so that
 * every weapon takes about `targetMinutes` (engine.ts `damageScale`).
 */
export const WEAPONS: Readonly<Record<HuntWeapon, Weapon>> = {
  greatsword: { label: '大劍', attacks: ['charge', 'tackle'], openers: ['trueCharge', 'charge', 'tackle'] },
  longsword: {
    label: '太刀',
    moves: {
      idle: { action: 'L01', ticks: [6, 6] },
      run: { action: 'L01', ticks: [2, 2] },
      walk: { action: 'L01', ticks: [3, 3] },
      // L06 F1, F2 held, F4: the foresight slide back, without its counter cut
      roll: { action: 'L06', ticks: [2, 4, 4, 2], stamina: 1 },
    },
    dodgeFacesFoe: true,
    attacks: ['lsChain', 'lsFade'],
    openers: ['lsRound', 'lsChain', 'lsFade'],
  },
  bow: {
    label: '弓',
    moves: {
      idle: { action: 'B01', ticks: [6, 0, 0, 6] },
      run: { action: 'B01', ticks: [2, 2, 2, 2] },
      walk: { action: 'B01', ticks: [3, 3, 3, 3] },
      roll: { action: 'B07', ticks: [2, 4, 4, 2], stamina: 1 },
    },
    dodgeFacesFoe: true,
    attacks: ['bowShot', 'bowQuick'],
    openers: ['bowPower', 'bowShot', 'bowQuick'],
  },
}

/** The camp's buttons, in order. */
export const WEAPON_CHOICES: readonly { id: HuntWeaponChoice; label: string }[] = [
  ...(Object.keys(WEAPONS) as HuntWeapon[]).map(id => ({ id, label: WEAPONS[id].label })),
  { id: 'random', label: '隨機' },
]

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

/**
 * The camp between turns, for looks only (HP still refills on arrival): the
 * hunter walks to the fire, kneels to roast meat, eats it, and roasts the next.
 * World pixels; the fire is drawn over S03's own fire.
 */
export const CAMP = {
  fireX: 104,
  fireY: 163,
  /** Where the hunter kneels, facing the fire. */
  seatX: 166,
  walkStep: 2,
  restDelayTicks: 6,
  roastTicks: 48,
  eatTicks: 24,
} as const
