import type { HuntGame as Game } from '../../types'
import type { MonsterCtx } from './types'

/** The hunt's species counters, created on first use (saves from before them have none). */
export const metersOf = (g: Game): Record<string, number> => (g.hunt!.meters ??= {})

/** A part's durability record as a share of max HP. */
export const durability = (maxHp: number, share: number) => ({ durability: Math.round(maxHp * share), broken: false })

/**
 * Shared rage (spec 4.9), for Nargacuga and Tigrex: once the damage taken since
 * the last rage reaches 25% of max HP, the next safe decision point roars for 8
 * ticks and rage lasts 12 s after it; no new rage for 10 s after one ends. The
 * roar is a show only (no hit). Counters live in `meters`: rageDmg, rageT (ticks
 * left, roar included), rageLock.
 */
const RAGE_SHARE = 0.25
const ROAR_TICKS = 8
const RAGE_TICKS = 96
const RAGE_LOCK = 80

export const rage = {
  isOn: (g: Game): boolean => (metersOf(g).rageT ?? 0) > 0,
  damaged(g: Game, damage: number): void {
    if (!rage.isOn(g)) metersOf(g).rageDmg = (metersOf(g).rageDmg ?? 0) + damage
  },
  tick(c: MonsterCtx): void {
    const m = metersOf(c.g)
    if ((m.rageT ?? 0) > 0) {
      m.rageT! -= 1
      if (m.rageT === 0) {
        m.rageLock = RAGE_LOCK
        c.say('怒氣解除')
      }
    } else if ((m.rageLock ?? 0) > 0) m.rageLock! -= 1
  },
  /** At a safe decision point: roar when the meter is full; true when it did. */
  decide(c: MonsterCtx, name: string): boolean {
    const m = metersOf(c.g)
    if (rage.isOn(c.g) || (m.rageLock ?? 0) > 0 || (m.rageDmg ?? 0) < RAGE_SHARE * c.g.hunt!.monsterHpMax) return false
    m.rageDmg = 0
    m.rageT = ROAR_TICKS + RAGE_TICKS
    c.act('roar')
    c.say(`${name}憤怒`)
    return true
  },
}
