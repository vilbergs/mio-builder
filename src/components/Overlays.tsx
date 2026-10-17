import { useRef, useState } from 'react'
import { useStore } from '../store'
import { download } from '../exportImage'

export function ExportDialog() {
  const preview = useStore((s) => s.exportPreview)
  const set = useStore((s) => s.set)
  const text = useRef<HTMLTextAreaElement>(null)
  const [copiedFor, setCopiedFor] = useState<string | null>(null)
  if (!preview) return null
  const copied = copiedFor === preview.data
  const close = () => set({ exportPreview: null })
  const save = async () => {
    const msg = await download(preview.kind === 'image' ? preview.data : new Blob([preview.data], { type: 'text/plain' }), preview.name)
    useStore.getState().showToast(msg)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preview.data)
      setCopiedFor(preview.data)
    } catch {
      text.current?.select()
    }
  }
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="modal" role="dialog" aria-label={preview.title}>
        <header>
          <h2>{preview.title}</h2>
          <button className="link" onClick={close} aria-label="Close">✕</button>
        </header>
        {preview.kind === 'image' ? (
          <img src={preview.data} alt={preview.title} />
        ) : (
          <textarea id="export-text" ref={text} readOnly value={preview.data} onFocus={(e) => e.target.select()} />
        )}
        <div className="btns">
          <button onClick={save}>Download {preview.name}</button>
          {preview.kind === 'text' && <button onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>}
        </div>
        <p className="hint small">
          {preview.kind === 'image'
            ? 'If the download is blocked, right-click (or long-press) the image and save it.'
            : 'If the download is blocked, copy the text and save it in a file.'}
        </p>
      </div>
    </div>
  )
}

export function Toast() {
  const toast = useStore((s) => s.toast)
  return toast ? <div className="toast" role="status">{toast}</div> : null
}
