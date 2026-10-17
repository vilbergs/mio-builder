// Mio Rossi module catalog. All sizes in centimetres.
// Source: Mio's Rossi spec sheet (mio.se/dokument/221541.pdf) and product pages, via search summaries.
// Every seating module is 112 deep x 86 high, seat height 44, seat depth 70; an armrest adds 16 cm.

export type ModuleKind = 'seat' | 'corner' | 'chaise' | 'footstool'
export type Arms = 'none' | 'left' | 'right' | 'both'

export interface ModuleDef {
  id: string
  name: string
  nameSv: string
  kind: ModuleKind
  width: number
  depth: number
  height: number
  arms: Arms
  seats: number
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

const MIO = 'https://www.mio.se/p/'

export const MODULES: ModuleDef[] = [
  { id: 's15-none', name: '1.5-seat, no armrest', nameSv: '1,5-sits utan armstöd', kind: 'seat', width: 106, depth: 112, height: 86, arms: 'none', seats: 1.5, url: MIO + 'rossi-15-sits-utan-armst%C3%B6d/505196' },
  { id: 's15-left', name: '1.5-seat, armrest left', nameSv: '1,5-sits med armstöd vänster', kind: 'seat', width: 122, depth: 112, height: 86, arms: 'left', seats: 1.5, url: MIO + 'rossi-15-sits-med-armst%C3%B6d-v%C3%A4nster/505198' },
  { id: 's15-right', name: '1.5-seat, armrest right', nameSv: '1,5-sits med armstöd höger', kind: 'seat', width: 122, depth: 112, height: 86, arms: 'right', seats: 1.5 },
  { id: 's15-both', name: '1.5-seat, two armrests', nameSv: '1,5-sits med två armstöd', kind: 'seat', width: 138, depth: 112, height: 86, arms: 'both', seats: 1.5 },
  { id: 's2-none', name: '2-seat, no armrest', nameSv: '2-sits utan armstöd', kind: 'seat', width: 126, depth: 112, height: 86, arms: 'none', seats: 2, url: MIO + 'rossi-2-sits-utan-armst%C3%B6d/505201' },
  { id: 's2-left', name: '2-seat, armrest left', nameSv: '2-sits med armstöd vänster', kind: 'seat', width: 142, depth: 112, height: 86, arms: 'left', seats: 2, url: MIO + 'rossi-2-sits-med-armst%C3%B6d-v%C3%A4nster/505203' },
  { id: 's2-right', name: '2-seat, armrest right', nameSv: '2-sits med armstöd höger', kind: 'seat', width: 142, depth: 112, height: 86, arms: 'right', seats: 2, url: MIO + 'rossi-2-sits-med-armst%C3%B6d-h%C3%B6ger/505202' },
  { id: 's2-both', name: '2-seat, two armrests', nameSv: '2-sits', kind: 'seat', width: 158, depth: 112, height: 86, arms: 'both', seats: 2, url: MIO + 'rossi-2-sits/505200' },
  { id: 'corner', name: 'Corner 90', nameSv: 'Hörn 90', kind: 'corner', width: 110, depth: 110, height: 86, arms: 'none', seats: 1 },
  { id: 'chaise-left', name: 'Chaise XL, armrest left', nameSv: 'Schäslong XL vänster', kind: 'chaise', width: 142, depth: 190, height: 86, arms: 'left', seats: 1 },
  { id: 'chaise-right', name: 'Chaise XL, armrest right', nameSv: 'Schäslong XL höger', kind: 'chaise', width: 142, depth: 190, height: 86, arms: 'right', seats: 1 },
  { id: 'foot', name: 'Footstool', nameSv: 'Fotpall', kind: 'footstool', width: 104, depth: 80, height: 44, arms: 'none', seats: 0, url: MIO + 'rossi-fotpall/505217' },
  { id: 'foot-xl', name: 'Footstool XL', nameSv: 'Fotpall XL', kind: 'footstool', width: 124, depth: 80, height: 44, arms: 'none', seats: 0 },
]

export const MODULE_BY_ID: Record<string, ModuleDef> = Object.fromEntries(MODULES.map((m) => [m.id, m]))

export const SERIES_URL = 'https://www.mio.se/varumarken-och-serier/serier-soffor/rossi'
export const SPEC_URL = 'https://www.mio.se/dokument/221541.pdf'

export interface Fabric {
  id: string
  name: string
  color: string
}

// Colours are approximations; Mio's fabric photos could not be downloaded from the build environment.
export const FABRICS: Fabric[] = [
  { id: 'light-grey', name: 'Light grey', color: '#b9b6b0' },
  { id: 'graphite', name: 'Graphite', color: '#55575a' },
  { id: 'beige', name: 'Beige', color: '#cbbba2' },
  { id: 'sand', name: 'Sand', color: '#d8cdb9' },
  { id: 'off-white', name: 'Off-white', color: '#e7e2d8' },
  { id: 'moss', name: 'Moss green', color: '#6b7158' },
  { id: 'rust', name: 'Rust', color: '#9c5a3c' },
  { id: 'dusty-blue', name: 'Dusty blue', color: '#6f8291' },
]
