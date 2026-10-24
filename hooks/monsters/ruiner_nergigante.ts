import type { HuntGame as Game } from '../../types'
import { durability, metersOf } from './common'
import type { Mechanic, MonsterCtx, MonsterDef } from './types'

/**
 * 殲世滅盡龍 (spec 4.8): the boss. A claw sweep, a shoulder charge, a volley of
 * metal spikes and, with at least one black spike, a dive. Its head and both
 * forearms (near and far side) each carry spikes: bare, white or black. A fight
 * starts white; a white spot hardens black after 20 s of fighting (at a safe
 * decision point); a bare spot grows white again after 12 s. Hits on a spot
 * wear its spikes (white 8%, black 12% of max HP): breaking white puts it down
 * for 24 ticks, breaking black staggers it for 8; either leaves the spot bare.
 * The dive locks its landing spot at tick 10, falls on [14,17) (body and shock
 * wave one group, 4 damage at most) and spends every black spike when it ends.
 *
 * Spike stages live in `meters` (`<part>:stage` 0 bare / 1 white / 2 black,
 * `<part>:t` its age in fight ticks); the wear in `parts`.
 */

const SPOTS = ['spike_head', 'spike_arm_near', 'spike_arm_far'] as const
const BARE = 0
const WHITE = 1
const BLACK = 2
const HARDEN_TICKS = 160
const REGROW_TICKS = 96
const WHITE_SHARE = 0.08
const BLACK_SHARE = 0.12
const DIVE_TICKS = 37

const stage = (g: Game, spot: string): number => metersOf(g)[`${spot}:stage`] ?? WHITE
const blacks = (g: Game): number => SPOTS.filter(s => stage(g, s) === BLACK).length
const whites = (g: Game): number => SPOTS.filter(s => stage(g, s) === WHITE).length

function setStage(g: Game, spot: string, to: number): void {
  const m = metersOf(g)
  m[`${spot}:stage`] = to
  m[`${spot}:t`] = 0
  const share = to === WHITE ? WHITE_SHARE : to === BLACK ? BLACK_SHARE : 0
  g.hunt!.parts[spot] = { ...durability(g.hunt!.monsterHpMax, share), broken: to === BARE }
}

const mechanic: Mechanic = {
  initial: maxHp => ({
    state: 'normal',
    parts: Object.fromEntries(SPOTS.map(s => [s, durability(maxHp, WHITE_SHARE)])),
  }),
  idleMove: g => (blacks(g) > 0 ? 'idleBlack' : 'idle'),
  walkMove: () => 'walk',
  speed: () => 1,
  tick(c: MonsterCtx): void {
    const m = metersOf(c.g)
    for (const s of SPOTS) m[`${s}:t`] = (m[`${s}:t`] ?? 0) + 1
    // the dive spends every black spike when it ends (not when it is cut short)
    if (c.g.monster.move === 'dive' && c.g.monster.t >= DIVE_TICKS) for (const s of SPOTS) if (stage(c.g, s) === BLACK) setStage(c.g, s, BARE)
  },
  decide(c: MonsterCtx): boolean {
    const m = metersOf(c.g)
    const hardening = SPOTS.filter(s => stage(c.g, s) === WHITE && (m[`${s}:t`] ?? 0) >= HARDEN_TICKS)
    if (hardening.length > 0) {
      for (const s of hardening) setStage(c.g, s, BLACK)
      c.act('harden')
      c.say('棘硬化')
      return true
    }
    const growing = SPOTS.filter(s => stage(c.g, s) === BARE && (m[`${s}:t`] ?? 0) >= REGROW_TICKS)
    if (growing.length > 0) {
      for (const s of growing) setStage(c.g, s, WHITE)
      c.act('grow')
      c.say('棘再生')
      return true
    }
    return false
  },
  // with a black spike to dive on it holds its ground (the dive is a mid-range move; walking in would crowd it out)
  walksIn: g => blacks(g) === 0,
  allows: (g, move) => move !== 'dive' || blacks(g) > 0,
  damaged(c: MonsterCtx, part: string, damage: number): boolean {
    const was = (SPOTS as readonly string[]).includes(part) ? stage(c.g, part) : BARE
    const own = c.g.hunt!.parts[part]
    if (was === BARE || own === undefined) return false
    own.durability = Math.max(0, own.durability - damage)
    if (own.durability > 0) return false
    setStage(c.g, part, BARE)
    // a white break puts it down (once, however many break this tick); a black one staggers it
    if (was === WHITE) {
      if (c.g.monster.move !== 'spikeDown') c.act('spikeDown')
      c.say('白棘破壞！')
    } else {
      if (c.g.monster.move !== 'spikeDown') c.act('spikeStagger')
      c.say('黑棘破壞！')
    }
    return true
  },
  status: g => [whites(g) > 0 ? `白棘 ${whites(g)}` : '', blacks(g) > 0 ? `黑棘 ${blacks(g)}` : ''].filter(s => s !== '').join('・') || null,
}

