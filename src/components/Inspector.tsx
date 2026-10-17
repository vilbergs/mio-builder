import { useRef, useState } from 'react'
import { useStore, moduleIssues, type Design } from '../store'
import { MODULE_BY_ID, FABRICS, ROSSI } from '../data/modules'
import { PRESETS } from '../data/presets'
import { footprint, boundsOf, walls, setWallLength, addNotch, alignWall, normalizeRoom, polygonArea, ROOM_PRESETS, isValidRoom } from '../model/geometry'

const refit = () => setTimeout(() => window.dispatchEvent(new Event('rossi-fit')), 50)

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

function SelectionPanel() {
  const s = useStore()
  const issues = moduleIssues(s.modules, s.room, s.openings)
  const group = s.modules.filter((m) => s.selected.includes(m.uid))
  const b = boundsOf(group.map(footprint))!
  const one = group.length === 1 ? group[0] : null
  const def = one ? MODULE_BY_ID[one.defId] : null
  const moveTo = (dx: number, dy: number) => s.nudge(dx, dy)
  return (
    <section>
      {def ? (
        <>
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
        </>
      ) : (
        <>
          <h2>{group.length} modules selected</h2>
          <table className="specs">
            <tbody>
              <tr><td>Width</td><td>{Math.round(b.x1 - b.x0)} cm</td></tr>
              <tr><td>Depth</td><td>{Math.round(b.y1 - b.y0)} cm</td></tr>
            </tbody>
          </table>
        </>
      )}
      {group.some((m) => issues.has(m.uid)) && <p className="warn">Overlaps another module, a wall or a door swing.</p>}
      <div className="row">
        <NumberField label="Left edge (cm)" value={b.x0} min={-10000} onCommit={(v) => moveTo(v - b.x0, 0)} />
        <NumberField label="Top edge (cm)" value={b.y0} min={-10000} onCommit={(v) => moveTo(0, v - b.y0)} />
      </div>
      <div className="btns">
        <button onClick={() => s.rotateSelection(-1)} title="Rotate anticlockwise (Shift+R)">⟲ Rotate</button>
        <button onClick={() => s.rotateSelection(1)} title="Rotate clockwise (R)">⟳ Rotate</button>
        <button onClick={() => s.mirrorSelection()} title="Swap left and right (M)">⇋ Mirror</button>
        <button onClick={() => s.duplicateSelection()} title="Duplicate (Ctrl+D)">Duplicate</button>
        <button className="danger" onClick={() => s.removeSelection()} title="Delete (Del)">Delete</button>
      </div>
      {def?.url && <p className="small"><a href={def.url} target="_blank" rel="noreferrer">View on mio.se ↗</a></p>}
      <p className="hint small">Shift-click to add or remove modules from the selection. Ctrl+A selects the whole couch.</p>
      <button className="link" onClick={() => s.clearSelection()}>← Back to summary</button>
    </section>
  )
}

function CouchPanel() {
  const s = useStore()
  const issues = moduleIssues(s.modules, s.room, s.openings)
  const sofa = s.modules.filter((m) => MODULE_BY_ID[m.defId].kind !== 'footstool')
  const b = boundsOf(sofa.map(footprint))
  const seats = sofa.reduce((n, m) => n + MODULE_BY_ID[m.defId].seats, 0)
  const counts = new Map<string, number>()
  s.modules.forEach((m) => counts.set(m.defId, (counts.get(m.defId) ?? 0) + 1))
  const [copied, setCopied] = useState(false)

  if (s.selected.length) return <SelectionPanel />

  const list = () =>
    [...counts].map(([id, n]) => `${n} × Rossi ${MODULE_BY_ID[id].nameSv} (${MODULE_BY_ID[id].width}×${MODULE_BY_ID[id].depth} cm)`).join('\n') +
    `\nArmstöd ${s.armStyle}` + (b ? `\nTotal ${Math.round(b.x1 - b.x0)} × ${Math.round(b.y1 - b.y0)} cm` : '')

  return (
    <section>
      <h2>Your couch</h2>
      {s.modules.length === 0 ? (
        <p className="hint">Add modules from the left, or start from one of Mio's ready-made sofas below. Modules snap to each other and to walls.</p>
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
          <div className="btns">
            <button onClick={() => s.selectAll()}>Select all</button>
            <button onClick={async () => {
              try {
                await navigator.clipboard.writeText(list())
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              } catch {
                s.set({ exportPreview: { kind: 'text', data: list(), name: 'rossi-parts.txt', title: 'Parts list' } })
              }
            }}>{copied ? 'Copied ✓' : 'Copy parts list'}</button>
          </div>
          {issues.size > 0 && <p className="warn">{issues.size} module{issues.size > 1 ? 's' : ''} overlap, stick through a wall or block a door (shown in red).</p>}
        </>
      )}
      <h3>Mio's ready-made sofas</h3>
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.id} onClick={() => s.addPreset(p.id)} title={p.note ?? ''}>{p.name}</button>
        ))}
      </div>
      <p className="hint small">Keys: R rotate · M mirror · Del delete · arrows nudge (Shift = 10 cm) · Ctrl+A select all · Ctrl+Z undo.</p>
    </section>
  )
}

