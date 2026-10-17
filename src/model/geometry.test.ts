import { describe, expect, it } from 'vitest'
import {
  addNotch, alignWall, footprint, isValidRoom, localToPlan, mirrorPlaced, moveWall, normalizeRoom, polygonArea,
  rectInsideRoom, rotatePlacedAbout, ROOM_PRESETS, setWallLength, snapCenter, walls, wallClearance, type Placed,
} from './geometry'
import { MODULES } from '../data/modules'
import { moduleParts } from './parts'
import { PRESETS } from '../data/presets'

const rect = ROOM_PRESETS.rect.pts // 520 x 420
const L = ROOM_PRESETS.L.pts

describe('room walls', () => {
  it('points every inward normal into the room, whatever the winding', () => {
    for (const pts of [rect, [...rect].reverse(), L, [...L].reverse()]) {
      for (const w of walls(pts)) {
        const mid = { x: (w.a.x + w.b.x) / 2 + w.inward.x, y: (w.a.y + w.b.y) / 2 + w.inward.y }
        expect(rectInsideRoom({ x0: mid.x - 0.1, y0: mid.y - 0.1, x1: mid.x + 0.1, y1: mid.y + 0.1 }, pts)).toBe(true)
      }
    }
  })

  it('moves a wall inward and keeps the others axis-aligned', () => {
    const moved = moveWall(rect, 1, 20) // right wall 20 cm in
    expect(moved[1].x).toBe(500)
    expect(moved[2].x).toBe(500)
    expect(isValidRoom(moved)).toBe(true)
  })

  it('sets an exact wall length', () => {
    const r = setWallLength(rect, 0, 600)
    expect(walls(r)[0].length).toBe(600)
    expect(walls(r)[2].length).toBe(600)
  })

  it('adds a notch as four extra walls and lines it back up', () => {
    const n = addNotch(rect, 0, 60)
    expect(n).toHaveLength(8)
    expect(isValidRoom(n)).toBe(true)
    expect(Math.abs(polygonArea(n))).toBeLessThan(Math.abs(polygonArea(rect)))
    const flat = normalizeRoom(alignWall(n, 2, -2))
    expect(flat).toHaveLength(4)
    expect(Math.abs(polygonArea(flat))).toBe(Math.abs(polygonArea(rect)))
  })

  it('rejects rooms whose walls cross', () => {
    expect(isValidRoom(moveWall(L, 2, 400))).toBe(false)
  })

  it('treats the inside corner of an L as outside', () => {
    expect(rectInsideRoom({ x0: 300, y0: 250, x1: 420, y1: 350 }, L)).toBe(false)
    expect(rectInsideRoom({ x0: 10, y0: 10, x1: 350, y1: 500 }, L)).toBe(true)
  })
})

describe('modules', () => {
  it('swaps width and depth when turned 90 degrees', () => {
    const m: Placed = { uid: 'a', defId: 'chaise-left', x: 100, y: 100, rot: 90 }
    const r = footprint(m)
    expect(r.x1 - r.x0).toBe(190)
    expect(r.y1 - r.y0).toBe(142)
  })

  it('keeps every part inside the module footprint', () => {
    for (const def of MODULES) {
      for (const style of ['A', 'B'] as const) {
        for (const p of moduleParts(def, style)) {
          expect(p.x0).toBeGreaterThanOrEqual(0)
          expect(p.x1).toBeLessThanOrEqual(def.width)
          expect(p.y0).toBeGreaterThanOrEqual(0)
          expect(p.y1).toBeLessThanOrEqual(def.depth)
          expect(p.z1).toBeLessThanOrEqual(def.height)
        }
      }
    }
  })

  it('maps the back of a module turned 90 degrees to the right side', () => {
    const m: Placed = { uid: 'a', defId: 's2-none', x: 0, y: 0, rot: 90 }
    expect(localToPlan(m, 63, 0).x).toBeCloseTo(56) // back centre is now on the right
  })

  it('mirrors a left armrest into a right one and back', () => {
    const m: Placed = { uid: 'a', defId: 's2-left', x: 50, y: 0, rot: 90 }
    const once = mirrorPlaced(m, 0)
    expect(once).toMatchObject({ defId: 's2-right', x: -50, rot: 270 })
    expect(mirrorPlaced(once, 0)).toMatchObject({ defId: 's2-left', x: 50, rot: 90 })
  })

  it('turns four times back to the start', () => {
    let m: Placed = { uid: 'a', defId: 'corner', x: 30, y: 10, rot: 0 }
    for (let i = 0; i < 4; i++) m = rotatePlacedAbout(m, { x: 0, y: 0 }, 1)
    expect(m).toMatchObject({ x: 30, y: 10, rot: 0 })
  })

  it('snaps a module flush against a nearby wall and module', () => {
    const c = snapCenter({ w: 100, h: 100 }, { x: 54, y: 155 }, [{ x0: 0, y0: 0, x1: 100, y1: 100 }], rect, 8)
    expect(c.x - 50).toBe(0) // left edge on the wall
    expect(c.y - 50).toBe(100) // top edge on the other module
  })

  it('measures clearance to the walls', () => {
    expect(wallClearance({ x0: 20, y0: 30, x1: 120, y1: 130 }, rect)).toEqual({ left: 20, right: 400, up: 30, down: 290 })
  })
})

describe('presets', () => {
  it('builds every ready-made sofa without overlapping modules', () => {
    for (const p of PRESETS) {
      const rs = p.modules.map((m) => footprint({ ...m, uid: '' }))
      for (let i = 0; i < rs.length; i++)
        for (let j = i + 1; j < rs.length; j++) {
          const a = rs[i], b = rs[j]
          const overlap = a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5
          expect(overlap, `${p.name}: ${i} and ${j}`).toBe(false)
        }
    }
  })
})
