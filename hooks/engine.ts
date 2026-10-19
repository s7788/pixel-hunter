import type {
  HuntAttack as Attack,
  HuntContactOutcome as Outcome,
  HuntGame as Game,
  HunterMoveId as HunterMove,
  HuntMode as Mode,
  HuntRun,
  MonsterId,
  MonsterMoveId as MonsterMove,
} from '../types'
import type { Aabb, Placement } from './collision'
import { contactPart, hitboxes, hitDefs, hurtboxes, reaches, shifted, toWorld, touchesAny } from './collision'
import { MOVE_BOUNDS } from './collision-data'
import type { Move } from './data'
import { BODY_GAP, CAMP, CAMP_SCENE, HUNTER, TICK_MS } from './data'
import { enabledMonsters, monsterDef, VELKHANA } from './monsters/registry'
import type { Fx, MonsterCtx, MonsterDef, MonsterMove as MonsterMoveDef } from './monsters/types'
import { RANGE_BANDS } from './monsters/types'
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
 *
 * The monster is whichever species the hunt was drawn with (hooks/monsters):
 * its moves, tuning and own mechanic come from that definition.
 */

export type { Game }

const hunterMove = (move: HunterMove): Move => HUNTER.moves[move]

/** The hunt's species; a hunt is always started with a registered one. */
const defOf = (g: Game): MonsterDef => monsterDef(g.hunt!.monsterId)!
const monsterMove = (g: Game, move: MonsterMove): MonsterMoveDef => defOf(g).moves[move]!
const idleKey = (g: Game): MonsterMove => defOf(g).mechanic?.idleMove(g) ?? 'idle'
const walkKey = (g: Game): MonsterMove => defOf(g).mechanic?.walkMove(g) ?? 'walk'
/** Down on the ground: an opening that gets up again (never left for idle on retreat). */
const isDown = (g: Game): boolean => {
  const move = monsterMove(g, g.monster.move)
  return move.opening === true && move.then !== undefined
}

/**
 * `hitShift`/`hitSpread`: local pixels the live hit boxes have flown (a
 * projectile, a spread volley), for the debug boxes; `lift`: the root's height
 * in a leap (negative = up).
 */
export type ActorView = {
  action: ActionId
  frame: number
  x: number
  facing: 1 | -1
  hitShift?: number
  hitSpread?: number[]
  lift?: number
}

export type View = {
  scene: SceneId
  hunter: ActorView
  monster: ActorView | null
  /** The hunt's species for the HUD: name, kind, and its state when it has one to show. */
  monsterInfo: { name: string; species: string; status: string | null } | null
  hp: number
  stamina: number
  label: string
  monsterHpPercent: number | null
  /** Effects drawn on live hit boxes (a projectile in flight). */
  effects: { fx: Fx; box: Aabb }[]
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

const SAVE_SCHEMA = 4
const SCENE_SCALE = 3
const HITS_KEPT = 30
const MARK_TICKS = 8
const HUNTER_LOOPING = new Set<string>(['idle', 'run', 'walk'])
const hunterPoseOf = (key: string, move: Move, t: number): number =>
  HUNTER_LOOPING.has(key) ? loopPose(move, t) : poseAt(move, t)
/** The tick segment a monster move is in (its pose index); `frameOf` maps it to the sprite frame shown. */
const monsterPoseOf = (move: MonsterMoveDef, t: number): number => (move.loop === true ? loopPose(move, t) : poseAt(move, t))
const frameOf = (move: MonsterMoveDef, seg: number): number => move.frames?.[seg] ?? seg
/** A move's active segments (a combo has several, each its own group). */
const activesOf = (move: MonsterMoveDef): readonly number[] => move.actives ?? (move.active === undefined ? [] : [move.active])
const spanOf = (move: Move, seg: number): [number, number] => {
  const start = sum(move.ticks.slice(0, seg))
  return [start, start + (move.ticks[seg] ?? 0)]
}
/** The active span a projectile flies from: the latest one started by tick `t` (the first before any). */
function launchOf(move: MonsterMoveDef, t: number): [number, number] {
  const spans = activesOf(move).map(seg => spanOf(move, seg))
  return spans.filter(([start]) => start <= t).at(-1) ?? spans[0] ?? [0, 0]
}

/** The root's height at tick `t` of a move: linear between its lift keys, 0 outside them or without any. */
export function liftAt(move: MonsterMoveDef, t: number): number {
  const keys = move.lift
  if (keys === undefined || keys.length === 0 || t <= keys[0]![0] || t >= keys[keys.length - 1]![0]) return 0
  let i = 1
  while (keys[i]![0] < t) i += 1
  const [t0, y0] = keys[i - 1]!
  const [t1, y1] = keys[i]!
  return Math.round(y0 + ((y1 - y0) * (t - t0)) / (t1 - t0))
}

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

function say(g: Game, text: string): void {
  g.label = text
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
    slainBy: {},
    carts: 0,
    lastOutcome: null,
    hits: [],
  }
}

