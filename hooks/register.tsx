import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'
import { version } from './version'

import type { HuntEvent, HuntLang, HuntPhase, HuntWeaponChoice, HuntWorld, MonsterId } from '../types'
import { HUNTER, TICK_MS, WEAPON_CHOICES } from './data'
import type { Game } from './engine'
import { beginTurn, chooseWeapon, debugHunt, endTurn, migrate, newGame, restore, step, viewOf } from './engine'
import { pickLang, t } from './i18n'
import { enabledMonsters } from './monsters/registry'
import { huntCells, imageCells, huntRgba, RASTER, toBase64 } from './raster'
import { HUNT_SIZE, huntSvg, hudText, statsSvg, statsText } from './svg'

const PANE = 'pixel-hunter'
const TITLE = 'pixel-hunter'
const SAVE_KEY = 'save'
const PICTURE_KEY = 'terminalPicture'
/** Ticks between saves while the game moves (10 s). */
const SAVE_EVERY = 80

const phase = atom({ plugin: 'pixel-hunter', key: 'phase' } as const, 'camp' as HuntPhase)
const turnStartedAt = atom({ plugin: 'pixel-hunter', key: 'turnStartedAt' } as const, null as number | null)
const lastElapsedMs = atom({ plugin: 'pixel-hunter', key: 'lastElapsedMs' } as const, 0)
const world = atom({ plugin: 'pixel-hunter', key: 'world' } as const, null as HuntWorld | null)
const log = atom({ plugin: 'pixel-hunter', key: 'log' } as const, [] as HuntEvent[])
const lang = atom({ plugin: 'pixel-hunter', key: 'lang' } as const, 'en' as HuntLang)
/** How the terminal draws the scene: terminal cells (works anywhere) or an Image (kitty, Ghostty, iTerm2, WezTerm, foot). */
const terminalCells = atom({ plugin: 'pixel-hunter', key: 'terminalCells' } as const, true)

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

/** One tick: the game steps and the pane redraws. */
async function advance($: EngineInterface): Promise<void> {
  const p = await read($, phase)
  const n = await $.clock.now()
  let saved: Game | undefined
  let isHome = false
  await update($, world, w => {
    if (w === null) return w
    const game = step(w.game, p === 'hunting')
    if ((w.tick + 1) % SAVE_EVERY === 0 || game.mode !== w.game.mode) saved = game
    isHome = game.mode === 'camp'
    return { tick: w.tick + 1, now: n, game }
  })
  if (saved !== undefined) await save($, saved)
  // back at camp after a turn: the HUD reads 待機 again, not 撤退
  if (p === 'retreat' && isHome) await update($, phase, () => 'camp')
}

/**
 * Traditional Chinese where Claude speaks it, English for everyone else:
 * Claude's `language` setting first, then the system locale (on macOS and
 * Linux it already follows LANG / LC_ALL, so the mod reads no environment
 * variables of its own). A setting that cannot be read is passed over.
 */
async function detectLang($: EngineInterface): Promise<HuntLang> {
  let language: unknown
  try {
    language = await $.settings.read({ key: 'language' })
  } catch {
    language = undefined
  }
  return pickLang([language, Intl.DateTimeFormat().resolvedOptions().locale])
}

async function pickWeapon($: EngineInterface, choice: HuntWeaponChoice): Promise<void> {
  await save($, await changeGame($, g => chooseWeapon(g, choice)))
  await note($, `weapon ${choice}`)
}

async function togglePicture($: EngineInterface): Promise<void> {
  const next = !(await read($, terminalCells))
  await update($, terminalCells, () => next)
  await $.store.set(PICTURE_KEY, next)
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
  // answered or interrupted alike: the hunter runs back to camp, the hunt kept
  await update($, phase, () => 'retreat')
  await save($, await changeGame($, endTurn))
  await note($, `turn.complete ${reason} ${fmt(elapsed)}`)
}

