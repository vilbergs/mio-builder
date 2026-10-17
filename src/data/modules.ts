// Mio Rossi module catalog. All sizes in centimetres, prices in SEK.
// Source: Mio's printed Rossi price list (season sale, valid to 2026-10-19), cross-checked with
// mio.se/dokument/221541.pdf. Every seating module is 112 deep x 86 high, seat height 44, seat depth 70;
// both armrest styles are 16 cm wide; legs are wengé-stained, 4.5 cm high. Mio allows about ±2 cm.

export type ModuleKind = 'seat' | 'corner' | 'chaise' | 'openEnd' | 'footstool'
export type Arms = 'none' | 'left' | 'right' | 'both'

/** Price per fabric group: Zoom; Alex, Iberia, Aurora; Grand. */
export interface Price {
  zoom: number
  alex: number
  grand: number
  /** Season sale price in Zoom and Alex. */
  sale: { zoom: number; alex: number }
}

export interface ModuleDef {
  id: string
  name: string
  nameSv: string
  kind: ModuleKind
  width: number
  depth: number
  height: number
  arms: Arms
  /** For an open end: the side without a back. */
  open?: 'left' | 'right'
  seats: number
  /** Decorative 50x50 cushions included. */
  pillows: number
  price: Price
  url?: string
}

export const ROSSI = {
  depth: 112,
  height: 86,
  seatHeight: 44,
  seatDepth: 70,
  armWidth: 16,
  legHeight: 4.5,
}

export const SALE_ENDS = '2026-10-19'

const MIO = 'https://www.mio.se/p/'
const P = (zoom: number, alex: number, grand: number, saleZoom: number, saleAlex: number): Price => ({ zoom, alex, grand, sale: { zoom: saleZoom, alex: saleAlex } })

const S15_NONE = P(6995, 7995, 8995, 5995, 6495)
const S15_ONE = P(7495, 8495, 9995, 6495, 6995)
const S15_BOTH = P(7995, 8995, 9995, 6995, 7495)
const S2_NONE = P(7495, 8495, 9495, 6495, 6995)
const S2_ONE = P(7995, 8995, 10495, 6995, 7495)
const S2_BOTH = P(8995, 9995, 10995, 7995, 8495)
const CHAISE = P(8505, 9005, 11005, 7505, 8005)
const CHAISE_XL = P(10500, 11000, 13000, 9500, 10000)
const OPEN_END = P(7000, 7500, 9000, 6500, 7000)

