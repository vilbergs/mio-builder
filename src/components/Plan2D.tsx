import { useEffect, useMemo, useRef, useState } from 'react'
import rough from 'roughjs'
import { useStore, moduleIssues, type Design } from '../store'
import { MODULE_BY_ID } from '../data/modules'
import { moduleParts, type Part } from '../model/parts'
import {
  footprint, localToPlan, walls, moveWall, normalizeRoom, openingEnds, fitOpening, type Opening, snapCenter, snapGroupDelta, boundsOf, polygonArea, isValidRoom, wallClearance,
  type Placed, type Pt, type Rect,
} from '../model/geometry'
import { shade } from '../model/color'
import { svgToPng } from '../exportImage'

const WALL_T = 12
const gen = rough.generator()

type Drag =
  | { kind: 'module'; start: Pt; base: Placed[]; moved: boolean; future: Design[] }
  | { kind: 'wall'; i: number; start: Pt; base: Pt[] }
  | { kind: 'pan'; sx: number; sy: number; vb: VB }
  | { kind: 'pinch'; dist: number; mid: Pt; vb: VB }
  | { kind: 'opening'; id: string; t0: number; offset0: number; moved: boolean; future: Design[] }

interface VB {
  x: number
  y: number
  w: number
  h: number
}

function seedOf(s: string): number {
  let h = 7
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 100000
  return h + 1
}

function partRect(m: Placed, p: Part): Rect {
  const a = localToPlan(m, p.x0, p.y0)
  const b = localToPlan(m, p.x1, p.y1)
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }
}

function roughPaths(d: ReturnType<typeof gen.rectangle>, key: string) {
  return gen.toPaths(d).map((p, i) => (
    <path key={key + i} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={p.fill ?? 'none'} />
  ))
}

