// Light natural oak planks, matched to the room's real floor: wide (20 cm), long (1.2–2.2 m) boards with soft,
// low-contrast grain and barely visible seams. One tile covers FLOOR_TILE cm and repeats seamlessly.

export const FLOOR_TILE = 240 // cm
const PLANK_W = 20 // cm

function rand(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export function floorCanvas(px = 2048): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = cv.height = px
  const c = cv.getContext('2d')!
  const r = rand(11)
  const k = px / FLOOR_TILE // canvas px per cm
  const rows = FLOOR_TILE / PLANK_W
  const ph = PLANK_W * k

  const plank = (x: number, y: number, len: number, seed: number) => {
    const r = rand(seed)
    const tone = 0.95 + r() * 0.09
    const warm = (r() - 0.5) * 8
    c.save()
    c.beginPath()
    c.rect(x, y, len, ph)
    c.clip()
    c.fillStyle = `rgb(${210 * tone + warm}, ${172 * tone}, ${132 * tone - warm})`
    c.fillRect(x, y, len, ph)
    // Long straight grain lines.
    for (let g = 0; g < 34; g++) {
      c.strokeStyle = `rgba(120,82,48,${0.03 + r() * 0.06})`
      c.lineWidth = (0.5 + r() * 1.4) * (px / 2048)
      const gy = y + r() * ph
      c.beginPath()
      c.moveTo(x, gy)
      c.bezierCurveTo(x + len / 3, gy + (r() - 0.5) * ph * 0.08, x + (2 * len) / 3, gy + (r() - 0.5) * ph * 0.08, x + len, gy)
      c.stroke()
    }
    // A few oak "cathedral" arches.
    const arches = Math.floor(r() * 3)
    for (let a = 0; a < arches; a++) {
      const cx = x + len * (0.15 + r() * 0.7)
      const cy = y + ph * (0.3 + r() * 0.4)
      const aw = len * (0.12 + r() * 0.15)
      for (let n = 0; n < 6; n++) {
        const s = 1 + n * 0.35
        c.strokeStyle = `rgba(120,82,48,${0.05 + r() * 0.05})`
        c.lineWidth = (0.8 + r()) * (px / 2048)
        c.beginPath()
        c.ellipse(cx, cy, (aw * s) / 2, (ph * 0.12 * s) / 2, 0, Math.PI * 0.5, Math.PI * 1.5)
        c.stroke()
      }
    }
    c.restore()
    // Seams: hairline and soft.
    c.fillStyle = 'rgba(95,65,40,0.32)'
    const seam = Math.max(1, 1.2 * (px / 2048))
    c.fillRect(x, y, seam, ph)
    c.fillRect(x + len - seam, y, seam, ph)
  }

  for (let row = 0; row < rows; row++) {
    const y = row * ph
    const start = r() * px
    let x = start
    while (x < start + px) {
      const len = (120 + r() * 100) * k
      // Draw each plank twice, a tile apart, so the pattern wraps without a seam.
      const seed = 1 + Math.floor(r() * 1e6)
      plank(x, y, len, seed)
      plank(x - px, y, len, seed)
      x += len
    }
    c.fillStyle = 'rgba(95,65,40,0.3)'
    c.fillRect(0, y, px, Math.max(1, 1.2 * (px / 2048)))
  }
  return cv
}

let url: string | null = null
/** A small JPEG of the floor for the 2D plan. */
export function floorDataUrl(): string {
  url ??= floorCanvas(768).toDataURL('image/jpeg', 0.85)
  return url
}
