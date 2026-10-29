import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { HUNTER, TICK_MS, WEAPON_CHOICES } from './data'
import { enabledMonsters, monsterDef, VELKHANA } from './monsters/registry'
import type { Game } from './engine'
import { beginTurn, chooseWeapon, endTurn, newGame, restore, step, viewOf } from './engine'
import { pickLang, t } from './i18n'
import { huntSvg, hudText, statsSvg, statsText } from './svg'
import { ACTIONS } from './sprites'
import type { ActionId } from './sprites'

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

/** Claude's `language` setting as the mod reads it at session start. */
function speaks(on: On, language: string): void {
  on('settings.read', () => ({ value: { language } }))
}

/**
 * `mock.store` with a window on it: an in-memory store whose `save` (written
 * on a press, a turn start and a mode change) the test can read back.
 */
function memStore(on: On, entries: Record<string, unknown> = {}): () => Game {
  const data = new Map<string, unknown>(Object.entries(entries))
  on('store.get', (_, e) => ({ value: data.get(e.key) }))
  on('store.set', (_, e) => {
    data.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    data.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...data.keys()] }))
  return () => data.get('save') as Game
}

const run = (g: Game, ticks: number, working = true): Game => {
  let out = g
  for (let i = 0; i < ticks; i += 1) out = step(out, working)
  return out
}

test('every frame of a long hunt fits the Svg source limit, collision boxes included', () => {
  let g = beginTurn(newGame(7), 'velkhana')
  let largest = 0
  for (let i = 0; i < 3000; i += 1) {
    g = step(g, true)
    largest = Math.max(largest, huntSvg('hunting', viewOf(g), '88:88:88', true).length)
  }
  expect(largest).toBeLessThan(131072)
})

test('a hunt lasts about the target minutes and about a third of hunts see a faint', { timeoutMs: 60000 }, () => {
  const minutes: number[] = []
  let carted = 0
  for (let seed = 1; seed <= 12; seed += 1) {
    let g = beginTurn(newGame(seed), 'velkhana')
    let t = 0
    while (g.slain === 0 && t < 20000) {
      g = step(g, true)
      t += 1
    }
    minutes.push((t * TICK_MS) / 60000)
    if (g.carts > 0) carted += 1
  }
  const avg = minutes.reduce((a, b) => a + b, 0) / minutes.length
  expect(avg).toBeGreaterThan(VELKHANA.targetMinutes * 0.8)
  expect(avg).toBeLessThan(VELKHANA.targetMinutes * 1.2)
  expect(carted / minutes.length).toBeGreaterThan(0.1)
  expect(carted / minutes.length).toBeLessThan(0.6)
})

test('the answer retreats to camp and keeps the monster wounded for the next turn', () => {
  let g = run(beginTurn(newGame(3), 'velkhana'), 400)
  expect(g.mode).toBe('fight')
  const wounded = g.hunt!.monsterHp
  expect(wounded).toBeLessThan(g.hunt!.monsterHpMax)
  g = run(endTurn(g), 30, false)
  expect(g.mode).toBe('camp')
  expect(viewOf(g).monster).toBeNull()
  expect(g.hunter.hp).toBe(HUNTER.hpMax)
  expect(g.hunt!.monsterHp).toBe(wounded)
  g = run(beginTurn(g), 40)
  expect(g.hunt!.monsterHp).toBeLessThanOrEqual(wounded)
  expect(viewOf(g).scene).toBe(g.hunt!.scene)
})

test('a completed hunt stays at camp when Claude has finished; the next turn starts a fresh hunt', () => {
  let g = beginTurn(newGame(5), 'velkhana')
  const first = g.hunt!.scene
  g.hunt!.monsterHp = 1
  for (let i = 0; i < 200 && g.slain === 0; i += 1) g = step(g, true)
  g = run(endTurn(g), 200, false)
  expect(g.slain).toBe(1)
  expect(g.mode).toBe('camp')
  expect(g.hunt).toBeNull()
  g = run(g, 100, false)
  expect(g.mode).toBe('camp')
  g = beginTurn(g, 'velkhana')
  expect(g.hunt!.scene).not.toBe(first)
})

test('a save from a session that ended mid-fight comes back at camp, hunt kept', () => {
  const g = run(beginTurn(newGame(9), 'velkhana'), 300)
  const back = restore(JSON.parse(JSON.stringify(g)) as Game)
  expect(back.mode).toBe('camp')
  expect(back.hunt!.monsterHp).toBe(g.hunt!.monsterHp)
  expect(back.hunt!.isFresh).toBe(false)
})

