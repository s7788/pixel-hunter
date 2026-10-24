/** The turn side: any end of a main turn (answered or interrupted) is a retreat. */
export type HuntPhase = 'camp' | 'hunting' | 'retreat'

export type HuntEvent = { at: number; text: string }

export type HuntSceneId = 'S01' | 'S02' | 'S03' | 'S04' | 'S05'
export type HunterMoveId =
  | 'idle'
  | 'run'
  | 'roll'
  | 'hit'
  | 'down'
  | 'charge'
  | 'trueCharge'
  | 'tackle'
  | 'lsChain'
  | 'lsFade'
  | 'lsRound'
  | 'bowShot'
  | 'bowQuick'
  | 'bowPower'
  | 'walk'
  | 'roast'
  | 'eat'
/** The pane's language: Traditional Chinese, or English for everyone else (hooks/i18n.ts pickLang). */
export type HuntLang = 'zh-TW' | 'en'

/** The weapon in hand; `random` draws one for each new hunt. */
export type HuntWeapon = 'greatsword' | 'longsword' | 'bow'
export type HuntWeaponChoice = HuntWeapon | 'random'

/** A monster's move key; each monster definition (hooks/monsters) names its own. */
export type MonsterMoveId = string

/** Registered monster species (hooks/monsters/registry.ts). */
export type MonsterId = 'velkhana' | 'great_jagras' | 'tobi_kadachi' | 'anjanath' | 'barioth' | 'nargacuga' | 'tigrex' | 'zinogre' | 'ruiner_nergigante'

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
  /** World point where the boxes met (debug cross); absent on hits saved before v0.3.2. */
  x?: number
  y?: number
}

export type HuntActor<M extends string> = { move: M; t: number; x: number; wait: number; attack: HuntAttack | null }

/** One hunt against the monster; kept across turns and sessions until slain. */
export type HuntRun = {
  /** Fixed for the whole hunt; saves from before schema 3 are Velkhana. */
  monsterId: MonsterId
  definitionVersion: number
  scene: HuntSceneId
  monsterHp: number
  monsterHpMax: number
  stagger: number
  topple: number
  fightTicks: number
  isFresh: boolean
  /** The species' own state (e.g. 'inflated') and its age in fight ticks. */
  state: string
  stateT: number
  /** Durability of breakable parts, from the actual hits on them. */
  parts: Record<string, { durability: number; broken: boolean }>
  /** Fight tick from which each attack may be chosen again. */
  cooldowns: Record<string, number>
  /** The species' own counters (rage, charge, spike stages, a locked landing spot); absent on older saves. */
  meters?: Record<string, number>
}

export type HuntGame = {
  /** 5 since weapons met the registry (4: per-species tally, 3: registry or weapons); older saves are migrated. */
  saveSchemaVersion: number
  /** Simulation ticks (125 ms each); moves only when the game steps. */
  simTick: number
  /** Next attack serial; never reused, so attack ids stay unique. */
  nextAttackSerial: number
  mode: HuntMode
  modeT: number
  huntNo: number
  hunt: HuntRun | null
  /** Set when a hunt ends inside a turn: the next one waits for the next turn. */
  isResting: boolean
  /** The weapon in hand; never changes during a trip out of camp. */
  weapon: HuntWeapon
  /**
   * The camp's pick. A fixed weapon is taken up at once unless the hunter is
   * out; `random` draws when a new hunt starts and keeps a hunt's weapon.
   */
  weaponChoice: HuntWeaponChoice
  hunter: HuntActor<HunterMoveId> & {
    hp: number
    stamina: number
    facing: 1 | -1
    rollIn: number
    /** The attack the hunter is running in to make, out of reach when chosen. */
    intent: HunterMoveId | null
    /** The monster attack the hunter already drew its one dodge chance for. */
    dodgeFor: string | null
  }
  monster: HuntActor<MonsterMoveId>
  seed: number
  label: string
  labelT: number
  slain: number
  /** Kills per species; always sums to `slain` (saves before schema 4 count every kill as Velkhana's). */
  slainBy: Partial<Record<MonsterId, number>>
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
      /** The language the pane draws in, picked at session start. */
      lang: HuntLang
      /** The terminal draws the scene as cells (true) or as an Image (false). */
      terminalCells: boolean
    }
  }
}
