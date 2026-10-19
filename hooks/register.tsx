import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { HuntEvent, HuntPhase, HuntWorld, MonsterId } from '../types'
import { HUNTER, TICK_MS } from './data'
import type { Game } from './engine'
import { beginTurn, debugHunt, endTurn, migrate, newGame, restore, step, viewOf } from './engine'
import { enabledMonsters } from './monsters/registry'
import { huntCells, imageCells, huntRgba, RASTER, toBase64 } from './raster'
import { HUNT_SIZE, huntSvg, hudText, statsSvg, statsText } from './svg'

const PANE = 'hunt-8bit'
const TITLE = 'Hunt'
const SAVE_KEY = 'save'
const DEBUG_KEY = 'debugOpen'
const BOXES_KEY = 'boxesOpen'
const PICTURE_KEY = 'terminalPicture'
/** Ticks between saves while the game moves (10 s). */
const SAVE_EVERY = 80

const phase = atom({ plugin: 'hunt-8bit', key: 'phase' } as const, 'camp' as HuntPhase)
const turnStartedAt = atom({ plugin: 'hunt-8bit', key: 'turnStartedAt' } as const, null as number | null)
const lastElapsedMs = atom({ plugin: 'hunt-8bit', key: 'lastElapsedMs' } as const, 0)
const world = atom({ plugin: 'hunt-8bit', key: 'world' } as const, null as HuntWorld | null)
const log = atom({ plugin: 'hunt-8bit', key: 'log' } as const, [] as HuntEvent[])
const debugOpen = atom({ plugin: 'hunt-8bit', key: 'debugOpen' } as const, true)
const boxesOpen = atom({ plugin: 'hunt-8bit', key: 'boxesOpen' } as const, false)
/** How the terminal draws the scene: terminal cells (works anywhere) or an Image (kitty, Ghostty, iTerm2, WezTerm, foot). */
const terminalCells = atom({ plugin: 'hunt-8bit', key: 'terminalCells' } as const, true)

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

