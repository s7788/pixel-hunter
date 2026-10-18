/** The turn side: `paused` freezes the picture until the next main turn. */
export type HuntPhase = 'camp' | 'hunting' | 'retreat' | 'paused'

export type HuntEvent = { at: number; text: string }

export type HuntSceneId = 'S01' | 'S02' | 'S03' | 'S04'
export type HunterMoveId = 'idle' | 'run' | 'roll' | 'hit' | 'down' | 'charge' | 'trueCharge' | 'tackle'
export type MonsterMoveId = 'idle' | 'walk' | 'tailStab' | 'iceBeam' | 'flinch' | 'topple' | 'getup'

/** The state machine's place: at camp, travelling, fighting, or leaving a fight. */
export type HuntMode = 'camp' | 'leaving' | 'arriving' | 'fight' | 'retreating' | 'carted' | 'slain'

/** What one attack group did to one target; each pair is settled once. */
export type HuntContactOutcome = 'damaged' | 'evaded'
export type HuntContact = { target: 'hunter' | 'monster'; outcome: HuntContactOutcome; tick: number }

/** The attack under way: a fresh id per start, its settled contacts kept with it. */
export type HuntAttack = { id: string; contacts: HuntContact[] }

/** A settled contact, kept (the last 30) for the debug panel. */
export type HuntHit = {
  attackId: string
  target: 'hunter' | 'monster'
  part: string
  outcome: HuntContactOutcome
  damage: number
  tick: number
}

export type HuntActor<M extends string> = { move: M; t: number; x: number; wait: number; attack: HuntAttack | null }

/** One hunt against the monster; kept across turns and sessions until slain. */
export type HuntRun = {
  scene: HuntSceneId
  monsterHp: number
  monsterHpMax: number
  stagger: number
  topple: number
  fightTicks: number
  isFresh: boolean
}

export type HuntGame = {
  /** 2 since collision; older saves are migrated (attacks under way dropped). */
  saveSchemaVersion: number
  /** Simulation ticks (125 ms each); moves only when the game steps, never while paused. */
  simTick: number
  /** Next attack serial; never reused, so attack ids stay unique. */
  nextAttackSerial: number
  mode: HuntMode
  modeT: number
  huntNo: number
  hunt: HuntRun | null
  /** Set when a hunt ends inside a turn: the next one waits for the next turn. */
  isResting: boolean
  hunter: HuntActor<HunterMoveId> & {
    hp: number
    stamina: number
    facing: 1 | -1
    rollIn: number
    /** The attack the hunter is running in to make, out of reach when chosen. */
    intent: HunterMoveId | null
  }
  monster: HuntActor<MonsterMoveId>
  seed: number
  label: string
  labelT: number
  slain: number
  carts: number
  /** How the last hunt ended when both fell on the same tick. */
  lastOutcome: 'mutual_ko' | null
  hits: HuntHit[]
}

/** One tick's world: the clock for working_elapsed and the hunt state machine. */
export type HuntWorld = { tick: number; now: number; game: HuntGame }

declare module 'claude-code' {
  interface PluginState {
    'hunt-8bit': {
      phase: HuntPhase
      turnStartedAt: number | null
      lastElapsedMs: number
      world: HuntWorld | null
      log: HuntEvent[]
      debugOpen: boolean
      /** Draw the collision boxes over the scene (debug). */
      boxesOpen: boolean
    }
  }
}
