import { MODULES, ROSSI, SERIES_URL, SPEC_URL, type ModuleDef } from '../data/modules'
import { moduleParts } from '../model/parts'
import { useStore } from '../store'

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

const GROUPS: { title: string; kinds: ModuleDef['kind'][] }[] = [
  { title: 'Seats', kinds: ['seat'] },
  { title: 'Corner & chaise', kinds: ['corner', 'chaise'] },
  { title: 'Footstools', kinds: ['footstool'] },
]

export function Palette() {
  const addModule = useStore((s) => s.addModule)
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
                <Thumb def={m} />
                <span className="module-name">{m.name}</span>
                <span className="module-dims">{m.width} × {m.depth} × {m.height}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <p className="hint small">
        Seat height {ROSSI.seatHeight} cm · seat depth {ROSSI.seatDepth} cm · legs {ROSSI.legHeight} cm. Left/right is as seen
        facing the sofa. <a href={SERIES_URL} target="_blank" rel="noreferrer">Rossi at Mio</a> ·{' '}
        <a href={SPEC_URL} target="_blank" rel="noreferrer">spec sheet</a>
      </p>
    </aside>
  )
}