/** A turn (or the demo) starts; `monster` drops the hunt under way for a fresh one of that species (debug). */
async function startTurn($: EngineInterface, label: string, monster?: MonsterId): Promise<void> {
  const now = await $.clock.now()
  await update($, turnStartedAt, () => now)
  await update($, phase, () => 'hunting')
  await save($, await changeGame($, g => (monster === undefined ? beginTurn(g) : debugHunt(g, monster))))
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
    await $.command.register({
      name: 'hunt-demo',
      description: 'Toggle the hunt on or off without a Claude turn; with a monster id, start a fresh hunt of it (debug)',
      argumentHint: '[monster id]',
    })
    const stored = (await $.store.get(SAVE_KEY)) as Game | undefined
    const open = await $.store.get(DEBUG_KEY)
    if (typeof open === 'boolean') await update($, debugOpen, () => open)
    const cellsMode = await $.store.get(PICTURE_KEY)
    if (typeof cellsMode === 'boolean') await update($, terminalCells, () => cellsMode)
    const showBoxes = await $.store.get(BOXES_KEY)
    if (typeof showBoxes === 'boolean') await update($, boxesOpen, () => showBoxes)
    const now = await $.clock.now()
    // a hot reload keeps the session's world (migrated if it predates collision or the registry); a new session restores the save
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

  on('command.run', { command: 'hunt-demo' }, async ($, e) => {
    const wanted = e.args.trim()
    if (wanted !== '') {
      const monster = enabledMonsters().find(id => id === wanted)
      if (monster === undefined) return { text: `Unknown monster "${wanted}". One of: ${enabledMonsters().join(', ')}.` }
      await serial(() => startTurn($, `hunt-demo -> ${monster}`, monster))
      await $.ui.open({ id: PANE, title: TITLE })
      return { text: `Hunt demo: a fresh ${monster} hunt (the one under way was dropped).` }
    }
    const isHunting = (await read($, phase)) === 'hunting'
    await serial(() => (isHunting ? finishTurn($, 'answer') : startTurn($, 'hunt-demo -> hunting')))
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: `Hunt demo: ${isHunting ? 'retreat' : 'hunting'}.` }
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
    const Image = e.surface === 'terminal' && 'Image' in els ? els.Image : undefined
    const Raster = e.surface === 'terminal' && 'Raster' in els ? els.Raster : undefined
    const isCells = await read($, terminalCells)
    const p = await read($, phase)
    const started = await read($, turnStartedAt)
    const w = await read($, world)
    const last = await read($, lastElapsedMs)
    const events = await read($, log)
    const isOpen = await read($, debugOpen)
    const isBoxes = await read($, boxesOpen)
    if (w === null) return <Text dimColor>Hunt is loading…</Text>
    const elapsed = started === null ? last : Math.max(0, w.now - started)
    const view = viewOf(w.game)
    // the terminal's picture is pixels (raster.ts), the Desktop's an Svg; only the Svg has the debug boxes
    const picture = Svg === undefined && (Image !== undefined || Raster !== undefined)
    const source = picture ? '' : huntSvg(p, view, fmt(elapsed), p === 'paused', isOpen && isBoxes)
    const g = w.game
    const clock = fmt(elapsed)
    // the picture's box: the pane's width, no taller than the rows it leaves for the picture
    const box = imageCells(e.props.bodyColumns, e.props.scroll.bodyRows)

    return (
      <Box flexDirection="column">
        {Svg !== undefined ? (
          <Svg source={source} alt={`8-bit hunt: ${p}`} width={HUNT_SIZE.width} height={HUNT_SIZE.height} />
        ) : Image !== undefined || Raster !== undefined ? (
          <Box flexDirection="column">
            {isCells && Raster !== undefined ? (
              <Raster key="scene-cells" {...box} cells={huntCells(view, p === 'paused', box.columns, box.rows)} />
            ) : Image !== undefined ? (
              <Image
                key="scene"
                source={{ rgba: toBase64(huntRgba(view, p === 'paused')), width: RASTER.width, height: RASTER.height }}
                {...box}
                alt={`8-bit hunt: ${p}${view.monsterInfo === null ? '' : ` — ${view.monsterInfo.name}`}`}
              />
            ) : null}
            <Text bold>{hudText(p, view, clock)}</Text>
            <Text dimColor>
              HP {view.hp}/{HUNTER.hpMax} ST {view.stamina}/{HUNTER.staminaMax}
            </Text>
            {view.label !== '' && <Text>{view.label}</Text>}
            {Image !== undefined && Raster !== undefined && (
              <Button
                key="picture"
                plain
                onPress={async () => {
                  const next = !(await read($, terminalCells))
                  await update($, terminalCells, () => next)
                  await $.store.set(PICTURE_KEY, next)
                }}
              >
                {isCells ? '畫面：字元（點此改圖片）' : '畫面：圖片（點此改字元）'}
              </Button>
            )}
            {isOpen && isBoxes && <Text dimColor>碰撞框疊圖僅 Desktop</Text>}
          </Box>
        ) : (
          <Text dimColor>(this surface draws no Svg; hunt scene skipped)</Text>
        )}
        {Svg !== undefined ? (
          <Svg source={statsSvg(g)} alt={statsText(g)} width={HUNT_SIZE.width} height={24} />
        ) : (
          <Text>{statsText(g)}</Text>
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
            <Button
              key="boxes"
              plain
              onPress={async () => {
                const next = !(await read($, boxesOpen))
                await update($, boxesOpen, () => next)
                await $.store.set(BOXES_KEY, next)
              }}
            >
              {isBoxes ? '碰撞框 ■ 開' : '碰撞框 □ 關'}
            </Button>
            <Text dimColor>
              phase {p} / mode {g.mode} / hunter {g.hunter.move} / monster {view.monster === null ? '-' : g.monster.move}
            </Text>
            <Text dimColor>
              HP {g.hunter.hp} ST {g.hunter.stamina} / monster HP {view.monsterHpPercent ?? '-'}% / hunt #{g.huntNo} / slain{' '}
              {g.slain} / carts {g.carts}
            </Text>
            {g.hunt !== null && (
              <Text dimColor>
                {g.hunt.monsterId} / state {g.hunt.state} {g.hunt.stateT} /{' '}
                {Object.entries(g.hunt.parts)
                  .map(([part, p]) => `${part} ${p.broken ? 'broken' : p.durability}`)
                  .join(' ') || 'no parts'}
              </Text>
            )}
            <Text dimColor>
              {source === '' ? (isCells ? 'cells' : 'image 384x216') : `svg ${source.length} / 131072 chars`} / {e.surface} {e.props.placement} cols{' '}
              {e.props.bodyColumns}
            </Text>
            {events.slice(-6).map(ev => (
              <Text dimColor>{ev.text}</Text>
            ))}
            {isBoxes &&
              g.hits.slice(-6).map(hit => (
                <Text dimColor>
                  #{hit.tick} {hit.attackId} → {hit.target}/{hit.part} {hit.outcome} {hit.damage}
                </Text>
              ))}
          </Box>
        )}
      </Box>
    )
  })
}