/**
 * Monster HP that lasts about the species' `targetMinutes` of hunting, from a
 * fixed-seed run against an unkillable one. A species whose parts scale with
 * max HP runs a second pass at the first estimate, so its breaks happen.
 */
const calibrated = new Map<MonsterId, number>()
export function monsterHpForTarget(id: MonsterId): number {
  let hp = calibrated.get(id)
  if (hp === undefined) {
    const def = monsterDef(id)!
    const pass = (maxHp: number): number => {
      let g = newGame(20261016)
      startHunt(g, id, 1e9, maxHp)
      g = beginTurn(g)
      const ticks = 6000
      for (let i = 0; i < ticks; i += 1) g = step(g, true)
      const perTick = (1e9 - g.hunt!.monsterHp) / ticks
      // no hit landed: a box or stance is off; never make a monster with no HP
      if (!(perTick > 0)) throw new Error(`hunt-8bit: calibration of ${id} landed no hits; check the collision boxes and stances`)
      return Math.round(perTick * ((def.targetMinutes * 60_000) / TICK_MS))
    }
    hp = pass(1e9)
    if (def.calibrateTwice === true) hp = pass(hp)
    calibrated.set(id, hp)
  }
  return hp
}

/** The species of a new hunt: an enabled one, from the seed (the draw leaves the seed as it is). */
function drawMonster(g: Game): MonsterId {
  const pool = enabledMonsters()
  // murmur3's finalizer: a bare multiply leaves the low bits patterned, and with six species only three came up
  let x = g.seed ^ Math.imul(g.huntNo + 1, 0x9e3779b1)
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b)
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
  return pool[((x ^ (x >>> 16)) >>> 0) % pool.length]!
}

function startHunt(g: Game, id: MonsterId = drawMonster(g), hp: number = monsterHpForTarget(id), maxHp: number = hp): void {
  const def = monsterDef(id)!
  const scene = def.scenes[g.huntNo % def.scenes.length]!
  const own = def.mechanic?.initial(maxHp) ?? { state: 'normal', parts: {} }
  g.hunt = {
    monsterId: id,
    definitionVersion: def.definitionVersion,
    scene,
    monsterHp: hp,
    monsterHpMax: maxHp,
    stagger: 0,
    topple: 0,
    fightTicks: 0,
    isFresh: true,
    state: own.state,
    stateT: 0,
    parts: own.parts,
    cooldowns: {},
  }
  g.huntNo += 1
}

/** The saved hunt's species is registered: otherwise it waits at camp, kept as it was. */
const isReady = (g: Game): boolean => g.hunt === null || monsterDef(g.hunt.monsterId) !== undefined

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
  g.hunter.stamina = Math.max(0, g.hunter.stamina - (hunterMove(move).stamina ?? 0))
  g.hunter.attack = startAttack(g, 'hunter', hunterMove(move))
}

function monsterDo(g: Game, move: MonsterMove): void {
  g.monster.move = move
  g.monster.t = 0
  g.monster.attack = startAttack(g, 'monster', monsterMove(g, move))
}

/** The hunt's species counters, created on first use (saves from before them have none). */
const meters = (g: Game): Record<string, number> => (g.hunt!.meters ??= {})

const ctxOf = (g: Game): MonsterCtx => ({ g, act: move => monsterDo(g, move), say: text => say(g, text) })

