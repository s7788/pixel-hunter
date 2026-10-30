import { expect, test } from 'claude-code/testing'
import { ACTIONS } from './sprites'
import { actorLayers, unpack } from './visuals'
import { beginTurn, chooseWeapon, newGame, step, viewOf } from './engine'
import { impactRects } from './shapes'

test('separate attack layers reconstruct every source pixel without duplicates', () => {
  let detached = 0
  for (const action of ['L02', 'L03', 'L05', 'G03', 'G05', 'V14', 'V17'] as const) {
    const source = ACTIONS[action]
    for (let frame = 0; frame < source.frames.length; frame += 1) {
      const layers = actorLayers({ action, frame, x: 100, facing: 1 })
      source.frames[frame]!.forEach((row, y) => {
        const original = unpack(row)
        const body = unpack(layers.body.frames[0]![y]!)
        const fx = unpack(layers.effect.frames[0]![y]!)
        expect(body.map((c, x) => c === '.' ? fx[x] : c)).toEqual(original)
        for (let x = 0; x < fx.length; x += 1) if (fx[x] !== '.') {
          detached += 1
          expect(body[x]).toBe('.')
        }
      })
    }
  }
  expect(detached).toBeGreaterThan(100)
})

test('both weapons follow four common running, hit and get-up poses with a held weapon', () => {
  for (const weapon of ['longsword', 'bow'] as const) {
    for (const move of ['run', 'hit', 'down'] as const) {
      let g = chooseWeapon(newGame(7), weapon)
      g.hunter.move = move
      for (const tick of move === 'down' ? [0, 8, 13, 17] : move === 'hit' ? [0, 2, 5, 9] : [0, 2, 4, 6]) {
        g.hunter.t = tick
        const actor = viewOf(g).hunter
        expect(actor.weapon).toBe(weapon)
        const body = actorLayers(actor).body.frames[0]!
        expect(body.join('')).toMatch(/[uvwx]/)
      }
    }
  }
})

test('contact flashes use the collision position and expire after three ticks', () => {
  const hit = { x: 101, y: 57, outcome: 'damaged' as const, age: 0 }
  const rects = impactRects([hit])
  expect(rects.length).toBeGreaterThan(0)
  expect(rects.every(r => r.x <= hit.x && r.x + r.w >= hit.x && r.y <= hit.y && r.y + r.h >= hit.y)).toBe(true)
  expect(impactRects([{ ...hit, age: 3 }])).toHaveLength(0)
  expect(impactRects([{ ...hit, outcome: 'evaded' }])).toHaveLength(0)
})

test('a great sword charge abandons its wind-up when a tail slam would catch its recovery', () => {
  let g = beginTurn(newGame(19), 'nargacuga')
  while (g.mode !== 'fight') g = step(g, true)
  g.hunter = { ...g.hunter, move: 'charge', t: 2, x: g.monster.x - 120, stamina: 6, rollIn: -1 }
  g.monster = { ...g.monster, move: 'tailSlam', t: 1, attack: { id: 'windup:monster', contacts: [] } }
  g = step(g, true)
  expect(g.hunter.move).not.toBe('charge')
  expect(g.hunter.hp).toBe(12)
})

test('a spent first slam still warns the hunter about the second slam', () => {
  let g = beginTurn(newGame(21), 'nargacuga')
  while (g.mode !== 'fight') g = step(g, true)
  const x = g.monster.x - 120
  g.hunter = { ...g.hunter, move: 'idle', t: 0, x, stamina: 6, wait: 1, rollIn: -1, dodgeFor: 'combo' }
  g.monster = { ...g.monster, move: 'tailSlam2', t: 12,
    attack: { id: 'combo', contacts: [{ target: 'hunter', outcome: 'evaded', tick: g.simTick }] } }
  g = step(g, true)
  expect(g.hunter.x).toBeLessThan(x)
  expect(g.hunter.move).toBe('run')
})
