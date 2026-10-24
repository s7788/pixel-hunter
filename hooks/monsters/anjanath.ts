import type { HuntGame as Game } from '../../types'
import type { Mechanic, MonsterCtx, MonsterDef } from './types'

/**
 * 蠻顎龍 (spec 4.3): the heavy one. A bite, a head-down charge, a tail sweep;
 * after 20 s of fighting it raises its nose and sail for 12 ticks. Taking 5%
 * of max HP while it does breaks the ready (it flinches, the timer starts
 * again); a finished ready leaves it fire-ready for 18 s, which only opens the
 * fire breath (near or mid range; it stops walking in meanwhile). Each breath is followed by a 12-tick cool-down, then it is
 * fire-ready again until the 18 s are up. Damage only: no burning.
 *
 * The ready gauge lives in `parts.ready`: the damage still to take before the
 * ready breaks (5% of max HP).
 *
 * Moves map the spec's [start, end) windows onto the four key poses: the
 * active pose is the window, e.g. AN01 [6,9) of 18 = poses 3,3,3,9.
 */

/** Fight ticks before it readies (20 s), the ready itself, and how long it stays fire-ready (18 s). */
const NORMAL_TICKS = 160
const READY_TICKS = 12
const FIRE_TICKS = 144
const READY_SHARE = 0.05

const isFire = (g: Game): boolean => g.hunt!.state === 'fire'

const mechanic: Mechanic = {
  initial: () => ({ state: 'normal', parts: {} }),
  idleMove: g => (isFire(g) ? 'idleFire' : 'idle'),
  walkMove: g => (isFire(g) ? 'walkFire' : 'walk'),
  speed: () => 1,
  tick(c: MonsterCtx): void {
    const hunt = c.g.hunt!
    const m = c.g.monster
    if (hunt.state !== 'readying') return
    if (m.move === 'fireReady' && m.t >= READY_TICKS) {
      hunt.state = 'fire'
      hunt.stateT = 0
      c.say('蠻顎龍火焰準備')
    } else if (m.move !== 'fireReady') {
      // cut short by a flinch, a topple or a retreat: not ready, the timer starts again
      hunt.state = 'normal'
      hunt.stateT = 0
      if (hunt.parts.ready !== undefined) hunt.parts.ready.broken = true
    }
  },
  decide(c: MonsterCtx): boolean {
    const hunt = c.g.hunt!
    if (hunt.state === 'normal' && hunt.stateT >= NORMAL_TICKS) {
      hunt.state = 'readying'
      hunt.stateT = 0
      hunt.parts.ready = { durability: Math.round(hunt.monsterHpMax * READY_SHARE), broken: false }
      c.act('fireReady')
      c.say('蠻顎龍抬起鼻冠')
      return true
    }
    if (hunt.state === 'fire' && hunt.stateT >= FIRE_TICKS) {
      // the time is up: back to normal, and it picks its next move as usual
      hunt.state = 'normal'
      hunt.stateT = 0
      c.say('火焰準備結束')
    }
    return false
  },
  // fire-ready, it holds its ground and lets the hunter come into the breath
  walksIn: g => !isFire(g),
  allows: () => true,
  damaged(c: MonsterCtx, _part: string, damage: number): boolean {
    const hunt = c.g.hunt!
    const own = hunt.parts.ready
    if (hunt.state !== 'readying' || c.g.monster.move !== 'fireReady' || own === undefined || own.broken) return false
    own.durability = Math.max(0, own.durability - damage)
    if (own.durability > 0) return false
    own.broken = true
    hunt.state = 'normal'
    hunt.stateT = 0
    c.act('flinch')
    c.say('火焰準備中斷')
    return true
  },
  status: g => (g.hunt!.state === 'fire' ? '火焰準備' : g.hunt!.state === 'readying' ? '準備中' : null),
}

export const ANJANATH = {
  id: 'anjanath',
  definitionVersion: 1,
  enabled: true,
  name: '蠻顎龍',
  species: '獸龍種',
  targetMinutes: 4,
  scenes: ['S01'],
  assetFacing: -1,
  x: 270,
  minX: 130,
  enterFromX: 460,
  walkStep: 14,
  idleTicks: [12, 30],
  flinchEvery: 70,
  toppleEvery: 200,
  // the push box reaches the nose crest (head -96..-62). The decision torso takes in the neck
  // (to -80): measured from the chest the 34 px head alone would keep every hunter out of 'near'
  bounds: [-96, 60],
  torso: [-80, 60],
  moves: {
    idle: { action: 'AN_IDLE', ticks: [3, 3, 3, 3], loop: true },
    walk: { action: 'AN_WALK', ticks: [3, 3, 3, 3], loop: true },
    // fire-ready: the last FIRE_READY pose held (nose and sail up), swaying with the one before it while walking
    idleFire: { action: 'AN_FIRE_READY', ticks: [0, 0, 0, 12], loop: true },
    walkFire: { action: 'AN_FIRE_READY', ticks: [0, 0, 3, 3], loop: true },
    bite: {
      action: 'AN01', ticks: [3, 3, 3, 9], active: 2, damage: 2, weight: 4, cooldown: 16, advance: 16,
      range: ['near'], label: '俯身咬擊', hitLabel: '被咬擊擊中',
    },
    // stops short at the hunter's body, never through it
    charge: {
      action: 'AN02', ticks: [5, 4, 6, 12], active: 2, damage: 3, weight: 3, cooldown: 28, advance: 120,
      range: ['mid'], label: '低頭衝撞', hitLabel: '被衝撞擊中',
    },
    tailSweep: {
      action: 'AN03', ticks: [4, 4, 4, 12], active: 2, damage: 2, weight: 2, cooldown: 20,
      range: ['near'], label: '回身尾掃', hitLabel: '被尾掃擊中',
    },
    // straight ahead only: three boxes, one group, settled once. Near or mid (the spec says mid; widened on request)
    flame: {
      action: 'AN04', ticks: [6, 6, 8, 16], active: 2, damage: 3, weight: 2, cooldown: 40, fx: 'flame', then: 'coolDown',
      range: ['near', 'mid'], state: 'fire', label: '火焰吐息', hitLabel: '被火焰吐息擊中',
    },
    fireReady: { action: 'AN_FIRE_READY', ticks: [3, 3, 3, 3] },
    coolDown: { action: 'AN_COOL_DOWN', ticks: [3, 3, 3, 3], opening: true },
    flinch: { action: 'AN_FLINCH', ticks: [3, 3, 3, 3], opening: true },
    topple: { action: 'AN_TOPPLE', ticks: [3, 3, 3, 30], then: 'getup', opening: true },
    getup: { action: 'AN_GETUP', ticks: [3, 3, 3, 3] },
    death: { action: 'AN_DEATH', ticks: [3, 3, 4, 40] },
  },
  attacks: ['bite', 'charge', 'tailSweep', 'flame'],
  approachWeight: 2,
  slainMove: 'death',
  calibrateTwice: true,
  mechanic,
} as const satisfies MonsterDef
