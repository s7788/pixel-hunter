import type {
  HuntAttack as Attack,
  HuntContactOutcome as Outcome,
  HuntGame as Game,
  HunterMoveId as HunterMove,
  HuntMode as Mode,
  HuntWeapon as Weapon,
  HuntWeaponChoice as WeaponChoice,
  MonsterMoveId as MonsterMove,
} from '../types'
import type { Placement } from './collision'
import { contactPart, hitboxes, hurtboxes, reaches } from './collision'
import { MOVE_BOUNDS } from './collision-data'
import type { Move } from './data'
import type { TextId } from './i18n'
import { BODY_GAP, CAMP, CAMP_SCENE, HUNTER, TICK_MS, VELKHANA, WEAPONS } from './data'
import type { ActionId, SceneId } from './sprites'
import { SCENES } from './sprites'

/**
 * The local hunt state machine: one pure step per tick, no model calls.
 * Randomness comes from a seed kept in the state, so a saved game resumes
 * exactly and a simulation is reproducible. Its state types live in the
 * mod's state contract (types/index.d.ts).
 *
 * Damage lands only on contact: an attack's boxes on its active pose must
 * touch the target's hurt boxes that tick (hooks/collision.ts), and each
 * attack settles each target once.
 */

export type { Game }

/** The hunter's move as drawn: the weapon's own stance, run, walk and dodge where it has them. */
function hunterMove(g: Game, move: HunterMove): Move {
  const own: Move | undefined = (WEAPONS[g.weapon].moves as Partial<Record<string, Move>> | undefined)?.[move]
  return own ?? HUNTER.moves[move]
}
const monsterMove = (move: MonsterMove): Move => VELKHANA.moves[move]

export type ActorView = { action: ActionId; frame: number; x: number; facing: 1 | -1 }

export type View = {
  scene: SceneId
  hunter: ActorView
  monster: ActorView | null
  hp: number
  stamina: number
  weapon: Weapon
  isRandomWeapon: boolean
  label: string
  monsterHpPercent: number | null
  /** Debug: where recent hits met (the last MARK_TICKS ticks). */
  marks: { x: number; y: number; outcome: Outcome }[]
  /** Camp props: the fire's flicker frame, and the meat on the spit (0 raw .. 1 done; null while eaten). */
  camp: { flicker: number; cook: number | null } | null
}

const RUN_TICKS = 14
const CAMP_DELAY = 8
const SLAIN_HOLD = 32
const LABEL_TICKS = 16

const sum = (list: readonly number[]): number => list.reduce((a, b) => a + b, 0)

export function poseAt(move: Move, t: number): number {
  let local = t
  for (let i = 0; i < move.ticks.length; i += 1) {
    const span = move.ticks[i] ?? 1
    if (local < span) return i
    local -= span
  }
  return move.ticks.length - 1
}

const loopPose = (move: Move, t: number): number => poseAt(move, t % sum(move.ticks))
const isOver = (move: Move, t: number): boolean => t >= sum(move.ticks)

const SAVE_SCHEMA = 3
const SCENE_SCALE = 3
const HITS_KEPT = 30
const MARK_TICKS = 8
const LOOPING = new Set<string>(['idle', 'run', 'walk'])
const poseOf = (key: string, move: Move, t: number): number => (LOOPING.has(key) ? loopPose(move, t) : poseAt(move, t))

/** mulberry32 over the state's seed. */
function rand(g: Game): number {
  g.seed = (g.seed + 0x6d2b79f5) | 0
  let r = Math.imul(g.seed ^ (g.seed >>> 15), 1 | g.seed)
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296
}

const between = (g: Game, [lo, hi]: readonly [number, number]): number => lo + Math.floor(rand(g) * (hi - lo + 1))

function pick<K extends string>(g: Game, weights: readonly (readonly [K, number])[]): K {
  let roll = rand(g) * sum(weights.map(w => w[1]))
  for (const [key, w] of weights) {
    if (roll < w) return key
    roll -= w
  }
  return weights[weights.length - 1]![0]
}

/** A callout over the fight, by text id (hooks/i18n.ts); the drawing picks the words. */
function say(g: Game, id: TextId): void {
  g.label = id
  g.labelT = 0
}

