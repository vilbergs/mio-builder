import { create } from 'zustand'
import { MODULE_BY_ID, FABRICS } from './data/modules'
import type { ArmStyle } from './model/parts'
import {
  footprint, rectsOverlap, rectInsideRoom, normalizeRoom, isValidRoom, ROOM_PRESETS,
  type Placed, type Pt, type Rot,
} from './model/geometry'

export type ViewMode = '2d' | '3d'
export type Style = 'sketch' | 'real'
export type EditMode = 'couch' | 'room'

export interface Design {
  room: Pt[]
  wallHeight: number
  modules: Placed[]
  armStyle: ArmStyle
  fabric: string // hex colour
}

interface State extends Design {
  view: ViewMode
  style: Style
  edit: EditMode
  selected: string | null
  selectedWall: number | null
  fabricImage: string | null
  past: Design[]
  future: Design[]

  set: (patch: Partial<State>) => void
  commit: (patch: Partial<Design>) => void
  undo: () => void
  redo: () => void
  addModule: (defId: string, at?: Pt) => void
  updateModule: (uid: string, patch: Partial<Placed>, record?: boolean) => void
  removeModule: (uid: string) => void
  rotate: (uid: string, dir?: 1 | -1) => void
  duplicate: (uid: string) => void
  setRoom: (pts: Pt[], record?: boolean) => void
  loadDesign: (d: Design) => void
}

const STORAGE_KEY = 'rossi-builder-design-v1'

const defaultDesign: Design = {
  room: ROOM_PRESETS.L.pts,
  wallHeight: 250,
  modules: [
    { uid: 'm1', defId: 's2-left', x: 111, y: 56, rot: 0 },
    { uid: 'm2', defId: 's2-none', x: 245, y: 56, rot: 0 },
    { uid: 'm3', defId: 'corner', x: 363, y: 55, rot: 90 },
    { uid: 'm4', defId: 's15-right', x: 364, y: 171, rot: 90 },
  ],
  armStyle: 'B',
  fabric: FABRICS[0].color,
}

function loadSaved(): Design {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultDesign
    const d = JSON.parse(raw) as Design
    if (!Array.isArray(d.room) || !Array.isArray(d.modules)) return defaultDesign
    return { ...defaultDesign, ...d, modules: d.modules.filter((m) => MODULE_BY_ID[m.defId]) }
  } catch {
    return defaultDesign
  }
}

function pick(s: Design): Design {
  return { room: s.room, wallHeight: s.wallHeight, modules: s.modules, armStyle: s.armStyle, fabric: s.fabric }
}

let counter = Date.now() % 100000
const uid = () => `m${(counter++).toString(36)}`

export const useStore = create<State>((set, get) => ({
  ...loadSaved(),
  view: '2d',
  style: 'real',
  edit: 'couch',
  selected: null,
  selectedWall: null,
  fabricImage: null,
  past: [],
  future: [],

  set: (patch) => set(patch),

  commit: (patch) => {
    const s = get()
    set({ ...patch, past: [...s.past.slice(-60), pick(s)], future: [] })
  },

  undo: () => {
    const s = get()
    const prev = s.past.at(-1)
    if (!prev) return
    set({ ...prev, past: s.past.slice(0, -1), future: [pick(s), ...s.future], selected: null, selectedWall: null })
  },

  redo: () => {
    const s = get()
    const next = s.future[0]
    if (!next) return
    set({ ...next, past: [...s.past, pick(s)], future: s.future.slice(1), selected: null, selectedWall: null })
  },

  addModule: (defId, at) => {
    const s = get()
    const def = MODULE_BY_ID[defId]
    const rects = s.modules.map(footprint)
    let pos = at
    if (!pos) {
      // Scan the room for the first free spot, starting top-left.
      const xs = s.room.map((p) => p.x)
      const ys = s.room.map((p) => p.y)
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
      outer: for (let y = minY + def.depth / 2; y <= maxY - def.depth / 2; y += 10) {
        for (let x = minX + def.width / 2; x <= maxX - def.width / 2; x += 10) {
          const r = { x0: x - def.width / 2, y0: y - def.depth / 2, x1: x + def.width / 2, y1: y + def.depth / 2 }
          if (rectInsideRoom(r, s.room) && !rects.some((o) => rectsOverlap(o, r))) {
            pos = { x, y }
            break outer
          }
        }
      }
      pos ??= { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
    }
    const m: Placed = { uid: uid(), defId, x: Math.round(pos.x), y: Math.round(pos.y), rot: 0 }
    get().commit({ modules: [...s.modules, m] })
    set({ selected: m.uid, edit: 'couch' })
  },

  updateModule: (id, patch, record = true) => {
    const modules = get().modules.map((m) => (m.uid === id ? { ...m, ...patch } : m))
    if (record) get().commit({ modules })
    else set({ modules })
  },

  removeModule: (id) => {
    get().commit({ modules: get().modules.filter((m) => m.uid !== id) })
    set({ selected: null })
  },

  rotate: (id, dir = 1) => {
    const m = get().modules.find((x) => x.uid === id)
    if (!m) return
    const rot = (((m.rot + dir * 90) % 360) + 360) % 360 as Rot
    get().updateModule(id, { rot })
  },

  duplicate: (id) => {
    const m = get().modules.find((x) => x.uid === id)
    if (!m) return
    const r = footprint(m)
    const copy = { ...m, uid: uid(), x: m.x + (r.x1 - r.x0), y: m.y }
    get().commit({ modules: [...get().modules, copy] })
    set({ selected: copy.uid })
  },

  setRoom: (pts, record = true) => {
    const clean = record ? normalizeRoom(pts) : pts
    if (!isValidRoom(clean)) return
    if (record) get().commit({ room: clean })
    else set({ room: clean })
  },

  loadDesign: (d) => {
    get().commit({ ...defaultDesign, ...d })
    set({ selected: null, selectedWall: null })
  },
}))

useStore.subscribe((s) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pick(s)))
  } catch {
    // storage unavailable: the design just won't survive a reload
  }
})

export function moduleIssues(modules: Placed[], room: Pt[]): Set<string> {
  const bad = new Set<string>()
  const rects = modules.map(footprint)
  modules.forEach((m, i) => {
    if (!rectInsideRoom(rects[i], room)) bad.add(m.uid)
    for (let j = i + 1; j < modules.length; j++) {
      if (rectsOverlap(rects[i], rects[j])) {
        bad.add(m.uid)
        bad.add(modules[j].uid)
      }
    }
  })
  return bad
}
