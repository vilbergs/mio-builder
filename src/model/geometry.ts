import { MODULE_BY_ID } from '../data/modules'

export interface Pt {
  x: number
  y: number
}

export type Rot = 0 | 90 | 180 | 270

export interface Placed {
  uid: string
  defId: string
  x: number // footprint centre, cm
  y: number
  rot: Rot
}

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

// ---------- placed modules ----------

export function footprint(p: Placed): Rect {
  const def = MODULE_BY_ID[p.defId]
  const swap = p.rot === 90 || p.rot === 270
  const w = swap ? def.depth : def.width
  const h = swap ? def.width : def.depth
  return { x0: p.x - w / 2, y0: p.y - h / 2, x1: p.x + w / 2, y1: p.y + h / 2 }
}

/** Map a module-local point (origin top-left of the unrotated footprint, y = 0 at the back) to plan coordinates. */
export function localToPlan(p: Placed, lx: number, ly: number): Pt {
  const def = MODULE_BY_ID[p.defId]
  const cx = lx - def.width / 2
  const cy = ly - def.depth / 2
  const t = (p.rot * Math.PI) / 180
  const c = Math.round(Math.cos(t))
  const s = Math.round(Math.sin(t))
  return { x: p.x + cx * c - cy * s, y: p.y + cx * s + cy * c }
}

export function rectsOverlap(a: Rect, b: Rect, eps = 0.5): boolean {
  return a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.y0 < b.y1 - eps && b.y0 < a.y1 - eps
}

export function boundsOf(rects: Rect[]): Rect | null {
  if (!rects.length) return null
  return {
    x0: Math.min(...rects.map((r) => r.x0)),
    y0: Math.min(...rects.map((r) => r.y0)),
    x1: Math.max(...rects.map((r) => r.x1)),
    y1: Math.max(...rects.map((r) => r.y1)),
  }
}

// ---------- room polygon (axis-aligned walls only) ----------

export function polygonArea(pts: Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

export function pointInPolygon(pt: Pt, pts: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export interface Wall {
  i: number
  a: Pt
  b: Pt
  horizontal: boolean
  length: number
  inward: Pt // unit normal pointing into the room
}

export function walls(pts: Pt[]): Wall[] {
  const sign = polygonArea(pts) > 0 ? 1 : -1
  return pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    // For positive area (clockwise on a y-down screen) the interior is to the right of travel: (-dy, dx).
    const inward = { x: (-dy / len) * sign, y: (dx / len) * sign }
    return { i, a, b, horizontal: Math.abs(dy) < 1e-9, length: Math.hypot(dx, dy), inward }
  })
}

function segmentsCross(a: Wall, b: Wall): boolean {
  // Axis-aligned segments: proper overlap test including collinear overlap.
  const ax0 = Math.min(a.a.x, a.b.x), ax1 = Math.max(a.a.x, a.b.x)
  const ay0 = Math.min(a.a.y, a.b.y), ay1 = Math.max(a.a.y, a.b.y)
  const bx0 = Math.min(b.a.x, b.b.x), bx1 = Math.max(b.a.x, b.b.x)
  const by0 = Math.min(b.a.y, b.b.y), by1 = Math.max(b.a.y, b.b.y)
  return ax0 <= bx1 && bx0 <= ax1 && ay0 <= by1 && by0 <= ay1
}

export function isValidRoom(pts: Pt[]): boolean {
  if (pts.length < 4) return false
  const ws = walls(pts)
  for (const w of ws) {
    if (w.length < 1) return false
    const ok = Math.abs(w.a.x - w.b.x) < 1e-9 || Math.abs(w.a.y - w.b.y) < 1e-9
    if (!ok) return false
  }
  const n = ws.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (segmentsCross(ws[i], ws[j])) return false
    }
  }
  return Math.abs(polygonArea(pts)) > 1
}

/** Remove zero-length walls and merge collinear neighbours. */
export function normalizeRoom(pts: Pt[]): Pt[] {
  let out = pts.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }))
  let changed = true
  while (changed && out.length > 4) {
    changed = false
    for (let i = 0; i < out.length; i++) {
      const prev = out[(i - 1 + out.length) % out.length]
      const cur = out[i]
      const next = out[(i + 1) % out.length]
      const samePrev = prev.x === cur.x && prev.y === cur.y
      const collinear = (prev.x === cur.x && cur.x === next.x) || (prev.y === cur.y && cur.y === next.y)
      if (samePrev || collinear) {
        out = out.filter((_, k) => k !== i)
        changed = true
        break
      }
    }
  }
  return out
}

/** Move wall i perpendicular to itself by delta (cm, along the inward normal). */
export function moveWall(pts: Pt[], i: number, delta: number): Pt[] {
  const w = walls(pts)[i]
  const j = (i + 1) % pts.length
  return pts.map((p, k) => (k === i || k === j ? { x: p.x + w.inward.x * delta, y: p.y + w.inward.y * delta } : p))
}