export function newGame(seed: number): Game {
  return {
    saveSchemaVersion: SAVE_SCHEMA,
    simTick: 0,
    nextAttackSerial: 0,
    mode: 'camp',
    modeT: 0,
    huntNo: 0,
    hunt: null,
    isResting: false,
    weapon: 'greatsword',
    weaponChoice: 'greatsword',
    hunter: {
      move: 'idle',
      t: 0,
      x: HUNTER.campX,
      wait: 0,
      attack: null,
      hp: HUNTER.hpMax,
      stamina: HUNTER.staminaMax,
      facing: 1,
      rollIn: -1,
      intent: null,
      dodgeFor: null,
    },
    monster: { move: 'idle', t: 0, x: VELKHANA.x, wait: 0, attack: null },
    seed,
    label: '',
    labelT: LABEL_TICKS,
    slain: 0,
    carts: 0,
    lastOutcome: null,
    hits: [],
  }
}

/**
 * Damage per tick a weapon deals in a fixed-seed run with its damage times
 * `scale`. While it runs that scale is the weapon's (`calibrating`).
 */
let calibrating: number | undefined
function damagePerTick(weapon: Weapon, scale: number): number {
  calibrating = scale
  try {
    let g = newGame(20261016)
    g.weapon = weapon
    g.weaponChoice = weapon
    startHunt(g, 1e9)
    g = beginTurn(g)
    const ticks = 6000
    for (let i = 0; i < ticks; i += 1) g = step(g, true)
    const out = (1e9 - g.hunt!.monsterHp) / ticks
    // no hit landed: a box or stance is off; never make a monster with no HP
    if (!(out > 0)) throw new Error(`hunt-8bit: calibration landed no ${weapon} hits; check the collision boxes and stances`)
    return out
  } finally {
    calibrating = undefined
  }
}

let greatswordPerTick: number | undefined
const gsPerTick = (): number => (greatswordPerTick ??= damagePerTick('greatsword', 1))

/** Monster HP that lasts about `targetMinutes` of great sword hunting. */
export function monsterHpForTarget(): number {
  return Math.round(gsPerTick() * ((VELKHANA.targetMinutes * 60_000) / TICK_MS))
}

/**
 * The factor on a weapon's damage that makes it as fast as the great sword.
 * Bigger blows also flinch and topple the monster sooner, so the factor is
 * refined over a few runs with it applied.
 */
const scales: Partial<Record<Weapon, number>> = { greatsword: 1 }
export function damageScale(weapon: Weapon): number {
  if (calibrating !== undefined) return calibrating
  let scale = scales[weapon]
  if (scale === undefined) {
    scale = 1
    for (let i = 0; i < 4; i += 1) scale *= gsPerTick() / damagePerTick(weapon, scale)
    scales[weapon] = scale
  }
  return scale
}

/** Out on a hunt: the weapon in hand stays until the hunter is on the way home. */
const isOut = (g: Game): boolean => g.mode === 'leaving' || g.mode === 'arriving' || g.mode === 'fight'

/**
 * The weapon pick. A fixed weapon is taken up at once unless the hunter is out
 * (then on the way home, `toCamp`, or the next trip out); `random` waits for
 * the next trip out (`takeWeapon`).
 */
export function chooseWeapon(game: Game, choice: WeaponChoice): Game {
  const g = clone(game)
  g.weaponChoice = choice
  if (!isOut(g) && choice !== 'random') g.weapon = choice
  return g
}

/** Leaving camp: put the pick in hand; `random` draws only for a new hunt. */
function takeWeapon(g: Game, isNewHunt: boolean): void {
  const choice = g.weaponChoice
  if (choice !== 'random') g.weapon = choice
  else if (isNewHunt) {
    const all = Object.keys(WEAPONS) as Weapon[]
    g.weapon = all[Math.floor(rand(g) * all.length)]!
  }
  damageScale(g.weapon) // calibrate now, not on the first hit
}