export const MODULES: ModuleDef[] = [
  { id: 's15-none', name: '1.5-seat, no armrest', nameSv: '1,5-sits utan armstöd', kind: 'seat', width: 106, depth: 112, height: 86, arms: 'none', seats: 1.5, pillows: 2, price: S15_NONE, url: MIO + 'rossi-15-sits-utan-armst%C3%B6d/505196' },
  { id: 's15-left', name: '1.5-seat, armrest left', nameSv: '1,5-sits med armstöd vänster', kind: 'seat', width: 122, depth: 112, height: 86, arms: 'left', seats: 1.5, pillows: 2, price: S15_ONE, url: MIO + 'rossi-15-sits-med-armst%C3%B6d-v%C3%A4nster/505198' },
  { id: 's15-right', name: '1.5-seat, armrest right', nameSv: '1,5-sits med armstöd höger', kind: 'seat', width: 122, depth: 112, height: 86, arms: 'right', seats: 1.5, pillows: 2, price: S15_ONE },
  { id: 's15-both', name: '1.5-seat, two armrests', nameSv: '1,5-sits', kind: 'seat', width: 138, depth: 112, height: 86, arms: 'both', seats: 1.5, pillows: 2, price: S15_BOTH },
  { id: 's2-none', name: '2-seat, no armrest', nameSv: '2-sits utan armstöd', kind: 'seat', width: 126, depth: 112, height: 86, arms: 'none', seats: 2, pillows: 3, price: S2_NONE, url: MIO + 'rossi-2-sits-utan-armst%C3%B6d/505201' },
  { id: 's2-left', name: '2-seat, armrest left', nameSv: '2-sits med armstöd vänster', kind: 'seat', width: 142, depth: 112, height: 86, arms: 'left', seats: 2, pillows: 3, price: S2_ONE, url: MIO + 'rossi-2-sits-med-armst%C3%B6d-v%C3%A4nster/505203' },
  { id: 's2-right', name: '2-seat, armrest right', nameSv: '2-sits med armstöd höger', kind: 'seat', width: 142, depth: 112, height: 86, arms: 'right', seats: 2, pillows: 3, price: S2_ONE, url: MIO + 'rossi-2-sits-med-armst%C3%B6d-h%C3%B6ger/505202' },
  { id: 's2-both', name: '2-seat, two armrests', nameSv: '2-sits', kind: 'seat', width: 158, depth: 112, height: 86, arms: 'both', seats: 2, pillows: 3, price: S2_BOTH, url: MIO + 'rossi-2-sits/505200' },
  { id: 's3-both', name: '3-seat sofa', nameSv: '3-sits soffa', kind: 'seat', width: 242, depth: 112, height: 86, arms: 'both', seats: 3, pillows: 4, price: P(14990, 16990, 19990, 12990, 13990), url: MIO + 'rossi-3-sits-soffa/505206' },
  { id: 'corner', name: 'Corner 90', nameSv: 'Hörn 90', kind: 'corner', width: 110, depth: 110, height: 86, arms: 'none', seats: 1, pillows: 4, price: P(6500, 7000, 8500, 5500, 6000) },
  { id: 'chaisesm-left', name: 'Chaise, armrest left', nameSv: 'Schäslong med armstöd vänster', kind: 'chaise', width: 122, depth: 190, height: 86, arms: 'left', seats: 1, pillows: 2, price: CHAISE },
  { id: 'chaisesm-right', name: 'Chaise, armrest right', nameSv: 'Schäslong med armstöd höger', kind: 'chaise', width: 122, depth: 190, height: 86, arms: 'right', seats: 1, pillows: 2, price: CHAISE, url: MIO + 'rossi-schaslong-hoger/505222' },
  { id: 'chaise-left', name: 'Chaise XL, armrest left', nameSv: 'Schäslong XL med armstöd vänster', kind: 'chaise', width: 142, depth: 190, height: 86, arms: 'left', seats: 1, pillows: 3, price: CHAISE_XL },
  { id: 'chaise-right', name: 'Chaise XL, armrest right', nameSv: 'Schäslong XL med armstöd höger', kind: 'chaise', width: 142, depth: 190, height: 86, arms: 'right', seats: 1, pillows: 3, price: CHAISE_XL },
  { id: 'open-left', name: 'Open end, open left', nameSv: 'Öppet avslut vänster', kind: 'openEnd', width: 144, depth: 112, height: 86, arms: 'none', open: 'left', seats: 1.5, pillows: 2, price: OPEN_END },
  { id: 'open-right', name: 'Open end, open right', nameSv: 'Öppet avslut höger', kind: 'openEnd', width: 144, depth: 112, height: 86, arms: 'none', open: 'right', seats: 1.5, pillows: 2, price: OPEN_END },
  { id: 'foot', name: 'Footstool', nameSv: 'Fotpall', kind: 'footstool', width: 104, depth: 80, height: 44, arms: 'none', seats: 0, pillows: 0, price: P(3995, 4495, 4995, 3495, 3995), url: MIO + 'rossi-fotpall/505217' },
  { id: 'foot-xl', name: 'Footstool XL', nameSv: 'Fotpall XL', kind: 'footstool', width: 124, depth: 80, height: 44, arms: 'none', seats: 0, pillows: 0, price: P(4495, 4995, 5495, 3995, 4495) },
]

export const MODULE_BY_ID: Record<string, ModuleDef> = Object.fromEntries(MODULES.map((m) => [m.id, m]))

export const SERIES_URL = 'https://www.mio.se/varumarken-och-serier/serier-soffor/rossi'
export const SPEC_URL = 'https://www.mio.se/dokument/221541.pdf'

export type FabricGroup = 'zoom' | 'alex' | 'iberia' | 'grand'

// Alex, Iberia and Aurora share a price, but the season sale covers only Zoom and Alex.
export const FABRIC_GROUPS: { id: FabricGroup; name: string }[] = [
  { id: 'zoom', name: 'Zoom' },
  { id: 'alex', name: 'Alex' },
  { id: 'iberia', name: 'Iberia / Aurora' },
  { id: 'grand', name: 'Grand' },
]

export interface Fabric {
  id: string
  name: string
  color: string
}

// Colours sampled from the product photos in Mio's printed Rossi price list (white-balanced
// against the paper). Mio doesn't say which fabric each photo shows, so these are named by colour.
export const FABRICS: Fabric[] = [
  { id: 'greige', name: 'Greige', color: '#a69a95' },
  { id: 'light-grey', name: 'Light grey', color: '#a7a2a4' },
  { id: 'taupe', name: 'Taupe', color: '#ab9f9b' },
  { id: 'charcoal', name: 'Charcoal', color: '#444242' },
  { id: 'dark-brown', name: 'Dark brown', color: '#574848' },
  { id: 'rust', name: 'Rust', color: '#8a4d3c' },
  { id: 'forest', name: 'Forest green', color: '#39423f' },
  { id: 'denim', name: 'Denim blue', color: '#4c5866' },
  { id: 'navy', name: 'Navy', color: '#2b363d' },
]
