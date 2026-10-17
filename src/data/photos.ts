// Product photos cropped from Mio's printed Rossi price list. They live in the git-ignored
// `local-photos/` folder (Mio's images aren't ours to publish in this repository); without it the
// app falls back to its own drawings.
const files = import.meta.glob('../../local-photos/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

const byName: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.split('/').pop()!.replace(/\.jpg$/, ''), url]),
)

export interface Photo {
  url: string
  /** The photo shows the other hand, so mirror it. */
  flip: boolean
}

const MODULE_PHOTOS: Record<string, [string, boolean]> = {
  's15-none': ['s15-none', false],
  's15-left': ['s15-one', true],
  's15-right': ['s15-one', false],
  's15-both': ['s15-both', false],
  's2-none': ['s2-none', false],
  's2-left': ['s2-one', false],
  's2-right': ['s2-one', true],
  's2-both': ['s2-both', false],
  's3-both': ['p-sofa3', false],
  corner: ['corner', false],
  'chaisesm-left': ['chaise', true],
  'chaisesm-right': ['chaise', false],
  'chaise-left': ['chaise-xl', true],
  'chaise-right': ['chaise-xl', false],
  'open-left': ['open', true],
  'open-right': ['open', false],
  foot: ['foot', false],
  'foot-xl': ['foot-xl', false],
  // Ready-made sofas, by preset id.
  sofa3: ['p-sofa3', false],
  sofa4: ['p-sofa4', false],
  'chaise2-r': ['p-chaise2', false],
  'chaise2-l': ['p-chaise2', true],
  'chaise3-l': ['p-chaise3', false],
  'chaise3-r': ['p-chaise3', true],
  'chaise4-r': ['p-chaise4', false],
  'chaise4-l': ['p-chaise4', true],
  'divan2-l': ['p-divan2', false],
  'divan2-r': ['p-divan2', true],
  'divan3-r': ['p-divan3', false],
  'divan3-l': ['p-divan3', true],
  'divan4-r': ['p-divan4', false],
  'divan4-l': ['p-divan4', true],
  armA: ['arm-a', false],
  armB: ['arm-b', false],
}

export function photoFor(id: string): Photo | null {
  const hit = MODULE_PHOTOS[id]
  const url = hit && byName[hit[0]]
  return url ? { url, flip: hit[1] } : null
}

export const hasPhotos = Object.keys(byName).length > 0
