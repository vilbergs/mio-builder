import { beforeEach, describe, expect, it } from 'vitest'
import { itemFootprint, type Item } from '../data/furniture'
import { ROOM_PRESETS, boundsOf, cornerAnchor, footprint } from './geometry'
import { moduleIssues, placeLayout, useStore, type Design } from '../store'
import { CORNER_LAYOUTS } from '../data/presets'
import { quote } from './pricing'

const rect = ROOM_PRESETS.rect.pts // 520 x 420

const item = (patch: Partial<Item>): Item => ({ uid: 'i1', type: 'wardrobe', name: 'Wardrobe', x: 100, y: 100, rot: 0, w: 100, d: 60, h: 200, color: '#eeeeee', ...patch })

describe('furniture', () => {
  it('swaps width and depth when turned', () => {
    expect(itemFootprint(item({ rot: 90 }))).toEqual({ x0: 70, y0: 50, x1: 130, y1: 150 })
  })

  it('flags furniture overlapping the couch or a wall, but not rugs or chairs under tables', () => {
    const sofa = [{ uid: 'm1', defId: 's2-none', x: 100, y: 100, rot: 0 as const }]
    expect([...moduleIssues(sofa, rect, [], [item({})])].sort()).toEqual(['i1', 'm1'])
    expect(moduleIssues(sofa, rect, [], [item({ type: 'rug', w: 200, d: 300, x: 150, y: 200 })]).size).toBe(0)
    expect(moduleIssues([], rect, [], [item({ x: 30 })]).has('i1')).toBe(true)
    const table = item({ uid: 't', type: 'dining-table', x: 300, y: 200, w: 180, d: 90 })
    const chair = item({ uid: 'c', type: 'chair', x: 300, y: 250, w: 45, d: 52 })
    expect(moduleIssues([], rect, [], [table, chair]).size).toBe(0)
  })
})

describe('furniture in the store', () => {
  beforeEach(() => {
    const d: Design = { room: rect, openings: [], wallHeight: 250, modules: [], items: [], armStyle: 'B', fabric: '#888888' }
    useStore.getState().loadDesign(d)
  })

  it('adds an item where it fits, turns it, moves it and deletes it', () => {
    const st = useStore.getState
    st().addItem('sideboard')
    const it = st().items[0]
    expect(it).toMatchObject({ w: 160, d: 45, h: 80, rot: 0 })
    expect(st().selected).toEqual([it.uid])
    expect(moduleIssues([], rect, [], st().items).size).toBe(0)

    st().rotateSelection(1)
    expect(st().items[0].rot).toBe(90)
    const x = st().items[0].x
    st().nudge(10, 0)
    expect(st().items[0].x).toBe(x + 10)
    st().removeSelection()
    expect(st().items).toEqual([])
    st().undo()
    expect(st().items).toHaveLength(1)
  })

  it('drags furniture and modules together and snaps them to walls', () => {
    const st = useStore.getState
    st().addItem('bookcase')
    const it = st().items[0]
    st().dragPieces({ modules: [], items: [it] }, { x: -itemFootprint(it).x0 + 3, y: 0 }, 8)
    expect(itemFootprint(st().items[0]).x0).toBe(0)
  })

  it('keeps sane items from a file and fixes broken ones', () => {
    const st = useStore.getState
    const ok = st().loadDesign({
      room: rect, openings: [], wallHeight: 250, modules: [], armStyle: 'B', fabric: '#888888',
      items: [
        item({ name: 'Mormors skåp', w: 120 }),
        { ...item({}), x: Number.NaN },
        { ...item({ type: 'spaceship' }), w: -5, color: 'red' } as Item,
      ],
    })
    expect(ok).toBe(true)
    const items = st().items
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ name: 'Mormors skåp', w: 120 })
    expect(items[1]).toMatchObject({ type: 'wardrobe', w: 60, d: 60, color: '#cccccc' })
  })
})

describe('corner layouts', () => {
  const alcove = ROOM_PRESETS.alcove.pts

  it('finds the main corner of the default room, not the alcove', () => {
    expect(cornerAnchor(alcove)).toEqual({ at: { x: 0, y: 200 }, east: 300, south: 400 })
    expect(cornerAnchor(rect)?.at).toEqual({ x: 0, y: 0 })
  })

  it('fits every layout in the default room with its backs against the walls', () => {
    for (const l of CORNER_LAYOUTS) {
      const placed = placeLayout(l, alcove)
      expect(placed, l.name).not.toBeNull()
      const b = boundsOf(placed!.map(footprint))!
      expect([b.x0, b.y0], l.name).toEqual([0, 200])
    }
  })

  it('prices the package layouts as Mio packages', () => {
    const pkg = (id: string) => quote(CORNER_LAYOUTS.find((l) => l.id === id)!.modules.map((m) => m.defId), 'alex', false).preset?.id
    expect(pkg('chaise-xl-left')).toBe('chaise2-l')
    expect(pkg('chaise-xl-west')).toBe('chaise2-r')
    expect(pkg('chaise3-west')).toBe('chaise3-r')
    expect(pkg('corner-2-2')).toMatch(/^divan2-/)
    expect(pkg('corner-2-3')).toMatch(/^divan3-/)
  })

  it('replaces the couch and can be undone', () => {
    const st = useStore.getState
    st().loadDesign({ room: alcove, openings: [], wallHeight: 250, modules: [], items: [], armStyle: 'B', fabric: '#888888' })
    st().applyLayout('corner-2-2')
    expect(st().modules.map((m) => m.defId).sort()).toEqual(['corner', 's2-left', 's2-right'])
    st().undo()
    expect(st().modules).toEqual([])
  })
})
