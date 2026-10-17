import { useEffect, useMemo, useRef, useState } from 'react'
import rough from 'roughjs'
import { useStore, moduleIssues } from '../store'
import { MODULE_BY_ID } from '../data/modules'
import { moduleParts, type Part } from '../model/parts'
import {
  footprint, localToPlan, walls, moveWall, snapCenter, boundsOf, polygonArea, isValidRoom,
  type Placed, type Pt, type Rect,
} from '../model/geometry'
import { shade } from '../model/color'

const WALL_T = 12
const gen = rough.generator()

type Drag =
  | { kind: 'module'; uid: string; dx: number; dy: number; moved: boolean }
  | { kind: 'wall'; i: number; start: Pt; base: Pt[] }
  | { kind: 'pan'; sx: number; sy: number; vb: VB }

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
  const issues = useMemo(() => moduleIssues(s.modules, s.room), [s.modules, s.room])
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
  useEffect(() => {
    fit()
    const onResize = () => fit()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toPlan = (e: { clientX: number; clientY: number }): Pt => {
    const el = svgRef.current!
    const pt = el.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const r = pt.matrixTransform(el.getScreenCTM()!.inverse())
    return { x: r.x, y: r.y }
  }
  const pxToCm = () => (vb && svgRef.current ? vb.w / svgRef.current.clientWidth : 1)

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
    const p = toPlan(e)
    s.set({ selected: m.uid, selectedWall: null })
    setDrag({ kind: 'module', uid: m.uid, dx: p.x - m.x, dy: p.y - m.y, moved: false })
    useStore.setState((st) => ({ past: [...st.past.slice(-60), { room: st.room, wallHeight: st.wallHeight, modules: st.modules, armStyle: st.armStyle, fabric: st.fabric }], future: [] }))
  }

  const startWall = (e: React.PointerEvent, i: number) => {
    if (s.edit !== 'room') return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    s.set({ selectedWall: i, selected: null })
    setDrag({ kind: 'wall', i, start: toPlan(e), base: s.room })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!vb) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    s.set({ selected: null, selectedWall: null })
    setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vb })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return
    if (drag.kind === 'pan') {
      const k = drag.vb.w / svgRef.current!.clientWidth
      setVb({ ...drag.vb, x: drag.vb.x - (e.clientX - drag.sx) * k, y: drag.vb.y - (e.clientY - drag.sy) * k })
      return
    }
    const p = toPlan(e)
    if (drag.kind === 'module') {
      const m = s.modules.find((x) => x.uid === drag.uid)
      if (!m) return
      const r = footprint(m)
      const others = s.modules.filter((x) => x.uid !== m.uid).map(footprint)
      const c = snapCenter({ w: r.x1 - r.x0, h: r.y1 - r.y0 }, { x: p.x - drag.dx, y: p.y - drag.dy }, others, s.room, 10 * pxToCm())
      s.updateModule(m.uid, { x: Math.round(c.x * 2) / 2, y: Math.round(c.y * 2) / 2 }, false)
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
      const next = moveWall(drag.base, drag.i, delta)
      if (isValidRoom(next)) s.setRoom(next, false)
    }
  }

  const onPointerUp = () => {
    if (drag?.kind === 'wall') {
      const room = useStore.getState().room
      useStore.setState({ room: drag.base })
      if (room !== drag.base) s.setRoom(room, true)
      else s.set({ room: drag.base })
    }
    if (drag?.kind === 'module' && !drag.moved) {
      // A click without a move shouldn't leave an undo step behind.
      useStore.setState((st) => ({ past: st.past.slice(0, -1) }))
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
    const sel = s.selected === m.uid
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
        {sel && (
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

  const area = Math.abs(polygonArea(s.room)) / 10000

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
      </div>
    </div>
  )
}
