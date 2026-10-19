import type { HuntGame as Game, HuntRun, MonsterId } from '../../types'
import type { Move } from '../data'
import type { SceneId } from '../sprites'

/**
 * A monster species as data: its moves, attacks and tuning, and (optionally)
 * its own mechanic. The engine reads only this; nothing species-specific is
 * hard-coded there. Every number is this project's adaptation, not game data.
 */

/** Decision bands on the horizontal gap between the two body boxes (spec 3.3). */
export type Range = 'near' | 'mid' | 'far'
export const RANGE_BANDS: Readonly<Record<Range, readonly [number, number]>> = { near: [0, 32], mid: [32, 96], far: [96, 160] }

export type MonsterMove = Move & {
  /** Shown when the move starts. */
  label?: string
  /** Shown when it hits the hunter. */
  hitLabel?: string
  /** Pixels the root moves forward, spread over the active pose; stops at the hunter's body. */
  advance?: number
  /** A projectile: pixels per tick its hit box flies forward from the active pose's first tick. */
  travel?: number
  /** Decision bands it may be chosen in; without them, only when its boxes would reach. */
  range?: readonly Range[]
  /** The species state it needs (e.g. 'inflated'); without it, any state the species allows. */
  state?: string
  /** Ticks after the move ends before it may be chosen again. */
  cooldown?: number
  /** The move that follows when this one ends (default: back to idle). */
  then?: string
  /** The hunter treats it as an opening for its strongest swing. */
  opening?: boolean
  /** Idle and walk moves loop their poses; every other move plays once. */
  loop?: boolean
  /** An effect drawn on the live hit box (kept out of the monster's frames). */
  fx?: 'spit'
}

/** The engine's hands, lent to a mechanic so it never imports the engine. */
export type MonsterCtx = {
  g: Game
  act(move: string): void
  say(text: string): void
}

/** A species' own rules; every hook is called only during a fight. */
export type Mechanic = {
  /** State and parts of a new hunt. */
  initial(maxHp: number): { state: string; parts: HuntRun['parts'] }
  /** The idle and walk moves for the current state. */
  idleMove(g: Game): string
  walkMove(g: Game): string
  /** Walk speed factor for the current state. */
  speed(g: Game): number
  /** The push box for the current state, when it differs from the species' own (e.g. an inflated belly). */
  bounds?(g: Game): readonly [number, number]
  /** At a safe decision point (monster idle, wait over): true when it started a move. */
  decide(c: MonsterCtx): boolean
  /** A move may be chosen in the current state. */
  allows(g: Game, move: string): boolean
  /** After damage landed on `part`: true when it took over the reaction (e.g. a part broke). */
  damaged(c: MonsterCtx, part: string, damage: number): boolean
  /** HUD status text for the current state, or null. */
  status(g: Game): string | null
}

export type MonsterDef = {
  id: MonsterId
  definitionVersion: number
  name: string
  species: string
  /** Only enabled species are drawn for new hunts. */
  enabled: boolean
  /** New hunts take these grounds in turn; a hunt never changes ground. */
  scenes: readonly SceneId[]
  /** Minutes of fighting one hunt is tuned to last; HP is calibrated to it. */
  targetMinutes: number
  /** The way the art faces as drawn: -1 = left. */
  assetFacing: -1
  x: number
  /** Leftmost the monster walks in to reach the hunter. */
  minX: number
  enterFromX: number
  walkStep: number
  idleTicks: readonly [number, number]
  /** Damage taken between flinches, and between topples. */
  flinchEvery: number
  toppleEvery: number
  /** Push box [minX, maxX] in the unmirrored local frame: the hunter never stands inside it. Spacing only. */
  bounds: readonly [number, number]
  /** Torso width for the decision bands (spec 3.3), when narrower than the push box; default `bounds`. */
  torso?: readonly [number, number]
  moves: Readonly<Record<string, MonsterMove>>
  /** The moves it attacks with, in decision order. */
  attacks: readonly string[]
  /** Weight of walking in when attacks are also possible; without it, it walks only when none is. */
  approachWeight?: number
  /** The move played when slain (held until the hunter leaves). */
  slainMove: string
  /** Calibration runs a second pass at the first estimate (part durability scales with max HP). */
  calibrateTwice?: boolean
  mechanic?: Mechanic
}