export const register: Register = on => {
  let animation: Timer | undefined
  /**
   * Ticks, turn changes and the demo run one at a time, in arrival order, so a
   * tick queued before a retreat can never land a hit after it.
   */
  let queue: Promise<void> = Promise.resolve()
  const serial = (work: () => Promise<void>): Promise<void> => {
    const run = queue.then(work, work)
    queue = run.catch(() => undefined)
    return run
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pixel-hunter', description: 'Open the 8-bit hunt pane' })
    await $.command.register({
      name: 'hunt-demo',
      description: 'Toggle the hunt on or off without a Claude turn; with a monster id, start a fresh hunt of it (debug)',
      argumentHint: '[monster id]',
    })
    const stored = (await $.store.get(SAVE_KEY)) as Game | undefined
    const language = await detectLang($)
    await update($, lang, () => language)
    const cellsMode = await $.store.get(PICTURE_KEY)
    if (typeof cellsMode === 'boolean') await update($, terminalCells, () => cellsMode)
    const now = await $.clock.now()
    // a hot reload keeps the session's world (migrated if it is older); a new session restores the save
    await update($, world, w =>
      w !== null ? { ...w, game: migrate(w.game) } : { tick: 0, now, game: stored === undefined ? newGame(now) : restore(stored) },
    )
    // a turn interrupted under the old pause rule (before a reload): retreat, as an interrupt does now
    if ((await read($, phase)) === ('paused' as HuntPhase)) {
      await update($, phase, () => 'retreat')
      await save($, await changeGame($, endTurn))
    }
    void $.ui.open({ id: PANE, title: TITLE })
    await note($, stored === undefined ? 'session.start (new hunter)' : 'session.start (save restored)')
    animation?.cancel()
    animation = $.clock.every(TICK_MS, () => {
      void serial(() => advance($))
    })
    return next(e)
  })

  on('command.run', { command: 'pixel-hunter' }, async $ => {
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
    let isHunting = false
    await serial(async () => {
      // Read inside the queue so consecutive toggles see the preceding change.
      isHunting = (await read($, phase)) === 'hunting'
      await (isHunting ? finishTurn($, 'answer') : startTurn($, 'hunt-demo -> hunting'))
    })
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: `Hunt demo: ${isHunting ? 'retreat' : 'hunting'}.` }
  })

  /**
   * The pane's buttons, answered here by key rather than by their onPress: the
   * pane redraws every tick, and a closure lives only as long as the drawing
   * that held it, so a click landing just after a redraw used to be lost.
   */
  on('ui.press', { plugin: 'pixel-hunter' }, async ($, e, next) => {
    const weapon = WEAPON_CHOICES.find(c => `weapon-${c}` === e.element)
    if (weapon !== undefined) await serial(() => pickWeapon($, weapon))
    else if (e.element === 'picture') await togglePicture($)
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
    const Image = e.surface === 'terminal' && 'Image' in els ? els.Image : undefined
    const Raster = e.surface === 'terminal' && 'Raster' in els ? els.Raster : undefined
    const isCells = await read($, terminalCells)
    const p = await read($, phase)
    const started = await read($, turnStartedAt)
    const w = await read($, world)
    const last = await read($, lastElapsedMs)
    const lg = await read($, lang)
    if (w === null) return <Text dimColor>Hunt is loading…</Text>
    const elapsed = started === null ? last : Math.max(0, w.now - started)
    const view = viewOf(w.game)
    // the terminal's picture is pixels (raster.ts), the Desktop's an Svg
    const picture = Svg === undefined && (Image !== undefined || Raster !== undefined)
    const source = picture ? '' : huntSvg(p, view, fmt(elapsed), false, lg)
    const g = w.game
    const clock = fmt(elapsed)
    // the picture's box: the pane's width, no taller than the rows it leaves for the picture
    const box = imageCells(e.props.bodyColumns, e.props.scroll.bodyRows)
    // pickable as soon as the turn ends, whether or not the hunter is back yet (engine.ts chooseWeapon)
    const canChoose = p !== 'hunting'

    return (
      <Box flexDirection="column">
        {Svg !== undefined ? (
          <Svg source={source} alt={`8-bit hunt: ${p}`} width={HUNT_SIZE.width} height={HUNT_SIZE.height} />
        ) : Image !== undefined || Raster !== undefined ? (
          <Box flexDirection="column">
            {isCells && Raster !== undefined ? (
              <Raster key="scene-cells" {...box} cells={huntCells(view, false, box.columns, box.rows)} />
            ) : Image !== undefined ? (
              <Image
                key="scene"
                source={{ rgba: toBase64(huntRgba(view, false)), width: RASTER.width, height: RASTER.height }}
                {...box}
                alt={`8-bit hunt: ${p}${view.monsterInfo === null ? '' : ` — ${t(lg, view.monsterInfo.name)}`}`}
              />
            ) : null}
            <Text bold>{hudText(p, view, clock, lg)}</Text>
            <Text dimColor>
              HP {view.hp}/{HUNTER.hpMax} ST {view.stamina}/{HUNTER.staminaMax}
            </Text>
            {view.label !== '' && <Text>{t(lg, view.label)}</Text>}
            {Image !== undefined && Raster !== undefined && (
              <Button key="picture" plain onPress={() => togglePicture($)}>
                {t(lg, isCells ? 'pictureCells' : 'pictureImage')}
              </Button>
            )}
          </Box>
        ) : (
          <Text dimColor>(this surface draws no Svg; hunt scene skipped)</Text>
        )}
        {Svg !== undefined ? (
          <Svg source={statsSvg(g, lg)} alt={statsText(g, lg)} width={HUNT_SIZE.width} height={24} />
        ) : (
          <Text>{statsText(g, lg)}</Text>
        )}
        {canChoose ? (
          <Box flexDirection="row">
            {WEAPON_CHOICES.map(c => (
              <Button key={`weapon-${c}`} plain dimColor={c !== g.weaponChoice} onPress={() => serial(() => pickWeapon($, c))}>
                {`${c === g.weaponChoice ? '●' : '○'} ${t(lg, c)}  `}
              </Button>
            ))}
          </Box>
        ) : (
          <Text dimColor>
            {t(lg, 'weaponInHand', { weapon: t(lg, g.weapon) })}
            {g.weaponChoice === 'random' ? t(lg, 'randomSuffix') : ''}
            {t(lg, 'pickAfterTurn')}
          </Text>
        )}
        <Text dimColor>v{version}</Text>
      </Box>
    )
  })
}
