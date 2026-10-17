import * as THREE from 'three'

function rand(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const fabricCache = new Map<string, { map: THREE.Texture; bumpMap: THREE.Texture }>()
const imageCache = new Map<string, THREE.Texture>()
let wood: THREE.Texture | null = null

/** Woven fabric: returns a colour map and a bump map (cached per colour). */
export function fabricTextures(hex: string) {
  const hit = fabricCache.get(hex)
  if (hit) return hit
  const made = makeFabric(hex)
  fabricCache.set(hex, made)
  return made
}

function makeFabric(hex: string) {
  const size = 256
  const color = document.createElement('canvas')
  const bump = document.createElement('canvas')
  color.width = color.height = bump.width = bump.height = size
  const c = color.getContext('2d')!
  const b = bump.getContext('2d')!
  const n0 = parseInt(hex.slice(1), 16)
  const base = { r: ((n0 >> 16) & 255) / 255, g: ((n0 >> 8) & 255) / 255, b: (n0 & 255) / 255 } // sRGB, as the canvas expects
  const img = c.createImageData(size, size)
  const bimg = b.createImageData(size, size)
  const r = rand(42)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Basket weave: alternating warp/weft every 4 px, plus fibre noise.
      const cell = ((x >> 2) + (y >> 2)) & 1
      const along = cell ? (x % 4) / 3 : (y % 4) / 3
      const ridge = Math.sin(along * Math.PI)
      const n = (r() - 0.5) * 0.16
      const v = 0.86 + ridge * 0.12 + n
      const i = (y * size + x) * 4
      img.data[i] = Math.min(255, base.r * 255 * v)
      img.data[i + 1] = Math.min(255, base.g * 255 * v)
      img.data[i + 2] = Math.min(255, base.b * 255 * v)
      img.data[i + 3] = 255
      const h = Math.max(0, Math.min(255, 128 + ridge * 90 + n * 200))
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = h
      bimg.data[i + 3] = 255
    }
  }
  c.putImageData(img, 0, 0)
  b.putImageData(bimg, 0, 0)
  const map = new THREE.CanvasTexture(color)
  map.colorSpace = THREE.SRGBColorSpace
  const bumpMap = new THREE.CanvasTexture(bump)
  for (const t of [map, bumpMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(6, 6)
    t.anisotropy = 4
  }
  return { map, bumpMap }
}

/** Oak plank floor, one texture tile = 1.2 m. */
export function woodTexture() {
  wood ??= makeWood()
  return wood
}

function makeWood() {
  const w = 1024
  const h = 1024
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const c = cv.getContext('2d')!
  const r = rand(7)
  const plankH = h / 8
  for (let row = 0; row < 8; row++) {
    let x = -r() * 400
    while (x < w) {
      const len = 300 + r() * 500
      const tone = 0.85 + r() * 0.2
      c.fillStyle = `rgb(${200 * tone}, ${163 * tone}, ${118 * tone})`
      c.fillRect(x, row * plankH, len, plankH)
      for (let g = 0; g < 26; g++) {
        c.strokeStyle = `rgba(110,75,40,${0.05 + r() * 0.08})`
        c.lineWidth = 1 + r() * 2
        c.beginPath()
        const gy = row * plankH + r() * plankH
        c.moveTo(x, gy)
        c.bezierCurveTo(x + len / 3, gy + (r() - 0.5) * 10, x + (2 * len) / 3, gy + (r() - 0.5) * 10, x + len, gy)
        c.stroke()
      }
      c.fillStyle = 'rgba(70,45,25,0.55)'
      c.fillRect(x, row * plankH, 2, plankH)
      x += len
    }
    c.fillStyle = 'rgba(70,45,25,0.5)'
    c.fillRect(0, row * plankH, w, 2)
  }
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1 / 1.2, 1 / 1.2)
  t.anisotropy = 8
  return t
}

export function imageTexture(url: string) {
  const hit = imageCache.get(url)
  if (hit) return hit
  const t = new THREE.TextureLoader().load(url)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 2)
  imageCache.set(url, t)
  return t
}