/** Set wall i to an exact length by moving the wall that follows it. */
export function setWallLength(pts: Pt[], i: number, length: number): Pt[] {
  const ws = walls(pts)
  const w = ws[i]
  const next = ws[(i + 1) % ws.length]
  const dir = { x: (w.b.x - w.a.x) / w.length, y: (w.b.y - w.a.y) / w.length }
  const delta = length - w.length
  // Moving the next wall along `dir` by delta; express as movement along its inward normal.
  const along = dir.x * next.inward.x + dir.y * next.inward.y
  return moveWall(pts, next.i, delta * along)
}

/** Split wall i into three and push the middle third in (positive depth) or out. Adds four walls. */
export function addNotch(pts: Pt[], i: number, depth = 60): Pt[] {
  const w = walls(pts)[i]
  const t1 = 1 / 3
  const t2 = 2 / 3
  const p1 = { x: w.a.x + (w.b.x - w.a.x) * t1, y: w.a.y + (w.b.y - w.a.y) * t1 }
  const p2 = { x: w.a.x + (w.b.x - w.a.x) * t2, y: w.a.y + (w.b.y - w.a.y) * t2 }
  const r = (p: Pt) => ({ x: Math.round(p.x), y: Math.round(p.y) })
  const q1 = r({ x: p1.x + w.inward.x * depth, y: p1.y + w.inward.y * depth })
  const q2 = r({ x: p2.x + w.inward.x * depth, y: p2.y + w.inward.y * depth })
  return [...pts.slice(0, i + 1), r(p1), q1, q2, r(p2), ...pts.slice(i + 1)]
}

export const ROOM_PRESETS: Record<string, { name: string; pts: Pt[] }> = {
  rect: { name: 'Rectangle', pts: [{ x: 0, y: 0 }, { x: 520, y: 0 }, { x: 520, y: 420 }, { x: 0, y: 420 }] },
  L: { name: 'L-shape', pts: [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 300 }, { x: 360, y: 300 }, { x: 360, y: 520 }, { x: 0, y: 520 }] },
  U: { name: 'U-shape', pts: [{ x: 0, y: 0 }, { x: 220, y: 0 }, { x: 220, y: 160 }, { x: 460, y: 160 }, { x: 460, y: 0 }, { x: 680, y: 0 }, { x: 680, y: 480 }, { x: 0, y: 480 }] },
  alcove: { name: 'Alcove', pts: [{ x: 300, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 200 }, { x: 800, y: 200 }, { x: 800, y: 600 }, { x: 0, y: 600 }, { x: 0, y: 200 }, { x: 300, y: 200 }] },
  T: { name: 'T-shape', pts: [{ x: 0, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 260 }, { x: 500, y: 260 }, { x: 500, y: 560 }, { x: 200, y: 560 }, { x: 200, y: 260 }, { x: 0, y: 260 }] },
}

/**
 * The inside corner a couch fits best: a convex corner with one wall running east and one running south from it,
 * picked by the shorter of the two walls. Returns the corner and both wall lengths.
 */
export function cornerAnchor(pts: Pt[]): { at: Pt; east: number; south: number } | null {
  let best: { at: Pt; east: number; south: number } | null = null
  pts.forEach((p, i) => {
    const nb = [pts[(i - 1 + pts.length) % pts.length], pts[(i + 1) % pts.length]]
    const e = nb.find((q) => q.y === p.y && q.x > p.x)
    const s = nb.find((q) => q.x === p.x && q.y > p.y)
    if (!e || !s || !pointInPolygon({ x: p.x + 1, y: p.y + 1 }, pts)) return
    const c = { at: p, east: e.x - p.x, south: s.y - p.y }
    if (!best || Math.min(c.east, c.south) > Math.min(best.east, best.south)) best = c
  })
  return best
}

// ---------- placement checks and snapping ----------

export function rectInsideRoom(r: Rect, pts: Pt[]): boolean {
  const e = 0.6
  const corners = [
    { x: r.x0 + e, y: r.y0 + e },
    { x: r.x1 - e, y: r.y0 + e },
    { x: r.x1 - e, y: r.y1 - e },
    { x: r.x0 + e, y: r.y1 - e },
  ]
  if (!corners.every((c) => pointInPolygon(c, pts))) return false
  // No wall may pass through the rect's interior (covers reflex corners poking in and walls spanning it).
  return !walls(pts).some((w) => {
    if (w.horizontal) {
      const a = Math.min(w.a.x, w.b.x), b = Math.max(w.a.x, w.b.x)
      return w.a.y > r.y0 + e && w.a.y < r.y1 - e && a < r.x1 - e && b > r.x0 + e
    }
    const a = Math.min(w.a.y, w.b.y), b = Math.max(w.a.y, w.b.y)
    return w.a.x > r.x0 + e && w.a.x < r.x1 - e && a < r.y1 - e && b > r.y0 + e
  })
}

