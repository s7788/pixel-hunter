import type { HuntGame as Game } from '../../types'
import { metersOf, rage } from './common'
import type { Mechanic, MonsterCtx, MonsterDef } from './types'

/**
 * 轟龍 (spec 4.6): the turn-back dash, a lunging bite, a spin and a close
 * roar blast. The dash runs 112 px at the hunter, brakes turning round (a
 * visible turn), runs 112 px back the other way, brakes turning again and,
 * enraged (shared rage, spec 4.9), runs a third time. Each run is its own
 * group; a run is cut at the hunter's body or the arena's edge, never through.
 *
 * Side-view adaptation: the hunter always stands to the left, so the run back
 * (facing right) heads away from the hunter and rarely lands; the first and
 * third runs come at the hunter.
 *
 * After three dashes it tires at the next safe decision point for 8 s:
 * slower (0.8), no dash, only bite, spin, roar and walking.
 */

const TIRED_TICKS = 64
const DASHES_TO_TIRE = 3
const DASHES = ['dash', 'dash3']

const isTired = (g: Game): boolean => g.hunt!.state === 'tired'

const mechanic: Mechanic = {
  initial: () => ({ state: 'normal', parts: {} }),
  idleMove: g => (isTired(g) ? 'idleTired' : 'idle'),
  walkMove: () => 'walk',
  speed: g => (isTired(g) ? 0.8 : 1),
  tick(c: MonsterCtx): void {
    rage.tick(c)
    if (DASHES.includes(c.g.monster.move) && c.g.monster.t === 1) metersOf(c.g).dashes = (metersOf(c.g).dashes ?? 0) + 1
  },
  decide(c: MonsterCtx): boolean {
    const hunt = c.g.hunt!
    if (hunt.state === 'tired' && hunt.stateT >= TIRED_TICKS) {
      hunt.state = 'normal'
      hunt.stateT = 0
    }
    if (hunt.state === 'normal' && (metersOf(c.g).dashes ?? 0) >= DASHES_TO_TIRE) {
      hunt.state = 'tired'
      hunt.stateT = 0
      metersOf(c.g).dashes = 0
      c.say('轟龍疲勞')
    }
    return rage.decide(c, '轟龍')
  },
  // the dash that fits the rage when it starts; none while tired
  allows: (g, move) =>
    move === 'dash' ? !isTired(g) && !rage.isOn(g) : move === 'dash3' ? !isTired(g) && rage.isOn(g) : true,
  damaged(c: MonsterCtx, _part: string, damage: number): boolean {
    rage.damaged(c.g, damage)
    return false
  },
  status: g => [rage.isOn(g) ? '憤怒' : '', isTired(g) ? '疲勞' : ''].filter(s => s !== '').join('・') || null,
}

export const TIGREX = {
  id: 'tigrex',
  definitionVersion: 1,
  enabled: true,
  name: '轟龍',
  species: '飛龍種',
  targetMinutes: 5,
  scenes: ['S02'],
  assetFacing: -1,
  x: 270,
  minX: 140,
  enterFromX: 460,
  walkStep: 16,
  idleTicks: [10, 26],
  flinchEvery: 70,
  toppleEvery: 200,
  // the push box reaches the jaw (head -100..-50); the decision torso takes in the neck (to -74)
  bounds: [-96, 48],
  torso: [-74, 48],
  moves: {
    idle: { action: 'TI_IDLE', ticks: [3, 3, 3, 3], loop: true },
    walk: { action: 'TI_WALK', ticks: [3, 3, 3, 3], loop: true },
    idleTired: { action: 'TI_TIRED', ticks: [3, 3, 3, 3], loop: true },
    // run, brake turning right, run back, brake turning left, recover: [8,12) and [18,22) of 32
    dash: {
      action: 'TI01X', ticks: [8, 4, 6, 4, 6, 4], frames: [5, 0, 1, 2, 3, 5], active: 1, actives: [1, 3], turned: [2, 3],
      damage: 2, weight: 4, cooldown: 36, advance: 112, range: ['mid'], label: '折返衝刺', hitLabel: '被衝刺撞中',
    },
    // enraged: a third run, [28,32) of 42
    dash3: {
      action: 'TI01X', ticks: [8, 4, 6, 4, 6, 4, 10], frames: [5, 0, 1, 2, 3, 4, 5], active: 1, actives: [1, 3, 5], turned: [2, 3],
      damage: 2, weight: 4, cooldown: 44, advance: 112, range: ['mid'], label: '三連衝刺', hitLabel: '被衝刺撞中',
    },
    bite: {
      action: 'TI02', ticks: [3, 3, 3, 10], active: 2, damage: 2, weight: 3, cooldown: 16, advance: 24,
      range: ['near'], label: '連身咬擊', hitLabel: '被咬擊擊中',
    },
    spin: {
      action: 'TI03', ticks: [5, 4, 5, 14], active: 2, damage: 3, weight: 3, cooldown: 28,
      range: ['near'], label: '原地迴旋', hitLabel: '被迴旋擊中',
    },
    // only the close blast hurts; the roar heard far away is a show
    roarBlast: {
      action: 'TI04', ticks: [6, 6, 2, 14], active: 2, damage: 2, weight: 1, cooldown: 32,
      range: ['near'], label: '近身咆哮', hitLabel: '被咆哮衝擊震飛',
    },
    roar: { action: 'TI_ROAR', ticks: [2, 2, 2, 2] },
    flinch: { action: 'TI_FLINCH', ticks: [3, 3, 3, 3], opening: true },
    topple: { action: 'TI_TOPPLE', ticks: [3, 3, 3, 30], then: 'getup', opening: true },
    getup: { action: 'TI_GETUP', ticks: [3, 3, 3, 3] },
    death: { action: 'TI_DEATH', ticks: [3, 3, 4, 40] },
  },
  attacks: ['dash', 'dash3', 'bite', 'spin', 'roarBlast'],
  approachWeight: 2,
  slainMove: 'death',
  calibrateTwice: true,
  mechanic,
} as const satisfies MonsterDef