export function Plan2D() {
  const s = useStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const [vb, setVb] = useState<VB | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hoverWall, setHoverWall] = useState<number | null>(null)
  const sketch = s.style === 'sketch'
  const issues = useMemo(() => moduleIssues(s.modules, s.room, s.openings), [s.modules, s.room, s.openings])
  const ws = useMemo(() => walls(s.room), [s.room])

  // Fit the room on first render and when the room changes shape a lot.
  const roomBounds = useMemo(() => {
    const xs = s.room.map((p) => p.x), ys = s.room.map((p) => p.y)
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
  }, [s.room])
  const fit = () => {
    const el = svgRef.current
    if (!el) return
    const pad = 90
    const w = roomBounds.x1 - roomBounds.x0 + pad * 2
    const h = roomBounds.y1 - roomBounds.y0 + pad * 2
    const aspect = el.clientWidth / Math.max(1, el.clientHeight)
    const vw = Math.max(w, h * aspect)
    const vh = vw / aspect
    setVb({ x: (roomBounds.x0 + roomBounds.x1) / 2 - vw / 2, y: (roomBounds.y0 + roomBounds.y1) / 2 - vh / 2, w: vw, h: vh })
  }
  const fitRef = useRef(fit)
  useEffect(() => {
    fitRef.current = fit
  })
  useEffect(() => {
    fitRef.current()
    const onFit = () => fitRef.current()
    window.addEventListener('resize', onFit)
    window.addEventListener('rossi-fit', onFit)
    return () => {
      window.removeEventListener('resize', onFit)
      window.removeEventListener('rossi-fit', onFit)
    }
  }, [])

  const toPlan = (e: { clientX: number; clientY: number }): Pt => {
    const el = svgRef.current!
    const pt = el.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const r = pt.matrixTransform(el.getScreenCTM()!.inverse())
    return { x: r.x, y: r.y }
  }
  const [pxWidth, setPxWidth] = useState(1)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setPxWidth(Math.max(1, el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const pxToCm = () => (vb ? vb.w / pxWidth : 1)

  const onWheel = (e: React.WheelEvent) => {
    if (!vb) return
    const p = toPlan(e)
    const k = Math.exp(e.deltaY * 0.0012)
    const w = Math.min(4000, Math.max(80, vb.w * k))
    const f = w / vb.w
    setVb({ x: p.x - (p.x - vb.x) * f, y: p.y - (p.y - vb.y) * f, w, h: vb.h * f })
  }

  const startModule = (e: React.PointerEvent, m: Placed) => {
    if (s.edit !== 'couch') return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    s.select(m.uid, additive)
    s.set({ selectedWall: null })
    const sel = new Set(useStore.getState().selected)
    if (!sel.has(m.uid)) return
    setDrag({ kind: 'module', start: toPlan(e), base: s.modules.filter((x) => sel.has(x.uid)), moved: false, future: s.future })
    s.snapshot()
  }

  const alongWall = (o: Opening, p: Pt) => {
    const w = ws[o.wall]
    return ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) / w.length
  }

  const startOpening = (e: React.PointerEvent, o: Opening) => {
    if (s.edit !== 'room') return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    s.set({ selectedWall: o.wall, selected: [] })
    setDrag({ kind: 'opening', id: o.id, t0: alongWall(o, toPlan(e)), offset0: o.offset, moved: false, future: s.future })
    s.snapshot()
  }

  const startWall = (e: React.PointerEvent, i: number) => {
    if (s.edit !== 'room') return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    s.set({ selectedWall: i, selected: [], dragOpenings: s.openings })
    setDrag({ kind: 'wall', i, start: toPlan(e), base: s.room })
  }

  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = () => {
    const [a, b] = [...touches.current.values()]
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: toPlan({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }) }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!vb) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    if (e.pointerType === 'touch') touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.current.size === 2) {
      setDrag({ kind: 'pinch', ...pinchStart(), vb })
      return
    }
    s.set({ selected: [], selectedWall: null })
    setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vb })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (!drag) return
    if (drag.kind === 'pinch') {
      if (touches.current.size < 2) return
      const [a, b] = [...touches.current.values()]
      const f = drag.dist / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
      const w = Math.min(4000, Math.max(80, drag.vb.w * f))
      const k2 = w / drag.vb.w
      // Keep the plan point under the fingers' midpoint fixed.
      const el = svgRef.current!.getBoundingClientRect()
      const mx = (a.x + b.x) / 2 - el.left, my = (a.y + b.y) / 2 - el.top
      const h = drag.vb.h * k2
      setVb({ x: drag.mid.x - (mx / el.width) * w, y: drag.mid.y - (my / el.height) * h, w, h })
      return
    }
    if (drag.kind === 'pan') {
      const k = drag.vb.w / svgRef.current!.clientWidth
      setVb({ ...drag.vb, x: drag.vb.x - (e.clientX - drag.sx) * k, y: drag.vb.y - (e.clientY - drag.sy) * k })
      return
    }
    const p = toPlan(e)
    if (drag.kind === 'opening') {
      const o = s.openings.find((x) => x.id === drag.id)
      if (!o) return
      const f = fitOpening({ ...o, offset: Math.round(drag.offset0 + alongWall(o, p) - drag.t0) }, s.room)
      if (f) s.set({ openings: s.openings.map((x) => (x.id === o.id ? f : x)) })
      if (!drag.moved) setDrag({ ...drag, moved: true })
      return
    }
    if (drag.kind === 'module') {
      const ids = new Set(drag.base.map((m) => m.uid))
      const others = s.modules.filter((x) => !ids.has(x.uid)).map(footprint)
      const d = snapGroupDelta(drag.base.map(footprint), { x: p.x - drag.start.x, y: p.y - drag.start.y }, others, s.room, 10 * pxToCm())
      const moved = new Map(drag.base.map((m) => [m.uid, { ...m, x: Math.round((m.x + d.x) * 2) / 2, y: Math.round((m.y + d.y) * 2) / 2 }]))
      s.setModules(s.modules.map((m) => moved.get(m.uid) ?? m), false)
      if (!drag.moved) setDrag({ ...drag, moved: true })
    } else if (drag.kind === 'wall') {
      const w = walls(drag.base)[drag.i]
      let delta = (p.x - drag.start.x) * w.inward.x + (p.y - drag.start.y) * w.inward.y
      delta = Math.round(delta)
      // Snap to parallel walls so notches can be flattened.
      const cur = w.horizontal ? w.a.y : w.a.x
      const target = cur + delta * (w.horizontal ? w.inward.y : w.inward.x)
      const thr = 8 * pxToCm()
      for (const o of walls(drag.base)) {
        if (o.i === w.i || o.horizontal !== w.horizontal) continue
        const v = w.horizontal ? o.a.y : o.a.x
        if (Math.abs(v - target) < thr) delta = (v - cur) * (w.horizontal ? w.inward.y : w.inward.x)
      }
      const moved = moveWall(drag.base, drag.i, delta)
      // Landing exactly on a parallel wall leaves a zero-length step; show it already merged.
      const next = isValidRoom(moved) ? moved : normalizeRoom(moved)
      if (isValidRoom(next)) s.setRoom(next, false, drag.base)
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId)
    if (drag?.kind === 'pinch') {
      setDrag(null)
      return
    }
    if (drag?.kind === 'wall') {
      const { room, dragOpenings } = useStore.getState()
      useStore.setState({ room: drag.base, openings: dragOpenings ?? [], dragOpenings: null })
      if (room !== drag.base) s.setRoom(room, true)
    }
    if ((drag?.kind === 'module' || drag?.kind === 'opening') && !drag.moved) {
      // A click without a move shouldn't leave an undo step behind or lose the redo stack.
      const future = drag.future
      useStore.setState((st) => ({ past: st.past.slice(0, -1), future }))
    }
    setDrag(null)
  }

  const onDrop = (e: React.DragEvent) => {
    const defId = e.dataTransfer.getData('text/rossi-module')
    if (!defId || !MODULE_BY_ID[defId]) return
    e.preventDefault()
    const p = toPlan(e)
    const def = MODULE_BY_ID[defId]
    const c = snapCenter({ w: def.width, h: def.depth }, p, s.modules.map(footprint), s.room, 12 * pxToCm())
    s.addModule(defId, c)
  }

  const k = pxToCm()
  const fontSize = Math.max(9, 12 * k)
  const ink = sketch ? '#3b3a36' : '#2a2a2a'
  const couchBounds = boundsOf(s.modules.filter((m) => MODULE_BY_ID[m.defId].kind !== 'footstool').map(footprint))
  const roomPath = 'M' + s.room.map((p) => `${p.x} ${p.y}`).join('L') + 'Z'
  const outerPath = useMemo(() => {
    // Offset polygon outward by wall thickness (works for axis-aligned polygons).
    const n = s.room.length
    const out: Pt[] = []
    for (let i = 0; i < n; i++) {
      const wPrev = ws[(i - 1 + n) % n]
      const wCur = ws[i]
      const p = s.room[i]
      out.push({ x: p.x - (wPrev.inward.x + wCur.inward.x) * WALL_T, y: p.y - (wPrev.inward.y + wCur.inward.y) * WALL_T })
    }
    return 'M' + out.map((p) => `${p.x} ${p.y}`).join('L') + 'Z'
  }, [s.room, ws])

  const fabric = s.fabric
  const fillFor = (kind: Part['kind']) => {
    switch (kind) {
      case 'leg': return '#2b2724'
      case 'base': return shade(fabric, -0.18)
      case 'back': return shade(fabric, -0.12)
      case 'arm': return shade(fabric, -0.05)
      case 'backCushion': return shade(fabric, 0.02)
      case 'seat': return shade(fabric, 0.1)
    }
  }

  const renderModule = (m: Placed) => {
    const def = MODULE_BY_ID[m.defId]
    const r = footprint(m)
    const parts = moduleParts(def, s.armStyle).filter((p) => p.kind !== 'leg' && p.kind !== 'base').sort((a, b) => a.z1 - b.z1)
    const sel = s.selected.includes(m.uid)
    const bad = issues.has(m.uid)
    const seed = seedOf(m.uid)
    return (
      <g key={m.uid} onPointerDown={(e) => startModule(e, m)} style={{ cursor: s.edit === 'couch' ? 'grab' : 'default' }}>
        {sketch ? (
          <>
            <rect x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} fill="#fffdf7" />
            {parts.map((p, i) => {
              const pr = partRect(m, p)
              const d = gen.rectangle(pr.x0, pr.y0, pr.x1 - pr.x0, pr.y1 - pr.y0, {
                seed: seed + i, roughness: 1.1, bowing: 0.8, stroke: bad ? '#c0392b' : ink, strokeWidth: 1.1 * k,
                fill: p.kind === 'back' || p.kind === 'arm' ? '#8a8578' : undefined,
                fillStyle: 'hachure', hachureGap: 6 * k, fillWeight: 0.6 * k, hachureAngle: 40,
              })
              return <g key={i}>{roughPaths(d, `${m.uid}-${i}`)}</g>
            })}
          </>
        ) : (
          <>
            <rect x={r.x0 + 3} y={r.y0 + 4} width={r.x1 - r.x0} height={r.y1 - r.y0} rx={6} fill="rgba(0,0,0,0.22)" filter="url(#soft)" />
            <rect x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} rx={4} fill={fillFor('base')} />
            {parts.map((p, i) => {
              const pr = partRect(m, p)
              return (
                <rect key={i} x={pr.x0} y={pr.y0} width={pr.x1 - pr.x0} height={pr.y1 - pr.y0} rx={Math.min(p.r * 1.4, 10)}
                  fill={s.fabricImage ? 'url(#fabric-img)' : fillFor(p.kind)} stroke={shade(fabric, -0.3)} strokeWidth={0.6}
                  filter="url(#weave)" />
              )
            })}
            {s.fabricImage && parts.map((p, i) => {
              const pr = partRect(m, p)
              return <rect key={'t' + i} x={pr.x0} y={pr.y0} width={pr.x1 - pr.x0} height={pr.y1 - pr.y0} rx={Math.min(p.r * 1.4, 10)} fill={fillFor(p.kind)} opacity={0.25} pointerEvents="none" />
            })}
            {bad && <rect x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} fill="rgba(220,40,40,0.25)" stroke="#d33" strokeWidth={1.5 * k} />}
          </>
        )}
        {sel && (
          <rect x={r.x0 - 3 * k} y={r.y0 - 3 * k} width={r.x1 - r.x0 + 6 * k} height={r.y1 - r.y0 + 6 * k}
            fill="none" stroke="#2f6fed" strokeWidth={2 * k} strokeDasharray={`${6 * k} ${4 * k}`} rx={3} />
        )}
        {sel && s.selected.length === 1 && (
          <text x={(r.x0 + r.x1) / 2} y={(r.y0 + r.y1) / 2} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize}
            className="plan-label" pointerEvents="none">
            {def.width} × {def.depth}
          </text>
        )}
      </g>
    )
  }

  const dimLine = (a: Pt, b: Pt, label: string, off: Pt, key: string) => {
    const A = { x: a.x + off.x, y: a.y + off.y }
    const B = { x: b.x + off.x, y: b.y + off.y }
    const t = 5 * k
    const vertical = Math.abs(a.x - b.x) < 1e-6
    return (
      <g key={key} className="dim" pointerEvents="none">
        <line x1={a.x} y1={a.y} x2={A.x} y2={A.y} strokeWidth={0.7 * k} />
        <line x1={b.x} y1={b.y} x2={B.x} y2={B.y} strokeWidth={0.7 * k} />
        <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} strokeWidth={1 * k} />
        <line x1={A.x - t} y1={A.y + t} x2={A.x + t} y2={A.y - t} strokeWidth={1.2 * k} />
        <line x1={B.x - t} y1={B.y + t} x2={B.x + t} y2={B.y - t} strokeWidth={1.2 * k} />
        <text x={(A.x + B.x) / 2} y={(A.y + B.y) / 2} fontSize={fontSize} textAnchor="middle" dominantBaseline="middle"
          transform={vertical ? `rotate(-90 ${(A.x + B.x) / 2} ${(A.y + B.y) / 2})` : undefined} className="dim-text">
          {label}
        </text>
      </g>
    )
  }

  const openingProps = (o: Opening) =>
    s.edit === 'room'
      ? { onPointerDown: (e: React.PointerEvent) => startOpening(e, o), style: { cursor: 'grab' } as React.CSSProperties }
      : { pointerEvents: 'none' as const }

  const area = Math.abs(polygonArea(s.room)) / 10000
  const selBounds = boundsOf(s.modules.filter((m) => s.selected.includes(m.uid)).map(footprint))
  const clearance: { key: string; a: Pt; b: Pt; label: string; vertical: boolean }[] = []
  if (selBounds) {
    const c = wallClearance(selBounds, s.room)
    const mx = (selBounds.x0 + selBounds.x1) / 2, my = (selBounds.y0 + selBounds.y1) / 2
    const add = (key: string, d: number | null, a: Pt, b: Pt, vertical: boolean) => {
      if (d !== null && d > 0.5) clearance.push({ key, a, b, label: `${Math.round(d)}`, vertical })
    }
    add('l', c.left, { x: selBounds.x0 - (c.left ?? 0), y: my }, { x: selBounds.x0, y: my }, false)
    add('r', c.right, { x: selBounds.x1, y: my }, { x: selBounds.x1 + (c.right ?? 0), y: my }, false)
    add('u', c.up, { x: mx, y: selBounds.y0 - (c.up ?? 0) }, { x: mx, y: selBounds.y0 }, true)
    add('d', c.down, { x: mx, y: selBounds.y1 }, { x: mx, y: selBounds.y1 + (c.down ?? 0) }, true)
  }

  return (
    <div className={`plan ${sketch ? 'plan-sketch' : 'plan-real'}`} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <svg
        ref={svgRef}
        viewBox={vb ? `${vb.x} ${vb.y} ${vb.w} ${vb.h}` : '0 0 100 100'}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern id="grid10" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0H0V10" fill="none" stroke={sketch ? '#e4ddcc' : '#e6e3dd'} strokeWidth={0.4} />
          </pattern>
          <pattern id="grid100" width="100" height="100" patternUnits="userSpaceOnUse">
            <rect width="100" height="100" fill="url(#grid10)" />
            <path d="M100 0H0V100" fill="none" stroke={sketch ? '#d2c8b2' : '#d5d1c9'} strokeWidth={0.9} />
          </pattern>
          <pattern id="planks" width="120" height="18" patternUnits="userSpaceOnUse">
            <rect width="120" height="18" fill="#c9a77f" />
            <rect y="0" width="120" height="9" fill="#c4a07a" />
            <path d="M0 0H120M0 9H120M38 0V9M95 9V18" stroke="#a9845e" strokeWidth="0.5" />
          </pattern>
          {s.fabricImage && (
            <pattern id="fabric-img" width="60" height="60" patternUnits="userSpaceOnUse">
              <image href={s.fabricImage} width="60" height="60" preserveAspectRatio="xMidYMid slice" />
            </pattern>
          )}
          <filter id="weave" x="0" y="0" width="1" height="1">
            <feTurbulence type="fractalNoise" baseFrequency="0.9 0.35" numOctaves="2" seed="3" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.16 0" result="a" />
            <feComposite in="a" in2="SourceGraphic" operator="in" result="t" />
            <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="t" /></feMerge>
          </filter>
          <filter id="soft"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>

        <rect x={-5000} y={-5000} width={10000} height={10000} fill={sketch ? '#f7f2e6' : '#eceae6'} />
        <rect x={-5000} y={-5000} width={10000} height={10000} fill="url(#grid100)" />

        {/* walls */}
        <path d={outerPath + roomPath} fillRule="evenodd" fill={sketch ? '#5a564d' : '#3d3d3d'} opacity={sketch ? 0.85 : 1} />
        <path d={roomPath} fill={sketch ? '#fbf8f0' : 'url(#planks)'} stroke={ink} strokeWidth={0.6 * k} />
        {sketch && <path d={roomPath} fill="url(#grid10)" opacity={0.6} />}

        {s.openings.map((o) => {
          const e = openingEnds(o, s.room)
          if (!e) return null
          const n = e.wall.inward
          const T = WALL_T
          const band = `M${e.a.x} ${e.a.y}L${e.b.x} ${e.b.y}L${e.b.x - n.x * T} ${e.b.y - n.y * T}L${e.a.x - n.x * T} ${e.a.y - n.y * T}Z`
          const stroke = sketch ? '#3b3a36' : '#2a2a2a'
          if (o.kind === 'door') {
            const tip = { x: e.a.x + n.x * o.width, y: e.a.y + n.y * o.width }
            // Sweep direction: from the far jamb round to the open leaf.
            const cross = (e.b.x - e.a.x) * n.y - (e.b.y - e.a.y) * n.x
            return (
              <g key={o.id} {...openingProps(o)}>
                <path d={band} fill={sketch ? '#fbf8f0' : 'url(#planks)'} />
                <line x1={e.a.x} y1={e.a.y} x2={tip.x} y2={tip.y} stroke={stroke} strokeWidth={2.2 * k} />
                <path d={`M${e.b.x} ${e.b.y}A${o.width} ${o.width} 0 0 ${cross > 0 ? 0 : 1} ${tip.x} ${tip.y}`} fill="none" stroke={stroke} strokeWidth={0.8 * k} strokeDasharray={`${4 * k} ${3 * k}`} />
              </g>
            )
          }
          const mid = (t: number) => `M${e.a.x - n.x * T * t} ${e.a.y - n.y * T * t}L${e.b.x - n.x * T * t} ${e.b.y - n.y * T * t}`
          return (
            <g key={o.id} {...openingProps(o)}>
              <path d={band} fill={sketch ? '#fdfcf8' : '#e8f1f6'} stroke={stroke} strokeWidth={0.8 * k} />
              <path d={mid(0.35) + mid(0.65)} stroke={sketch ? '#3b3a36' : '#7aa6c2'} strokeWidth={0.8 * k} />
            </g>
          )
        })}

        {s.edit === 'room' && s.selectedWall !== null && ws[s.selectedWall] && (
          <circle cx={ws[s.selectedWall].a.x} cy={ws[s.selectedWall].a.y} r={5 * k} fill="#2f6fed" stroke="#fff" strokeWidth={1.5 * k} pointerEvents="none" />
        )}

        {s.edit === 'room' && ws.map((w) => {
          const hot = s.selectedWall === w.i || hoverWall === w.i
          return (
            <line key={w.i} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y}
              stroke={hot ? '#2f6fed' : 'rgba(47,111,237,0.35)'} strokeWidth={(hot ? 6 : 4) * k}
              style={{ cursor: w.horizontal ? 'ns-resize' : 'ew-resize' }}
              onPointerEnter={() => setHoverWall(w.i)} onPointerLeave={() => setHoverWall(null)}
              onPointerDown={(e) => startWall(e, w.i)} />
          )
        })}

        {/* wall lengths */}
        {ws.map((w) => dimLine(w.a, w.b, `${Math.round(w.length)}`, { x: -w.inward.x * (WALL_T + 22 * k), y: -w.inward.y * (WALL_T + 22 * k) }, 'w' + w.i))}

        <g opacity={s.edit === 'room' ? 0.45 : 1}>{s.modules.map(renderModule)}</g>

        {selBounds && s.edit === 'couch' && (
          <g pointerEvents="none">
            {s.selected.length > 1 && (
              <rect x={selBounds.x0 - 8 * k} y={selBounds.y0 - 8 * k} width={selBounds.x1 - selBounds.x0 + 16 * k} height={selBounds.y1 - selBounds.y0 + 16 * k}
                fill="none" stroke="#2f6fed" strokeWidth={1.2 * k} strokeDasharray={`${3 * k} ${3 * k}`} rx={4 * k} />
            )}
            {clearance.map((c) => (
              <g key={c.key} className="clear">
                <line x1={c.a.x} y1={c.a.y} x2={c.b.x} y2={c.b.y} strokeWidth={1 * k} strokeDasharray={`${4 * k} ${3 * k}`} />
                <text x={(c.a.x + c.b.x) / 2 + (c.vertical ? 4 * k : 0)} y={(c.a.y + c.b.y) / 2 - (c.vertical ? 0 : 4 * k)} fontSize={fontSize * 0.95}
                  textAnchor={c.vertical ? 'start' : 'middle'} dominantBaseline={c.vertical ? 'middle' : 'auto'} className="clear-text">{c.label}</text>
              </g>
            ))}
          </g>
        )}

        {couchBounds && s.edit === 'couch' && (
          <>
            {dimLine({ x: couchBounds.x0, y: couchBounds.y1 }, { x: couchBounds.x1, y: couchBounds.y1 }, `${Math.round(couchBounds.x1 - couchBounds.x0)} cm`, { x: 0, y: 26 * k }, 'cw')}
            {dimLine({ x: couchBounds.x0, y: couchBounds.y0 }, { x: couchBounds.x0, y: couchBounds.y1 }, `${Math.round(couchBounds.y1 - couchBounds.y0)} cm`, { x: -26 * k, y: 0 }, 'cd')}
          </>
        )}

        <text x={roomBounds.x0} y={roomBounds.y0 - WALL_T - 50 * k} fontSize={fontSize * 1.1} className="plan-label">
          Room {area.toFixed(1)} m² · {s.room.length} walls
        </text>
      </svg>
      <div className="plan-tools">
        <button onClick={fit} title="Fit room to view">Fit</button>
        <button onClick={async () => {
          if (!svgRef.current) return
          s.set({ exportPreview: { kind: 'image', data: await svgToPng(svgRef.current), name: 'rossi-plan.png', title: 'Plan image' } })
        }} title="Save the plan as an image">Save image</button>
      </div>
    </div>
  )
}
