import { useEffect } from 'react'
import { useStore } from './store'
import { Palette } from './components/Palette'
import { Inspector } from './components/Inspector'
import { Plan2D } from './components/Plan2D'
import { View3D } from './components/View3D'

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  )
}

export default function App() {
  const s = useStore()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      const st = useStore.getState()
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        st.redo()
        return
      }
      const sel = st.modules.find((m) => m.uid === st.selected)
      if (!sel) return
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        st.duplicate(sel.uid)
      } else if (e.key === 'r' || e.key === 'R') {
        st.rotate(sel.uid, e.shiftKey ? -1 : 1)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        st.removeModule(sel.uid)
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        const d = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0
        st.updateModule(sel.uid, { x: sel.x + dx, y: sel.y + dy })
      } else if (e.key === 'Escape') {
        st.set({ selected: null })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">▭▭▯</span>
          <div>
            <h1>Rossi Couch Builder</h1>
            <span className="sub">Puzzle together Mio Rossi modules in your own room</span>
          </div>
        </div>
        <div className="controls">
          <Seg value={s.edit} options={[['couch', 'Couch'], ['room', 'Room']]} onChange={(v) => s.set({ edit: v, selected: null, selectedWall: null, view: v === 'room' ? '2d' : s.view })} />
          <Seg value={s.view} options={[['2d', '2D'], ['3d', '3D']]} onChange={(v) => s.set({ view: v, edit: v === '3d' ? 'couch' : s.edit })} />
          <Seg value={s.style} options={[['sketch', 'Sketch'], ['real', 'Realistic']]} onChange={(v) => s.set({ style: v })} />
          <div className="seg">
            <button onClick={s.undo} disabled={!s.past.length} title="Undo (Ctrl+Z)">↶</button>
            <button onClick={s.redo} disabled={!s.future.length} title="Redo (Ctrl+Shift+Z)">↷</button>
          </div>
        </div>
      </header>
      <main className="main">
        <Palette />
        <div className="stage">
          {s.view === '2d' ? <Plan2D /> : <View3D />}
          <div className="stage-hint">
            {s.view === '3d'
              ? 'Drag to orbit · scroll to zoom · right-drag to pan · drag a module to move it'
              : s.edit === 'room'
                ? 'Drag a wall to move it · click a wall to type its length'
                : 'Drag modules · scroll to zoom · drag the background to pan'}
          </div>
        </div>
        <Inspector />
      </main>
    </div>
  )
}
