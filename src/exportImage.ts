interface DownloadsApi {
  save(req: { filename: string; data: string | Blob }): Promise<unknown>
}
type ClaudeHost = { use?: (name: string) => Promise<unknown> }

/**
 * Save a file. Inside the claude.ai artifact viewer plain downloads are blocked, so use its
 * `downloads` capability there; elsewhere fall back to a normal download link.
 * Resolves to a short status message for the UI.
 */
export async function download(data: string | Blob, name: string): Promise<string> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude
  if (host?.use) {
    const api = (await host.use('downloads').catch(() => null)) as DownloadsApi | null
    if (api) {
      const blob = typeof data === 'string' && data.startsWith('data:') ? await (await fetch(data)).blob() : data
      try {
        await api.save({ filename: name, data: blob })
        return 'Saved'
      } catch (e) {
        const code = (e as { code?: string }).code
        return code === 'declined' ? 'Not saved' : 'Saving is not available here; copy it instead'
      }
    }
  }
  const url = typeof data === 'string' && data.startsWith('data:') ? data : URL.createObjectURL(data instanceof Blob ? data : new Blob([data]))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  if (!url.startsWith('data:')) setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'Downloaded'
}

const INLINE = ['fill', 'stroke', 'stroke-width', 'font-family', 'font-size', 'paint-order', 'font-variant-numeric']

/** Render the 2D plan (an SVG) to a PNG data URL, with the page's CSS styles baked in. */
export async function svgToPng(svg: SVGSVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const src = svg.querySelectorAll('*')
  const dst = clone.querySelectorAll('*')
  src.forEach((el, i) => {
    if (!(el instanceof SVGTextElement) && !el.closest('.dim, .clear')) return
    const cs = getComputedStyle(el)
    const d = dst[i] as SVGElement
    d.setAttribute('style', INLINE.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'))
  })
  const scale = 2
  const w = svg.clientWidth * scale
  const h = svg.clientHeight * scale
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  const xml = new XMLSerializer().serializeToString(clone)
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/png')
}

export type CameraView = 'corner' | 'top' | 'eye'

export function requestCamera(view: CameraView) {
  window.dispatchEvent(new CustomEvent<CameraView>('rossi-camera', { detail: view }))
}
