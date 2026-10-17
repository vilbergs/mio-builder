import { ROSSI, type ModuleDef } from '../data/modules'

export type ArmStyle = 'A' | 'B'
export type PartKind = 'leg' | 'base' | 'back' | 'arm' | 'seat' | 'backCushion'

// A box in module-local coordinates (cm): x across the width, y from back (0) to front (depth), z up.
export interface Part {
  kind: PartKind
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
  r: number // corner radius
}

const LEG = ROSSI.legHeight
const BASE_TOP = 28
const SEAT_TOP = ROSSI.seatHeight + 2 // cushions sit slightly proud of the nominal seat height
const BACK_FRAME = 16
const BACK_CUSHION = 26
const BACK_FRAME_TOP = 64
const BACK_TOP = ROSSI.height - 2

function box(kind: PartKind, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, r = 3): Part {
  return { kind, x0, x1, y0, y1, z0, z1, r }
}

function legs(w: number, d: number): Part[] {
  const s = 5
  const i = 5
  return [
    box('leg', i, i + s, i, i + s, 0, LEG, 0.5),
    box('leg', w - i - s, w - i, i, i + s, 0, LEG, 0.5),
    box('leg', i, i + s, d - i - s, d - i, 0, LEG, 0.5),
    box('leg', w - i - s, w - i, d - i - s, d - i, 0, LEG, 0.5),
  ]
}

function arm(x0: number, x1: number, d: number, style: ArmStyle): Part {
  return style === 'A'
    ? box('arm', x0, x1, 0, d - 14, LEG, 58, 6)
    : box('arm', x0, x1, 0, d, LEG, 62, 4)
}

/** Split a span into roughly equal cushions no wider than maxW. */
function cushions(kind: PartKind, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, maxW: number, r: number): Part[] {
  const n = Math.max(1, Math.round((x1 - x0) / maxW))
  const w = (x1 - x0) / n
  return Array.from({ length: n }, (_, k) => box(kind, x0 + k * w + 0.4, x0 + (k + 1) * w - 0.4, y0, y1, z0, z1, r))
}

export function moduleParts(def: ModuleDef, armStyle: ArmStyle): Part[] {
  const w = def.width
  const d = def.depth
  const A = ROSSI.armWidth
  const parts: Part[] = [...legs(w, d)]

  if (def.kind === 'footstool') {
    parts.push(box('base', 0, w, 0, d, LEG, BASE_TOP, 3))
    parts.push(box('seat', 0.5, w - 0.5, 0.5, d - 0.5, BASE_TOP - 2, def.height, 6))
    return parts
  }

  const left = def.arms === 'left' || def.arms === 'both'
  const right = def.arms === 'right' || def.arms === 'both'
  const sx0 = left ? A : 0
  const sx1 = right ? w - A : w

  parts.push(box('base', 0, w, 0, d, LEG, BASE_TOP, 2))

  if (def.kind === 'corner') {
    // Back along y=0 and along x=0.
    parts.push(box('back', 0, w, 0, BACK_FRAME, LEG, BACK_FRAME_TOP, 3))
    parts.push(box('back', 0, BACK_FRAME, 0, d, LEG, BACK_FRAME_TOP, 3))
    parts.push(box('seat', BACK_FRAME + BACK_CUSHION, w, BACK_FRAME + BACK_CUSHION, d, BASE_TOP - 2, SEAT_TOP, 6))
    parts.push(box('seat', BACK_FRAME, BACK_FRAME + BACK_CUSHION, BACK_FRAME + BACK_CUSHION, d, BASE_TOP - 2, SEAT_TOP, 6))
    parts.push(box('seat', BACK_FRAME + BACK_CUSHION, w, BACK_FRAME, BACK_FRAME + BACK_CUSHION, BASE_TOP - 2, SEAT_TOP, 6))
    parts.push(box('backCushion', BACK_FRAME, w, BACK_FRAME, BACK_FRAME + BACK_CUSHION, SEAT_TOP - 2, BACK_TOP, 9))
    parts.push(box('backCushion', BACK_FRAME, BACK_FRAME + BACK_CUSHION, BACK_FRAME + BACK_CUSHION, d, SEAT_TOP - 2, BACK_TOP, 9))
    return parts
  }

  parts.push(box('back', sx0, sx1, 0, BACK_FRAME, LEG, BACK_FRAME_TOP, 3))
  if (left) parts.push(arm(0, A, d, armStyle))
  if (right) parts.push(arm(w - A, w, d, armStyle))

  const seatY0 = BACK_FRAME + BACK_CUSHION
  if (def.kind === 'chaise') {
    parts.push(box('seat', sx0, sx1, seatY0, d, BASE_TOP - 2, SEAT_TOP, 6))
  } else {
    parts.push(...cushions('seat', sx0, sx1, seatY0 - 4, d, BASE_TOP - 2, SEAT_TOP, 130, 6))
  }
  parts.push(...cushions('backCushion', sx0, sx1, BACK_FRAME, seatY0, SEAT_TOP - 2, BACK_TOP, 80, 9))
  return parts
}
