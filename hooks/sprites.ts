import { ANJANATH } from './gen/anjanath'
import { BARIOTH } from './gen/barioth'
import { NARGA } from './gen/narga'
import { TIGREX } from './gen/tigrex'
import { ZINOGRE } from './gen/zinogre'
import { NERGI } from './gen/nergi'
import { CAMP } from './gen/camp'
import { HUNTER } from './gen/hunter'
import { JAGRAS } from './gen/jagras'
import { SCENES } from './gen/scenes'
import { TOBI } from './gen/tobi'
import { VEL } from './gen/vel'

/** A frame row run-length encoded: a palette letter or '.', then its count when over 1. */
export type RleRow = string

export type Sprite = {
  palette: Readonly<Record<string, string>>
  anchorX: number
  frames: readonly (readonly RleRow[])[]
}

export type ActionId =
  | keyof typeof HUNTER.actions
  | keyof typeof CAMP.actions
  | keyof typeof VEL.actions
  | keyof typeof JAGRAS.actions
  | keyof typeof TOBI.actions
  | keyof typeof ANJANATH.actions
  | keyof typeof BARIOTH.actions
  | keyof typeof NARGA.actions
  | keyof typeof TIGREX.actions
  | keyof typeof ZINOGRE.actions
  | keyof typeof NERGI.actions
export type SceneId = keyof typeof SCENES

function withPalette(group: typeof HUNTER | typeof CAMP | typeof VEL | typeof JAGRAS | typeof TOBI | typeof ANJANATH | typeof BARIOTH | typeof NARGA | typeof TIGREX | typeof ZINOGRE | typeof NERGI): Record<string, Sprite> {
  const out: Record<string, Sprite> = {}
  for (const [id, action] of Object.entries(group.actions)) {
    out[id] = { palette: group.palette, anchorX: action.anchorX, frames: action.frames }
  }
  return out
}

export const ACTIONS = {
  ...withPalette(HUNTER),
  ...withPalette(CAMP),
  ...withPalette(VEL),
  ...withPalette(JAGRAS),
  ...withPalette(TOBI),
  ...withPalette(ANJANATH),
  ...withPalette(BARIOTH),
  ...withPalette(NARGA),
  ...withPalette(TIGREX),
  ...withPalette(ZINOGRE),
  ...withPalette(NERGI),
} as Record<ActionId, Sprite>
export { SCENES }
