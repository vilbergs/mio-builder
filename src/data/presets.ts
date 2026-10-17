import { mirrorPlaced, footprint, boundsOf, type Placed } from '../model/geometry'

// Mio's ready-made Rossi sofas, rebuilt from the individual modules.
// Positions are footprint centres in cm with the back against y = 0.
export interface Preset {
  id: string
  name: string
  note?: string
  modules: Omit<Placed, 'uid'>[]
}

const base: Preset[] = [
  { id: 'sofa2', name: '2-sits soffa', modules: [{ defId: 's2-both', x: 79, y: 56, rot: 0 }] },
  { id: 'sofa3', name: '3-sits soffa', note: 'Mio lists 242 cm', modules: [{ defId: 's15-left', x: 61, y: 56, rot: 0 }, { defId: 's15-right', x: 183, y: 56, rot: 0 }] },
  { id: 'sofa4', name: '4-sits soffa', note: 'Mio lists 282 cm', modules: [{ defId: 's2-left', x: 71, y: 56, rot: 0 }, { defId: 's2-right', x: 213, y: 56, rot: 0 }] },
  { id: 'chaise2-r', name: '2-sits med schäslong XL höger', modules: [{ defId: 's2-left', x: 71, y: 56, rot: 0 }, { defId: 'chaise-right', x: 213, y: 95, rot: 0 }] },
  { id: 'chaise4-r', name: '4-sits med schäslong XL höger', modules: [{ defId: 's2-left', x: 71, y: 56, rot: 0 }, { defId: 's2-none', x: 205, y: 56, rot: 0 }, { defId: 'chaise-right', x: 339, y: 95, rot: 0 }] },
  {
    id: 'corner-r', name: 'Hörnsoffa med divan höger', note: 'Mio lists about 380 × 250 cm',
    modules: [
      { defId: 's2-left', x: 71, y: 56, rot: 0 },
      { defId: 's2-none', x: 205, y: 56, rot: 0 },
      { defId: 'corner', x: 323, y: 55, rot: 90 },
      { defId: 's2-right', x: 324, y: 181, rot: 90 },
    ],
  },
]

function mirrored(p: Preset): Preset {
  const b = boundsOf(p.modules.map((m) => footprint({ ...m, uid: '' })))!
  const axis = (b.x0 + b.x1) / 2
  return {
    ...p,
    id: p.id.replace(/-r$/, '-l'),
    name: p.name.replace('höger', 'vänster'),
    modules: p.modules.map((m) => {
      const r = mirrorPlaced({ ...m, uid: '' }, axis)
      return { defId: r.defId, x: r.x, y: r.y, rot: r.rot }
    }),
  }
}

export const PRESETS: Preset[] = base.flatMap((p) => (p.id.endsWith('-r') ? [p, mirrored(p)] : [p]))