/** Out of camp toward the fight, starting a hunt if none is saved. */
function leaveCamp(g: Game): void {
  const isNewHunt = g.hunt === null
  if (isNewHunt) startHunt(g)
  takeWeapon(g, isNewHunt)
  setMode(g, 'leaving')
  g.hunter.facing = 1
  hunterDo(g, 'run')
}

function startHunt(g: Game, hp: number = monsterHpForTarget()): void {
  const scene = VELKHANA.scenes[g.huntNo % VELKHANA.scenes.length]!
  g.hunt = { scene, monsterHp: hp, monsterHpMax: hp, stagger: 0, topple: 0, fightTicks: 0, isFresh: true }
  g.huntNo += 1
}

function setMode(g: Game, mode: Mode): void {
  g.mode = mode
  g.modeT = 0
}

/** A new attack instance when the move has a hit; a new move always ends the old one. */
function startAttack(g: Game, source: 'hunter' | 'monster', move: Move): Attack | null {
  if (move.active === undefined) return null
  const id = `${g.huntNo}:${source}:${g.nextAttackSerial}`
  g.nextAttackSerial += 1
  return { id, contacts: [] }
}

function hunterDo(g: Game, move: HunterMove): void {
  g.hunter.move = move
  g.hunter.t = 0
  g.hunter.stamina = Math.max(0, g.hunter.stamina - (hunterMove(g, move).stamina ?? 0))
  g.hunter.attack = startAttack(g, 'hunter', hunterMove(g, move))
}

function monsterDo(g: Game, move: MonsterMove): void {
  g.monster.move = move
  g.monster.t = 0
  g.monster.attack = startAttack(g, 'monster', monsterMove(move))
}

/** A main turn started: leave camp (new hunt or the saved one). */
export function beginTurn(game: Game): Game {
  const g = clone(game)
  g.isResting = false
  if (g.mode === 'camp') leaveCamp(g)
  return g
}

/** The main turn answered: save the fight and run back to camp. */
export function endTurn(game: Game): Game {
  const g = clone(game)
  if (g.mode === 'fight' || g.mode === 'arriving') {
    setMode(g, 'retreating')
    g.hunter.facing = -1
    g.hunter.intent = null
    g.hunter.rollIn = -1
    hunterDo(g, 'run')
    if (g.monster.move !== 'topple') monsterDo(g, 'idle')
    say(g, 'retreat')
  } else if (g.mode === 'leaving') {
    toCamp(g)
  }
  return g
}

/**
 * A game from before weapons (schema 2) gets the great sword and plays on as
 * it was. One from before collision (no schema 2): attacks under way had no
 * contact record, so they are dropped and the hunter goes back to camp; the
 * hunt's HP, seed and tallies stay. A current game comes back unchanged.
 */
export function migrate(saved: Game): Game {
  if (saved.saveSchemaVersion === SAVE_SCHEMA) return saved
  const old = clone(saved)
  const armed = { saveSchemaVersion: SAVE_SCHEMA, weapon: old.weapon ?? 'greatsword', weaponChoice: old.weaponChoice ?? 'greatsword' }
  if (old.saveSchemaVersion === 2) return { ...old, ...armed }
  const g: Game = {
    ...old,
    ...armed,
    simTick: 0,
    nextAttackSerial: 0,
    lastOutcome: null,
    hits: [],
    hunter: { ...old.hunter, attack: null, intent: null, rollIn: -1, dodgeFor: null },
    monster: { ...old.monster, attack: null },
  }
  if (g.mode === 'slain') g.hunt = null
  if (g.mode !== 'camp') toCamp(g)
  return g
}

/** A save from an earlier session: whatever was under way, the hunter is back at camp. */
export function restore(saved: Game): Game {
  const g = migrate(clone(saved))
  if (g.mode === 'slain') g.hunt = null
  if (g.mode !== 'camp') toCamp(g)
  // a hunt never fought keeps isFresh: its monster still walks in, not from an old x
  g.isResting = false
  return g
}

