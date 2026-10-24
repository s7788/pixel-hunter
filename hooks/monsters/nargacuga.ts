import { rage } from './common'
import type { Mechanic, MonsterCtx, MonsterDef } from './types'

/**
 * 迅龍 (spec 4.5): a blade-wing pounce, a sweeping tail, a tail slam and a
 * volley of three tail spikes. Shared rage (spec 4.9): enraged, the slam comes
 * twice (two groups, each may land once), the second raised again before it
 * falls and aimed the same way. After either slam the tail stays stuck in the
 * ground for the last 12 ticks: an opening.
 *
 * The three spikes fly together as one group (one volley lands at most once).
 * Moves map the spec's [start, end) windows onto the key poses, e.g. NA01
 * [6,10) of 19 = poses 3,3,4,9; the enraged slam is the combo board's six
 * poses, active on [10,12) and [18,20) of 32.
 */

const mechanic: Mechanic = {
  initial: () => ({ state: 'normal', parts: {} }),
  idleMove: () => 'idle',
  walkMove: () => 'walk',
  speed: () => 1,
  tick: c => rage.tick(c),
  decide: (c: MonsterCtx) => rage.decide(c, '迅龍'),
  // the slam that fits the rage when it starts (spec 6.2 rule 6)
  allows: (g, move) => (move === 'tailSlam' ? !rage.isOn(g) : move === 'tailSlam2' ? rage.isOn(g) : true),
  damaged(c: MonsterCtx, _part: string, damage: number): boolean {
    rage.damaged(c.g, damage)
    return false
  },
  status: g => (rage.isOn(g) ? '憤怒' : null),
}

export const NARGACUGA = {
  id: 'nargacuga',
  definitionVersion: 1,
  enabled: true,
  name: '迅龍',
  species: '飛龍種',
  targetMinutes: 5,
  scenes: ['S01'],
  assetFacing: -1,
  x: 266,
  minX: 140,
  enterFromX: 450,
  walkStep: 18,
  idleTicks: [8, 22],
  flinchEvery: 70,
  toppleEvery: 200,
  // the push box reaches the snout (head -80..-36); the decision torso takes in the neck (to -58)
  bounds: [-76, 42],
  torso: [-58, 42],
  moves: {
    idle: { action: 'NA_IDLE', ticks: [3, 3, 3, 3], loop: true },
    walk: { action: 'NA_WALK', ticks: [3, 3, 3, 3], loop: true },
    // low and long: 88 px on, 24 px high, landing at the end of the active pose
    pounce: {
      action: 'NA01', ticks: [3, 3, 4, 9], active: 2, damage: 2, weight: 4, cooldown: 16, advance: 88,
      lift: [[3, 0], [6, -24], [10, 0]], range: ['mid'], label: '刃翼飛撲', hitLabel: '被刃翼飛撲擊中',
    },
    tailSweep: {
      action: 'NA02', ticks: [4, 3, 4, 11], active: 2, damage: 2, weight: 3, cooldown: 20,
      range: ['near'], label: '橫向尾掃', hitLabel: '被尾掃擊中',
    },
    tailSlam: {
      action: 'NA03', ticks: [5, 5, 2, 12], active: 2, damage: 3, weight: 3, cooldown: 24, openFrom: 12,
      range: ['near', 'mid'], label: '重尾砸地', hitLabel: '被尾砸擊中',
    },
    // enraged: slam, raise again, slam (two groups), then stuck
    tailSlam2: {
      action: 'NA03X', ticks: [5, 5, 2, 6, 2, 12], frames: [0, 1, 2, 3, 4, 5], active: 2, actives: [2, 4],
      damage: 3, weight: 3, cooldown: 32, openFrom: 20,
      range: ['near', 'mid'], label: '二連尾砸', hitLabel: '被尾砸擊中',
    },
    spikes: {
      action: 'NA04', ticks: [4, 4, 12, 8], active: 2, damage: 1, weight: 2, cooldown: 28, travel: 24, spread: [-4, 0, 4],
      fx: 'spikes', range: ['mid', 'far'], label: '尾棘散射', hitLabel: '被尾棘擊中',
    },
    roar: { action: 'NA_ROAR', ticks: [2, 2, 2, 2] },
    flinch: { action: 'NA_FLINCH', ticks: [3, 3, 3, 3], opening: true },
    topple: { action: 'NA_TOPPLE', ticks: [3, 3, 3, 30], then: 'getup', opening: true },
    getup: { action: 'NA_GETUP', ticks: [3, 3, 3, 3] },
    death: { action: 'NA_DEATH', ticks: [3, 3, 4, 40] },
  },
  attacks: ['pounce', 'tailSweep', 'tailSlam', 'tailSlam2', 'spikes'],
  approachWeight: 2,
  slainMove: 'death',
  calibrateTwice: true,
  mechanic,
} as const satisfies MonsterDef
