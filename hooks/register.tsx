import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { HuntEvent, HuntPhase, HuntWorld } from '../types'
import { TICK_MS } from './data'
import type { Game } from './engine'
import { beginTurn, endTurn, newGame, restore, step, viewOf } from './engine'
import { HUNT_SIZE, huntSvg } from './svg'

const PANE = 'hunt-8bit'
const TITLE = 'Hunt'
const SAVE_KEY = 'save'
const DEBUG_KEY = 'debugOpen'
/** Ticks between saves while the game moves (10 s). */
const SAVE_EVERY = 80

const phase = atom({ plugin: 'hunt-8bit', key: 'phase' } as const, 'camp' as HuntPhase)
const turnStartedAt = atom({ plugin: 'hunt-8bit', key: 'turnStartedAt' } as const, null as number | null)
const lastElapsedMs = atom({ plugin: 'hunt-8bit', key: 'lastElapsedMs' } as const, 0)
const world = atom({ plugin: 'hunt-8bit', key: 'world' } as const, null as HuntWorld | null)
const log = atom({ plugin: 'hunt-8bit', key: 'log' } as const, [] as HuntEvent[])
const debugOpen = atom({ plugin: 'hunt-8bit', key: 'debugOpen' } as const, true)

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

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hunt', description: 'Open the 8-bit hunt pane' })
    await $.command.register({ name: 'hunt-demo', description: 'Toggle the hunt on or off without a Claude turn (debug)' })
    const stored = (await $.store.get(SAVE_KEY)) as Game | undefined
    const open = await $.store.get(DEBUG_KEY)
    if (typeof open === 'boolean') await update($, debugOpen, () => open)
    const now = await $.clock.now()
    // a hot reload keeps the session's world; a new session restores the save
    await update($, world, w => w ?? { tick: 0, now, game: stored === undefined ? newGame(now) : restore(stored) })
    void $.ui.open({ id: PANE, title: TITLE })
    await note($, stored === undefined ? 'session.start (new hunter)' : 'session.start (save restored)')
    animation?.cancel()
    animation = $.clock.every(TICK_MS, () => {
      void advance($)
    })
    return next(e)
  })

  on('command.run', { command: 'hunt' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Hunt pane opened.' }
  })

  on('command.run', { command: 'hunt-demo' }, async $ => {
    const isHunting = (await read($, phase)) === 'hunting'
    if (isHunting) await finishTurn($, 'answer')
    else await startTurn($, 'hunt-demo -> hunting')
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: `Hunt demo: ${isHunting ? 'retreat' : 'hunting'}.` }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    await startTurn($, `turn.start ${e.turnId.slice(0, 8)}`)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    await finishTurn($, e.reason)
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
    const events = await read($, log)
    const isOpen = await read($, debugOpen)
    if (w === null) return <Text dimColor>Hunt is loading…</Text>
    const elapsed = started === null ? last : Math.max(0, w.now - started)
    const view = viewOf(w.game)
    const source = huntSvg(p, view, fmt(elapsed), p === 'paused')
    const g = w.game

    return (
      <Box flexDirection="column">
        {Svg !== undefined ? (
          <Svg source={source} alt={`8-bit hunt: ${p}`} width={HUNT_SIZE.width} height={HUNT_SIZE.height} />
        ) : (
          <Text dimColor>(this surface draws no Svg; hunt scene skipped)</Text>
        )}
        <Button
          key="debug"
          plain
          onPress={async () => {
            const next = !(await read($, debugOpen))
            await update($, debugOpen, () => next)
            await $.store.set(DEBUG_KEY, next)
          }}
        >
          {isOpen ? '除錯 ▾' : '除錯 ▸'}
        </Button>
        {isOpen && (
          <Box flexDirection="column">
            <Text dimColor>
              phase {p} / mode {g.mode} / hunter {g.hunter.move} / monster {view.monster === null ? '-' : g.monster.move}
            </Text>
            <Text dimColor>
              HP {g.hunter.hp} ST {g.hunter.stamina} / monster HP {view.monsterHpPercent ?? '-'}% / hunt #{g.huntNo} / slain{' '}
              {g.slain} / carts {g.carts}
            </Text>
            <Text dimColor>
              svg {source.length} / 131072 chars / {e.surface} {e.props.placement} cols {e.props.bodyColumns}
            </Text>
            {events.slice(-6).map(ev => (
              <Text dimColor>{ev.text}</Text>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