/** Between turns: walk to the fire, kneel and roast, eat, roast the next. */
function campRest(g: Game): void {
  const h = g.hunter
  if (h.move === 'idle' && g.modeT >= CAMP.restDelayTicks) {
    h.facing = -1
    hunterDo(g, 'walk')
  } else if (h.move === 'walk') {
    h.x = Math.max(CAMP.seatX, h.x - CAMP.walkStep)
    if (h.x <= CAMP.seatX) hunterDo(g, 'roast')
  } else if (h.move === 'roast' && h.t >= CAMP.roastTicks) hunterDo(g, 'eat')
  else if (h.move === 'eat' && h.t >= CAMP.eatTicks) hunterDo(g, 'roast')
}

function toCamp(g: Game): void {
  if (g.weaponChoice !== 'random') g.weapon = g.weaponChoice
  setMode(g, 'camp')
  g.hunter = { ...g.hunter, move: 'idle', t: 0, x: HUNTER.campX, facing: 1, hp: HUNTER.hpMax, rollIn: -1, intent: null, attack: null }
  g.monster.attack = null
}

function clone(g: Game): Game {
  return JSON.parse(JSON.stringify(g)) as Game
}

/** One tick. `working`: a main turn is running (new trips out of camp only then). */
export function step(game: Game, working: boolean): Game {
  const g = clone(game)
  g.simTick += 1
  g.modeT += 1
  g.labelT += 1
  g.hunter.t += 1
  g.monster.t += 1
  switch (g.mode) {
    case 'camp':
      if (working && !g.isResting && g.modeT >= CAMP_DELAY) leaveCamp(g)
      else campRest(g)
      break
    case 'leaving':
      // from wherever the hunter was resting, off the right edge in RUN_TICKS
      g.hunter.x += (420 - g.hunter.x) / Math.max(1, RUN_TICKS - g.modeT + 1)
      if (g.modeT >= RUN_TICKS) {
        setMode(g, 'arriving')
        g.hunter.x = -40
        if (g.hunt!.isFresh) {
          g.monster = { move: 'walk', t: 0, x: VELKHANA.enterFromX, wait: 0, attack: null }
        } else {
          g.monster = { move: 'idle', t: 0, x: g.monster.x, wait: between(g, VELKHANA.idleTicks), attack: null }
        }
      }
      break
    case 'arriving': {
      const span = g.hunt!.isFresh ? RUN_TICKS * 2 : RUN_TICKS
      g.hunter.x = Math.min(HUNTER.x, hunterMaxX(g), -40 + ((HUNTER.x + 40) * g.modeT) / RUN_TICKS)
      if (g.hunt!.isFresh) g.monster.x = VELKHANA.enterFromX + ((VELKHANA.x - VELKHANA.enterFromX) * g.modeT) / span
      if (g.modeT >= RUN_TICKS && g.hunter.move === 'run') {
        hunterDo(g, 'idle')
        g.hunter.wait = between(g, HUNTER.idleTicks)
      }
      if (g.modeT >= span) {
        g.monster = {
          move: 'idle',
          t: 0,
          x: g.hunt!.isFresh ? VELKHANA.x : g.monster.x,
          wait: between(g, VELKHANA.idleTicks),
          attack: null,
        }
        g.hunt!.isFresh = false
        setMode(g, 'fight')
        say(g, g.hunt!.monsterHp === g.hunt!.monsterHpMax ? 'huntStart' : 'huntResume')
      }
      break
    }
    case 'fight':
      fight(g)
      break
    case 'retreating':
      g.hunter.x -= (HUNTER.x + 60) / RUN_TICKS
      if (g.modeT >= RUN_TICKS) toCamp(g)
      break
    case 'carted':
      if (g.modeT === sum(HUNTER.moves.down.ticks)) {
        g.hunter.facing = -1
        hunterDo(g, 'run')
      }
      if (g.modeT > sum(HUNTER.moves.down.ticks)) g.hunter.x -= (HUNTER.x + 60) / RUN_TICKS
      if (g.modeT >= sum(HUNTER.moves.down.ticks) + RUN_TICKS) toCamp(g)
      break
    case 'slain':
      if (g.modeT === SLAIN_HOLD) {
        g.hunter.facing = -1
        hunterDo(g, 'run')
      }
      if (g.modeT > SLAIN_HOLD) g.hunter.x -= (HUNTER.x + 60) / RUN_TICKS
      if (g.modeT >= SLAIN_HOLD + RUN_TICKS) {
        g.hunt = null
        toCamp(g)
        say(g, 'huntDone')
      }
      break
  }
  return g
}

