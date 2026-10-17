import { floorCanvas, FLOOR_TILE } from '../model/floor'
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
  if (hit) {
    // Re-insert so the map's order is least- to most-recently used.
    fabricCache.delete(hex)
    fabricCache.set(hex, hit)
    return hit
  }
  const made = makeFabric(hex)
  fabricCache.set(hex, made)
  // Dragging the colour picker visits many colours; keep only the last few in memory.
  while (fabricCache.size > 8) {
    const [oldKey, old] = fabricCache.entries().next().value!
    old.map.dispose()
    old.bumpMap.dispose()
    fabricCache.delete(oldKey)
  }
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
  const t = new THREE.CanvasTexture(floorCanvas())
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  // Floor UVs are in metres.
  t.repeat.set(100 / FLOOR_TILE, 100 / FLOOR_TILE)
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
  for (const [k, old] of imageCache) {
    old.dispose()
    imageCache.delete(k)
  }
  imageCache.set(url, t)
  return t
}
