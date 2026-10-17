import { create } from 'zustand'
import { MODULE_BY_ID, FABRICS, type FabricGroup } from './data/modules'
import type { ArmStyle } from './model/parts'
import { PRESETS, CORNER_LAYOUTS, type CornerLayout } from './data/presets'
import { FURNITURE_BY_ID, itemFootprint, shapeOf, canOverlap, type Item } from './data/furniture'
import {
  footprint, rectsOverlap, rectInsideRoom, normalizeRoom, isValidRoom, ROOM_PRESETS, boundsOf, mirrorPlaced, rotatePlacedAbout, snapGroupDelta,
  reattachOpenings, fitOpening, walls, OPENING_DEFAULTS, doorSwing, cornerAnchor,
  type Placed, type Pt, type Rect, type Opening,
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
  openings: Opening[]
  wallHeight: number
  modules: Placed[]
  items: Item[]
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
  showPillows: boolean
  fabricGroup: FabricGroup
  toast: string | null
  exportPreview: ExportPreview | null
  dragOpenings: Opening[] | null
  past: Design[]
  future: Design[]

  set: (patch: Partial<State>) => void
  showToast: (msg: string) => void
  commit: (patch: Partial<Design>) => void
  undo: () => void
  redo: () => void
  addModule: (defId: string, at?: Pt) => void
  addPreset: (id: string) => void
  /** Replace the couch with a corner layout, placed in the room's best corner. */
  applyLayout: (id: string) => void
  updateModule: (uid: string, patch: Partial<Placed>, record?: boolean) => void
  setModules: (modules: Placed[], record?: boolean) => void
  addItem: (type: string, at?: Pt) => void
  updateItem: (uid: string, patch: Partial<Item>) => void
  /** Live drag: move `base` (the dragged pieces as they were at the start) by `delta`, snapping to walls and other pieces. */
  dragPieces: (base: { modules: Placed[]; items: Item[] }, delta: Pt, threshold: number) => void
  select: (uid: string, additive?: boolean) => void
  selectAll: () => void
  clearSelection: () => void
  nudge: (dx: number, dy: number) => void
  rotateSelection: (dir?: 1 | -1) => void
  mirrorSelection: () => void
  removeSelection: () => void
  duplicateSelection: () => void
  snapshot: () => void
  setRoom: (pts: Pt[], record?: boolean, base?: Pt[]) => void
  addOpening: (kind: Opening['kind'], wall: number) => void
  updateOpening: (id: string, patch: Partial<Opening>) => void
  removeOpening: (id: string) => void
  loadDesign: (d: Design) => boolean
}

const STORAGE_KEY = 'rossi-builder-design-v1'

let counter = 0
// Random part keeps ids unique against ones saved in earlier sessions or imported files.
const uid = () => `m${Math.random().toString(36).slice(2, 8)}${(counter++).toString(36)}`

const defaultDesign: Design = {
  room: ROOM_PRESETS.alcove.pts,
  openings: [
    { id: 'o1', kind: 'window', wall: 0, offset: 30, width: 140 },
    { id: 'o2', kind: 'door', wall: 4, offset: 40, width: 90 },
  ],
  wallHeight: 250,
  modules: [
    // Mio's 2-sits soffa med schäslong XL vänster, in the north-west corner of the main room.
    { uid: 'm1', defId: 'chaise-left', x: 71, y: 295, rot: 0 },
    { uid: 'm2', defId: 's2-right', x: 213, y: 256, rot: 0 },
  ],
  items: [],
  armStyle: 'B',
  fabric: FABRICS[0].color,
}

function loadSaved(): Design {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultDesign
    const d = JSON.parse(raw) as Design
    if (!Array.isArray(d.room) || !Array.isArray(d.modules)) return defaultDesign
    return { ...defaultDesign, ...d, openings: d.openings ?? [], modules: d.modules.filter((m) => MODULE_BY_ID[m.defId]), items: cleanItems(d.items) }
  } catch {
    return defaultDesign
  }
}

function cleanItems(items: unknown): Item[] {
  if (!Array.isArray(items)) return []
  return items.flatMap((it: Item) => {
    if (!it || !Number.isFinite(it.x) || !Number.isFinite(it.y)) return []
    const def = FURNITURE_BY_ID[it.type]
    const size = (v: number, fallback: number) => (Number.isFinite(v) && v >= 1 ? v : fallback)
    return [{
      uid: typeof it.uid === 'string' && it.uid ? it.uid : uid(),
      type: def ? it.type : 'wardrobe',
      name: typeof it.name === 'string' ? it.name.slice(0, 60) : def?.name ?? 'Item',
      x: it.x,
      y: it.y,
      rot: ([0, 90, 180, 270].includes(it.rot) ? it.rot : 0) as Placed['rot'],
      w: size(it.w, def?.width ?? 60),
      d: size(it.d, def?.depth ?? 60),
      h: size(it.h, def?.height ?? 80),
      color: /^#[0-9a-f]{6}$/i.test(it.color) ? it.color : def?.color ?? '#cccccc',
    }]
  })
}