const groundOf = (g: Game): number => SCENES[g.hunt!.scene].ground * SCENE_SCALE
const hunterAt = (g: Game): Placement => ({ x: g.hunter.x, groundY: groundOf(g), renderFlip: g.hunter.facing })
const monsterAt = (g: Game): Placement => ({ x: g.monster.x, groundY: groundOf(g), renderFlip: 1 })
const hunterPose = (g: Game): [ActionId, number] => {
  const move = hunterMove(g, g.hunter.move)
  return [move.action, poseOf(g.hunter.move, move, g.hunter.t)]
}
const monsterPose = (g: Game): [ActionId, number] => {
  const move = monsterMove(g.monster.move)
  return [move.action, poseOf(g.monster.move, move, g.monster.t)]
}

/** The bodies never overlap: the hunter stays left of the monster's body. */
const hunterMaxX = (g: Game): number => g.monster.x + MOVE_BOUNDS.monster[0] - MOVE_BOUNDS.hunter[1] - BODY_GAP
const monsterMinX = (g: Game): number =>
  Math.max(VELKHANA.minX, g.hunter.x + MOVE_BOUNDS.hunter[1] - MOVE_BOUNDS.monster[0] + BODY_GAP)

const isInvulnerable = (g: Game): boolean =>
  g.hunter.move === 'roll' && (HUNTER.rollInvulnerable as readonly number[]).includes(poseAt(hunterMove(g, 'roll'), g.hunter.t))

/** The hunter's blow, scaled so every weapon hunts about as fast. */
const hunterDamage = (g: Game): number => {
  const raw = hunterMove(g, g.hunter.move).damage ?? 0
  return Math.round(raw * damageScale(g.weapon) * 100) / 100
}

type Contact = { source: 'hunter' | 'monster'; attack: Attack; part: string; x: number; y: number; outcome: Outcome; damage: number }

/** This tick's contacts, judged on the state before any of them applies. */
function findContacts(g: Game): Contact[] {
  const out: Contact[] = []
  const [hAction, hPose] = hunterPose(g)
  const [mAction, mPose] = monsterPose(g)
  const m = g.monster
  const h = g.hunter
  if (m.attack !== null && !m.attack.contacts.some(c => c.target === 'hunter')) {
    const touch = contactPart(hitboxes(mAction, mPose, monsterAt(g)), hurtboxes(hAction, hPose, hunterAt(g)))
    if (touch !== undefined) {
      const evaded = isInvulnerable(g)
      out.push({
        source: 'monster',
        attack: m.attack,
        part: touch.part,
        ...touch.point,
        outcome: evaded ? 'evaded' : 'damaged',
        damage: evaded ? 0 : monsterMove(m.move).damage ?? 0,
      })
    }
  }
  if (h.attack !== null && !h.attack.contacts.some(c => c.target === 'monster')) {
    const touch = contactPart(hitboxes(hAction, hPose, hunterAt(g)), hurtboxes(mAction, mPose, monsterAt(g)))
    if (touch !== undefined) {
      out.push({ source: 'hunter', attack: h.attack, part: touch.part, ...touch.point, outcome: 'damaged', damage: hunterDamage(g) })
    }
  }
  return out
}

/**
 * Settle this tick's contacts together (an exchange of blows is allowed), then
 * the reactions. Returns true when the fight ended this tick.
 */
