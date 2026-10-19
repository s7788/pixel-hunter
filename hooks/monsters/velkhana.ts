import type { MonsterDef } from './types'

/** 冰呪龍: the first monster, two attacks, no mechanic of its own (the moves and tuning of v0.3). */
export const VELKHANA = {
  id: 'velkhana',
  definitionVersion: 1,
  enabled: true,
  name: '冰呪龍',
  species: '古龍',
  targetMinutes: 5,
  scenes: ['S02', 'S04'],
  assetFacing: -1,
  x: 262,
  minX: 200,
  enterFromX: 440,
  walkStep: 12,
  idleTicks: [16, 40],
  flinchEvery: 70,
  toppleEvery: 200,
  bounds: [-62, 25],
  moves: {
    idle: { action: 'V01', ticks: [3, 3, 3, 3], loop: true },
    walk: { action: 'V02', ticks: [3, 3, 3, 3], weight: 15, loop: true },
    tailStab: { action: 'V14', ticks: [5, 3, 3, 3], active: 2, damage: 2, weight: 50, label: '尾刺', hitLabel: '被尾刺擊中' },
    iceBeam: { action: 'V17', ticks: [3, 4, 6, 3], active: 2, damage: 2, weight: 35, label: '冰吐息', hitLabel: '被冰吐息擊中' },
    flinch: { action: 'V23', ticks: [3, 3, 3, 3], opening: true },
    topple: { action: 'V25', ticks: [3, 3, 3, 40], then: 'getup', opening: true },
    getup: { action: 'V26', ticks: [3, 4, 4, 3] },
  },
  attacks: ['tailStab', 'iceBeam'],
  slainMove: 'topple',
} as const satisfies MonsterDef
