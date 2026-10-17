import { create } from 'zustand'
import { MODULE_BY_ID, FABRICS } from './data/modules'
import type { ArmStyle } from './model/parts'
import { PRESETS } from './data/presets'
import {
  footprint, rectsOverlap, rectInsideRoom, normalizeRoom, isValidRoom, ROOM_PRESETS, boundsOf, mirrorPlaced, rotatePlacedAbout,
  type Placed, type Pt, type Rect,
} from './model/geometry'

export type ViewMode = '2d' | '3d'
export type Style = 'sketch' | 'real'
export type EditMode = 'couch' | 'room'

export interface ExportPreview {
  kind: 'image' | 'text'
  data: string // data URL for images, plain text otherwise
  name: string // suggested file name
  title: string
}

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
  selected: string[]
  selectedWall: number | null
  fabricImage: string | null
  toast: string | null
  exportPreview: ExportPreview | null
  past: Design[]
  future: Design[]

  set: (patch: Partial<State>) => void
  showToast: (msg: string) => void
  commit: (patch: Partial<Design>) => void
  undo: () => void
  redo: () => void
  addModule: (defId: string, at?: Pt) => void
  addPreset: (id: string) => void
  updateModule: (uid: string, patch: Partial<Placed>, record?: boolean) => void
  setModules: (modules: Placed[], record?: boolean) => void
  select: (uid: string, additive?: boolean) => void
  selectAll: () => void
  clearSelection: () => void
  nudge: (dx: number, dy: number) => void
  rotateSelection: (dir?: 1 | -1) => void
  mirrorSelection: () => void
  removeSelection: () => void
  duplicateSelection: () => void
  snapshot: () => void
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

