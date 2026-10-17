import type { Pt, Rect, Rot } from '../model/geometry'

export type ItemShape = 'cabinet' | 'table' | 'round' | 'chair' | 'plant' | 'rug' | 'tv' | 'pillar' | 'stove' | 'lamp' | 'spot'

export interface FurnitureDef {
  id: string
  name: string
  shape: ItemShape
  width: number // cm, along the front
  depth: number
  height: number
  color: string
  /** Height of the underside above the floor, for things hung on a wall. */
  elevation?: number
}

/** Other furniture in the room, placed like a module but with its own size and colour. */
export interface Item {
  uid: string
  type: string // FurnitureDef id
  name: string
  x: number // footprint centre, cm
  y: number
  rot: Rot // 0 = back towards the top of the plan, like modules
  w: number
  d: number
  h: number
  z: number // underside above the floor, cm
  color: string
}

export const FURNITURE: FurnitureDef[] = [
  { id: 'wardrobe', name: 'Wardrobe', shape: 'cabinet', width: 100, depth: 60, height: 200, color: '#ebe6dc' },
  { id: 'bookcase', name: 'Bookcase', shape: 'cabinet', width: 80, depth: 30, height: 200, color: '#d8c19c' },
  { id: 'sideboard', name: 'Sideboard', shape: 'cabinet', width: 160, depth: 45, height: 80, color: '#b8875a' },
  { id: 'tv-bench', name: 'TV bench', shape: 'cabinet', width: 180, depth: 40, height: 45, color: '#3d3a36' },
  { id: 'coffee-table', name: 'Coffee table', shape: 'table', width: 110, depth: 60, height: 42, color: '#b88b5e' },
  { id: 'side-table', name: 'Side table', shape: 'round', width: 45, depth: 45, height: 55, color: '#a07a52' },
  { id: 'dining-table', name: 'Dining table', shape: 'table', width: 180, depth: 90, height: 75, color: '#c9a77f' },
  { id: 'desk', name: 'Desk', shape: 'table', width: 140, depth: 70, height: 75, color: '#e2ddd3' },
  { id: 'armchair', name: 'Armchair', shape: 'chair', width: 80, depth: 85, height: 80, color: '#8d9187' },
  { id: 'chair', name: 'Chair', shape: 'chair', width: 45, depth: 52, height: 85, color: '#6f5a46' },
  { id: 'plant', name: 'Plant', shape: 'plant', width: 45, depth: 45, height: 110, color: '#5f7d4f' },
  { id: 'tv', name: '65" TV', shape: 'tv', width: 145, depth: 6, height: 83, color: '#1c1c1e', elevation: 105 },
  { id: 'chimney', name: 'Chimney', shape: 'pillar', width: 45, depth: 120, height: 250, color: '#f6f5f1' },
  { id: 'stove', name: 'Wood stove', shape: 'stove', width: 47, depth: 46, height: 140, color: '#8f918c' },
  { id: 'pendant', name: 'Ceiling lamp', shape: 'lamp', width: 40, depth: 40, height: 28, color: '#efe9dc', elevation: 175 },
  { id: 'spot', name: 'Ceiling spotlight', shape: 'spot', width: 10, depth: 10, height: 2, color: '#f2f0ec', elevation: 248 },
  { id: 'rug', name: 'Rug', shape: 'rug', width: 200, depth: 300, height: 1, color: '#d6c8b1' },
]

export const FURNITURE_BY_ID: Record<string, FurnitureDef> = Object.fromEntries(FURNITURE.map((f) => [f.id, f]))

export const shapeOf = (it: Item): ItemShape => FURNITURE_BY_ID[it.type]?.shape ?? 'cabinet'

export function itemFootprint(it: Item): Rect {
  const swap = it.rot === 90 || it.rot === 270
  const w = swap ? it.d : it.w
  const h = swap ? it.w : it.d
  return { x0: it.x - w / 2, y0: it.y - h / 2, x1: it.x + w / 2, y1: it.y + h / 2 }
}

