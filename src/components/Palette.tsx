import { MODULES, ROSSI, SERIES_URL, SPEC_URL, type ModuleDef } from '../data/modules'
import { moduleParts } from '../model/parts'
import { useStore } from '../store'
import { photoFor } from '../data/photos'
import { currentPrice, saleActive, kr } from '../model/pricing'
import { FURNITURE, itemParts2D, type FurnitureDef } from '../data/furniture'
import { shade } from '../model/color'

function Thumb({ def }: { def: ModuleDef }) {
  const armStyle = useStore((s) => s.armStyle)
  const parts = moduleParts(def, armStyle).filter((p) => p.kind !== 'leg' && p.kind !== 'base').sort((a, b) => a.z1 - b.z1)
  const pad = 4
  return (
    <svg viewBox={`${-pad} ${-pad} ${def.width + pad * 2} ${def.depth + pad * 2}`} className="thumb">
      <rect x={0} y={0} width={def.width} height={def.depth} rx={3} className="thumb-base" />
      {parts.map((p, i) => (
        <rect key={i} x={p.x0} y={p.y0} width={p.x1 - p.x0} height={p.y1 - p.y0} rx={Math.min(p.r, 6)} className={`thumb-${p.kind}`} />
      ))}
    </svg>
  )
}

function FurnitureThumb({ def }: { def: FurnitureDef }) {
  const it = { uid: '', type: def.id, name: def.name, x: def.width / 2, y: def.depth / 2, rot: 0 as const, w: def.width, d: def.depth, h: def.height, z: def.elevation ?? 0, color: def.color }
  const pad = Math.max(def.width, def.depth) * 0.06
  const line = shade(def.color, -0.45)
  return (
    <svg viewBox={`${-pad} ${-pad} ${def.width + pad * 2} ${def.depth + pad * 2}`} className="thumb">
      {itemParts2D(it).map((p, i) => {
        const props = { fill: p.dashed ? 'none' : shade(def.color, p.tone), stroke: line, strokeWidth: Math.max(def.width, def.depth) / 90, strokeDasharray: p.dashed ? '4 3' : undefined }
        return p.kind === 'ellipse'
          ? <ellipse key={i} cx={(p.x0 + p.x1) / 2} cy={(p.y0 + p.y1) / 2} rx={(p.x1 - p.x0) / 2} ry={(p.y1 - p.y0) / 2} {...props} />
          : <rect key={i} x={p.x0} y={p.y0} width={p.x1 - p.x0} height={p.y1 - p.y0} rx={p.r ?? 2} {...props} />
      })}
    </svg>
  )
}

export function ModuleImage({ id, fallback, className = 'photo' }: { id: string; fallback?: React.ReactNode; className?: string }) {
  const p = photoFor(id)
  if (!p) return <>{fallback ?? null}</>
  return <img className={className} src={p.url} alt="" style={p.flip ? { transform: 'scaleX(-1)' } : undefined} draggable={false} />
}

const GROUPS: { title: string; kinds: ModuleDef['kind'][] }[] = [
  { title: 'Seats', kinds: ['seat'] },
  { title: 'Corner, chaise & open end', kinds: ['corner', 'chaise', 'openEnd'] },
  { title: 'Footstools', kinds: ['footstool'] },
]

const sale = saleActive()

export function Palette() {
  const addModule = useStore((s) => s.addModule)
  const addItem = useStore((s) => s.addItem)
  const group = useStore((s) => s.fabricGroup)
  return (
    <aside className="palette">
      <h2>Rossi modules</h2>
      <p className="hint">Click to add, or drag onto the plan. Sizes in cm, width × depth × height.</p>
      {GROUPS.map((g) => (
        <section key={g.title}>
          <h3>{g.title}</h3>
          <div className="module-grid">
            {MODULES.filter((m) => g.kinds.includes(m.kind)).map((m) => (
              <button
                key={m.id}
                className="module-card"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/rossi-module', m.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => addModule(m.id)}
                title={`${m.nameSv} — ${m.width} × ${m.depth} × ${m.height} cm`}
              >
                <ModuleImage id={m.id} fallback={<Thumb def={m} />} />
                <span className="module-name">{m.name}</span>
                <span className="module-dims">{m.width} × {m.depth} × {m.height}</span>
                <span className="module-price">{kr(currentPrice(m.price, group, sale))}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <section>
        <h3>Other furniture</h3>
        <p className="hint small">Cabinets, tables and more, to see how the couch fits around them. Select one to change its size, name or colour.</p>
        <div className="module-grid">
          {FURNITURE.map((f) => (
            <button
              key={f.id}
              className="module-card"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/rossi-item', f.id)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => addItem(f.id)}
              title={`${f.name} — ${f.width} × ${f.depth} × ${f.height} cm`}
            >
              <FurnitureThumb def={f} />
              <span className="module-name">{f.name}</span>
              <span className="module-dims">{f.width} × {f.depth} × {f.height}</span>
            </button>
          ))}
        </div>
      </section>
      <p className="hint small">
        Seat height {ROSSI.seatHeight} cm · seat depth {ROSSI.seatDepth} cm · legs {ROSSI.legHeight} cm. Left/right is as seen
        facing the sofa. <a href={SERIES_URL} target="_blank" rel="noreferrer">Rossi at Mio</a> ·{' '}
        <a href={SPEC_URL} target="_blank" rel="noreferrer">spec sheet</a>
      </p>
      <p className="hint small">Unofficial planning tool, not made by or affiliated with Mio. Check sizes on mio.se before you buy.</p>
    </aside>
  )
}