test('main turns hunt; answers and interrupts both retreat; subagent turns change nothing', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const mount = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const svg = await ui.find({ type: 'Svg' })
    await ui.unmount()
    return svg?.props.alt
  }
  expect(await mount()).toBe('8-bit hunt: camp')
  await $.turn.start({ text: 'go', turnId: 't1' })
  expect(await mount()).toBe('8-bit hunt: hunting')
  await $.turn.start({ text: 'sub', turnId: 's1', agentId: 'a1' })
  await $.turn.complete({ reason: 'answer', turnId: 's1', agentId: 'a1' } as never)
  expect(await mount()).toBe('8-bit hunt: hunting')
  await $.turn.complete({ reason: 'answer', turnId: 't1' } as never)
  expect(await mount()).toBe('8-bit hunt: retreat')
  await $.turn.start({ text: 'again', turnId: 't2' })
  await $.turn.complete({ reason: 'aborted', turnId: 't2' } as never)
  expect(await mount()).toBe('8-bit hunt: retreat')
})

test('the terminal draws the scene as cells (an Image on request) with its words under it, and no Svg', { timeoutMs: 60000 }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  speaks(on, '繁體中文')
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  // cells work in any terminal, so they are the default: 43 columns, 12 rows, 3 u32 words a cell
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  const raster = await ui.find({ type: 'Raster' })
  expect(raster).toBeDefined()
  const cells = raster!.props as { columns: number; rows: number; cells: string }
  expect(cells.columns).toBe(43)
  expect(cells.rows).toBe(12)
  expect(cells.cells.length).toBe(Math.ceil((43 * 12 * 12) / 3) * 4)
  expect(await ui.find({ type: 'Text', text: /待機・00:00/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /HP 12\/12/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^討伐 0/ })).toBeDefined()
  // the button swaps to the Image: 384 x 216 RGBA, alt, the same box
  await ui.press({ key: 'picture' })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  const image = await ui.find({ type: 'Image' })
  expect(image).toBeDefined()
  expect(image!.props.alt).toBe('8-bit hunt: camp')
  const { columns, rows, source } = image!.props as { columns: number; rows: number; source: { rgba: string; width: number; height: number } }
  expect(columns).toBe(43)
  expect(rows).toBe(12)
  expect(source.width).toBe(384)
  expect(source.height).toBe(216)
  // 384 x 216 x 4 bytes, base64: well under the 2 MiB the terminal takes
  expect(source.rgba.length).toBe(Math.ceil((384 * 216 * 4) / 3) * 4)
  await ui.unmount()
})

test('a wide, short inline pane: the cells fill the width the rows allow', { timeoutMs: 60000 }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const wide = { ...PANE, props: { ...PANE.props, bodyColumns: 160, placement: 'inline' as const, scroll: { offset: 0, bodyRows: 30 } } }
  const ui = await $.ui.mount({ ...wide, surface: 'terminal' })
  const raster = (await ui.find({ type: 'Raster' }))!.props as { columns: number; rows: number }
  // 30 rows less 7 for the words: 23 rows, and the 384:216 shape gives 82 columns
  expect(raster.rows).toBe(23)
  expect(raster.columns).toBe(82)
  await ui.unmount()
})

test('/hunt-demo toggles the hunt without a turn', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'hunt-demo', args: '' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('8-bit hunt: hunting')
  await ui.unmount()
})

test('a new session picks the stored hunt back up at camp', async ($, on) => {
  const midFight = run(beginTurn(newGame(11), 'velkhana'), 300)
  mock.clock(on)
  const saved = memStore(on, { save: midFight })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('8-bit hunt: camp')
  await ui.unmount()
  // the next turn carries on the stored hunt, not a new one
  await $.turn.start({ text: 'go', turnId: 't1' })
  const g = saved()
  expect(g.huntNo).toBe(midFight.huntNo)
  expect(g.hunt?.monsterHp).toBe(midFight.hunt?.monsterHp)
})

test('camp shows the weapon buttons; a press takes the weapon up; a hunt locks them', async ($, on) => {
  mock.clock(on)
  const saved = memStore(on)
  speaks(on, '繁體中文')
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.findAll({ type: 'Button', text: /^[●○] / })).toHaveLength(4)
  await ui.press({ key: 'weapon-longsword' })
  await ui.unmount()
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(saved().weapon).toBe('longsword')
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toContain('武器 太刀</text>')
  expect(await ui.find({ type: 'Button', key: 'weapon-longsword', text: /● 太刀/ })).toBeDefined()
  await ui.unmount()
  await $.turn.start({ text: 'go', turnId: 't1' })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.findAll({ type: 'Button', text: /^[●○] / })).toHaveLength(0)
  expect(await ui.find({ type: 'Text', text: /武器 太刀/ })).toBeDefined()
  await ui.unmount()
})

