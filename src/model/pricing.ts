import { MODULE_BY_ID, SALE_ENDS, type FabricGroup, type Price } from '../data/modules'
import { matchPreset, type Preset } from '../data/presets'

export function saleActive(today = new Date()): boolean {
  // Local calendar date, compared as YYYY-MM-DD.
  const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return d <= SALE_ENDS
}

export function regularPrice(p: Price, g: FabricGroup): number {
  return g === 'zoom' ? p.zoom : g === 'grand' ? p.grand : p.alex
}

export function currentPrice(p: Price, g: FabricGroup, sale: boolean): number {
  if (sale && g === 'zoom') return p.sale.zoom
  if (sale && g === 'alex') return p.sale.alex
  return regularPrice(p, g)
}

export interface Quote {
  regular: number
  now: number
  /** Set when the sofa modules exactly make up one of Mio's packages. */
  preset: Preset | null
  /** What the same modules cost bought one by one (only when a package applies). */
  separately: { regular: number; now: number } | null
}

export function quote(defIds: string[], g: FabricGroup, sale: boolean): Quote {
  const sofa = defIds.filter((id) => MODULE_BY_ID[id].kind !== 'footstool')
  const extras = defIds.filter((id) => MODULE_BY_ID[id].kind === 'footstool')
  const sum = (ids: string[], f: (p: Price) => number) => ids.reduce((n, id) => n + f(MODULE_BY_ID[id].price), 0)
  const single = {
    regular: sum(defIds, (p) => regularPrice(p, g)),
    now: sum(defIds, (p) => currentPrice(p, g, sale)),
  }
  const preset = sofa.length > 1 ? matchPreset(sofa) : null
  if (!preset) return { ...single, preset: null, separately: null }
  const pkg = {
    regular: regularPrice(preset.price, g) + sum(extras, (p) => regularPrice(p, g)),
    now: currentPrice(preset.price, g, sale) + sum(extras, (p) => currentPrice(p, g, sale)),
  }
  // Use whichever is cheaper; the package normally is.
  return pkg.now <= single.now ? { ...pkg, preset, separately: single } : { ...single, preset: null, separately: null }
}

export const kr = (n: number) => `${n.toLocaleString('sv-SE')} kr`