export function snapCenter(
  size: { w: number; h: number },
  c: Pt,
  others: Rect[],
  room: Pt[],
  threshold: number,
): Pt {
  const xs: number[] = []
  const ys: number[] = []
  const near = 160
  const y0 = c.y - size.h / 2, y1 = c.y + size.h / 2
  const x0 = c.x - size.w / 2, x1 = c.x + size.w / 2
  for (const o of others) {
    if (o.y0 < y1 + near && o.y1 > y0 - near) xs.push(o.x0, o.x1)
    if (o.x0 < x1 + near && o.x1 > x0 - near) ys.push(o.y0, o.y1)
  }
  for (const w of walls(room)) {
    if (w.horizontal) {
      const a = Math.min(w.a.x, w.b.x), b = Math.max(w.a.x, w.b.x)
      if (a < x1 + near && b > x0 - near) ys.push(w.a.y)
    } else {
      const a = Math.min(w.a.y, w.b.y), b = Math.max(w.a.y, w.b.y)
      if (a < y1 + near && b > y0 - near) xs.push(w.a.x)
    }
  }
  const pick = (lo: number, hi: number, targets: number[]) => {
    let best = 0
    let bestAbs = threshold
    for (const t of targets) {
      for (const d of [t - lo, t - hi]) {
        if (Math.abs(d) < bestAbs) {
          bestAbs = Math.abs(d)
          best = d
        }
      }
    }
    return bestAbs < threshold ? best : null
  }
  const dx = pick(x0, x1, xs)
  const dy = pick(y0, y1, ys)
  const snap = (v: number, lo: number) => Math.round(lo) - lo + v // keep edges on whole centimetres
  return {
    x: dx !== null ? c.x + dx : snap(c.x, x0),
    y: dy !== null ? c.y + dy : snap(c.y, y0),
  }
}

// ---------- groups ----------

const MIRROR_VARIANT: Record<string, string> = {
  's15-left': 's15-right', 's15-right': 's15-left',
  's2-left': 's2-right', 's2-right': 's2-left',
  'chaise-left': 'chaise-right', 'chaise-right': 'chaise-left',
  'chaisesm-left': 'chaisesm-right', 'chaisesm-right': 'chaisesm-left',
  'open-left': 'open-right', 'open-right': 'open-left',
}
const CORNER_MIRROR: Record<Rot, Rot> = { 0: 90, 90: 0, 180: 270, 270: 180 }

/** Mirror a module left-to-right about the vertical line x = axis. */
export function mirrorPlaced(p: Placed, axis: number): Placed {
  const def = MODULE_BY_ID[p.defId]
  const rot = def.kind === 'corner' ? CORNER_MIRROR[p.rot] : (((360 - p.rot) % 360) as Rot)
  return { ...p, defId: MIRROR_VARIANT[p.defId] ?? p.defId, rot, x: 2 * axis - p.x }
}

/** Rotate a module 90° clockwise (dir 1) or anticlockwise (dir -1) about a point. */
export function rotatePlacedAbout(p: Placed, c: Pt, dir: 1 | -1): Placed {
  const dx = p.x - c.x
  const dy = p.y - c.y
  const rot = ((((p.rot + dir * 90) % 360) + 360) % 360) as Rot
  return { ...p, rot, x: c.x - dir * dy, y: c.y + dir * dx }
}

/** Snap a group moved by `delta`: the group's bounding box snaps like a single module. */
export function snapGroupDelta(base: Rect[], delta: Pt, others: Rect[], room: Pt[], threshold: number): Pt {
  const b = boundsOf(base)!
  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  const c = snapCenter({ w, h }, { x: (b.x0 + b.x1) / 2 + delta.x, y: (b.y0 + b.y1) / 2 + delta.y }, others, room, threshold)
  return { x: c.x - (b.x0 + b.x1) / 2, y: c.y - (b.y0 + b.y1) / 2 }
}