/** First spot (scanning from the top-left, or nearest to `prefer`) where a w x h box fits inside the room without overlaps. */
function freeSpot(s: Design, w: number, h: number, prefer?: Pt): Pt {
  const rects: Rect[] = s.modules.map(footprint)
  const xs = s.room.map((p) => p.x)
  const ys = s.room.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  let best: Pt | null = null
  let bestD = Infinity
  for (let y = minY + h / 2; y <= maxY - h / 2; y += 10) {
    for (let x = minX + w / 2; x <= maxX - w / 2; x += 10) {
      const r = { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 }
      if (!rectInsideRoom(r, s.room) || rects.some((o) => rectsOverlap(o, r))) continue
      if (!prefer) return { x, y }
      const d = Math.hypot(x - prefer.x, y - prefer.y)
      if (d < bestD) {
        bestD = d
        best = { x, y }
      }
    }
  }
  return best ?? prefer ?? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
let counter = Date.now() % 100000
const uid = () => `m${(counter++).toString(36)}`

export const useStore = create<State>((set, get) => ({
  ...loadSaved(),
  view: '2d',
  style: 'real',
  edit: 'couch',
  selected: [],
  selectedWall: null,
  fabricImage: null,
  toast: null,
  exportPreview: null,
  past: [],
  future: [],

  set: (patch) => set(patch),

  showToast: (msg) => {
    set({ toast: msg })
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => set({ toast: null }), 3200)
  },

  commit: (patch) => {
    const s = get()
    set({ ...patch, past: [...s.past.slice(-60), pick(s)], future: [] })
  },

  undo: () => {
    const s = get()
    const prev = s.past.at(-1)
    if (!prev) return
    set({ ...prev, past: s.past.slice(0, -1), future: [pick(s), ...s.future], selected: [], selectedWall: null })
  },

  redo: () => {
    const s = get()
    const next = s.future[0]
    if (!next) return
    set({ ...next, past: [...s.past, pick(s)], future: s.future.slice(1), selected: [], selectedWall: null })
  },

  addModule: (defId, at) => {
    const s = get()
    const def = MODULE_BY_ID[defId]
    const pos = at ?? freeSpot(s, def.width, def.depth)
    const m: Placed = { uid: uid(), defId, x: Math.round(pos.x), y: Math.round(pos.y), rot: 0 }
    get().commit({ modules: [...s.modules, m] })
    set({ selected: [m.uid], edit: 'couch' })
  },

  addPreset: (id) => {
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    const s = get()
    const parts = p.modules.map((m) => ({ ...m, uid: uid() }))
    const b = boundsOf(parts.map(footprint))!
    const c = freeSpot(s, b.x1 - b.x0, b.y1 - b.y0)
    const dx = Math.round(c.x - (b.x0 + b.x1) / 2)
    const dy = Math.round(c.y - (b.y0 + b.y1) / 2)
    const placed = parts.map((m) => ({ ...m, x: m.x + dx, y: m.y + dy }))
    get().commit({ modules: [...s.modules, ...placed] })
    set({ selected: placed.map((m) => m.uid), edit: 'couch' })
  },

  updateModule: (id, patch, record = true) => {
    const modules = get().modules.map((m) => (m.uid === id ? { ...m, ...patch } : m))
    if (record) get().commit({ modules })
    else set({ modules })
  },

  setModules: (modules, record = true) => {
    if (record) get().commit({ modules })
    else set({ modules })
  },

  select: (id, additive = false) => {
    const sel = get().selected
    if (additive) set({ selected: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] })
    else if (!sel.includes(id)) set({ selected: [id] })
  },

  selectAll: () => set({ selected: get().modules.map((m) => m.uid), edit: 'couch' }),
  clearSelection: () => set({ selected: [] }),

  nudge: (dx, dy) => {
    const sel = new Set(get().selected)
    get().commit({ modules: get().modules.map((m) => (sel.has(m.uid) ? { ...m, x: m.x + dx, y: m.y + dy } : m)) })
  },

  rotateSelection: (dir = 1) => {
    const s = get()
    const sel = new Set(s.selected)
    const group = s.modules.filter((m) => sel.has(m.uid))
    if (!group.length) return
    const b = boundsOf(group.map(footprint))!
    const c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
    const turned = new Map(group.map((m) => [m.uid, rotatePlacedAbout(m, c, dir)]))
    // Keep edges on whole centimetres after turning about a half-centimetre centre.
    const nb = boundsOf([...turned.values()].map(footprint))!
    let fx = Math.round(nb.x0) - nb.x0, fy = Math.round(nb.y0) - nb.y0
    // Turning a long group about its centre can swing it through a wall; nudge it back inside the room's extent.
    const xs = s.room.map((p) => p.x), ys = s.room.map((p) => p.y)
    const push = (lo: number, hi: number, min: number, max: number) => (hi - lo > max - min ? 0 : lo < min ? min - lo : hi > max ? max - hi : 0)
    fx += push(nb.x0 + fx, nb.x1 + fx, Math.min(...xs), Math.max(...xs))
    fy += push(nb.y0 + fy, nb.y1 + fy, Math.min(...ys), Math.max(...ys))
    get().commit({ modules: s.modules.map((m) => { const t = turned.get(m.uid); return t ? { ...t, x: t.x + fx, y: t.y + fy } : m }) })
  },

  mirrorSelection: () => {
    const s = get()
    const sel = new Set(s.selected)
    const group = s.modules.filter((m) => sel.has(m.uid))
    if (!group.length) return
    const b = boundsOf(group.map(footprint))!
    const axis = (b.x0 + b.x1) / 2
    get().commit({ modules: s.modules.map((m) => (sel.has(m.uid) ? mirrorPlaced(m, axis) : m)) })
  },

  removeSelection: () => {
    const sel = new Set(get().selected)
    if (!sel.size) return
    get().commit({ modules: get().modules.filter((m) => !sel.has(m.uid)) })
    set({ selected: [] })
  },

  duplicateSelection: () => {
    const s = get()
    const sel = new Set(s.selected)
    const group = s.modules.filter((m) => sel.has(m.uid))
    if (!group.length) return
    const b = boundsOf(group.map(footprint))!
    const c = freeSpot({ ...s, modules: s.modules }, b.x1 - b.x0, b.y1 - b.y0, { x: (b.x0 + b.x1) / 2 + (b.x1 - b.x0), y: (b.y0 + b.y1) / 2 })
    const dx = Math.round(c.x - (b.x0 + b.x1) / 2), dy = Math.round(c.y - (b.y0 + b.y1) / 2)
    const copies = group.map((m) => ({ ...m, uid: uid(), x: m.x + dx, y: m.y + dy }))
    get().commit({ modules: [...s.modules, ...copies] })
    set({ selected: copies.map((m) => m.uid) })
  },

  snapshot: () => set((st) => ({ past: [...st.past.slice(-60), pick(st)], future: [] })),

  setRoom: (pts, record = true) => {
    const clean = record ? normalizeRoom(pts) : pts
    if (!isValidRoom(clean)) return
    if (record) get().commit({ room: clean })
    else set({ room: clean })
  },

  loadDesign: (d) => {
    get().commit({ ...defaultDesign, ...d })
    set({ selected: [], selectedWall: null })
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
