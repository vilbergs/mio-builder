function download(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
}

const INLINE = ['fill', 'stroke', 'stroke-width', 'font-family', 'font-size', 'paint-order', 'font-variant-numeric']

/** Save the 2D plan (an SVG) as a PNG, with the page's CSS styles baked in. */
export async function exportSvg(svg: SVGSVGElement, name: string) {
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
  download(canvas.toDataURL('image/png'), name)
}

export function exportCanvas(canvas: HTMLCanvasElement, name: string) {
  download(canvas.toDataURL('image/png'), name)
}

export type CameraView = 'corner' | 'top' | 'eye'

export function requestCamera(view: CameraView) {
  window.dispatchEvent(new CustomEvent<CameraView>('rossi-camera', { detail: view }))
}