/** Clear distance from a rectangle to the nearest wall straight left, right, up and down. */
export function wallClearance(r: Rect, room: Pt[]): { left: number | null; right: number | null; up: number | null; down: number | null } {
  const res = { left: null as number | null, right: null as number | null, up: null as number | null, down: null as number | null }
  const min = (a: number | null, b: number) => (a === null || b < a ? b : a)
  for (const w of walls(room)) {
    if (w.horizontal) {
      const a = Math.min(w.a.x, w.b.x), b = Math.max(w.a.x, w.b.x)
      if (a >= r.x1 || b <= r.x0) continue
      const y = w.a.y
      if (y <= r.y0 + 0.01) res.up = min(res.up, r.y0 - y)
      else if (y >= r.y1 - 0.01) res.down = min(res.down, y - r.y1)
    } else {
      const a = Math.min(w.a.y, w.b.y), b = Math.max(w.a.y, w.b.y)
      if (a >= r.y1 || b <= r.y0) continue
      const x = w.a.x
      if (x <= r.x0 + 0.01) res.left = min(res.left, r.x0 - x)
      else if (x >= r.x1 - 0.01) res.right = min(res.right, x - r.x1)
    }
  }
  return res
}

/** Move wall i onto the line of the parallel wall two steps away (offset -2 or +2), removing the step between them. */
export function alignWall(pts: Pt[], i: number, offset: -2 | 2): Pt[] {
  const ws = walls(pts)
  const n = ws.length
  const w = ws[i]
  const o = ws[(i + offset + n) % n]
  const cur = w.horizontal ? w.a.y : w.a.x
  const target = w.horizontal ? o.a.y : o.a.x
  const along = w.horizontal ? w.inward.y : w.inward.x
  return moveWall(pts, i, (target - cur) * along)
}

// ---------- doors and windows ----------

export interface Opening {
  id: string
  kind: 'door' | 'window'
  wall: number // index of the wall it sits in
  offset: number // cm from the wall's start point to the opening's near edge
  width: number
}

export const OPENING_DEFAULTS = {
  door: { width: 90, top: 210 },
  window: { width: 120, sill: 90, top: 210 },
}

/** Clamp an opening so it fits inside its wall. Returns null if the wall is gone or too short. */
export function fitOpening(o: Opening, room: Pt[]): Opening | null {
  const w = walls(room)[o.wall]
  if (!w || w.length < 20) return null
  const width = Math.min(o.width, w.length - 10)
  const offset = Math.max(5, Math.min(o.offset, w.length - 5 - width))
  return { ...o, width: Math.round(width), offset: Math.round(offset) }
}

/**
 * Re-attach openings after the room changed shape. An opening stays on the wall whose line still
 * contains its centre; failing that it follows the wall with the same index (a dragged wall).
 */
export function reattachOpenings(openings: Opening[], before: Pt[], after: Pt[]): Opening[] {
  const oldWalls = walls(before)
  const newWalls = walls(after)
  const out: Opening[] = []
  for (const o of openings) {
    const w = oldWalls[o.wall]
    if (!w) continue
    const dir = { x: (w.b.x - w.a.x) / w.length, y: (w.b.y - w.a.y) / w.length }
    const mid = o.offset + o.width / 2
    const c = { x: w.a.x + dir.x * mid, y: w.a.y + dir.y * mid }
    let placed: Opening | null = null
    for (const n of newWalls) {
      if (n.horizontal !== w.horizontal) continue
      const onLine = n.horizontal ? Math.abs(n.a.y - c.y) < 0.5 : Math.abs(n.a.x - c.x) < 0.5
      if (!onLine) continue
      const t = n.horizontal ? (c.x - n.a.x) / (n.b.x - n.a.x) : (c.y - n.a.y) / (n.b.y - n.a.y)
      if (t <= 0 || t >= 1) continue
      placed = fitOpening({ ...o, wall: n.i, offset: t * n.length - o.width / 2 }, after)
      break
    }
    if (!placed && newWalls[o.wall] && newWalls[o.wall].horizontal === w.horizontal && newWalls.length === oldWalls.length) {
      placed = fitOpening(o, after)
    }
    if (placed) out.push(placed)
  }
  return out
}

/** The opening's two end points on the wall line, in plan coordinates. */
export function openingEnds(o: Opening, room: Pt[]): { a: Pt; b: Pt; wall: Wall } | null {
  const w = walls(room)[o.wall]
  if (!w) return null
  const dx = (w.b.x - w.a.x) / w.length, dy = (w.b.y - w.a.y) / w.length
  return {
    a: { x: w.a.x + dx * o.offset, y: w.a.y + dy * o.offset },
    b: { x: w.a.x + dx * (o.offset + o.width), y: w.a.y + dy * (o.offset + o.width) },
    wall: w,
  }
}

/** The floor area a door needs to swing open into the room. */
export function doorSwing(o: Opening, room: Pt[]): Rect | null {
  if (o.kind !== 'door') return null
  const e = openingEnds(o, room)
  if (!e) return null
  const n = e.wall.inward
  const xs = [e.a.x, e.b.x, e.a.x + n.x * o.width, e.b.x + n.x * o.width]
  const ys = [e.a.y, e.b.y, e.a.y + n.y * o.width, e.b.y + n.y * o.width]
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}
