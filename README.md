# mio-builder

Mio doesn't have an official couch builder so I'm trying to make my own.

**Rossi Couch Builder** lets you draw your own room and puzzle together [Mio Rossi](https://www.mio.se/varumarken-och-serier/serier-soffor/rossi) modules inside it, true to size.

## Features

- All Rossi modules with their measurements (cm): 1,5-sits and 2-sits with no, left, right or both armrests, Hörn 90, Schäslong XL left/right, Fotpall and Fotpall XL. Data lives in `src/data/modules.ts`.
- One-click starting points rebuilt from modules: Mio's 2-, 3- and 4-sits sofas, 2-/4-sits with Schäslong XL and the corner sofa with divan, left or right.
- Drag modules in 2D or 3D. They snap edge-to-edge to each other and to walls; overlaps and modules outside the room turn red.
- Shift-click or Ctrl+A to select several modules and move, rotate, mirror, duplicate or delete them together.
- Live distances from the selection to the nearest wall on each side.
- Room editor with any number of walls (all horizontal/vertical): presets, drag walls, type exact lengths, add notches or bays, line a wall up with its neighbour to remove a step.
- Doors and windows on any wall (drag them along the wall or type sizes); modules in a door's swing are flagged.
- 2D plan and 3D view, each in **Sketch** (pencil on paper / clay with outlines) or **Realistic** (fabric, wood floor, shadows) style.
- Armrest A or B, fabric colours, or your own fabric photo as texture.
- 3D camera views (overview, top, eye level) and image export of the plan or the 3D view.
- Undo/redo, autosave in the browser, JSON export/import, copyable parts list.

Keys: `R` rotate (Shift+R the other way) · `M` mirror · `Del` delete · arrows nudge 1 cm (Shift = 10 cm) · `Ctrl+A` select all · `Ctrl+D` duplicate · `Ctrl+Z` undo.

## Run

```sh
npm install
npm run dev     # http://localhost:5173
npm run build   # static files in dist/
npm test        # geometry and preset unit tests
npm run build:artifact  # one self-contained HTML file in dist-artifact/
```

## About the measurements

Every Rossi seating module is 112 cm deep and 86 cm high (seat height 44, seat depth 70); each armrest adds 16 cm of width. Figures come from Mio's [Rossi spec sheet](https://www.mio.se/dokument/221541.pdf) and product pages, read through search summaries, so treat them as ±2 cm and check mio.se before buying. Fabric colours are approximations.
