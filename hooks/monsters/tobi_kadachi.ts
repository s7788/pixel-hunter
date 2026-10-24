import type { HuntGame as Game } from '../../types'
import type { Mechanic, MonsterCtx, MonsterDef } from './types'

/**
 * 飛雷龍 (spec 4.2): bite, a leaping pounce and a tail sweep; after 12 s of
 * fighting it charges up for 12 ticks. Taking 5% of max HP while charging
 * breaks the charge (it flinches, the timer starts again); a completed charge
 * leaves it charged for 16 s, which only opens the charged tail slam and lights
 * its fur. 16 s or 15% of max HP taken while charged ends it with an 8-tick
 * discharge. No paralysis or other status: damage only.
 *
 * The charge gauge lives in `parts.charge`: the damage still to take before
 * the charge breaks (5% while charging, 15% once charged).
 *
 * Moves map the spec's [start, end) windows onto the four key poses: the
 * active pose is the window, e.g. TK01 [5,7) of 14 = poses 3,2,2,7.
 */

/** Fight ticks before it charges (12 s), the charge itself, and how long it stays charged (16 s). */
const READY_TICKS = 96
const CHARGE_TICKS = 12
const CHARGED_TICKS = 128
const CHARGING_SHARE = 0.05
const CHARGED_SHARE = 0.15

const gauge = (maxHp: number, share: number) => ({ durability: Math.round(maxHp * share), broken: false })
const isCharged = (g: Game): boolean => g.hunt!.state === 'charged'

function settleDown(c: MonsterCtx, move: 'flinch' | 'discharge', text: string): void {
  const hunt = c.g.hunt!
  hunt.state = 'normal'
  hunt.stateT = 0
  c.act(move)
  c.say(text)
}

const mechanic: Mechanic = {
  initial: () => ({ state: 'normal', parts: {} }),
  idleMove: g => (isCharged(g) ? 'idleCharged' : 'idle'),
  walkMove: g => (isCharged(g) ? 'walkCharged' : 'walk'),
  speed: () => 1,
  tick(c: MonsterCtx): void {
    const hunt = c.g.hunt!
    const m = c.g.monster
    if (hunt.state !== 'charging') return
    if (m.move === 'charge' && m.t >= CHARGE_TICKS) {
      hunt.state = 'charged'
      hunt.stateT = 0
      hunt.parts.charge = gauge(hunt.monsterHpMax, CHARGED_SHARE)
      c.say('飛雷龍帶電')
    } else if (m.move !== 'charge') {
      // cut short by a flinch, a topple or a retreat: no charge, the timer starts again
      hunt.state = 'normal'
      hunt.stateT = 0
      if (hunt.parts.charge !== undefined) hunt.parts.charge.broken = true
    }
  },
  decide(c: MonsterCtx): boolean {
    const hunt = c.g.hunt!
    if (hunt.state === 'normal' && hunt.stateT >= READY_TICKS) {
      hunt.state = 'charging'
      hunt.stateT = 0
      hunt.parts.charge = gauge(hunt.monsterHpMax, CHARGING_SHARE)
      c.act('charge')
      c.say('飛雷龍蓄電')
      return true
    }
    if (hunt.state === 'charged' && hunt.stateT >= CHARGED_TICKS) {
      settleDown(c, 'discharge', '飛雷龍放電')
      return true
    }
    return false
  },
  allows: () => true,
  damaged(c: MonsterCtx, _part: string, damage: number): boolean {
    const hunt = c.g.hunt!
    const own = hunt.parts.charge
    const charging = hunt.state === 'charging' && c.g.monster.move === 'charge'
    if (own === undefined || own.broken || !(charging || hunt.state === 'charged')) return false
    own.durability = Math.max(0, own.durability - damage)
    if (own.durability > 0) return false
    own.broken = true
    if (charging) settleDown(c, 'flinch', '蓄電中斷')
    else settleDown(c, 'discharge', '飛雷龍放電')
    return true
  },
  status: g => (g.hunt!.state === 'charged' ? '帶電' : g.hunt!.state === 'charging' ? '蓄電中' : null),
}

export const TOBI_KADACHI = {
  id: 'tobi_kadachi',
  definitionVersion: 1,
  enabled: true,
  name: '飛雷龍',
  species: '牙龍種',
  targetMinutes: 3,
  scenes: ['S01'],
  assetFacing: -1,
  x: 262,
  minX: 140,
  enterFromX: 440,
  walkStep: 16,
  idleTicks: [10, 24],
  flinchEvery: 70,
  toppleEvery: 200,
  // the push box reaches the snout (head -74..-40), the torso is [-46, 58]
  bounds: [-72, 58],
  torso: [-46, 58],
  moves: {
    idle: { action: 'TK_IDLE', ticks: [3, 3, 3, 3], loop: true },
    walk: { action: 'TK_WALK', ticks: [3, 3, 3, 3], loop: true },
    // charged: the lit last CHARGE pose held, swaying with the one before it while walking
    idleCharged: { action: 'TK_CHARGE', ticks: [0, 0, 0, 12], loop: true },
    walkCharged: { action: 'TK_CHARGE', ticks: [0, 0, 3, 3], loop: true },
    bite: {
      action: 'TK01', ticks: [3, 2, 2, 7], active: 2, damage: 1, weight: 4, cooldown: 12, advance: 16,
      range: ['near'], label: '前咬', hitLabel: '被前咬擊中',
    },
    // takes off in the wind-up, lands at the end of the active pose: 80 px forward, 28 px high
    pounce: {
      action: 'TK02', ticks: [4, 4, 4, 10], active: 2, damage: 2, weight: 3, cooldown: 20, advance: 80,
      lift: [[4, 0], [7, -28], [8, -28], [12, 0]],
      range: ['mid'], label: '躍身撲擊', hitLabel: '被撲擊擊中',
    },
    tailSweep: {
      action: 'TK03', ticks: [4, 3, 4, 10], active: 2, damage: 2, weight: 3, cooldown: 20,
      range: ['near'], label: '迴身尾掃', hitLabel: '被尾掃擊中',
    },
    chargedSlam: {
      action: 'TK04', ticks: [5, 5, 3, 13], active: 2, damage: 3, weight: 2, cooldown: 28,
      range: ['near', 'mid'], state: 'charged', label: '帶電尾砸', hitLabel: '被帶電尾砸擊中',
    },
    charge: { action: 'TK_CHARGE', ticks: [3, 3, 3, 3] },
    discharge: { action: 'TK_DISCHARGE', ticks: [2, 2, 2, 2], opening: true },
    flinch: { action: 'TK_FLINCH', ticks: [3, 3, 3, 3], opening: true },
    topple: { action: 'TK_TOPPLE', ticks: [3, 3, 3, 30], then: 'getup', opening: true },
    getup: { action: 'TK_GETUP', ticks: [3, 3, 3, 3] },
    death: { action: 'TK_DEATH', ticks: [3, 3, 4, 40] },
  },
  attacks: ['bite', 'pounce', 'tailSweep', 'chargedSlam'],
  approachWeight: 2,
  slainMove: 'death',
  calibrateTwice: true,
  mechanic,
} as const satisfies MonsterDef
