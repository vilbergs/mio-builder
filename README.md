# mio-builder

Mio doesn't have an official couch builder so I'm trying to make my own.

**Rossi Couch Builder** lets you draw your own room and puzzle together [Mio Rossi](https://www.mio.se/varumarken-och-serier/serier-soffor/rossi) modules inside it, true to size.

## Features

- All Rossi modules with their measurements (cm): 1,5-sits and 2-sits with no, left, right or both armrests, Hörn 90, Schäslong XL left/right, Fotpall and Fotpall XL. Data lives in `src/data/modules.ts`.
- Drag modules in 2D or 3D. They snap edge-to-edge to each other and to walls; overlaps and modules outside the room turn red.
- Room editor with any number of walls (all horizontal/vertical): presets, drag walls, type exact lengths, add notches or bays.
- 2D plan and 3D view, each in **Sketch** (pencil on paper / clay with outlines) or **Realistic** (fabric, wood floor, shadows) style.
- Armrest A or B, fabric colours, or your own fabric photo as texture.
- Undo/redo, autosave in the browser, JSON export/import.

Keys: `R` rotate (Shift+R the other way) · `Del` delete · arrows nudge 1 cm (Shift = 10 cm) · `Ctrl+D` duplicate · `Ctrl+Z` undo.

## Run

```sh
npm install
npm run dev     # http://localhost:5173
npm run build   # static files in dist/
```

## About the measurements

Every Rossi seating module is 112 cm deep and 86 cm high (seat height 44, seat depth 70); each armrest adds 16 cm of width. Figures come from Mio's [Rossi spec sheet](https://www.mio.se/dokument/221541.pdf) and product pages, read through search summaries, so treat them as ±2 cm and check mio.se before buying. Fabric colours are approximations.