function leaveCamp(g: Game, monster?: MonsterId): void {
  if (g.hunt === null) startHunt(g, monster)
  if (!isReady(g)) {
    say(g, '魔物資料未就緒')
    return
  }
  setMode(g, 'leaving')
  g.hunter.facing = 1
  hunterDo(g, 'run')
}

/** A main turn started: leave camp (new hunt or the saved one). `monster` picks the species of a new hunt (tests, calibration). */
export function beginTurn(game: Game, monster?: MonsterId): Game {
  const g = clone(game)
  g.isResting = false
  if (g.mode === 'camp') leaveCamp(g, monster)
  return g
}

/**
 * Debug (`/hunt-demo <monsterId>`): drop the hunt under way and head out at
 * once after a fresh one of this species. Tallies and the seed stay.
 */
export function debugHunt(game: Game, monster: MonsterId): Game {
  const g = clone(game)
  if (g.mode !== 'camp') toCamp(g)
  g.hunt = null
  g.isResting = false
  leaveCamp(g, monster)
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
    if (!isDown(g)) monsterDo(g, idleKey(g))
    say(g, '撤退')
  } else if (g.mode === 'leaving') {
    toCamp(g)
  }
  return g
}

/** The fields a hunt saved before the registry lacks: it was Velkhana, in no state of its own. */
function upgradeHunt(hunt: HuntRun): HuntRun {
  return {
    ...hunt,
    monsterId: hunt.monsterId ?? 'velkhana',
    definitionVersion: hunt.definitionVersion ?? 1,
    state: hunt.state ?? 'normal',
    stateT: hunt.stateT ?? 0,
    parts: hunt.parts ?? {},
    cooldowns: hunt.cooldowns ?? {},
  }
}

/**
 * An older save. Before collision (no schema 2) attacks under way had no
 * contact record, so they are dropped and the hunter goes back to camp; the
 * hunt's HP, seed and tallies stay. Before the registry (schema 2) the hunt
 * was Velkhana and gains its species fields, nothing else changes. Before the
 * per-species tally (schema 4) every kill so far is counted as Velkhana's: the
 * first three schemas only ever hunted her, and a schema-3 save that already
 * slew another species cannot be told apart. A current game comes back unchanged.
 */
export function migrate(saved: Game): Game {
  if (saved.saveSchemaVersion === SAVE_SCHEMA) return saved
  const g = migrateHunt(saved)
  g.slainBy ??= g.slain > 0 ? { velkhana: g.slain } : {}
  g.saveSchemaVersion = SAVE_SCHEMA
  return g
}