function pick(s: Design): Design {
  return { room: s.room, openings: s.openings, wallHeight: s.wallHeight, modules: s.modules, items: s.items, armStyle: s.armStyle, fabric: s.fabric }
}

/** Footprints of everything standing on the floor (rugs don't block anything). */
function solidRects(s: Design, skip?: Set<string>): Rect[] {
  return [
    ...s.modules.filter((m) => !skip?.has(m.uid)).map(footprint),
    ...s.items.filter((it) => !skip?.has(it.uid) && shapeOf(it) !== 'rug').map(itemFootprint),
  ]
}

/** A corner layout's modules placed in the room's best corner, or null if it doesn't fit with its backs against the walls. */
export function placeLayout(l: CornerLayout, room: Pt[], openings: Opening[] = []): Placed[] | null {
  const c = cornerAnchor(room)
  if (!c) return null
  const modules = l.modules.map((m, i) => ({ ...m, uid: `${l.id}-${i}`, x: m.x + c.at.x, y: m.y + c.at.y }))
  const b = boundsOf(modules.filter((m) => MODULE_BY_ID[m.defId].kind !== 'footstool').map(footprint))!
  if (b.x1 > c.at.x + c.east || b.y1 > c.at.y + c.south) return null
  return moduleIssues(modules, room, openings).size ? null : modules
}

/** Bounds of the selected modules and items together. */
export function selectionBounds(s: Design, selected: string[]): Rect | null {
  const sel = new Set(selected)
  return boundsOf([...s.modules.filter((m) => sel.has(m.uid)).map(footprint), ...s.items.filter((it) => sel.has(it.uid)).map(itemFootprint)])
}

const turnItem = (it: Item, c: Pt, dir: 1 | -1): Item => {
  const dx = it.x - c.x, dy = it.y - c.y
  return { ...it, rot: ((((it.rot + dir * 90) % 360) + 360) % 360) as Placed['rot'], x: c.x - dir * dy, y: c.y + dir * dx }
}

