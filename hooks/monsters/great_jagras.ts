import type { HuntGame as Game } from '../../types'
import type { Mechanic, MonsterCtx, MonsterDef } from './types'

/**
 * 大凶豺龍 (spec 4.1): the entry monster. Bite and spit when normal; after 20 s
 * of fighting it inflates for 20 s, slower, and only then slams and rolls. The
 * belly takes its own damage (15% of max HP); breaking it deflates the monster
 * and puts it down for 24 ticks, once per inflation.
 *
 * Moves map the spec's [start, end) windows onto the four key poses: the
 * active pose is the window, e.g. JG01 [6,8) of 16 = poses 3,3,2,8.
 */

/** Fight ticks in each state before it changes at the next safe decision point (20 s). */
const NORMAL_TICKS = 160
const INFLATED_TICKS = 160
const BELLY_SHARE = 0.15

const isInflated = (g: Game): boolean => g.hunt!.state === 'inflated'
const belly = (maxHp: number) => ({ durability: Math.round(maxHp * BELLY_SHARE), broken: false })

const mechanic: Mechanic = {
  initial: maxHp => ({ state: 'normal', parts: { belly: belly(maxHp) } }),
  idleMove: g => (isInflated(g) ? 'idleFat' : 'idle'),
  walkMove: g => (isInflated(g) ? 'walkFat' : 'walk'),
  speed: g => (isInflated(g) ? 0.8 : 1),
  decide(c: MonsterCtx): boolean {
    const hunt = c.g.hunt!
    if (hunt.state === 'normal' && hunt.stateT >= NORMAL_TICKS) {
      hunt.state = 'inflated'
      hunt.stateT = 0
      hunt.parts.belly = belly(hunt.monsterHpMax)
      c.act('inflate')
      c.say('大凶豺龍膨腹')
      return true
    }
    if (hunt.state === 'inflated' && hunt.stateT >= INFLATED_TICKS) {
      hunt.state = 'normal'
      hunt.stateT = 0
      c.act('deflate')
      c.say('大凶豺龍消腹')
      return true
    }
    return false
  },
  allows: () => true,
  damaged(c: MonsterCtx, part: string, damage: number): boolean {
    const hunt = c.g.hunt!
    const own = hunt.parts.belly
    if (part !== 'belly' || hunt.state !== 'inflated' || own === undefined || own.broken) return false
    own.durability = Math.max(0, own.durability - damage)
    if (own.durability > 0) return false
    own.broken = true
    hunt.state = 'normal'
    hunt.stateT = 0
    c.act('burst')
    c.say('腹部破壞！')
    return true
  },
  status: g => (isInflated(g) ? '膨腹' : null),
  // the inflated belly bulges out to the snout's line: the hunter stands in front of it
  bounds: g => (isInflated(g) ? [-64, 46] : GREAT_JAGRAS.bounds),
}

export const GREAT_JAGRAS = {
  id: 'great_jagras',
  definitionVersion: 1,
  enabled: true,
  name: '大凶豺龍',
  species: '牙獸種',
  targetMinutes: 2,
  scenes: ['S01'],
  assetFacing: -1,
  x: 262,
  minX: 140,
  enterFromX: 440,
  walkStep: 14,
  idleTicks: [10, 28],
  flinchEvery: 70,
  toppleEvery: 200,
  // the push box reaches under the chin (head -72..-30), the torso is [-36, 46]
  bounds: [-58, 46],
  torso: [-36, 46],
  moves: {
    idle: { action: 'JG_IDLE', ticks: [3, 3, 3, 3], loop: true },
    walk: { action: 'JG_WALK', ticks: [3, 3, 3, 3], loop: true },
    // inflated: the last INFLATE pose held, swaying with the one before it while walking
    idleFat: { action: 'JG_INFLATE', ticks: [0, 0, 0, 12], loop: true },
    walkFat: { action: 'JG_INFLATE', ticks: [0, 0, 3, 3], loop: true },
    bite: {
      action: 'JG01', ticks: [3, 3, 2, 8], active: 2, damage: 1, weight: 4, cooldown: 12, advance: 12,
      range: ['near'], state: 'normal', label: '前咬', hitLabel: '被前咬擊中',
    },
    slam: {
      action: 'JG02', ticks: [5, 5, 3, 12], active: 2, damage: 2, weight: 3, cooldown: 20,
      range: ['near'], state: 'inflated', label: '腹部重壓', hitLabel: '被腹部重壓擊中',
    },
    roll: {
      action: 'JG03', ticks: [4, 4, 5, 12], active: 2, damage: 2, weight: 2, cooldown: 20, advance: 64,
      range: ['mid'], state: 'inflated', label: '側身翻壓', hitLabel: '被翻壓擊中',
    },
    spit: {
      action: 'JG04', ticks: [4, 4, 12, 8], active: 2, damage: 1, weight: 2, cooldown: 24, travel: 20, fx: 'spit',
      range: ['mid', 'far'], state: 'normal', label: '吐出胃液團', hitLabel: '被胃液團擊中',
    },
    inflate: { action: 'JG_INFLATE', ticks: [3, 3, 3, 3] },
    deflate: { action: 'JG_DEFLATE', ticks: [2, 2, 2, 2] },
    burst: { action: 'JG_DEFLATE', ticks: [2, 2, 2, 2], then: 'down', opening: true },
    down: { action: 'JG_TOPPLE', ticks: [2, 2, 4, 16], then: 'getup', opening: true },
    flinch: { action: 'JG_FLINCH', ticks: [3, 3, 3, 3], opening: true },
    topple: { action: 'JG_TOPPLE', ticks: [3, 3, 3, 30], then: 'getup', opening: true },
    getup: { action: 'JG_GETUP', ticks: [3, 3, 3, 3] },
    death: { action: 'JG_DEATH', ticks: [3, 3, 4, 40] },
  },
  attacks: ['bite', 'slam', 'roll', 'spit'],
  approachWeight: 2,
  slainMove: 'death',
  calibrateTwice: true,
  mechanic,
} as const satisfies MonsterDef