function migrateHunt(saved: Game): Game {
  const old = clone(saved)
  if (old.saveSchemaVersion >= 3) return old
  if (old.saveSchemaVersion === 2) {
    return { ...old, saveSchemaVersion: SAVE_SCHEMA, hunt: old.hunt === null ? null : upgradeHunt(old.hunt) }
  }
  const g: Game = {
    ...old,
    saveSchemaVersion: SAVE_SCHEMA,
    simTick: 0,
    nextAttackSerial: 0,
    lastOutcome: null,
    hits: [],
    hunt: old.hunt === null ? null : upgradeHunt(old.hunt),
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
  if (g.hunt !== null && g.mode === 'camp') g.hunt.isFresh = false
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
      if (working && !g.isResting && g.modeT >= CAMP_DELAY && isReady(g)) leaveCamp(g)
      else campRest(g)
      break
    case 'leaving': {
      // from wherever the hunter was resting, off the right edge in RUN_TICKS
      g.hunter.x += (420 - g.hunter.x) / Math.max(1, RUN_TICKS - g.modeT + 1)
      if (g.modeT >= RUN_TICKS) {
        const def = defOf(g)
        setMode(g, 'arriving')
        g.hunter.x = -40
        if (g.hunt!.isFresh) {
          g.monster = { move: walkKey(g), t: 0, x: def.enterFromX, wait: 0, attack: null }
        } else {
          g.monster = { move: idleKey(g), t: 0, x: g.monster.x, wait: between(g, def.idleTicks), attack: null }
        }
      }
      break
    }
    case 'arriving': {
      const def = defOf(g)
      const span = g.hunt!.isFresh ? RUN_TICKS * 2 : RUN_TICKS
      g.hunter.x = Math.min(HUNTER.x, hunterMaxX(g), -40 + ((HUNTER.x + 40) * g.modeT) / RUN_TICKS)
      if (g.hunt!.isFresh) g.monster.x = def.enterFromX + ((def.x - def.enterFromX) * g.modeT) / span
      if (g.modeT >= RUN_TICKS && g.hunter.move === 'run') {
        hunterDo(g, 'idle')
        g.hunter.wait = between(g, HUNTER.idleTicks)
      }
      if (g.modeT >= span) {
        g.monster = {
          move: idleKey(g),
          t: 0,
          x: g.hunt!.isFresh ? def.x : g.monster.x,
          wait: between(g, def.idleTicks),
          attack: null,
        }
        g.hunt!.isFresh = false
        setMode(g, 'fight')
        say(g, g.hunt!.monsterHp === g.hunt!.monsterHpMax ? '狩獵開始' : '繼續狩獵')
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
        g.isResting = true
        toCamp(g)
        say(g, '討伐完成')
      }
      break
  }
  return g
}

const groundOf = (g: Game): number => SCENES[g.hunt!.scene].ground * SCENE_SCALE
const hunterAt = (g: Game): Placement => ({ x: g.hunter.x, groundY: groundOf(g), renderFlip: g.hunter.facing })
const monsterAt = (g: Game): Placement => ({
  x: g.monster.x,
  groundY: groundOf(g) + liftAt(monsterMove(g, g.monster.move), g.monster.t),
  renderFlip: 1,
})
const hunterPose = (g: Game): [ActionId, number] => {
  const move = hunterMove(g.hunter.move)
  return [move.action, hunterPoseOf(g.hunter.move, move, g.hunter.t)]
}
const monsterPose = (g: Game): [ActionId, number] => {
  const move = monsterMove(g, g.monster.move)
  return [move.action, frameOf(move, monsterPoseOf(move, g.monster.t))]
}

/** The monster faces the other way in this segment of its move (a turn-back dash). */
const isTurned = (g: Game): boolean => {
  const move = monsterMove(g, g.monster.move)
  return move.turned?.includes(monsterPoseOf(move, g.monster.t)) === true
}

/** The monster's push box now (its state may widen it; turned round it mirrors). */
const pushBox = (g: Game): readonly [number, number] => {
  const own = defOf(g).mechanic?.bounds?.(g) ?? defOf(g).bounds
  return isTurned(g) ? [-own[1], -own[0]] : own
}

/** Rightmost the monster's root goes: its push box stays on the screen. */
const ARENA_RIGHT = 368
const monsterMaxX = (g: Game): number => ARENA_RIGHT - pushBox(g)[1]

/** The bodies never overlap: the hunter stays left of the monster's push box. */
const hunterMaxX = (g: Game): number => g.monster.x + pushBox(g)[0] - MOVE_BOUNDS.hunter[1] - BODY_GAP
const monsterMinX = (g: Game): number =>
  Math.max(defOf(g).minX, g.hunter.x + MOVE_BOUNDS.hunter[1] - pushBox(g)[0] + BODY_GAP)

/** Local pixels a projectile has flown forward by this tick of its move (forward = the art's facing). */
function flight(g: Game, move: MonsterMoveDef, t: number): number {
  if (move.travel === undefined) return 0
  return defOf(g).assetFacing * move.travel * Math.max(0, t - launchOf(move, t)[0])
}

/** Pixels each box of a spread volley has drifted down by this tick (none without a spread). */
function drift(move: MonsterMoveDef, t: number): number[] | undefined {
  if (move.spread === undefined) return undefined
  const since = Math.max(0, t - launchOf(move, t)[0])
  return move.spread.map(v => v * since)
}

/** The monster's live hit boxes this tick (a projectile where it has flown to). */
function monsterHits(g: Game): Aabb[] {
  const move = monsterMove(g, g.monster.move)
  const [action, pose] = monsterPose(g)
  return hitboxes(action, pose, monsterAt(g), flight(g, move, g.monster.t), drift(move, g.monster.t))
}

/** Everywhere this monster attack could land from where it stands: lunge and flight included. */
function monsterReach(g: Game, key: MonsterMove): Aabb[] {
  const move = monsterMove(g, key)
  const [start, end] = launchOf(move, 0)
  const forward = (move.advance ?? 0) + (move.travel ?? 0) * Math.max(0, end - start - 1)
  const along = defOf(g).assetFacing * forward
  return hitDefs(move.action).flatMap(h => h.boxes).flatMap(b => {
    const [x0, y0, x1, y1] = shifted(b, along)
    return [toWorld(forward === 0 ? b : [Math.min(b[0], x0), y0, Math.max(b[2], x1), y1], monsterAt(g))]
  })
}

const isInvulnerable = (g: Game): boolean =>
  g.hunter.move === 'roll' && (HUNTER.rollInvulnerable as readonly number[]).includes(poseAt(HUNTER.moves.roll, g.hunter.t))

type Contact = { source: 'hunter' | 'monster'; attack: Attack; part: string; x: number; y: number; outcome: Outcome; damage: number }

/** This tick's contacts, judged on the state before any of them applies. */
function findContacts(g: Game): Contact[] {
  const out: Contact[] = []
  const [hAction, hPose] = hunterPose(g)
  const [mAction, mPose] = monsterPose(g)
  const m = g.monster
  const h = g.hunter
  if (m.attack !== null && !m.attack.contacts.some(c => c.target === 'hunter')) {
    const touch = contactPart(monsterHits(g), hurtboxes(hAction, hPose, hunterAt(g)))
    if (touch !== undefined) {
      const evaded = isInvulnerable(g)
      out.push({
        source: 'monster',
        attack: m.attack,
        part: touch.part,
        ...touch.point,
        outcome: evaded ? 'evaded' : 'damaged',
        damage: evaded ? 0 : monsterMove(g, m.move).damage ?? 0,
      })
    }
  }
  if (h.attack !== null && !h.attack.contacts.some(c => c.target === 'monster')) {
    const touch = contactPart(hitboxes(hAction, hPose, hunterAt(g)), hurtboxes(mAction, mPose, monsterAt(g)))
    if (touch !== undefined) {
      out.push({ source: 'hunter', attack: h.attack, part: touch.part, ...touch.point, outcome: 'damaged', damage: hunterMove(h.move).damage ?? 0 })
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
  const def = defOf(g)
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
    g.slain += 1
    g.slainBy[hunt.monsterId] = (g.slainBy[hunt.monsterId] ?? 0) + 1
    g.lastOutcome = hunterFell ? 'mutual_ko' : null
    if (hunterFell) g.carts += 1
    setMode(g, 'slain')
    monsterDo(g, def.slainMove)
    hunterDo(g, hunterFell ? 'down' : 'idle')
    h.rollIn = -1
    h.intent = null
    say(g, hunterFell ? '雙方倒下・討伐完成' : '討伐完成！')
    return true
  }
  if (hunterFell) {
    g.carts += 1
    setMode(g, 'carted')
    hunterDo(g, 'down')
    h.rollIn = -1
    h.intent = null
    if (!isDown(g)) monsterDo(g, idleKey(g))
    say(g, '力竭…回營')
    return true
  }
  if (toHunter > 0) {
    hunterDo(g, 'hit')
    h.facing = 1
    h.rollIn = -1
    h.intent = null
    say(g, monsterMove(g, monsterAttack).hitLabel ?? '被擊中')
  } else if (found.some(c => c.outcome === 'evaded')) {
    say(g, '翻滾閃避')
  }
  if (toMonster > 0) {
    // the species' own reaction (a part broke) wins over a flinch or topple; a filled meter is spent with it
    let tookOver = false
    for (const c of found) if (c.source === 'hunter' && c.damage > 0 && def.mechanic?.damaged(ctxOf(g), c.part, c.damage) === true) tookOver = true
    if (tookOver) {
      if (hunt.topple >= def.toppleEvery) hunt.topple = 0
      if (hunt.stagger >= def.flinchEvery) hunt.stagger = 0
    } else if (hunt.topple >= def.toppleEvery && !isDown(g)) {
      hunt.topple = 0
      hunt.stagger = 0
      monsterDo(g, 'topple')
      say(g, `${def.name}倒地`)
    } else if (hunt.stagger >= def.flinchEvery && !isDown(g) && m.move !== 'getup') {
      hunt.stagger = 0
      monsterDo(g, 'flinch')
      say(g, `${def.name}硬直`)
    }
  }
  return false
}

function fight(g: Game): void {
  const def = defOf(g)
  const hunt = g.hunt!
  const h = g.hunter
  const m = g.monster
  hunt.fightTicks += 1
  hunt.stateT += 1
  // a combo's next active segment is a new group: it may land once more
  const before = monsterMove(g, m.move)
  if (before.actives !== undefined && m.t > 0) {
    const at = monsterPoseOf(before, m.t)
    if (at !== monsterPoseOf(before, m.t - 1) && at !== before.actives[0] && before.actives.includes(at)) {
      m.attack = startAttack(g, 'monster', before)
    }
  }
  if (settle(g)) return
  def.mechanic?.tick?.(ctxOf(g))

  // monster: finish moves, lunge, walk in, then decide
  const mNow = monsterMove(g, m.move)
  const idle = idleKey(g)
  const walk = walkKey(g)
  // a dive locks its landing spot once: the nearest legal spot to the hunter, within its reach
  if (mNow.seek !== undefined && m.t === mNow.seek) {
    meters(g).seekX = Math.round(Math.max(monsterMinX(g), m.x + def.assetFacing * (mNow.advance ?? 0)))
  }
  const seg = monsterPoseOf(mNow, m.t)
  if (mNow.advance !== undefined && activesOf(mNow).includes(seg)) {
    const [start, end] = spanOf(mNow, seg)
    if (mNow.seek !== undefined) {
      const to = meters(g).seekX ?? m.x
      m.x = Math.max(monsterMinX(g), m.x + (to - m.x) / Math.max(1, end - m.t))
    } else {
      const stride = ((isTurned(g) ? -1 : 1) * def.assetFacing * mNow.advance) / Math.max(1, end - start)
      m.x = stride < 0 ? Math.max(monsterMinX(g), m.x + stride) : Math.min(monsterMaxX(g), m.x + stride)
    }
  }
  if (m.move !== idle && m.move !== walk && isOver(mNow, m.t)) {
    if (mNow.then !== undefined) monsterDo(g, mNow.then)
    else {
      monsterDo(g, idleKey(g))
      m.wait = between(g, def.idleTicks)
    }
  } else if (m.move === walk) {
    const speed = def.mechanic?.speed(g) ?? 1
    const next = Math.max(monsterMinX(g), m.x - (def.walkStep * speed) / sum(mNow.ticks))
    if (isOver(mNow, m.t) || next >= m.x) {
      monsterDo(g, idle)
      m.wait = between(g, def.idleTicks)
    } else m.x = next
  } else if (m.move === idle) {
    m.wait -= 1
    if (m.wait <= 0) monsterDecide(g)
  }

  // a lunge or a state that widens the monster pushes the hunter back, never through it
  if (h.x > hunterMaxX(g)) h.x = Math.max(HUNTER.minX, hunterMaxX(g))

  // hunter: finish moves, roll travel, pending dodge, run in, regen, then decide
  const hNow: Move = hunterMove(h.move)
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
      h.facing = -1
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

const can = (g: Game, move: HunterMove): boolean => g.hunter.stamina >= (hunterMove(move).stamina ?? 0)

/** Would this hunter attack touch the monster from where the hunter stands? */
function hunterReaches(g: Game, move: HunterMove): boolean {
  const [mAction, mPose] = monsterPose(g)
  return reaches(hunterMove(move).action, { ...hunterAt(g), renderFlip: 1 }, mAction, mPose, monsterAt(g))
}

/** The monster is open to the strongest swing: a reaction, or the tail end of a move (`openFrom`). */
function isOpening(g: Game): boolean {
  const move = monsterMove(g, g.monster.move)
  return move.opening === true || (move.openFrom !== undefined && g.monster.t >= move.openFrom)
}

function hunterDecide(g: Game): void {
  const h = g.hunter
  const opening = isOpening(g)
  let choice: HunterMove | 'wait'
  if (opening) choice = can(g, 'trueCharge') ? 'trueCharge' : can(g, 'charge') ? 'charge' : can(g, 'tackle') ? 'tackle' : 'wait'
  else {
    const options: [HunterMove | 'wait', number][] = [['wait', HUNTER.waitWeight]]
    if (can(g, 'charge')) options.push(['charge', HUNTER.moves.charge.weight])
    if (can(g, 'tackle')) options.push(['tackle', HUNTER.moves.tackle.weight])
    choice = pick(g, options)
  }
  if (choice === 'wait') {
    h.wait = between(g, HUNTER.idleTicks)
    return
  }
  if (hunterReaches(g, choice)) attack(g, choice)
  else {
    // out of reach: run in first, swing once the blade would land
    h.intent = choice
    h.facing = 1
    hunterDo(g, 'run')
  }
}

function attack(g: Game, move: HunterMove): void {
  g.hunter.facing = 1
  g.hunter.intent = null
  hunterDo(g, move)
  say(g, { charge: '蓄力斬', trueCharge: '真蓄力斬', tackle: '肩撞' }[move as 'charge' | 'trueCharge' | 'tackle'])
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
    attack(g, intent)
    return
  }
  const next = Math.min(hunterMaxX(g), h.x + HUNTER.runStep)
  if (next <= h.x) {
    h.intent = null
    hunterDo(g, 'idle')
    h.wait = between(g, HUNTER.idleTicks)
  } else h.x = next
}

/** Horizontal gap between the hunter's body and the monster's torso (negative when they would overlap). */
const bodyGap = (g: Game): number => g.monster.x + (defOf(g).torso ?? defOf(g).bounds)[0] - (g.hunter.x + MOVE_BOUNDS.hunter[1])

/** A band test: near takes anything closer than its far edge; mid and far are [from, to). */
function inRange(g: Game, ranges: readonly ('near' | 'mid' | 'far')[]): boolean {
  const gap = bodyGap(g)
  return ranges.some(r => {
    const [from, to] = RANGE_BANDS[r]
    return (r === 'near' || gap >= from) && (r === 'far' ? gap <= to : gap < to)
  })
}

/** The move fits the species' state, its own rules, and is off cooldown. */
function isAllowed(g: Game, key: MonsterMove): boolean {
  const move = monsterMove(g, key)
  const hunt = g.hunt!
  if (move.state !== undefined && move.state !== hunt.state) return false
  if (defOf(g).mechanic?.allows(g, key) === false) return false
  return (hunt.cooldowns[key] ?? 0) <= hunt.fightTicks
}

/**
 * A safe decision point. The species' mechanic may act first (a state
 * change); otherwise it attacks with what may be chosen now: by its decision
 * band, or, for moves with none, only when its boxes would reach. With nothing
 * to throw it walks in, or waits.
 */
function monsterDecide(g: Game): void {
  const def = defOf(g)
  const m = g.monster
  if (def.mechanic?.decide(ctxOf(g)) === true) return
  const [hAction, hPose] = hunterPose(g)
  const options: [MonsterMove, number][] = []
  for (const key of def.attacks) {
    if (!isAllowed(g, key)) continue
    const move = monsterMove(g, key)
    const fits = move.range !== undefined ? inRange(g, move.range) : touchesAny(monsterReach(g, key), hAction, hPose, hunterAt(g))
    if (fits && (move.hazard !== true || hazardFits(g, key))) options.push([key, move.weight ?? 1])
  }
  const walk = walkKey(g)
  const walksIn = def.mechanic?.walksIn?.(g) !== false
  if (options.length > 0 && def.approachWeight !== undefined && walksIn && m.x > monsterMinX(g)) options.push([walk, def.approachWeight])
  if (options.length === 0) {
    if (m.x > monsterMinX(g)) monsterDo(g, walk)
    else m.wait = between(g, def.idleTicks)
    return
  }
  const key = pick(g, options)
  monsterDo(g, key)
  if (key === walk) return
  const move = monsterMove(g, key)
  if (move.cooldown !== undefined) g.hunt!.cooldowns[key] = g.hunt!.fightTicks + sum(move.ticks) + move.cooldown
  if (move.label !== undefined) say(g, move.label)
}

/** A ground hazard is placed only where all of it is on the arena (spec 3.4). */
function hazardFits(g: Game, key: MonsterMove): boolean {
  return monsterReach(g, key).every(b => b.minX >= HUNTER.minX && b.maxX <= ARENA_RIGHT)
}

/** Ticks until the monster's attack can first touch, while it can still touch; null when no threat. */
function threat(g: Game): number | null {
  const m = g.monster
  const move = monsterMove(g, m.move)
  if (m.attack === null || move.active === undefined || m.attack.contacts.some(c => c.target === 'hunter')) return null
  const next = activesOf(move)
    .map(seg => spanOf(move, seg))
    .find(([, end]) => m.t < end)
  if (next === undefined) return null
  const [start] = next
  const [hAction, hPose] = hunterPose(g)
  return touchesAny(monsterReach(g, m.move), hAction, hPose, hunterAt(g)) ? Math.max(0, start - m.t) : null
}

/**
 * The free hunter (idle or running) watches the monster. An attack that would
 * reach gets one dodge draw (per attack, the first time the hunter is free to
 * see it); a roll is timed to meet it, otherwise the hunter backs off. Returns
 * true when this tick went to dodging.
 */
function watch(g: Game): boolean {
  const h = g.hunter
  const coming = threat(g)
  if (coming === null) return false
  const id = g.monster.attack!.id
  if (h.dodgeFor !== id) {
    h.dodgeFor = id
    if (can(g, 'roll') && rand(g) < HUNTER.dodgeRate) {
      const safeFrom = sum(HUNTER.moves.roll.ticks.slice(0, HUNTER.rollInvulnerable[0]))
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

const actorView = (move: Move, frame: number, a: { x: number }, facing: 1 | -1): ActorView => ({
  action: move.action,
  frame,
  x: Math.round(a.x),
  facing,
})

/** Effects on the live hit boxes, and a dive's landing mark from the lock until it lands. */
function effectsOf(g: Game, move: MonsterMoveDef): View['effects'] {
  const out: View['effects'] = move.fx === undefined ? [] : monsterHits(g).map(box => ({ fx: move.fx!, box }))
  const to = g.hunt?.meters?.seekX
  if (move.seek !== undefined && to !== undefined && g.monster.t >= move.seek && g.monster.t < launchOf(move, 0)[1]) {
    const at = { x: to, groundY: groundOf(g), renderFlip: 1 as const }
    const land = hitDefs(move.action).flatMap(h => h.boxes.map(b => toWorld(b, at)))
    const minX = Math.min(...land.map(b => b.minX))
    const maxX = Math.max(...land.map(b => b.maxX))
    out.push({ fx: 'mark', box: { minX, maxX, minY: groundOf(g) - 3, maxY: groundOf(g) } })
  }
  return out
}

export function viewOf(g: Game): View {
  const inCamp = g.mode === 'camp' || g.mode === 'leaving'
  const h = g.hunter
  const def = g.hunt === null ? undefined : monsterDef(g.hunt.monsterId)
  const shown = !inCamp && g.hunt !== null && def !== undefined
  const mMove = shown ? monsterMove(g, g.monster.move) : undefined
  return {
    scene: inCamp || g.hunt === null ? CAMP_SCENE : g.hunt.scene,
    hunter: actorView(hunterMove(h.move), hunterPoseOf(h.move, hunterMove(h.move), h.t), h, h.facing),
    monster:
      mMove === undefined
        ? null
        : {
            ...actorView(mMove, frameOf(mMove, monsterPoseOf(mMove, g.monster.t)), g.monster, 1),
            hitShift: flight(g, mMove, g.monster.t),
            ...(mMove.spread === undefined ? {} : { hitSpread: drift(mMove, g.monster.t)! }),
            ...(mMove.lift === undefined ? {} : { lift: liftAt(mMove, g.monster.t) }),
          },
    monsterInfo: def === undefined || inCamp ? null : { name: def.name, species: def.species, status: def.mechanic?.status(g) ?? null },
    hp: h.hp,
    stamina: h.stamina,
    label: g.labelT < LABEL_TICKS ? g.label : '',
    monsterHpPercent: g.hunt === null ? null : Math.round((100 * g.hunt.monsterHp) / g.hunt.monsterHpMax),
    effects: mMove === undefined || g.mode !== 'fight' ? [] : effectsOf(g, mMove),
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