/** First spot (scanning from the top-left, or nearest to `prefer`) where a w x h box fits inside the room without overlaps. */
function freeSpot(s: Design, w: number, h: number, prefer?: Pt): Pt {
  const swings = s.openings.map((o) => doorSwing(o, s.room)).filter((r): r is Rect => r !== null)
  const rects: Rect[] = [...solidRects(s), ...swings]
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

export const useStore = create<State>((set, get) => ({
  ...loadSaved(),
  view: '2d',
  style: 'real',
  edit: 'couch',
  selected: [],
  selectedWall: null,
  fabricImage: null,
  showPillows: true,
  fabricGroup: 'alex',
  toast: null,
  exportPreview: null,
  dragOpenings: null,
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

  applyLayout: (id) => {
    const s = get()
    const l = CORNER_LAYOUTS.find((x) => x.id === id)
    const placed = l && placeLayout(l, s.room, s.openings)
    if (!placed) return s.showToast("That layout doesn't fit this room's corner.")
    const modules = placed.map((m) => ({ ...m, uid: uid() }))
    get().commit({ modules })
    set({ selected: [], edit: 'couch' })
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

  addItem: (type, at) => {
    const s = get()
    const def = FURNITURE_BY_ID[type]
    if (!def) return
    const pos = at ?? freeSpot(s, def.width, def.depth)
    const it: Item = { uid: uid(), type, name: def.name, x: Math.round(pos.x), y: Math.round(pos.y), rot: 0, w: def.width, d: def.depth, h: def.height, color: def.color }
    get().commit({ items: [...s.items, it] })
    set({ selected: [it.uid], edit: 'couch' })
  },

  updateItem: (id, patch) => get().commit({ items: get().items.map((it) => (it.uid === id ? { ...it, ...patch } : it)) }),

  dragPieces: (base, delta, threshold) => {
    const s = get()
    const ids = new Set([...base.modules.map((m) => m.uid), ...base.items.map((it) => it.uid)])
    const rects = [...base.modules.map(footprint), ...base.items.map(itemFootprint)]
    if (!rects.length) return
    const d = snapGroupDelta(rects, delta, solidRects(s, ids), s.room, threshold)
    const half = (v: number) => Math.round(v * 2) / 2
    const mods = new Map(base.modules.map((m) => [m.uid, { ...m, x: half(m.x + d.x), y: half(m.y + d.y) }]))
    const its = new Map(base.items.map((it) => [it.uid, { ...it, x: half(it.x + d.x), y: half(it.y + d.y) }]))
    set({ modules: s.modules.map((m) => mods.get(m.uid) ?? m), items: s.items.map((it) => its.get(it.uid) ?? it) })
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
    const move = <T extends { uid: string; x: number; y: number }>(p: T): T => (sel.has(p.uid) ? { ...p, x: p.x + dx, y: p.y + dy } : p)
    get().commit({ modules: get().modules.map(move), items: get().items.map(move) })
  },

  rotateSelection: (dir = 1) => {
    const s = get()
    const sel = new Set(s.selected)
    const b = selectionBounds(s, s.selected)
    if (!b) return
    const c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
    const turned = new Map(s.modules.filter((m) => sel.has(m.uid)).map((m) => [m.uid, rotatePlacedAbout(m, c, dir)]))
    const turnedItems = new Map(s.items.filter((it) => sel.has(it.uid)).map((it) => [it.uid, turnItem(it, c, dir)]))
    // Keep edges on whole centimetres after turning about a half-centimetre centre.
    const nb = boundsOf([...[...turned.values()].map(footprint), ...[...turnedItems.values()].map(itemFootprint)])!
    let fx = Math.round(nb.x0) - nb.x0, fy = Math.round(nb.y0) - nb.y0
    // Turning a long group about its centre can swing it through a wall; nudge it back inside the room's extent.
    const xs = s.room.map((p) => p.x), ys = s.room.map((p) => p.y)
    const push = (lo: number, hi: number, min: number, max: number) => (hi - lo > max - min ? 0 : lo < min ? min - lo : hi > max ? max - hi : 0)
    fx += push(nb.x0 + fx, nb.x1 + fx, Math.min(...xs), Math.max(...xs))
    fy += push(nb.y0 + fy, nb.y1 + fy, Math.min(...ys), Math.max(...ys))
    get().commit({
      modules: s.modules.map((m) => { const t = turned.get(m.uid); return t ? { ...t, x: t.x + fx, y: t.y + fy } : m }),
      items: s.items.map((it) => { const t = turnedItems.get(it.uid); return t ? { ...t, x: t.x + fx, y: t.y + fy } : it }),
    })
  },

  mirrorSelection: () => {
    const s = get()
    const sel = new Set(s.selected)
    const b = selectionBounds(s, s.selected)
    if (!b) return
    const axis = (b.x0 + b.x1) / 2
    get().commit({
      modules: s.modules.map((m) => (sel.has(m.uid) ? mirrorPlaced(m, axis) : m)),
      items: s.items.map((it) => (sel.has(it.uid) ? { ...it, x: 2 * axis - it.x, rot: ((360 - it.rot) % 360) as Placed['rot'] } : it)),
    })
  },

  removeSelection: () => {
    const sel = new Set(get().selected)
    if (!sel.size) return
    get().commit({ modules: get().modules.filter((m) => !sel.has(m.uid)), items: get().items.filter((it) => !sel.has(it.uid)) })
    set({ selected: [] })
  },

  duplicateSelection: () => {
    const s = get()
    const sel = new Set(s.selected)
    const b = selectionBounds(s, s.selected)
    if (!b) return
    const c = freeSpot(s, b.x1 - b.x0, b.y1 - b.y0, { x: (b.x0 + b.x1) / 2 + (b.x1 - b.x0), y: (b.y0 + b.y1) / 2 })
    const dx = Math.round(c.x - (b.x0 + b.x1) / 2), dy = Math.round(c.y - (b.y0 + b.y1) / 2)
    const copy = <T extends { uid: string; x: number; y: number }>(p: T): T => ({ ...p, uid: uid(), x: p.x + dx, y: p.y + dy })
    const copies = s.modules.filter((m) => sel.has(m.uid)).map(copy)
    const itemCopies = s.items.filter((it) => sel.has(it.uid)).map(copy)
    get().commit({ modules: [...s.modules, ...copies], items: [...s.items, ...itemCopies] })
    set({ selected: [...copies, ...itemCopies].map((p) => p.uid) })
  },

  snapshot: () => set((st) => ({ past: [...st.past.slice(-60), pick(st)], future: [] })),

  setRoom: (pts, record = true, base) => {
    const clean = record ? normalizeRoom(pts) : pts
    if (!isValidRoom(clean)) return
    const s = get()
    const from = base ?? s.room
    // Openings are re-attached from where they were before this change (the drag start for live drags).
    const openings = reattachOpenings(base ? (s.dragOpenings ?? s.openings) : s.openings, from, clean)
    if (record) get().commit({ room: clean, openings })
    else set({ room: clean, openings })
  },

  addOpening: (kind, wall) => {
    const s = get()
    const w = walls(s.room)[wall]
    if (!w) return
    const width = OPENING_DEFAULTS[kind].width
    const o = fitOpening({ id: uid(), kind, wall, width, offset: (w.length - width) / 2 }, s.room)
    if (!o) return s.showToast('That wall is too short for a ' + kind + '.')
    get().commit({ openings: [...s.openings, o] })
  },

  updateOpening: (id, patch) => {
    const s = get()
    const openings = s.openings.flatMap((o) => {
      if (o.id !== id) return [o]
      const f = fitOpening({ ...o, ...patch }, s.room)
      return f ? [f] : [o]
    })
    get().commit({ openings })
  },

  removeOpening: (id) => get().commit({ openings: get().openings.filter((o) => o.id !== id) }),

  loadDesign: (d) => {
    const room = Array.isArray(d.room) ? normalizeRoom(d.room.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))) : []
    if (!isValidRoom(room)) {
      get().showToast('That file has no valid room (walls must be horizontal or vertical and must not cross).')
      return false
    }
    const modules = (Array.isArray(d.modules) ? d.modules : [])
      .filter((m) => MODULE_BY_ID[m?.defId] && Number.isFinite(m.x) && Number.isFinite(m.y))
      .map((m) => ({ ...m, uid: uid(), rot: ([0, 90, 180, 270].includes(m.rot) ? m.rot : 0) as Placed['rot'] }))
    const skipped = (Array.isArray(d.modules) ? d.modules.length : 0) - modules.length
    const openings = (Array.isArray(d.openings) ? d.openings : []).flatMap((o) => {
      const f = o && (o.kind === 'door' || o.kind === 'window') ? fitOpening({ ...o, id: uid() }, room) : null
      return f ? [f] : []
    })
    get().commit({
      room, modules, openings, items: cleanItems(d.items).map((it) => ({ ...it, uid: uid() })),
      wallHeight: Number.isFinite(d.wallHeight) && d.wallHeight >= 150 ? d.wallHeight : defaultDesign.wallHeight,
      armStyle: d.armStyle === 'A' ? 'A' : 'B',
      fabric: /^#[0-9a-f]{6}$/i.test(d.fabric) ? d.fabric : defaultDesign.fabric,
    })
    set({ selected: [], selectedWall: null })
    if (skipped > 0) get().showToast(`Skipped ${skipped} module${skipped > 1 ? 's' : ''} this version doesn't know.`)
    return true
  },
}))

