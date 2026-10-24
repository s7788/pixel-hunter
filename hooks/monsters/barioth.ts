import type { HuntGame as Game } from '../../types'
import { durability } from './common'
import type { Mechanic, MonsterCtx, MonsterDef } from './types'

/**
 * 冰牙龍 (spec 4.4): pounce, hip check, a long tail sweep and an ice
 * whirlwind. Each wing (near and far side) has 12% of max HP of its own, taken
 * only by hits on that wing. One broken wing adds an 8-tick stumble after the
 * pounce lands, both 12 ticks in all (not stacked); the pounce stays.
 *
 * The whirlwind (BA04) stands 100 px ahead from tick 12 to 27: chosen only
 * when it fits the arena, one per breath (it is the move's own box), settled
 * once, gone if the breath is cut short.
 *
 * Moves map the spec's [start, end) windows onto the four key poses: the
 * active pose is the window, e.g. BA02 [7,11) of 22 = poses 4,3,4,11.
 */

const WING_SHARE = 0.12
const WINGS = ['wing_near', 'wing_far'] as const

const brokenWings = (g: Game): number => WINGS.filter(w => g.hunt!.parts[w]?.broken === true).length
const POUNCE_BY_WINGS = ['pounce', 'pounceStumble', 'pounceStumble2'] as const

const mechanic: Mechanic = {
  initial: maxHp => ({ state: 'normal', parts: { wing_near: durability(maxHp, WING_SHARE), wing_far: durability(maxHp, WING_SHARE) } }),
  idleMove: () => 'idle',
  walkMove: () => 'walk',
  speed: () => 1,
  decide: () => false,
  // the pounce that lands with the right stumble for the wings broken so far
  allows: (g, move) => !(POUNCE_BY_WINGS as readonly string[]).includes(move) || POUNCE_BY_WINGS[brokenWings(g)] === move,
  damaged(c: MonsterCtx, part: string, damage: number): boolean {
    const own = c.g.hunt!.parts[part]
    if (!(WINGS as readonly string[]).includes(part) || own === undefined || own.broken) return false
    own.durability = Math.max(0, own.durability - damage)
    if (own.durability === 0) {
      own.broken = true
      c.say('翼部破壞！')
    }
    return false
  },
  status: g => (brokenWings(g) > 0 ? `破翼 ${brokenWings(g)}/2` : null),
}

/** The pounce: off the ground in the wind-up, down at the end of the active pose; 96 px on, 32 px high. */
const pounce = {
  action: 'BA01', ticks: [4, 4, 4, 11], active: 2, damage: 2, weight: 4, cooldown: 20, advance: 96,
  lift: [[4, 0], [8, -32], [12, 0]], range: ['mid'], label: '飛撲', hitLabel: '被飛撲擊中',
} as const

export const BARIOTH = {
  id: 'barioth',
  definitionVersion: 1,
  enabled: true,
  name: '冰牙龍',
  species: '飛龍種',
  targetMinutes: 5,
  scenes: ['S02'],
  assetFacing: -1,
  x: 268,
  minX: 140,
  enterFromX: 450,
  walkStep: 16,
  idleTicks: [12, 28],
  flinchEvery: 70,
  toppleEvery: 200,
  // the push box reaches the tusks (head -84..-44), the torso is [-60, 40]
  bounds: [-84, 40],
  torso: [-60, 40],
  moves: {
    idle: { action: 'BA_IDLE', ticks: [3, 3, 3, 3], loop: true },
    walk: { action: 'BA_WALK', ticks: [3, 3, 3, 3], loop: true },
    pounce,
    pounceStumble: { ...pounce, then: 'stumble8' },
    pounceStumble2: { ...pounce, then: 'stumble12' },
    hipCheck: {
      action: 'BA02', ticks: [4, 3, 4, 11], active: 2, damage: 2, weight: 3, cooldown: 20, advance: 40,
      range: ['near'], label: '側身撞擊', hitLabel: '被側身撞擊擊中',
    },
    tailSweep: {
      action: 'BA03', ticks: [4, 4, 5, 12], active: 2, damage: 2, weight: 3, cooldown: 24,
      range: ['near'], label: '長尾掃擊', hitLabel: '被尾掃擊中',
    },
    tornado: {
      action: 'BA04', ticks: [6, 6, 16, 8], active: 2, damage: 2, weight: 2, cooldown: 48, fx: 'tornado', hazard: true,
      range: ['mid'], label: '冰息旋風', hitLabel: '被冰旋風擊中',
    },
    // a broken wing: the landing staggers (8 ticks with one, 12 with both)
    stumble8: { action: 'BA_STUMBLE', ticks: [2, 2, 2, 2], opening: true },
    stumble12: { action: 'BA_STUMBLE', ticks: [3, 3, 3, 3], opening: true },
    flinch: { action: 'BA_FLINCH', ticks: [3, 3, 3, 3], opening: true },
    topple: { action: 'BA_TOPPLE', ticks: [3, 3, 3, 30], then: 'getup', opening: true },
    getup: { action: 'BA_GETUP', ticks: [3, 3, 3, 3] },
    death: { action: 'BA_DEATH', ticks: [3, 3, 4, 40] },
  },
  attacks: ['pounce', 'pounceStumble', 'pounceStumble2', 'hipCheck', 'tailSweep', 'tornado'],
  approachWeight: 2,
  slainMove: 'death',
  calibrateTwice: true,
  mechanic,
} as const satisfies MonsterDef