test('a long hunt with each weapon fits the Svg source limit', () => {
  for (const weapon of ['longsword', 'bow'] as const) {
    let g = beginTurn(chooseWeapon(newGame(7), weapon), 'velkhana')
    let largest = 0
    for (let i = 0; i < 3000; i += 1) {
      g = step(g, true)
      largest = Math.max(largest, huntSvg('hunting', viewOf(g), '88:88:88', true).length)
    }
    expect(largest).toBeLessThan(131072)
  }
})

test('a press in camp after a real turn, with the clock ticking, changes the weapon', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const saved = memStore(on, { save: run(beginTurn(newGame(11), 'velkhana'), 300) })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(5000)
  await $.turn.complete({ reason: 'answer', turnId: 't1', answer: '' } as never)
  await clock.advance(5000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(saved().weapon).toBe('greatsword')
  await ui.press({ key: 'weapon-bow' })
  await clock.advance(1000)
  expect(saved().weapon).toBe('bow')
  await ui.unmount()
})

test('the picture names the weapon in hand as text, with no boxes that look like buttons', () => {
  const picked = viewOf(chooseWeapon(newGame(3), 'longsword'))
  const svg = huntSvg('camp', picked, '00:00', false, 'zh-TW')
  expect(svg).toContain('武器 太刀</text>')
  expect(svg).not.toContain('大劍</text>')
  expect(huntSvg('camp', viewOf(chooseWeapon(newGame(3), 'random')), '00:00', false, 'zh-TW')).toContain('（隨機）</text>')
  expect(huntSvg('camp', picked, '00:00', false, 'en')).toContain('Weapon: Long Sword</text>')
})

test('the buttons come back the moment the turn ends; a pick on the way home is in hand at once', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const saved = memStore(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(10_000)
  expect(saved().mode).toBe('fight')
  await $.turn.complete({ reason: 'answer', turnId: 't1', answer: '' } as never)
  // no tick yet: the hunter is still out there, running home
  expect(saved().mode).toBe('retreating')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.findAll({ type: 'Button', text: /^[●○] / })).toHaveLength(4)
  await ui.press({ key: 'weapon-bow' })
  expect(saved().weapon).toBe('bow')
  await ui.unmount()
})

test('the pane shows the picture and the weapon buttons, and no debug controls or text', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  speaks(on, '繁體中文')
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.findAll({ type: 'Text' })).toHaveLength(0)
  const buttons = await ui.findAll({ type: 'Button' })
  expect(buttons).toHaveLength(4)
  expect(await ui.find({ type: 'Button', text: /除錯|碰撞框/ })).toBeUndefined()
  // the collision overlay is not drawn
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).not.toContain('class="bh"')
  await ui.unmount()
})

test('the pane takes its own presses by key, so one click is one change', async ($, on) => {
  mock.clock(on)
  const saved = memStore(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.press({ key: 'weapon-longsword' })).toEqual({ element: 'weapon-longsword' })
  expect(saved().weapon).toBe('longsword')
  expect(await ui.press({ key: 'weapon-bow' })).toEqual({ element: 'weapon-bow' })
  expect(saved().weapon).toBe('bow')
  await ui.unmount()
})

test('an interrupted turn runs the hunter home and keeps the hunt, as an answer does', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const saved = memStore(on)
  speaks(on, '繁體中文')
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(30_000)
  expect(saved().mode).toBe('fight')
  await $.turn.complete({ reason: 'aborted', turnId: 't1' } as never)
  expect(saved().mode).toBe('retreating')
  const wounded = saved().hunt!.monsterHp
  await clock.advance(5_000)
  expect(saved().mode).toBe('camp')
  expect(saved().hunt!.monsterHp).toBe(wounded)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.findAll({ type: 'Button', text: /^[●○] / })).toHaveLength(4)
  // home again: the HUD and the alt say camp, not retreat
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('8-bit hunt: camp')
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toContain('待機</text>')
  await ui.unmount()
})

test('every species on its own grounds, with every hunter frame of every weapon, fits the Svg source limit', { timeoutMs: 120000 }, () => {
  const hunterActions = Object.keys(ACTIONS).filter(id => /^[CGLB]\d/.test(id) && id !== 'C02' && id !== 'C21') as ActionId[]
  const marks = [1, 2, 3, 4].map(i => ({ x: 150 + i * 10, y: 120, outcome: 'damaged' as const }))
  let largest = 0
  for (const id of enabledMonsters()) {
    const def = monsterDef(id)!
    const actions = [...new Set(Object.values(def.moves).map(m => m.action))]
    for (const scene of def.scenes) {
      for (const m of actions) {
        for (let mf = 0; mf < ACTIONS[m].frames.length; mf += 1) {
          for (const h of hunterActions) {
            for (let hf = 0; hf < ACTIONS[h].frames.length; hf += 1) {
              for (const facing of [1, -1] as const) {
                const view = {
                  ...viewOf(newGame(1)),
                  scene,
                  camp: null,
                  label: '雙方倒下・討伐完成',
                  monsterHpPercent: 100,
                  marks,
                  hunter: { action: h, frame: hf, x: 96, facing },
                  monster: { action: m, frame: mf, x: 262, facing: 1 as const },
                }
                largest = Math.max(largest, huntSvg('hunting', view, '88:88:88', false, 'zh-TW').length)
              }
            }
          }
        }
      }
    }
  }
  expect(largest).toBeLessThan(131072)
})

