import { expect, mock, test } from 'claude-code/testing'

import { HEADS } from './gen/heads'
import type { HuntAttack } from '../types'
import type { Game } from './engine'
import { beginTurn, migrate, newGame, restore, step } from './engine'
import { MONSTERS, VELKHANA } from './monsters/registry'
import { parked, run } from './simulate'
import { statsSvg, statsText } from './svg'

const PANE = {
  plugin: 'pixel-hunter',
  component: 'Pane',
  requestId: 'pixel-hunter',
  props: {
    title: 'pixel-hunter',
    isFocused: false,
    bodyColumns: 43,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const attack = (id: string): HuntAttack => ({ id, contacts: [] })
const sum = (g: Game): number => Object.values(g.slainBy).reduce((a, b) => a + (b ?? 0), 0)

/** The hunter's swing meets a monster with 1 HP left on the next tick. */
function finishing(id: Parameters<typeof parked>[0]): Game {
  const g = parked(id)
  g.hunt!.monsterHp = 1
  g.hunter = { ...g.hunter, x: g.monster.x - 100, move: 'charge', t: 8, attack: attack(`t:hunter:${g.simTick}`) }
  return g
}

test('a kill adds one to the species slain, the total follows, and the tally always sums to it', () => {
  let g = step(finishing('great_jagras'), true)
  expect(g.mode).toBe('slain')
  expect(g.slain).toBe(1)
  expect(g.slainBy).toEqual({ great_jagras: 1 })
  g = run(g, 80)
  expect(g.mode).toBe('camp')
  g = parked('tigrex')
  g.slain = 1
  g.slainBy = { great_jagras: 1 }
  const again = step(finishing('tigrex'), true)
  expect(again.slainBy).toEqual({ tigrex: 1 })
  g.hunt!.monsterHp = 1
  g.hunter = { ...g.hunter, x: g.monster.x - 100, move: 'charge', t: 8, attack: attack('t:hunter:99') }
  g = step(g, true)
  expect(g.slainBy).toEqual({ great_jagras: 1, tigrex: 1 })
  expect(sum(g)).toBe(g.slain)
})

test('a double KO counts for the species too, once', () => {
  let g = parked('velkhana', VELKHANA.minX + 38)
  g.hunter.x = g.monster.x - 140
  g.monster = { ...g.monster, move: 'tailStab', t: 7, attack: attack('t:monster:0') }
  g.hunter = { ...g.hunter, move: 'charge', t: 8, attack: attack('t:hunter:1'), hp: 2 }
  g.hunt!.monsterHp = 30
  g = step(g, true)
  expect(g.lastOutcome).toBe('mutual_ko')
  expect(g.slainBy).toEqual({ velkhana: 1 })
  expect(sum(g)).toBe(g.slain)
})

test('schema 3 and older saves count every kill so far as Velkhana, keeping the rest', () => {
  const g = run(beginTurn(newGame(4), 'velkhana'), 300)
  g.slain = 5
  const old = JSON.parse(JSON.stringify(g)) as Record<string, unknown>
  old.saveSchemaVersion = 3
  delete old.slainBy
  const back = migrate(old as unknown as Game)
  expect(back.saveSchemaVersion).toBe(5)
  expect(back.slainBy).toEqual({ velkhana: 5 })
  // a schema-3 save keeps its fight under way (only the older ones go back to camp)
  expect(back.mode).toBe(g.mode)
  expect(back.hunt!.monsterHp).toBe(g.hunt!.monsterHp)
  // schema 1 and 2 too, and none slain means none counted
  delete old.saveSchemaVersion
  expect(restore(old as unknown as Game).slainBy).toEqual({ velkhana: 5 })
  const fresh = JSON.parse(JSON.stringify(newGame(1))) as Record<string, unknown>
  fresh.saveSchemaVersion = 3
  delete fresh.slainBy
  expect(migrate(fresh as unknown as Game).slainBy).toEqual({})
  // a current save comes back as it was
  const cur = newGame(2)
  cur.slainBy = { zinogre: 2 }
  cur.slain = 2
  expect(migrate(cur).slainBy).toEqual({ zinogre: 2 })
})

test('a head for every species, 16x16, in its own palette', () => {
  for (const id of Object.keys(MONSTERS)) {
    const h = HEADS[id as keyof typeof HEADS]
    expect(h.rows.length).toBe(16)
    const decoded = h.rows.map(r => [...r.matchAll(/([a-zA-Z.])(\d*)/g)].reduce((n, m) => n + (m[2] === '' ? 1 : Number(m[2])), 0))
    expect(decoded.every(n => n === 16)).toBe(true)
    expect(Object.keys(h.palette).length).toBeGreaterThan(2)
  }
})

test('the tally text and strip list the species in registry order, none slain dimmed', () => {
  const g = newGame(1)
  expect(statsText(g, 'zh-TW')).toBe('討伐 0')
  expect(statsText(g, 'en')).toBe('Slain 0')
  g.slain = 7
  g.slainBy = { great_jagras: 4, velkhana: 3 }
  expect(statsText(g, 'zh-TW')).toBe('討伐 7：冰呪龍×3 大凶豺龍×4')
  expect(statsText(g, 'en')).toBe('Slain 7: Velkhana×3 Great Jagras×4')
  expect(statsSvg(g, 'en')).toContain('Slain 7')
  const svg = statsSvg(g, 'zh-TW')
  expect(svg).toContain('討伐 7')
  expect((svg.match(/×/g) ?? []).length).toBe(Object.keys(MONSTERS).length)
  expect((svg.match(/opacity="\.3"/g) ?? []).length).toBe(Object.keys(MONSTERS).length - 2)
  expect(svg.length).toBeLessThan(20000)
  expect(svg).toContain('×4')
})

test('the pane has the tally strip under the scene; the terminal gets a line of text', { timeoutMs: 60000 }, async ($, on) => {
  const g = newGame(3)
  g.slain = 2
  g.slainBy = { velkhana: 1, anjanath: 1 }
  mock.clock(on)
  mock.store(on, { save: g })
  // Claude speaks Traditional Chinese here, so the tally is in Chinese
  on('settings.read', () => ({ value: { language: '繁體中文' } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // the scene first, the tally strip under it
  const svgs = await desktop.findAll({ type: 'Svg' })
  expect(svgs.length).toBe(2)
  expect(svgs[0]!.props.alt).toBe('8-bit hunt: camp')
  expect(svgs[1]!.props.alt).toBe('討伐 2：冰呪龍×1 蠻顎龍×1')
  expect(String(svgs[1]!.props.source)).toContain('討伐 2')
  await desktop.unmount()
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await terminal.find({ type: 'Text', text: '討伐 2：冰呪龍×1 蠻顎龍×1' })).toBeDefined()
  await terminal.unmount()
})