/** Map an item-local point (origin top-left of the unrotated footprint, y = 0 at the back) to plan coordinates. */
export function itemToPlan(it: Item, lx: number, ly: number): Pt {
  const cx = lx - it.w / 2
  const cy = ly - it.d / 2
  const t = (it.rot * Math.PI) / 180
  const c = Math.round(Math.cos(t))
  const s = Math.round(Math.sin(t))
  return { x: it.x + cx * c - cy * s, y: it.y + cx * s + cy * c }
}

/** Whether two pieces of furniture may share floor space (when they're at the same height): rugs lie under everything, chairs tuck under tables. */
export function canOverlap(a: ItemShape | 'module', b: ItemShape | 'module'): boolean {
  if (a === 'rug' || b === 'rug') return true
  return (a === 'chair' && b === 'table') || (a === 'table' && b === 'chair')
}

/** Parts of an item seen from above, in item-local cm. `tone` shades the item's colour. */
export interface ItemPart {
  kind: 'rect' | 'ellipse'
  x0: number
  y0: number
  x1: number
  y1: number
  tone: number
  r?: number
  dashed?: boolean
}

export function itemParts2D(it: Item): ItemPart[] {
  const { w, d } = it
  const rect = (x0: number, y0: number, x1: number, y1: number, tone = 0, r = 2): ItemPart => ({ kind: 'rect', x0, y0, x1, y1, tone, r })
  switch (shapeOf(it)) {
    case 'cabinet':
      // A darker strip marks the front, so you can tell which way it opens.
      return [rect(0, 0, w, d, 0, 1), rect(2, d - Math.min(5, d / 4), w - 2, d - 1, -0.25, 1)]
    case 'table':
      return [rect(0, 0, w, d, 0, 4), { ...rect(5, 5, w - 5, d - 5, 0.12, 2), dashed: true }]
    case 'round':
      return [{ kind: 'ellipse', x0: 0, y0: 0, x1: w, y1: d, tone: 0 }, { kind: 'ellipse', x0: w * 0.3, y0: d * 0.3, x1: w * 0.7, y1: d * 0.7, tone: 0.12 }]
    case 'chair': {
      const arm = w >= 70 ? Math.min(14, w * 0.18) : 0
      const back = Math.min(16, d * 0.22)
      const parts = [rect(0, 0, w, back, -0.2, 3), rect(arm, back, w - arm, d, 0.08, 4)]
      if (arm) parts.push(rect(0, back, arm, d, -0.1, 3), rect(w - arm, back, w, d, -0.1, 3))
      return parts
    }
    case 'plant':
      return [
        { kind: 'ellipse', x0: w * 0.2, y0: d * 0.2, x1: w * 0.8, y1: d * 0.8, tone: -0.2 },
        { kind: 'ellipse', x0: 0, y0: d * 0.1, x1: w * 0.65, y1: d * 0.75, tone: 0 },
        { kind: 'ellipse', x0: w * 0.35, y0: 0, x1: w, y1: d * 0.65, tone: 0.1 },
        { kind: 'ellipse', x0: w * 0.25, y0: d * 0.35, x1: w * 0.95, y1: d, tone: -0.08 },
      ]
    case 'rug':
      return [rect(0, 0, w, d, 0, 2), { ...rect(8, 8, w - 8, d - 8, -0.12, 1), dashed: true }]
    case 'stove':
      // Soapstone body with the black door at the front.
      return [rect(0, 0, w, d, 0, Math.min(w, d) / 3), rect(w * 0.18, d * 0.55, w * 0.82, d, -0.75, 2)]
    case 'spot':
      return [{ kind: 'ellipse', x0: 0, y0: 0, x1: w, y1: d, tone: 0 }, { kind: 'ellipse', x0: w * 0.25, y0: d * 0.25, x1: w * 0.75, y1: d * 0.75, tone: 0.2 }]
    case 'lamp':
      return [{ kind: 'ellipse', x0: 0, y0: 0, x1: w, y1: d, tone: 0 }, { kind: 'ellipse', x0: w * 0.36, y0: d * 0.36, x1: w * 0.64, y1: d * 0.64, tone: 0.3 }]
    case 'tv':
    case 'pillar':
      return [rect(0, 0, w, d, 0, 1)]
  }
}
