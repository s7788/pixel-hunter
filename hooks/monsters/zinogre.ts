import type { HuntGame as Game } from '../../types'
import { durability, metersOf } from './common'
import type { Mechanic, MonsterCtx, MonsterDef } from './types'

/**
 * 雷狼龍 (spec 4.7): a three-paw combo (three groups, one damage each, the
 * paw raised clearly between them), a tail spin, a back slam and, super
 * charged only, a close thunder burst. Charge (0..100, `meters.charge`) is its
 * own meter, apart from rage: every 12 s of fighting it charges up for 16
 * ticks, +50 only when the charge-up finishes; 5% of max HP taken meanwhile
 * breaks it (CHARGE_BREAK) and adds nothing. At 100 it is super charged for
 * 24 s; that ends with a 12-tick discharge, charge back to 0, when the time is
 * up or 20% of max HP has been taken. Damage only: no thunder status.
 *
 * `parts.charge` holds the damage still to take before the charge-up breaks
 * (5%) or the super charge ends (20%).
 */

const READY_TICKS = 96
const CHARGE_UP_TICKS = 16
const SUPER_TICKS = 192
const CHARGE_UP_SHARE = 0.05
const SUPER_SHARE = 0.2

const isSuper = (g: Game): boolean => g.hunt!.state === 'super'
const charge = (g: Game): number => metersOf(g).charge ?? 0

function calmDown(c: MonsterCtx, move: 'chargeBreak' | 'discharge', text: string): void {
  const hunt = c.g.hunt!
  if (move === 'discharge') metersOf(c.g).charge = 0
  hunt.state = 'normal'
  hunt.stateT = 0
  c.act(move)
  c.say(text)
}

const mechanic: Mechanic = {
  initial: () => ({ state: 'normal', parts: {} }),
  idleMove: g => (isSuper(g) ? 'idleSuper' : 'idle'),
  walkMove: g => (isSuper(g) ? 'walkSuper' : 'walk'),
  speed: () => 1,
  tick(c: MonsterCtx): void {
    const hunt = c.g.hunt!
    const m = c.g.monster
    if (hunt.state !== 'charging') return
    if (m.move === 'chargeUp' && m.t >= CHARGE_UP_TICKS) {
      const now = Math.min(100, charge(c.g) + 50)
      metersOf(c.g).charge = now
      hunt.stateT = 0
      if (now >= 100) {
        hunt.state = 'super'
        hunt.parts.charge = durability(hunt.monsterHpMax, SUPER_SHARE)
        c.say('雷狼龍超帶電')
      } else {
        hunt.state = 'normal'
        c.say(`雷狼龍蓄電 ${now}`)
      }
    } else if (m.move !== 'chargeUp') {
      // cut short by a flinch, a topple or a retreat: nothing added, the timer starts again
      hunt.state = 'normal'
      hunt.stateT = 0
    }
  },
  decide(c: MonsterCtx): boolean {
    const hunt = c.g.hunt!
    if (hunt.state === 'normal' && hunt.stateT >= READY_TICKS) {
      hunt.state = 'charging'
      hunt.stateT = 0
      hunt.parts.charge = durability(hunt.monsterHpMax, CHARGE_UP_SHARE)
      c.act('chargeUp')
      c.say('雷狼龍蓄電中')
      return true
    }
    if (hunt.state === 'super' && hunt.stateT >= SUPER_TICKS) {
      calmDown(c, 'discharge', '超帶電解除')
      return true
    }
    return false
  },
  allows: () => true,
  damaged(c: MonsterCtx, _part: string, damage: number): boolean {
    const hunt = c.g.hunt!
    const own = hunt.parts.charge
    const chargingUp = hunt.state === 'charging' && c.g.monster.move === 'chargeUp'
    if (own === undefined || own.broken || !(chargingUp || hunt.state === 'super')) return false
    own.durability = Math.max(0, own.durability - damage)
    if (own.durability > 0) return false
    own.broken = true
    if (chargingUp) calmDown(c, 'chargeBreak', '蓄電中斷')
    else calmDown(c, 'discharge', '超帶電解除')
    return true
  },
  status: g =>
    isSuper(g) ? '超帶電' : g.hunt!.state === 'charging' ? '蓄電中' : charge(g) > 0 ? `蓄電 ${charge(g)}` : null,
}

export const ZINOGRE = {
  id: 'zinogre',
  definitionVersion: 1,
  enabled: true,
  name: '雷狼龍',
  species: '牙龍種',
  targetMinutes: 6,
  scenes: ['S01'],
  assetFacing: -1,
  x: 268,
  minX: 140,
  enterFromX: 450,
  walkStep: 16,
  idleTicks: [10, 26],
  flinchEvery: 70,
  toppleEvery: 200,
  // the push box reaches the horns (head -95..-50); the decision torso takes in the neck (to -72)
  bounds: [-92, 36],
  torso: [-72, 36],
  moves: {
    idle: { action: 'ZI_IDLE', ticks: [3, 3, 3, 3], loop: true },
    walk: { action: 'ZI_WALK', ticks: [3, 3, 3, 3], loop: true },
    idleSuper: { action: 'ZI_SUPER', ticks: [3, 3, 3, 3], loop: true },
    walkSuper: { action: 'ZI_SUPER', ticks: [3, 3, 3, 3], loop: true },
    // raise, paw, raise the other, paw, raise high, paw, recover: [7,9) [13,15) [19,21) of 31, 12 px a paw
    paws: {
      action: 'ZI01X', ticks: [7, 2, 4, 2, 4, 2, 10], frames: [0, 1, 2, 3, 4, 5, 6], active: 1, actives: [1, 3, 5],
      damage: 1, weight: 4, cooldown: 32, advance: 12, range: ['near'], label: '前爪三連拍', hitLabel: '被前爪拍中',
    },
    tailSpin: {
      action: 'ZI02', ticks: [4, 4, 4, 12], active: 2, damage: 2, weight: 3, cooldown: 24,
      range: ['near'], label: '迴旋尾擊', hitLabel: '被尾擊擊中',
    },
    // up and over onto its back: 48 px on, 32 px high, down at the end of the active pose
    backSlam: {
      action: 'ZI03', ticks: [6, 5, 3, 15], active: 2, damage: 3, weight: 3, cooldown: 28, advance: 48,
      lift: [[4, 0], [9, -32], [14, 0]], range: ['near', 'mid'], label: '背身重壓', hitLabel: '被重壓擊中',
    },
    burst: {
      action: 'ZI04', ticks: [6, 6, 4, 16], active: 2, damage: 3, weight: 2, cooldown: 40, state: 'super',
      range: ['near'], label: '雷電爆發', hitLabel: '被雷電爆發擊中',
    },
    chargeUp: { action: 'ZI_CHARGE', ticks: [4, 4, 4, 4] },
    chargeBreak: { action: 'ZI_BREAK', ticks: [3, 3, 3, 3], opening: true },
    discharge: { action: 'ZI_DISCHARGE', ticks: [3, 3, 3, 3], opening: true },
    flinch: { action: 'ZI_FLINCH', ticks: [3, 3, 3, 3], opening: true },
    topple: { action: 'ZI_TOPPLE', ticks: [3, 3, 3, 30], then: 'getup', opening: true },
    getup: { action: 'ZI_GETUP', ticks: [3, 3, 3, 3] },
    death: { action: 'ZI_DEATH', ticks: [3, 3, 4, 40] },
  },
  attacks: ['paws', 'tailSpin', 'backSlam', 'burst'],
  approachWeight: 2,
  slainMove: 'death',
  calibrateTwice: true,
  mechanic,
} as const satisfies MonsterDef
