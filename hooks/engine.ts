import type { HuntGame as Game, HunterMoveId as HunterMove, HuntMode as Mode, MonsterMoveId as MonsterMove } from '../types'
import type { Move } from './data'
import { CAMP_SCENE, HUNTER, TICK_MS, VELKHANA } from './data'
import type { ActionId, SceneId } from './sprites'

/**
 * The local hunt state machine: one pure step per tick, no model calls.
 * Randomness comes from a seed kept in the state, so a saved game resumes
 * exactly and a simulation is reproducible. Its state types live in the
 * mod's state contract (types/index.d.ts).
 */

export type { Game }

const hunterMove = (move: HunterMove): Move => HUNTER.moves[move]
const monsterMove = (move: MonsterMove): Move => VELKHANA.moves[move]

export type ActorView = { action: ActionId; frame: number; x: number; facing: 1 | -1 }

export type View = {
  scene: SceneId
  hunter: ActorView
  monster: ActorView | null
  hp: number
  stamina: number
  label: string
  monsterHpPercent: number | null
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
const landsNow = (move: Move, t: number): boolean =>
  move.active !== undefined && t === sum(move.ticks.slice(0, move.active))

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
    mode: 'camp',
    modeT: 0,
    huntNo: 0,
    hunt: null,
    isResting: false,
    hunter: { move: 'idle', t: 0, x: HUNTER.campX, wait: 0, hp: HUNTER.hpMax, stamina: HUNTER.staminaMax, facing: 1, rollIn: -1 },
    monster: { move: 'idle', t: 0, x: VELKHANA.x, wait: 0 },
    seed,
    label: '',
    labelT: LABEL_TICKS,
    slain: 0,
    carts: 0,
  }
}

