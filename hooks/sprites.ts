import { CAMP } from './gen/camp'
import { HUNTER } from './gen/hunter'
import { SCENES } from './gen/scenes'
import { VEL } from './gen/vel'

/** A frame row run-length encoded: a palette letter or '.', then its count when over 1. */
export type RleRow = string

export type Sprite = {
  palette: Readonly<Record<string, string>>
  anchorX: number
  frames: readonly (readonly RleRow[])[]
}

export type ActionId = keyof typeof HUNTER.actions | keyof typeof CAMP.actions | keyof typeof VEL.actions
export type SceneId = keyof typeof SCENES

function withPalette(group: typeof HUNTER | typeof CAMP | typeof VEL): Record<string, Sprite> {
  const out: Record<string, Sprite> = {}
  for (const [id, action] of Object.entries(group.actions)) {
    out[id] = { palette: group.palette, anchorX: action.anchorX, frames: action.frames }
  }
  return out
}

export const ACTIONS = { ...withPalette(HUNTER), ...withPalette(CAMP), ...withPalette(VEL) } as Record<ActionId, Sprite>
export { SCENES }
