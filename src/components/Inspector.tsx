import { useRef } from 'react'
import { useStore, moduleIssues, type Design } from '../store'
import { MODULE_BY_ID, FABRICS, ROSSI } from '../data/modules'
import { footprint, boundsOf, walls, setWallLength, addNotch, polygonArea, ROOM_PRESETS, isValidRoom } from '../model/geometry'

function NumberField({ label, value, onCommit, min = 1, step = 1 }: { label: string; value: number; onCommit: (v: number) => void; min?: number; step?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        key={value}
        defaultValue={Math.round(value * 10) / 10}
        min={min}
        step={step}
        onBlur={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v) && v >= min && v !== value) onCommit(v)
          else e.target.value = String(Math.round(value * 10) / 10)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
    </label>
  )
}

function CouchPanel() {
  const s = useStore()
  const sel = s.modules.find((m) => m.uid === s.selected)
  const issues = moduleIssues(s.modules, s.room)
  const sofa = s.modules.filter((m) => MODULE_BY_ID[m.defId].kind !== 'footstool')
  const b = boundsOf(sofa.map(footprint))
  const seats = sofa.reduce((n, m) => n + MODULE_BY_ID[m.defId].seats, 0)
  const counts = new Map<string, number>()
  s.modules.forEach((m) => counts.set(m.defId, (counts.get(m.defId) ?? 0) + 1))

  if (sel) {
    const def = MODULE_BY_ID[sel.defId]
    const r = footprint(sel)
    return (
      <section>
        <h2>{def.name}</h2>
        <p className="sv">{def.nameSv}</p>
        <table className="specs">
          <tbody>
            <tr><td>Width</td><td>{def.width} cm</td></tr>
            <tr><td>Depth</td><td>{def.depth} cm</td></tr>
            <tr><td>Height</td><td>{def.height} cm</td></tr>
            {def.kind !== 'footstool' && <tr><td>Seat height</td><td>{ROSSI.seatHeight} cm</td></tr>}
            <tr><td>Footprint</td><td>{((def.width * def.depth) / 10000).toFixed(2)} m²</td></tr>
          </tbody>
        </table>
        {issues.has(sel.uid) && <p className="warn">Overlaps another module or a wall.</p>}
        <div className="row">
          <NumberField label="Left edge (cm)" value={r.x0} min={-10000} onCommit={(v) => s.updateModule(sel.uid, { x: sel.x + (v - r.x0) })} />
          <NumberField label="Top edge (cm)" value={r.y0} min={-10000} onCommit={(v) => s.updateModule(sel.uid, { y: sel.y + (v - r.y0) })} />
        </div>
        <div className="btns">
          <button onClick={() => s.rotate(sel.uid, -1)} title="Rotate left (Shift+R)">⟲ Rotate</button>
          <button onClick={() => s.rotate(sel.uid, 1)} title="Rotate right (R)">⟳ Rotate</button>
          <button onClick={() => s.duplicate(sel.uid)} title="Duplicate (Ctrl+D)">Duplicate</button>
          <button className="danger" onClick={() => s.removeModule(sel.uid)} title="Delete (Del)">Delete</button>
        </div>
        {def.url && <p className="small"><a href={def.url} target="_blank" rel="noreferrer">View on mio.se ↗</a></p>}
        <button className="link" onClick={() => s.set({ selected: null })}>← Back to summary</button>
      </section>
    )
  }

  return (
    <section>
      <h2>Your couch</h2>
      {s.modules.length === 0 ? (
        <p className="hint">Add modules from the left. They snap to each other and to walls.</p>
      ) : (
        <>
          <div className="stats">
            <div><b>{b ? Math.round(b.x1 - b.x0) : 0}</b><span>width cm</span></div>
            <div><b>{b ? Math.round(b.y1 - b.y0) : 0}</b><span>depth cm</span></div>
            <div><b>{seats}</b><span>seats</span></div>
          </div>
          <ul className="parts">
            {[...counts].map(([id, n]) => (
              <li key={id}><span>{n} ×</span> {MODULE_BY_ID[id].nameSv} <em>{MODULE_BY_ID[id].width}×{MODULE_BY_ID[id].depth}</em></li>
            ))}
          </ul>
          {issues.size > 0 && <p className="warn">{issues.size} module{issues.size > 1 ? 's' : ''} overlap or stick through a wall (shown in red).</p>}
        </>
      )}
      <p className="hint small">Select a module to rotate or delete it. Keys: R rotate · Del delete · arrows nudge (Shift = 10 cm) · Ctrl+Z undo.</p>
    </section>
  )
}

