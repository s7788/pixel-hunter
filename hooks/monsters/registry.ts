import type { MonsterId } from '../../types'
import type { MonsterDef } from './types'
import { GREAT_JAGRAS } from './great_jagras'
import { VELKHANA } from './velkhana'

/** Every species by id. Only `enabled` ones are drawn for new hunts. */
export const MONSTERS: Readonly<Partial<Record<MonsterId, MonsterDef>>> = {
  velkhana: VELKHANA,
  great_jagras: GREAT_JAGRAS,
}

export const monsterDef = (id: MonsterId): MonsterDef | undefined => MONSTERS[id]

export const enabledMonsters = (): MonsterId[] =>
  (Object.keys(MONSTERS) as MonsterId[]).filter(id => MONSTERS[id]?.enabled === true)

export { GREAT_JAGRAS, VELKHANA }
