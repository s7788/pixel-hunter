import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { HuntEvent, HuntPhase, HuntWeaponChoice, HuntWorld } from '../types'
import { TICK_MS, WEAPON_CHOICES, WEAPONS } from './data'
import type { Game } from './engine'
import { beginTurn, chooseWeapon, endTurn, migrate, newGame, restore, step, viewOf } from './engine'
import { HUNT_SIZE, huntSvg } from './svg'

const PANE = 'hunt-8bit'
const TITLE = 'Hunt'
const SAVE_KEY = 'save'
const DEBUG_KEY = 'debugOpen'
const BOXES_KEY = 'boxesOpen'
/** Ticks between saves while the game moves (10 s). */
const SAVE_EVERY = 80

const phase = atom({ plugin: 'hunt-8bit', key: 'phase' } as const, 'camp' as HuntPhase)
const turnStartedAt = atom({ plugin: 'hunt-8bit', key: 'turnStartedAt' } as const, null as number | null)
const lastElapsedMs = atom({ plugin: 'hunt-8bit', key: 'lastElapsedMs' } as const, 0)
const world = atom({ plugin: 'hunt-8bit', key: 'world' } as const, null as HuntWorld | null)
const log = atom({ plugin: 'hunt-8bit', key: 'log' } as const, [] as HuntEvent[])
const debugOpen = atom({ plugin: 'hunt-8bit', key: 'debugOpen' } as const, true)
const boxesOpen = atom({ plugin: 'hunt-8bit', key: 'boxesOpen' } as const, false)

/** working_elapsed: MM:SS, HH:MM:SS past an hour. */
const fmt = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const hh = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return hh > 0 ? `${String(hh).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`
}

async function note($: EngineInterface, text: string): Promise<void> {
  const at = await $.clock.now()
  await update($, log, list => [...list, { at, text }].slice(-30))
}

async function save($: EngineInterface, game: Game): Promise<void> {
  await $.store.set(SAVE_KEY, game)
}

async function changeGame($: EngineInterface, fn: (g: Game) => Game): Promise<Game> {
  let out: Game | undefined
  await update($, world, w => {
    const current = w ?? { tick: 0, now: 0, game: newGame(Date.now()) }
    out = fn(current.game)
    return { ...current, game: out }
  })
  return out!
}

/** One tick: frozen while paused, otherwise the game steps and the pane redraws. */
async function advance($: EngineInterface): Promise<void> {
  const p = await read($, phase)
  if (p === 'paused') return
  const n = await $.clock.now()
  let saved: Game | undefined
  await update($, world, w => {
    if (w === null) return w
    const game = step(w.game, p === 'hunting')
    if ((w.tick + 1) % SAVE_EVERY === 0 || game.mode !== w.game.mode) saved = game
    return { tick: w.tick + 1, now: n, game }
  })
  if (saved !== undefined) await save($, saved)
}

async function pickWeapon($: EngineInterface, choice: HuntWeaponChoice): Promise<void> {
  await save($, await changeGame($, g => chooseWeapon(g, choice)))
  await note($, `weapon ${choice}`)
}

async function toggleDebug($: EngineInterface): Promise<void> {
  const next = !(await read($, debugOpen))
  await update($, debugOpen, () => next)
  await $.store.set(DEBUG_KEY, next)
}

async function toggleBoxes($: EngineInterface): Promise<void> {
  const next = !(await read($, boxesOpen))
  await update($, boxesOpen, () => next)
  await $.store.set(BOXES_KEY, next)
}

async function startTurn($: EngineInterface, label: string): Promise<void> {
  const now = await $.clock.now()
  await update($, turnStartedAt, () => now)
  await update($, phase, () => 'hunting')
  await save($, await changeGame($, beginTurn))
  await note($, label)
}

async function finishTurn($: EngineInterface, reason: string): Promise<void> {
  const started = await read($, turnStartedAt)
  const now = await $.clock.now()
  const elapsed = started === null ? 0 : now - started
  await update($, lastElapsedMs, () => elapsed)
  await update($, turnStartedAt, () => null)
  if (reason === 'answer') {
    await update($, phase, () => 'retreat')
    await save($, await changeGame($, endTurn))
  } else {
    await update($, phase, () => 'paused')
    const w = await read($, world)
    if (w !== null) await save($, w.game)
  }
  await note($, `turn.complete ${reason} ${fmt(elapsed)}`)
}