function RoomPanel() {
  const s = useStore()
  const ws = walls(s.room)
  const sel = s.selectedWall !== null ? ws[s.selectedWall] : null
  const tryRoom = (pts: typeof s.room) => {
    if (isValidRoom(pts)) s.setRoom(pts)
    else alert('That change would make walls cross. Try a smaller value.')
  }
  return (
    <section>
      <h2>Room</h2>
      <p className="hint">Drag a wall in the plan to move it, or type exact lengths. Walls stay horizontal or vertical.</p>
      <div className="btns">
        {Object.entries(ROOM_PRESETS).map(([k, p]) => (
          <button key={k} onClick={() => { s.setRoom(p.pts); s.set({ selectedWall: null }) }}>{p.name}</button>
        ))}
      </div>
      <div className="stats">
        <div><b>{(Math.abs(polygonArea(s.room)) / 10000).toFixed(1)}</b><span>m²</span></div>
        <div><b>{ws.length}</b><span>walls</span></div>
        <div><b>{s.wallHeight}</b><span>height cm</span></div>
      </div>
      <NumberField label="Wall height (cm)" value={s.wallHeight} min={150} onCommit={(v) => s.commit({ wallHeight: v })} />
      {sel && (
        <div className="wall-edit">
          <h3>Wall {sel.i + 1}</h3>
          <NumberField label="Length (cm)" value={sel.length} min={10} onCommit={(v) => tryRoom(setWallLength(s.room, sel.i, v))} />
          <div className="btns">
            <button onClick={() => tryRoom(addNotch(s.room, sel.i, 60))} title="Split this wall into five, with the middle part pushed into the room">Add notch in</button>
            <button onClick={() => tryRoom(addNotch(s.room, sel.i, -60))} title="Split this wall into five, with the middle part pushed out">Add bay out</button>
          </div>
          <p className="hint small">Changing a length moves the next wall. Drag a notch flush with its neighbours to remove it.</p>
        </div>
      )}
      <ol className="walls">
        {ws.map((w) => (
          <li key={w.i} className={s.selectedWall === w.i ? 'on' : ''} onClick={() => s.set({ selectedWall: w.i })}>
            Wall {w.i + 1} <span>{w.horizontal ? '↔' : '↕'} {Math.round(w.length)} cm</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function StylePanel() {
  const s = useStore()
  const file = useRef<HTMLInputElement>(null)
  return (
    <section>
      <h2>Look</h2>
      <div className="seg">
        <button className={s.armStyle === 'A' ? 'on' : ''} onClick={() => s.commit({ armStyle: 'A' })} title="Armrest A: shorter, the seat cushion runs past it">Armrest A</button>
        <button className={s.armStyle === 'B' ? 'on' : ''} onClick={() => s.commit({ armStyle: 'B' })} title="Armrest B: classic, wraps the whole seat cushion">Armrest B</button>
      </div>
      <div className="swatches">
        {FABRICS.map((f) => (
          <button key={f.id} className={`swatch ${s.fabric === f.color && !s.fabricImage ? 'on' : ''}`} style={{ background: f.color }} title={f.name}
            onClick={() => { s.commit({ fabric: f.color }); s.set({ fabricImage: null }) }} />
        ))}
        <label className="swatch custom" title="Custom colour">
          <input type="color" value={s.fabric} onChange={(e) => { s.set({ fabric: e.target.value, fabricImage: null }) }} />
        </label>
      </div>
      <div className="btns">
        <button onClick={() => file.current?.click()}>Use a fabric photo…</button>
        {s.fabricImage && <button onClick={() => s.set({ fabricImage: null })}>Clear photo</button>}
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => {
        const f = e.target.files?.[0]
        if (!f) return
        const rd = new FileReader()
        rd.onload = () => s.set({ fabricImage: String(rd.result) })
        rd.readAsDataURL(f)
        e.target.value = ''
      }} />
      <p className="hint small">Colours are approximate. A close-up photo of a Mio fabric swatch works best as a texture in Realistic mode.</p>
    </section>
  )
}

function FilePanel() {
  const s = useStore()
  const file = useRef<HTMLInputElement>(null)
  const exportJson = () => {
    const d: Design = { room: s.room, wallHeight: s.wallHeight, modules: s.modules, armStyle: s.armStyle, fabric: s.fabric }
    const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'rossi-design.json'
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <section>
      <h2>Design</h2>
      <div className="btns">
        <button onClick={exportJson}>Export</button>
        <button onClick={() => file.current?.click()}>Import</button>
        <button className="danger" onClick={() => { if (confirm('Remove all modules?')) s.commit({ modules: [] }) }}>Clear couch</button>
      </div>
      <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => {
        const f = e.target.files?.[0]
        if (!f) return
        try {
          const d = JSON.parse(await f.text()) as Design
          if (!Array.isArray(d.room) || !Array.isArray(d.modules)) throw new Error('bad file')
          s.loadDesign(d)
        } catch {
          alert('That file is not a Rossi design.')
        }
        e.target.value = ''
      }} />
      <p className="hint small">Your design is saved in this browser automatically.</p>
    </section>
  )
}

export function Inspector() {
  const edit = useStore((s) => s.edit)
  return (
    <aside className="inspector">
      {edit === 'room' ? <RoomPanel /> : <CouchPanel />}
      <StylePanel />
      <FilePanel />
    </aside>
  )
}
