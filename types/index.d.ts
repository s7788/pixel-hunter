/** The turn side: `paused` freezes the picture until the next main turn. */
export type HuntPhase = 'camp' | 'hunting' | 'retreat' | 'paused'

export type HuntEvent = { at: number; text: string }

export type HuntSceneId = 'S01' | 'S02' | 'S03' | 'S04'
export type HunterMoveId = 'idle' | 'run' | 'roll' | 'hit' | 'down' | 'charge' | 'trueCharge' | 'tackle'
export type MonsterMoveId = 'idle' | 'walk' | 'tailStab' | 'iceBeam' | 'flinch' | 'topple' | 'getup'

/** The state machine's place: at camp, travelling, fighting, or leaving a fight. */
export type HuntMode = 'camp' | 'leaving' | 'arriving' | 'fight' | 'retreating' | 'carted' | 'slain'

export type HuntActor<M extends string> = { move: M; t: number; x: number; wait: number }

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
  mode: HuntMode
  modeT: number
  huntNo: number
  hunt: HuntRun | null
  /** Set when a hunt ends inside a turn: the next one waits for the next turn. */
  isResting: boolean
  hunter: HuntActor<HunterMoveId> & { hp: number; stamina: number; facing: 1 | -1; rollIn: number }
  monster: HuntActor<MonsterMoveId>
  seed: number
  label: string
  labelT: number
  slain: number
  carts: number
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
    }
  }
}