function RoomPanel() {
  const s = useStore()
  const ws = walls(s.room)
  const sel = s.selectedWall !== null ? ws[s.selectedWall] : null
  const tryRoom = (pts: typeof s.room) => {
    const clean = normalizeRoom(pts)
    if (isValidRoom(clean)) {
      s.setRoom(clean)
      if (clean.length !== s.room.length) s.set({ selectedWall: null })
    } else s.showToast('That change would make walls cross. Try a smaller value.')
  }
  const n = ws.length
  const canAlign = (off: -2 | 2) => {
    if (!sel || n <= 4) return false
    const o = ws[(sel.i + off + n) % n]
    return (sel.horizontal ? o.a.y : o.a.x) !== (sel.horizontal ? sel.a.y : sel.a.x)
  }
  return (
    <section>
      <h2>Room</h2>
      <p className="hint">Drag a wall in the plan to move it, or type exact lengths. Walls stay horizontal or vertical.</p>
      <div className="btns">
        {Object.entries(ROOM_PRESETS).map(([k, p]) => (
          <button key={k} onClick={() => { s.setRoom(p.pts); s.set({ selectedWall: null }); refit() }}>{p.name}</button>
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
          {(canAlign(-2) || canAlign(2)) && (
            <div className="btns">
              {canAlign(-2) && <button onClick={() => tryRoom(alignWall(s.room, sel.i, -2))} title="Remove the step before this wall">Line up with wall {((sel.i - 2 + n) % n) + 1}</button>}
              {canAlign(2) && <button onClick={() => tryRoom(alignWall(s.room, sel.i, 2))} title="Remove the step after this wall">Line up with wall {((sel.i + 2) % n) + 1}</button>}
            </div>
          )}
          <div className="btns">
            <button onClick={() => s.addOpening('door', sel.i)}>Add door</button>
            <button onClick={() => s.addOpening('window', sel.i)}>Add window</button>
          </div>
          {s.openings.filter((o) => o.wall === sel.i).map((o) => (
            <div key={o.id} className="opening">
              <div className="opening-head">
                <b>{o.kind === 'door' ? 'Door' : 'Window'}</b>
                <button className="link danger-link" onClick={() => s.removeOpening(o.id)}>Remove</button>
              </div>
              <div className="row">
                <NumberField label="Width (cm)" value={o.width} min={30} onCommit={(v) => s.updateOpening(o.id, { width: v })} />
                <NumberField label="From wall start (cm)" value={o.offset} min={0} onCommit={(v) => s.updateOpening(o.id, { offset: v })} />
              </div>
            </div>
          ))}
          <p className="hint small">Changing a length moves the next wall. Lining a wall up with its parallel neighbour removes the step between them. Distances along a wall count from the corner it starts at (marked ●).</p>
        </div>
      )}
      <ol className="walls">
        {ws.map((w) => (
          <li key={w.i} className={s.selectedWall === w.i ? 'on' : ''} onClick={() => s.set({ selectedWall: w.i })}>
            Wall {w.i + 1}{s.openings.some((o) => o.wall === w.i) && <em className="tag">{s.openings.filter((o) => o.wall === w.i).map((o) => (o.kind === 'door' ? 'door' : 'window')).join(', ')}</em>} <span>{w.horizontal ? '↔' : '↕'} {Math.round(w.length)} cm</span>
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
  const [confirmClear, setConfirmClear] = useState(false)
  const exportJson = () => {
    const d: Design = { room: s.room, openings: s.openings, wallHeight: s.wallHeight, modules: s.modules, armStyle: s.armStyle, fabric: s.fabric }
    s.set({ exportPreview: { kind: 'text', data: JSON.stringify(d, null, 2), name: 'rossi-design.json', title: 'Design file' } })
  }
  return (
    <section>
      <h2>Design</h2>
      <div className="btns">
        <button onClick={exportJson}>Export</button>
        <button onClick={() => file.current?.click()}>Import</button>
        {confirmClear ? (
          <>
            <button className="danger solid" onClick={() => { s.commit({ modules: [] }); s.set({ selected: [] }); setConfirmClear(false) }}>Yes, remove all</button>
            <button onClick={() => setConfirmClear(false)}>Keep</button>
          </>
        ) : (
          <button className="danger" onClick={() => setConfirmClear(true)} disabled={!s.modules.length}>Clear couch</button>
        )}
      </div>
      <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => {
        const f = e.target.files?.[0]
        if (!f) return
        try {
          const d = JSON.parse(await f.text()) as Design
          if (!Array.isArray(d.room) || !Array.isArray(d.modules)) throw new Error('bad file')
          if (s.loadDesign(d)) refit()
        } catch {
          s.showToast('That file is not a Rossi design (expected an exported .json file).')
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
