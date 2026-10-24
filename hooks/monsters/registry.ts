import type { MonsterId } from '../../types'
import type { MonsterDef } from './types'
import { RUINER_NERGIGANTE } from './ruiner_nergigante'
import { ZINOGRE } from './zinogre'
import { TIGREX } from './tigrex'
import { NARGACUGA } from './nargacuga'
import { BARIOTH } from './barioth'
import { ANJANATH } from './anjanath'
import { GREAT_JAGRAS } from './great_jagras'
import { TOBI_KADACHI } from './tobi_kadachi'
import { VELKHANA } from './velkhana'

/** Every species by id. Only `enabled` ones are drawn for new hunts. */
export const MONSTERS: Readonly<Partial<Record<MonsterId, MonsterDef>>> = {
  velkhana: VELKHANA,
  great_jagras: GREAT_JAGRAS,
  tobi_kadachi: TOBI_KADACHI,
  anjanath: ANJANATH,
  barioth: BARIOTH,
  nargacuga: NARGACUGA,
  tigrex: TIGREX,
  zinogre: ZINOGRE,
  ruiner_nergigante: RUINER_NERGIGANTE,
}

export const monsterDef = (id: MonsterId): MonsterDef | undefined => MONSTERS[id]

export const enabledMonsters = (): MonsterId[] =>
  (Object.keys(MONSTERS) as MonsterId[]).filter(id => MONSTERS[id]?.enabled === true)

export { ANJANATH, BARIOTH, GREAT_JAGRAS, NARGACUGA, RUINER_NERGIGANTE, TIGREX, TOBI_KADACHI, VELKHANA, ZINOGRE }