export const RUINER_NERGIGANTE = {
  id: 'ruiner_nergigante',
  definitionVersion: 1,
  enabled: true,
  name: '殲世滅盡龍',
  species: '古龍種',
  targetMinutes: 7,
  scenes: ['S05'],
  assetFacing: -1,
  x: 272,
  minX: 140,
  enterFromX: 460,
  walkStep: 14,
  idleTicks: [12, 28],
  flinchEvery: 70,
  toppleEvery: 200,
  // the push box reaches the horns (head -90..-46); the decision torso takes in the neck (to -68)
  bounds: [-88, 38],
  torso: [-68, 38],
  moves: {
    idle: { action: 'RN_IDLE', ticks: [3, 3, 3, 3], loop: true },
    walk: { action: 'RN_WALK', ticks: [3, 3, 3, 3], loop: true },
    // with a black spike: the hardened look held
    idleBlack: { action: 'RN_HARDEN', ticks: [0, 0, 0, 12], loop: true },
    claw: {
      action: 'RN01', ticks: [4, 3, 4, 12], active: 2, damage: 2, weight: 4, cooldown: 20, advance: 16,
      range: ['near'], label: '前爪橫掃', hitLabel: '被前爪掃中',
    },
    shoulder: {
      action: 'RN02', ticks: [5, 5, 5, 14], active: 2, damage: 3, weight: 3, cooldown: 28, advance: 96,
      range: ['mid'], label: '肩部衝撞', hitLabel: '被肩撞擊中',
    },
    spikes: {
      action: 'RN03', ticks: [5, 5, 12, 10], active: 2, damage: 2, weight: 2, cooldown: 32, travel: 28, spread: [-5, 0, 5],
      fx: 'spikes', range: ['mid', 'far'], label: '金屬棘散射', hitLabel: '被金屬棘擊中',
    },
    // take off, hang (the landing spot locked at tick 10, marked on the ground), fall on [14,17), recover
    dive: {
      action: 'RN04', ticks: [6, 8, 3, 20], active: 2, damage: 4, weight: 1, cooldown: 48, advance: 96, seek: 10,
      lift: [[4, 0], [8, -56], [14, -56], [17, 0]], range: ['mid'], label: '空中俯衝', hitLabel: '被俯衝重壓',
    },
    grow: { action: 'RN_GROW', ticks: [3, 3, 3, 3] },
    harden: { action: 'RN_HARDEN', ticks: [3, 3, 3, 3] },
    spikeDown: { action: 'RN_TOPPLE', ticks: [2, 2, 4, 16], then: 'getup', opening: true },
    spikeStagger: { action: 'RN_BREAK', ticks: [2, 2, 2, 2], opening: true },
    flinch: { action: 'RN_FLINCH', ticks: [3, 3, 3, 3], opening: true },
    topple: { action: 'RN_TOPPLE', ticks: [3, 3, 3, 30], then: 'getup', opening: true },
    getup: { action: 'RN_GETUP', ticks: [3, 3, 3, 3] },
    death: { action: 'RN_DEATH', ticks: [3, 3, 4, 40] },
  },
  attacks: ['claw', 'shoulder', 'spikes', 'dive'],
  approachWeight: 2,
  slainMove: 'death',
  calibrateTwice: true,
  mechanic,
} as const satisfies MonsterDef
