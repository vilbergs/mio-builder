import { mirrorPlaced, footprint, boundsOf, type Placed, type Rot } from '../model/geometry'
import { MODULE_BY_ID, type Price } from './modules'

// Mio's ready-made Rossi sofas from the price list, rebuilt from the individual modules.
// Positions are footprint centres in cm with the back against y = 0.
export interface Preset {
  id: string
  name: string
  /** Size Mio lists for the package (width x depth). */
  listed: string
  /** Mio sells the package at this price, often below the sum of its modules. */
  price: Price
  modules: Omit<Placed, 'uid'>[]
}

const P = (zoom: number, alex: number, grand: number, saleZoom: number, saleAlex: number): Price => ({ zoom, alex, grand, sale: { zoom: saleZoom, alex: saleAlex } })

/** Place a module by the top-left corner of its footprint. */
function at(defId: string, x0: number, y0: number, rot: Rot = 0): Omit<Placed, 'uid'> {
  const d = MODULE_BY_ID[defId]
  const turned = rot === 90 || rot === 270
  const w = turned ? d.depth : d.width
  const h = turned ? d.width : d.depth
  return { defId, x: x0 + w / 2, y: y0 + h / 2, rot }
}

/** Modules side by side along the back wall, left to right. */
function row(ids: string[], x0 = 0): Omit<Placed, 'uid'>[] {
  let x = x0
  return ids.map((id) => {
    const m = at(id, x, 0)
    x += MODULE_BY_ID[id].width
    return m
  })
}

/** A seat module running down the right-hand side under a corner that ends at x1. */
// Lined up with the corner's inner edge; Mio's corner is 2 cm shallower than a seat, so the seat overhangs it by 2 cm.
const downRight = (id: string, x1: number) => at(id, x1 - 110, 110, 90)

const base: Preset[] = [
  { id: 'sofa3', name: '3-sits soffa', listed: '242 × 112', price: P(14990, 16990, 19990, 12990, 13990), modules: row(['s3-both']) },
  { id: 'sofa4', name: '4-sits soffa', listed: '282 × 112', price: P(15990, 17990, 20990, 13990, 14990), modules: row(['s2-left', 's2-right']) },
  { id: 'chaise2-r', name: '2-sits soffa med schäslong XL höger', listed: '284 × 112–190', price: P(18495, 19995, 23495, 16495, 17495), modules: row(['s2-left', 'chaise-right']) },
  { id: 'chaise3-l', name: '3-sits soffa med schäslong vänster', listed: '350 × 112–190', price: P(22995, 25495, 29995, 19995, 21495), modules: row(['chaisesm-left', 's15-none', 's15-right']) },
  { id: 'chaise4-r', name: '4-sits soffa med schäslong XL höger', listed: '410 × 112–190', price: P(25990, 28490, 32990, 22990, 24490), modules: row(['s2-left', 's2-none', 'chaise-right']) },
  {
    id: 'divan2-r', name: '2-sits soffa med divan höger', listed: '254 × 112/250', price: P(21495, 23495, 27995, 18995, 20495),
    modules: [...row(['s2-left', 'corner']), downRight('s2-right', 252)],
  },
  {
    id: 'divan3-r', name: '3-sits soffa med divan höger', listed: '340 × 112–250', price: P(27990, 30990, 36490, 24490, 26490),
    modules: [...row(['s15-left', 's15-none', 'corner']), downRight('s2-right', 338)],
  },
  {
    id: 'divan4-r', name: '4-sits soffa med divan höger', listed: '380 × 112–250', price: P(28990, 31990, 37490, 25490, 27490),
    modules: [...row(['s2-left', 's2-none', 'corner']), downRight('s2-right', 378)],
  },
]

function mirrored(p: Preset): Preset {
  const b = boundsOf(p.modules.map((m) => footprint({ ...m, uid: '' })))!
  const axis = (b.x0 + b.x1) / 2
  const swap = (t: string) => (t.endsWith('-r') ? t.replace(/-r$/, '-l') : t.replace(/-l$/, '-r'))
  return {
    ...p,
    id: swap(p.id),
    name: p.name.includes('höger') ? p.name.replace('höger', 'vänster') : p.name.replace('vänster', 'höger'),
    modules: p.modules.map((m) => {
      const r = mirrorPlaced({ ...m, uid: '' }, axis)
      return { defId: r.defId, x: r.x, y: r.y, rot: r.rot }
    }),
  }
}

export const PRESETS: Preset[] = base.flatMap((p) => (/-[rl]$/.test(p.id) ? [p, mirrored(p)] : [p]))

/** The package whose modules exactly match these, if any (so its package price applies). */
export function matchPreset(defIds: string[]): Preset | null {
  const key = (ids: string[]) => [...ids].sort().join('|')
  const k = key(defIds)
  return PRESETS.find((p) => key(p.modules.map((m) => m.defId)) === k) ?? null
}