function settle(g: Game): boolean {
  const found = findContacts(g)
  if (found.length === 0) return false
  const hunt = g.hunt!
  const h = g.hunter
  const m = g.monster
  const monsterAttack = m.move
  let toHunter = 0
  let toMonster = 0
  for (const c of found) {
    const target: 'hunter' | 'monster' = c.source === 'hunter' ? 'monster' : 'hunter'
    c.attack.contacts.push({ target, outcome: c.outcome, tick: g.simTick })
    const hit = { attackId: c.attack.id, target, part: c.part, outcome: c.outcome, damage: c.damage, tick: g.simTick, x: c.x, y: c.y }
    g.hits = [...g.hits, hit].slice(-HITS_KEPT)
    if (target === 'hunter') toHunter += c.damage
    else toMonster += c.damage
  }
  h.hp = Math.max(0, h.hp - toHunter)
  hunt.monsterHp = Math.max(0, hunt.monsterHp - toMonster)
  hunt.stagger += toMonster
  hunt.topple += toMonster
  const hunterFell = toHunter > 0 && h.hp === 0
  const monsterFell = toMonster > 0 && hunt.monsterHp === 0

  if (monsterFell) {
    // the next hunt waits for the next turn; set now, so a turn begun during the hold clears it
    g.isResting = true
    g.slain += 1
    g.lastOutcome = hunterFell ? 'mutual_ko' : null
    if (hunterFell) g.carts += 1
    setMode(g, 'slain')
    monsterDo(g, 'topple')
    hunterDo(g, hunterFell ? 'down' : 'idle')
    h.rollIn = -1
    h.intent = null
    say(g, hunterFell ? 'mutualKo' : 'slain')
    return true
  }
  if (hunterFell) {
    g.carts += 1
    setMode(g, 'carted')
    hunterDo(g, 'down')
    h.rollIn = -1
    h.intent = null
    if (m.move !== 'topple') monsterDo(g, 'idle')
    say(g, 'carted')
    return true
  }
  if (toHunter > 0) {
    hunterDo(g, 'hit')
    h.facing = 1
    h.rollIn = -1
    h.intent = null
    say(g, monsterAttack === 'iceBeam' ? 'hitByBeam' : 'hitByStab')
  } else if (found.some(c => c.outcome === 'evaded')) {
    say(g, 'dodged')
  }
  if (toMonster > 0) {
    // never toppled again while down or getting up; the count waits for the next hit
    if (hunt.topple >= VELKHANA.toppleEvery && m.move !== 'topple' && m.move !== 'getup') {
      hunt.topple = 0
      hunt.stagger = 0
      monsterDo(g, 'topple')
      say(g, 'toppled')
    } else if (hunt.stagger >= VELKHANA.flinchEvery && m.move !== 'topple' && m.move !== 'getup') {
      hunt.stagger = 0
      monsterDo(g, 'flinch')
      say(g, 'flinched')
    }
  }
  return false
}

function fight(g: Game): void {
  const hunt = g.hunt!
  const h = g.hunter
  const m = g.monster
  hunt.fightTicks += 1
  if (settle(g)) return

  // monster: finish moves, walk in, then decide
  const mNow: Move = monsterMove(m.move)
  if (m.move !== 'idle' && m.move !== 'walk' && isOver(mNow, m.t)) {
    if (m.move === 'topple') monsterDo(g, 'getup')
    else {
      monsterDo(g, 'idle')
      m.wait = between(g, VELKHANA.idleTicks)
    }
  } else if (m.move === 'walk') {
    const next = Math.max(monsterMinX(g), m.x - VELKHANA.walkStep / sum(mNow.ticks))
    if (isOver(mNow, m.t) || next >= m.x) {
      monsterDo(g, 'idle')
      m.wait = between(g, VELKHANA.idleTicks)
    } else m.x = next
  } else if (m.move === 'idle') {
    m.wait -= 1
    if (m.wait <= 0) monsterDecide(g)
  }

  // hunter: finish moves, roll travel, pending dodge, run in, regen, then decide
  const hNow: Move = hunterMove(g, h.move)
  if (h.move === 'roll') h.x = Math.max(HUNTER.minX, h.x - HUNTER.rollDistance / sum(hNow.ticks))
  if (h.move !== 'idle' && h.move !== 'run' && isOver(hNow, h.t)) {
    h.facing = 1
    hunterDo(g, 'idle')
    h.wait = between(g, HUNTER.idleTicks)
  }
  if (h.rollIn >= 0) {
    h.rollIn -= 1
    if (h.rollIn < 0 && (h.move === 'idle' || h.move === 'run')) {
      h.intent = null
      h.facing = WEAPONS[g.weapon].dodgeFacesFoe === true ? 1 : -1
      hunterDo(g, 'roll')
    }
    if (h.move === 'idle') return
  }
  // a monster attack on its way that would reach: never swing into it
  if ((h.move === 'idle' || h.move === 'run') && h.rollIn < 0 && watch(g)) return
  if (h.move === 'run') {
    if (h.facing === -1) stopBackingOff(g)
    else runIn(g)
    return
  }
  if (h.move !== 'idle') return
  if (h.t % HUNTER.staminaRegenTicks === 0) h.stamina = Math.min(HUNTER.staminaMax, h.stamina + 1)
  if (hunt.fightTicks % HUNTER.hpRegenTicks === 0) h.hp = Math.min(HUNTER.hpMax, h.hp + 1)
  h.wait -= 1
  if (h.wait > 0) return
  hunterDecide(g)
}