export const register: Register = on => {
  let animation: Timer | undefined
  /**
   * Ticks, turn changes and the demo run one at a time, in arrival order, so a
   * tick queued before a retreat or pause can never land a hit after it.
   */
  let queue: Promise<void> = Promise.resolve()
  const serial = (work: () => Promise<void>): Promise<void> => {
    const run = queue.then(work, work)
    queue = run.catch(() => undefined)
    return run
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hunt', description: 'Open the 8-bit hunt pane' })
    await $.command.register({ name: 'hunt-demo', description: 'Toggle the hunt on or off without a Claude turn (debug)' })
    const stored = (await $.store.get(SAVE_KEY)) as Game | undefined
    const open = await $.store.get(DEBUG_KEY)
    if (typeof open === 'boolean') await update($, debugOpen, () => open)
    const showBoxes = await $.store.get(BOXES_KEY)
    if (typeof showBoxes === 'boolean') await update($, boxesOpen, () => showBoxes)
    const now = await $.clock.now()
    // a hot reload keeps the session's world (migrated if it predates collision); a new session restores the save
    await update($, world, w =>
      w !== null ? { ...w, game: migrate(w.game) } : { tick: 0, now, game: stored === undefined ? newGame(now) : restore(stored) },
    )
    void $.ui.open({ id: PANE, title: TITLE })
    await note($, stored === undefined ? 'session.start (new hunter)' : 'session.start (save restored)')
    animation?.cancel()
    animation = $.clock.every(TICK_MS, () => {
      void serial(() => advance($))
    })
    return next(e)
  })

  on('command.run', { command: 'hunt' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Hunt pane opened.' }
  })

  on('command.run', { command: 'hunt-demo' }, async $ => {
    const isHunting = (await read($, phase)) === 'hunting'
    await serial(() => (isHunting ? finishTurn($, 'answer') : startTurn($, 'hunt-demo -> hunting')))
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: `Hunt demo: ${isHunting ? 'retreat' : 'hunting'}.` }
  })

  /**
   * The pane's buttons, answered here by key rather than by their onPress: the
   * pane redraws every tick, and a closure lives only as long as the drawing
   * that held it, so a click landing just after a redraw used to be lost.
   */
  on('ui.press', { plugin: 'hunt-8bit' }, async ($, e, next) => {
    const weapon = WEAPON_CHOICES.find(c => `weapon-${c.id}` === e.element)
    if (weapon !== undefined) await serial(() => pickWeapon($, weapon.id))
    else if (e.element === 'debug') await toggleDebug($)
    else if (e.element === 'boxes') await toggleBoxes($)
    else return next(e)
    return { element: e.element }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    await serial(() => startTurn($, `turn.start ${e.turnId.slice(0, 8)}`))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    await serial(() => finishTurn($, e.reason))
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : undefined
    const p = await read($, phase)
    const started = await read($, turnStartedAt)
    const w = await read($, world)
    const last = await read($, lastElapsedMs)
    const isOpen = await read($, debugOpen)
    const isBoxes = await read($, boxesOpen)
    if (w === null) return <Text dimColor>Hunt is loading…</Text>
    const elapsed = started === null ? last : Math.max(0, w.now - started)
    const view = viewOf(w.game)
    const source = huntSvg(p, view, fmt(elapsed), p === 'paused', isOpen && isBoxes)
    const g = w.game
    // pickable as soon as the turn ends, whether or not the hunter is back yet (engine.ts chooseWeapon)
    const canChoose = p !== 'hunting'

    return (
      <Box flexDirection="column">
        {Svg !== undefined ? (
          <Svg source={source} alt={`8-bit hunt: ${p}`} width={HUNT_SIZE.width} height={HUNT_SIZE.height} />
        ) : (
          <Text dimColor>(this surface draws no Svg; hunt scene skipped)</Text>
        )}
        {canChoose ? (
          <Box flexDirection="row">
            {WEAPON_CHOICES.map(c => (
              <Button
                key={`weapon-${c.id}`}
                plain
                dimColor={c.id !== g.weaponChoice}
                onPress={() => serial(() => pickWeapon($, c.id))}
              >
                {`${c.id === g.weaponChoice ? '●' : '○'} ${c.label}  `}
              </Button>
            ))}
          </Box>
        ) : (
          <Text dimColor>
            武器 {WEAPONS[g.weapon].label}
            {g.weaponChoice === 'random' ? '（隨機）' : ''}・回合結束後可換
          </Text>
        )}
        <Button
          key="debug"
          plain
          onPress={() => toggleDebug($)}
        >
          {isOpen ? '除錯 ▾' : '除錯 ▸'}
        </Button>
        {isOpen && (
          <Box flexDirection="column">
            <Button
              key="boxes"
              plain
              onPress={() => toggleBoxes($)}
            >
              {isBoxes ? '碰撞框 ■ 開' : '碰撞框 □ 關'}
            </Button>
          </Box>
        )}
      </Box>
    )
  })
}