let saveTimer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((s, prev) => {
  const keys = ['room', 'openings', 'wallHeight', 'modules', 'items', 'armStyle', 'fabric'] as const
  if (keys.every((k) => s[k] === prev[k])) return
  // Debounced so a drag doesn't serialise the design on every pointer move.
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pick(useStore.getState())))
    } catch {
      // storage unavailable: the design just won't survive a reload
    }
  }, 250)
})

/** Ids of modules and items that overlap each other, stick through a wall or block a door swing. */
export function moduleIssues(modules: Placed[], room: Pt[], openings: Opening[] = [], items: Item[] = []): Set<string> {
  const bad = new Set<string>()
  const pieces = [
    ...modules.map((m) => ({ uid: m.uid, r: footprint(m), shape: 'module' as const })),
    ...items.map((it) => ({ uid: it.uid, r: itemFootprint(it), shape: shapeOf(it) })),
  ]
  const swings = openings.map((o) => doorSwing(o, room)).filter((r): r is Rect => r !== null)
  pieces.forEach((a, i) => {
    // A rug may run under a door, but nothing may stick through a wall.
    if (!rectInsideRoom(a.r, room) || (a.shape !== 'rug' && swings.some((r) => rectsOverlap(r, a.r)))) bad.add(a.uid)
    for (let j = i + 1; j < pieces.length; j++) {
      const b = pieces[j]
      if (!canOverlap(a.shape, b.shape) && rectsOverlap(a.r, b.r)) {
        bad.add(a.uid)
        bad.add(b.uid)
      }
    }
  })
  return bad
}