const can = (g: Game, move: HunterMove): boolean => g.hunter.stamina >= (hunterMove(g, move).stamina ?? 0)

/** Would this hunter attack touch the monster from where the hunter stands? */
function hunterReaches(g: Game, move: HunterMove): boolean {
  const [mAction, mPose] = monsterPose(g)
  return reaches(hunterMove(g, move).action, { ...hunterAt(g), renderFlip: 1 }, mAction, mPose, monsterAt(g))
}

function hunterDecide(g: Game): void {
  const h = g.hunter
  const m = g.monster
  const opening = m.move === 'flinch' || m.move === 'topple'
  let choice: HunterMove | 'wait'
  const weapon = WEAPONS[g.weapon]
  if (opening) choice = weapon.openers.find(move => can(g, move)) ?? 'wait'
  else {
    const options: [HunterMove | 'wait', number][] = [['wait', HUNTER.waitWeight]]
    for (const move of weapon.attacks) if (can(g, move)) options.push([move, hunterMove(g, move).weight ?? 0])
    choice = pick(g, options)
  }
  if (choice === 'wait') {
    h.wait = between(g, HUNTER.idleTicks)
    return
  }
  if (hunterReaches(g, choice)) swing(g, choice)
  else {
    // out of reach: run in first, swing once the blade would land
    h.intent = choice
    h.facing = 1
    hunterDo(g, 'run')
  }
}

/** Swing, unless the monster's attack under way would catch the swinging body: then stand and let it pass. */
function swing(g: Game, move: HunterMove): void {
  if (threat(g, move) !== null) {
    g.hunter.intent = null
    if (g.hunter.move !== 'idle') hunterDo(g, 'idle')
    g.hunter.wait = 1
    return
  }
  attack(g, move)
}

function attack(g: Game, move: HunterMove): void {
  g.hunter.facing = 1
  g.hunter.intent = null
  hunterDo(g, move)
  // every attack move has its callout in hooks/i18n.ts (a test holds both tables to it)
  say(g, move as HunterMove & TextId)
}

/** One running step toward the monster; swing when in reach, give up when blocked. */
function runIn(g: Game): void {
  const h = g.hunter
  const intent = h.intent
  if (intent === null || !can(g, intent)) {
    h.intent = null
    hunterDo(g, 'idle')
    h.wait = between(g, HUNTER.idleTicks)
    return
  }
  if (hunterReaches(g, intent)) {
    swing(g, intent)
    return
  }
  const next = Math.min(hunterMaxX(g), h.x + HUNTER.runStep)
  if (next <= h.x) {
    h.intent = null
    hunterDo(g, 'idle')
    h.wait = between(g, HUNTER.idleTicks)
  } else h.x = next
}

/** Attack only with what reaches the hunter now; otherwise walk in, or wait. */
function monsterDecide(g: Game): void {
  const m = g.monster
  const [hAction, hPose] = hunterPose(g)
  const options: ['tailStab' | 'iceBeam', number][] = []
  for (const move of ['tailStab', 'iceBeam'] as const) {
    if (reaches(monsterMove(move).action, monsterAt(g), hAction, hPose, hunterAt(g))) options.push([move, VELKHANA.moves[move].weight])
  }
  if (options.length === 0) {
    if (m.x > monsterMinX(g)) monsterDo(g, 'walk')
    else m.wait = between(g, VELKHANA.idleTicks)
    return
  }
  const move = pick(g, options)
  monsterDo(g, move)
  say(g, move)
}