/** Monster HP that lasts about `targetMinutes` of hunting, from a fixed-seed run. */
let calibrated: number | undefined
export function monsterHpForTarget(): number {
  if (calibrated === undefined) {
    let g = newGame(20261016)
    startHunt(g, 1e9)
    g = beginTurn(g)
    const ticks = 6000
    for (let i = 0; i < ticks; i += 1) g = step(g, true)
    const perTick = (1e9 - g.hunt!.monsterHp) / ticks
    calibrated = Math.round(perTick * ((VELKHANA.targetMinutes * 60_000) / TICK_MS))
  }
  return calibrated
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

function hunterDo(g: Game, move: HunterMove): void {
  g.hunter.move = move
  g.hunter.t = 0
  g.hunter.stamina = Math.max(0, g.hunter.stamina - (hunterMove(move).stamina ?? 0))
}

function monsterDo(g: Game, move: MonsterMove): void {
  g.monster.move = move
  g.monster.t = 0
}

/** A main turn started: leave camp (new hunt or the saved one). */
export function beginTurn(game: Game): Game {
  const g = clone(game)
  g.isResting = false
  if (g.mode === 'camp') {
    if (g.hunt === null) startHunt(g)
    setMode(g, 'leaving')
    g.hunter.facing = 1
    hunterDo(g, 'run')
  }
  return g
}

/** The main turn answered: save the fight and run back to camp. */
export function endTurn(game: Game): Game {
  const g = clone(game)
  if (g.mode === 'fight' || g.mode === 'arriving') {
    setMode(g, 'retreating')
    g.hunter.facing = -1
    hunterDo(g, 'run')
    if (g.monster.move !== 'topple') monsterDo(g, 'idle')
    say(g, '撤退')
  } else if (g.mode === 'leaving') {
    toCamp(g)
  }
  return g
}

/** A save from an earlier session: whatever was under way, the hunter is back at camp. */
export function restore(saved: Game): Game {
  const g = clone(saved)
  if (g.mode === 'slain') g.hunt = null
  if (g.mode !== 'camp') toCamp(g)
  if (g.hunt !== null && g.mode === 'camp') g.hunt.isFresh = false
  g.isResting = false
  return g
}

function toCamp(g: Game): void {
  setMode(g, 'camp')
  g.hunter = { ...g.hunter, move: 'idle', t: 0, x: HUNTER.campX, facing: 1, hp: HUNTER.hpMax, rollIn: -1 }
}

function clone(g: Game): Game {
  return JSON.parse(JSON.stringify(g)) as Game
}

/** One tick. `working`: a main turn is running (new trips out of camp only then). */
export function step(game: Game, working: boolean): Game {
  const g = clone(game)
  g.modeT += 1
  g.labelT += 1
  g.hunter.t += 1
  g.monster.t += 1
  switch (g.mode) {
    case 'camp':
      if (working && !g.isResting && g.modeT >= CAMP_DELAY) {
        if (g.hunt === null) startHunt(g)
        setMode(g, 'leaving')
        hunterDo(g, 'run')
      }
      break
    case 'leaving':
      g.hunter.x = HUNTER.campX + ((420 - HUNTER.campX) * g.modeT) / RUN_TICKS
      if (g.modeT >= RUN_TICKS) {
        setMode(g, 'arriving')
        g.hunter.x = -40
        if (g.hunt!.isFresh) {
          g.monster = { move: 'walk', t: 0, x: VELKHANA.enterFromX, wait: 0 }
        } else {
          g.monster = { move: 'idle', t: 0, x: g.monster.x, wait: between(g, VELKHANA.idleTicks) }
        }
      }
      break
    case 'arriving': {
      const span = g.hunt!.isFresh ? RUN_TICKS * 2 : RUN_TICKS
      g.hunter.x = Math.min(HUNTER.x, -40 + ((HUNTER.x + 40) * g.modeT) / RUN_TICKS)
      if (g.hunt!.isFresh) g.monster.x = VELKHANA.enterFromX + ((VELKHANA.x - VELKHANA.enterFromX) * g.modeT) / span
      if (g.modeT >= RUN_TICKS && g.hunter.move === 'run') {
        hunterDo(g, 'idle')
        g.hunter.wait = between(g, HUNTER.idleTicks)
      }
      if (g.modeT >= span) {
        g.monster = { move: 'idle', t: 0, x: g.hunt!.isFresh ? VELKHANA.x : g.monster.x, wait: between(g, VELKHANA.idleTicks) }
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

function fight(g: Game): void {
  const hunt = g.hunt!
  const h = g.hunter
  const m = g.monster
  hunt.fightTicks += 1
  const hMove: Move = hunterMove(h.move)
  const mMove: Move = monsterMove(m.move)

  // the monster lands its hit
  if (landsNow(mMove, m.t)) {
    const dodging = h.move === 'roll' && (HUNTER.rollInvulnerable as readonly number[]).includes(poseAt(HUNTER.moves.roll, h.t))
    if (!dodging) {
      h.hp = Math.max(0, h.hp - (mMove.damage ?? 0))
      h.rollIn = -1
      if (h.hp === 0) {
        g.carts += 1
        setMode(g, 'carted')
        hunterDo(g, 'down')
        if (m.move !== 'topple') monsterDo(g, 'idle')
        say(g, '力竭…回營')
        return
      }
      hunterDo(g, 'hit')
      say(g, m.move === 'iceBeam' ? '被冰吐息擊中' : '被尾刺擊中')
    } else {
      say(g, '翻滾閃避')
    }
  }

  // the hunter lands a hit
  if (landsNow(hMove, h.t)) {
    const dmg = hMove.damage ?? 0
    hunt.monsterHp = Math.max(0, hunt.monsterHp - dmg)
    hunt.stagger += dmg
    hunt.topple += dmg
    if (hunt.monsterHp === 0) {
      g.slain += 1
      setMode(g, 'slain')
      monsterDo(g, 'topple')
      hunterDo(g, 'idle')
      say(g, '討伐完成！')
      return
    }
    if (hunt.topple >= VELKHANA.toppleEvery) {
      hunt.topple = 0
      hunt.stagger = 0
      monsterDo(g, 'topple')
      say(g, '冰呪龍倒地')
    } else if (hunt.stagger >= VELKHANA.flinchEvery && m.move !== 'topple' && m.move !== 'getup') {
      hunt.stagger = 0
      monsterDo(g, 'flinch')
      say(g, '冰呪龍硬直')
    }
  }

  // monster: finish moves, then decide
  const mNow: Move = monsterMove(m.move)
  if (m.move !== 'idle' && isOver(mNow, m.t)) {
    if (m.move === 'topple') monsterDo(g, 'getup')
    else {
      monsterDo(g, 'idle')
      m.wait = between(g, VELKHANA.idleTicks)
    }
  } else if (m.move === 'walk') {
    m.x = Math.max(VELKHANA.minX, m.x - VELKHANA.walkStep / sum(mNow.ticks))
  } else if (m.move === 'idle') {
    m.wait -= 1
    if (m.wait <= 0) {
      const options: [MonsterMove, number][] = [
        ['tailStab', VELKHANA.moves.tailStab.weight],
        ['iceBeam', VELKHANA.moves.iceBeam.weight],
      ]
      if (m.x > VELKHANA.minX) options.push(['walk', VELKHANA.moves.walk.weight])
      const move = pick(g, options)
      monsterDo(g, move)
      const attack: Move = monsterMove(move)
      if (attack.active !== undefined) {
        say(g, move === 'iceBeam' ? '冰吐息' : '尾刺')
        telegraph(g, attack)
      }
    }
  }

  // hunter: finish moves, pending dodge, regen, then decide
  const hNow: Move = hunterMove(h.move)
  if (h.move !== 'idle' && isOver(hNow, h.t)) {
    hunterDo(g, 'idle')
    h.wait = between(g, HUNTER.idleTicks)
  }
  if (h.rollIn >= 0) {
    h.rollIn -= 1
    if (h.rollIn < 0 && h.move === 'idle') hunterDo(g, 'roll')
    return
  }
  if (h.move !== 'idle') return
  if (h.t % HUNTER.staminaRegenTicks === 0) h.stamina = Math.min(HUNTER.staminaMax, h.stamina + 1)
  if (hunt.fightTicks % HUNTER.hpRegenTicks === 0) h.hp = Math.min(HUNTER.hpMax, h.hp + 1)
  h.wait -= 1
  if (h.wait > 0) return
  const opening = m.move === 'flinch' || m.move === 'topple'
  const can = (move: HunterMove): boolean => h.stamina >= (hunterMove(move).stamina ?? 0)
  let choice: HunterMove | 'wait'
  if (opening) choice = can('trueCharge') ? 'trueCharge' : can('charge') ? 'charge' : can('tackle') ? 'tackle' : 'wait'
  else {
    const options: [HunterMove | 'wait', number][] = [['wait', HUNTER.waitWeight]]
    if (can('charge')) options.push(['charge', HUNTER.moves.charge.weight])
    if (can('tackle')) options.push(['tackle', HUNTER.moves.tackle.weight])
    choice = pick(g, options)
  }
  if (choice === 'wait') h.wait = between(g, HUNTER.idleTicks)
  else {
    hunterDo(g, choice)
    say(g, { charge: '蓄力斬', trueCharge: '真蓄力斬', tackle: '肩撞' }[choice as 'charge' | 'trueCharge' | 'tackle'])
  }
}

/** The hunter sees the attack coming: dodge it (if free and rested) or not. */
function telegraph(g: Game, attack: Move): void {
  const h = g.hunter
  if (h.move !== 'idle' || h.stamina < (HUNTER.moves.roll.stamina ?? 0)) return
  if (rand(g) >= HUNTER.dodgeRate) return
  const until = sum(attack.ticks.slice(0, attack.active))
  const safeFrom = sum(HUNTER.moves.roll.ticks.slice(0, HUNTER.rollInvulnerable[0]))
  h.rollIn = Math.max(0, until - safeFrom - 2)
}

const actorView = (move: Move, a: { t: number; x: number }, facing: 1 | -1, loop: boolean): ActorView => ({
  action: move.action,
  frame: loop ? loopPose(move, a.t) : poseAt(move, a.t),
  x: Math.round(a.x),
  facing,
})

const LOOPING = new Set<string>(['idle', 'run', 'walk'])

export function viewOf(g: Game): View {
  const inCamp = g.mode === 'camp' || g.mode === 'leaving'
  const h = g.hunter
  return {
    scene: inCamp || g.hunt === null ? CAMP_SCENE : g.hunt.scene,
    hunter: actorView(hunterMove(h.move), h, h.facing, LOOPING.has(h.move)),
    monster: inCamp || g.hunt === null ? null : actorView(monsterMove(g.monster.move), g.monster, 1, LOOPING.has(g.monster.move)),
    hp: h.hp,
    stamina: h.stamina,
    label: g.labelT < LABEL_TICKS ? g.label : '',
    monsterHpPercent: g.hunt === null ? null : Math.round((100 * g.hunt.monsterHp) / g.hunt.monsterHpMax),
  }
}