test('Traditional Chinese draws Chinese; every other language, Simplified Chinese included, draws English', () => {
  for (const zh of ['繁體中文', '正體中文', 'Traditional Chinese', 'zh-TW', 'zh_TW.UTF-8', 'zh-Hant-TW', 'zh-HK']) expect(pickLang([zh])).toBe('zh-TW')
  for (const en of ['English', 'japanese', '日本語', '简体中文', 'Simplified Chinese', 'zh-CN', 'zh_CN.UTF-8', '中文', 'C.UTF-8']) expect(pickLang([en])).toBe('en')
  // the first source that says anything wins: Claude's setting over the system locale
  expect(pickLang([undefined, '', 'zh-TW'])).toBe('zh-TW')
  expect(pickLang(['English', undefined, undefined, undefined, 'zh-TW'])).toBe('en')
  expect(pickLang([])).toBe('en')
})

test('where Claude speaks another language, the pane and the picture are in English', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  speaks(on, 'japanese')
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', text: /● Great Sword/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /○ Random/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /Debug|Hitboxes/ })).toBeUndefined()
  const svg = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(svg).toContain('Weapon: Great Sword</text>')
  expect(svg).toContain('>Camp</text>')
  expect(svg).not.toMatch(/[\u4e00-\u9fff]/)
  await ui.unmount()
})

test('every callout and attack has its words in both languages; a callout saved as text shows as it is', () => {
  const ids = [
    ...WEAPON_CHOICES,
    ...Object.entries(HUNTER.moves).filter(([, m]) => (m as { active?: number }).active !== undefined).map(([id]) => id),
  ]
  for (const id of ids) {
    expect(t('zh-TW', id)).not.toBe(id)
    expect(t('en', id)).not.toBe(id)
  }
  // a long hunt in English draws no Chinese anywhere, callouts included
  let g = beginTurn(chooseWeapon(newGame(9), 'longsword'), 'velkhana')
  for (let i = 0; i < 2000; i += 1) {
    g = step(g, true)
    if (viewOf(g).label !== '') expect(huntSvg('hunting', viewOf(g), '00:00', false, 'en')).not.toMatch(/[\u4e00-\u9fff]/)
  }
  expect(t('en', '撤退')).toBe('撤退')
})

test('/hunt-demo <monster> starts a fresh hunt of that species; an unknown id is refused', { timeoutMs: 60000 }, async ($, on) => {
  mock.clock(on)
  const saved = memStore(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  const bad = await $.command.run({ command: 'hunt-demo', args: 'rathalos' } as never)
  expect(bad.text).toMatch(/Unknown monster "rathalos"/)
  const ok = await $.command.run({ command: 'hunt-demo', args: ' great_jagras ' } as never)
  expect(ok.text).toMatch(/great_jagras/)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('8-bit hunt: hunting')
  expect(saved().hunt?.monsterId).toBe('great_jagras')
  expect(saved().hunt?.state).toBe('normal')
  await ui.unmount()
})

test('every species in English: the picture, the terminal words and the tally hold no Chinese', { timeoutMs: 300000 }, () => {
  const cjk = /[\u4e00-\u9fff]/
  for (const id of enabledMonsters()) {
    for (const weapon of ['greatsword', 'bow'] as const) {
      let g = beginTurn(chooseWeapon(newGame(31), weapon), id)
      for (let i = 0; i < 2400 && g.slain === 0; i += 1) {
        g = step(g, true)
        const view = viewOf(g)
        if (view.label !== '' || i % 40 === 0) {
          const words = huntSvg('hunting', view, '00:00', false, 'en') + hudText('hunting', view, '00:00', 'en')
          const left = words.match(new RegExp(`.{0,24}${cjk.source}.{0,24}`))
          expect(left?.[0] ?? null).toBeNull()
        }
      }
      g.slainBy = { [id]: 1 }
      expect(statsText(g, 'en')).not.toMatch(cjk)
      expect(statsSvg(g, 'en')).not.toMatch(cjk)
    }
  }
})