/**
 * Ticks until the monster's attack can first touch the hunter standing here in
 * `as` (any of its poses), while it can still touch; null when no threat.
 * Judged on the body the hunter will have, not the one it has: standing still
 * after backing off, or swinging (a swing's body reaches further than idle).
 */
function threat(g: Game, as: HunterMove): number | null {
  const m = g.monster
  const move = monsterMove(m.move)
  if (m.attack === null || move.active === undefined || m.attack.contacts.some(c => c.target === 'hunter')) return null
  const start = sum(move.ticks.slice(0, move.active))
  const end = start + (move.ticks[move.active] ?? 0)
  if (m.t >= end) return null
  const body = hunterMove(g, as)
  // facing the monster, as the hunter stands once it stops or swings
  const at = { ...hunterAt(g), renderFlip: 1 as const }
  const hit = body.ticks.some((_, pose) => reaches(move.action, monsterAt(g), body.action, pose, at))
  return hit ? Math.max(0, start - m.t) : null
}

/**
 * The free hunter (idle or running) watches the monster. An attack that would
 * reach gets one dodge draw (per attack, the first time the hunter is free to
 * see it); a roll is timed to meet it, otherwise the hunter backs off. Returns
 * true when this tick went to dodging.
 */
function watch(g: Game): boolean {
  const h = g.hunter
  const coming = threat(g, 'idle')
  if (coming === null) return false
  const id = g.monster.attack!.id
  if (h.dodgeFor !== id) {
    h.dodgeFor = id
    if (can(g, 'roll') && rand(g) < HUNTER.dodgeRate) {
      const safeFrom = sum(hunterMove(g, 'roll').ticks.slice(0, HUNTER.rollInvulnerable[0]))
      h.rollIn = Math.max(0, coming - safeFrom - 3)
      h.intent = null
      if (h.move === 'run') hunterDo(g, 'idle')
      return true
    }
  }
  backOff(g)
  return true
}

/** Run away from the monster until its attack would no longer reach. */
function backOff(g: Game): void {
  const h = g.hunter
  h.intent = null
  if (h.move !== 'run' || h.facing !== -1) {
    h.facing = -1
    hunterDo(g, 'run')
  }
  h.x = Math.max(HUNTER.minX, h.x - HUNTER.runStep)
}

function stopBackingOff(g: Game): void {
  g.hunter.facing = 1
  hunterDo(g, 'idle')
  g.hunter.wait = between(g, HUNTER.idleTicks)
}

const actorView = (move: Move, a: { t: number; x: number }, facing: 1 | -1, loop: boolean): ActorView => ({
  action: move.action,
  frame: loop ? loopPose(move, a.t) : poseAt(move, a.t),
  x: Math.round(a.x),
  facing,
})

export function viewOf(g: Game): View {
  const inCamp = g.mode === 'camp' || g.mode === 'leaving'
  const h = g.hunter
  return {
    scene: inCamp || g.hunt === null ? CAMP_SCENE : g.hunt.scene,
    hunter: actorView(hunterMove(g, h.move), h, h.facing, LOOPING.has(h.move)),
    monster: inCamp || g.hunt === null ? null : actorView(monsterMove(g.monster.move), g.monster, 1, LOOPING.has(g.monster.move)),
    hp: h.hp,
    stamina: h.stamina,
    weapon: g.weapon,
    isRandomWeapon: g.weaponChoice === 'random',
    label: g.labelT < LABEL_TICKS ? g.label : '',
    monsterHpPercent: g.hunt === null ? null : Math.round((100 * g.hunt.monsterHp) / g.hunt.monsterHpMax),
    marks: inCamp
      ? []
      : g.hits.flatMap(hit =>
          hit.x !== undefined && hit.y !== undefined && g.simTick - hit.tick < MARK_TICKS ? [{ x: hit.x, y: hit.y, outcome: hit.outcome }] : [],
        ),
    camp: inCamp
      ? { flicker: g.simTick % 4, cook: h.move === 'eat' ? null : h.move === 'roast' ? Math.min(1, h.t / CAMP.roastTicks) : 0 }
      : null,
  }
}
