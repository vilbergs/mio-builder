import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useStore, moduleIssues, type Design } from '../store'
import { MODULE_BY_ID } from '../data/modules'
import { moduleParts, pillowParts, type Part } from '../model/parts'
import { footprint, walls, pointInPolygon, OPENING_DEFAULTS, type Placed, type Pt } from '../model/geometry'
import { shapeOf, type Item } from '../data/furniture'
import { fabricTextures, woodTexture, imageTexture } from '../three/textures'
import { shade } from '../model/color'
import { requestCamera, type CameraView } from '../exportImage'

const WALL_T = 12
const M = 0.01 // cm -> m

interface Ctx {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  room: THREE.Group
  couch: THREE.Group
  wallMeshes: { obj: THREE.Object3D; c: THREE.Vector3; n: THREE.Vector3 }[]
  sun: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
}

function disposeGroup(g: THREE.Group) {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh
    mesh.geometry?.dispose()
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else mat?.dispose()
  })
  g.clear()
}

function outerRing(room: Pt[]): Pt[] {
  const ws = walls(room)
  const n = room.length
  return room.map((p, i) => {
    const a = ws[(i - 1 + n) % n].inward
    const b = ws[i].inward
    return { x: p.x - (a.x + b.x) * WALL_T, y: p.y - (a.y + b.y) * WALL_T }
  })
}

/** A piece of furniture as simple solids, centred on its footprint with y = 0 on the floor. */
function buildItem(it: Item, sketch: boolean, bad: boolean): THREE.Group {
  const g = new THREE.Group()
  const w = it.w * M, d = it.d * M, h = it.h * M
  const mat = (tone = 0) => sketch
    ? new THREE.MeshLambertMaterial({ color: bad ? '#f2c4bd' : shade('#fbf9f4', tone / 3) })
    : new THREE.MeshStandardMaterial({
      color: shade(it.color, tone), roughness: 0.8,
      emissive: new THREE.Color(bad ? '#ff2a1a' : '#000000'), emissiveIntensity: bad ? 0.35 : 0,
    })
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, tone = 0) => {
    const mesh = new THREE.Mesh(geo, mat(tone))
    mesh.position.set(x, y, z)
    mesh.castShadow = !sketch && shapeOf(it) !== 'rug'
    mesh.receiveShadow = !sketch
    g.add(mesh)
    if (sketch) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: '#2f2e2a' }))
      edges.position.copy(mesh.position)
      g.add(edges)
    }
  }
  const box = (bw: number, bh: number, bd: number, x: number, y0: number, z: number, tone = 0) => add(new THREE.BoxGeometry(bw, bh, bd), x, y0 + bh / 2, z, tone)
  switch (shapeOf(it)) {
    case 'cabinet': {
      const plinth = Math.min(0.08, h * 0.1)
      box(w - 0.02, plinth, d - 0.03, 0, 0, -0.01, -0.3)
      box(w, h - plinth, d, 0, plinth, 0)
      // Door split down the front of anything wider than a single door.
      if (w > 0.6 && h > 0.3) box(0.004, (h - plinth) * 0.94, 0.004, 0, plinth + (h - plinth) * 0.03, d / 2 + 0.002, -0.35)
      break
    }
    case 'table': {
      const top = Math.min(0.04, h / 3), leg = 0.05
      box(w, top, d, 0, h - top, 0)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(leg, h - top, leg, sx * (w / 2 - leg), 0, sz * (d / 2 - leg), -0.15)
      break
    }
    case 'round': {
      const top = Math.min(0.03, h / 3)
      const disc = new THREE.CylinderGeometry(w / 2, w / 2, top, 40)
      disc.scale(1, 1, d / w)
      add(disc, 0, h - top / 2, 0)
      add(new THREE.CylinderGeometry(0.025, 0.025, h - top, 12), 0, (h - top) / 2, 0, -0.15)
      add(new THREE.CylinderGeometry(w * 0.25, w * 0.28, 0.02, 30), 0, 0.01, 0, -0.15)
      break
    }
    case 'chair': {
      const seatH = Math.min(0.45, h * 0.55), back = Math.min(0.16, d * 0.22)
      const arm = w >= 0.7 ? Math.min(0.14, w * 0.18) : 0
      const legs = arm ? 0.1 : seatH - 0.06
      if (arm) box(w, legs, d, 0, 0, 0, -0.25)
      else for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.035, legs, 0.035, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03), -0.2)
      box(w - arm * 2, seatH - legs, d - back, 0, legs, back / 2, 0.08)
      box(w, h - legs, back, 0, legs, -d / 2 + back / 2, -0.1)
      if (arm) for (const sx of [-1, 1]) box(arm, seatH + 0.15 - legs, d - back, sx * (w / 2 - arm / 2), legs, back / 2, -0.05)
      break
    }
    case 'plant': {
      const r = Math.min(w, d) / 2
      add(new THREE.CylinderGeometry(r * 0.6, r * 0.45, h * 0.3, 24), 0, h * 0.15, 0, -0.55)
      const leaves = new THREE.IcosahedronGeometry(r, 1)
      leaves.scale(w / (2 * r), (h * 0.75) / (2 * r), d / (2 * r))
      add(leaves, 0, h * 0.3 + h * 0.35, 0)
      break
    }
    case 'rug':
      box(w, Math.max(0.005, h), d, 0, 0, 0)
      break
  }
  return g
}

const polyShape = (pts: Pt[]) => new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x * M, -p.y * M)))

export function View3D() {
  const host = useRef<HTMLDivElement>(null)
  const ctx = useRef<Ctx | null>(null)
  const s = useStore()
  const sketch = s.style === 'sketch'

  // ----- one-time setup -----
  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1.15
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI / 2 - 0.03
    controls.minDistance = 0.8
    controls.maxDistance = 30

    const hemi = new THREE.HemisphereLight(0xffffff, 0xd6d0c6, 1.3)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff3e0, 2.0)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.02
    scene.add(sun, sun.target)

    const room = new THREE.Group()
    const couch = new THREE.Group()
    scene.add(room, couch)
    ctx.current = { renderer, scene, camera, controls, room, couch, wallMeshes: [], sun, hemi }

    // Frame the room.
    const frame = (view: CameraView) => {
      const st = useStore.getState()
      const xs = st.room.map((p) => p.x * M), zs = st.room.map((p) => p.y * M)
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs)
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
      const span = Math.max(x1 - x0, z1 - z0)
      // Aim at the couch if there is one, else the room centre.
      const fp = st.modules.map(footprint)
      const tx = fp.length ? (Math.min(...fp.map((r) => r.x0)) + Math.max(...fp.map((r) => r.x1))) / 2 * M : cx
      const tz = fp.length ? (Math.min(...fp.map((r) => r.y0)) + Math.max(...fp.map((r) => r.y1))) / 2 * M : cz
      if (view === 'top') {
        controls.target.set(cx, 0, cz)
        camera.position.set(cx, span * 1.35 + 1, cz + 0.001)
      } else if (view === 'eye') {
        // Stand in the room, on the far side from the couch, at eye height.
        let best = { x: cx, z: cz }
        let bestD = -1
        for (let x = x0 + 0.3; x <= x1 - 0.3; x += 0.1) {
          for (let z = z0 + 0.3; z <= z1 - 0.3; z += 0.1) {
            const inside = [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]].every(([dx, dz]) => pointInPolygon({ x: (x + dx) / M, y: (z + dz) / M }, st.room))
            const d = Math.hypot(x - tx, z - tz)
            if (inside && d > bestD) {
              bestD = d
              best = { x, z }
            }
          }
        }
        controls.target.set(tx, 0.5, tz)
        camera.position.set(best.x, 1.6, best.z)
      } else {
        controls.target.set(cx, 0.4, cz)
        camera.position.set(cx + span * 0.55, span * 0.75 + 1.2, cz + span * 0.95)
      }
      controls.update()
    }
    frame('corner')
    const onCamera = (e: Event) => frame((e as CustomEvent<CameraView>).detail)
    window.addEventListener('rossi-camera', onCamera)

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    let raf = 0
    const tmp = new THREE.Vector3()
    const loop = () => {
      raf = requestAnimationFrame(loop)
      controls.update()
      for (const w of ctx.current!.wallMeshes) {
        tmp.copy(camera.position).sub(w.c)
        tmp.y = 0
        w.obj.visible = tmp.dot(w.n) < 0.05
      }
      renderer.render(scene, camera)
    }
    loop()

    // ----- picking and dragging modules -----
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    let drag: { start: Pt; base: Placed[]; items: Item[]; moved: boolean; future: Design[] } | null = null
    let handled = false
    const setNdc = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
    }
    const floorPt = (): Pt | null => {
      const v = new THREE.Vector3()
      return ray.ray.intersectPlane(floor, v) ? { x: v.x / M, y: v.z / M } : null
    }
    let downAt: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY }
      handled = false
      const state = useStore.getState()
      if (state.edit !== 'couch') return
      setNdc(e)
      const hit = ray.intersectObjects(couch.children, true)[0]
      let o: THREE.Object3D | null = hit?.object ?? null
      while (o && !o.userData.uid) o = o.parent
      if (!o) return
      const uid = o.userData.uid as string
      const p = floorPt()
      if (!p) return
      state.select(uid, e.shiftKey || e.ctrlKey || e.metaKey)
      handled = true
      const sel = new Set(useStore.getState().selected)
      if (!sel.has(uid)) return
      controls.enabled = false
      drag = { start: p, base: state.modules.filter((x) => sel.has(x.uid)), items: state.items.filter((x) => sel.has(x.uid)), moved: false, future: state.future }
      state.snapshot()
      renderer.domElement.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!drag) return
      setNdc(e)
      const p = floorPt()
      if (!p) return
      useStore.getState().dragPieces({ modules: drag.base, items: drag.items }, { x: p.x - drag.start.x, y: p.y - drag.start.y }, 8)
      drag.moved = true
    }
    const onUp = (e: PointerEvent) => {
      if (drag && !drag.moved) {
        const future = drag.future
        useStore.setState((st) => ({ past: st.past.slice(0, -1), future }))
      }
      if (!drag && !handled && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4) useStore.getState().clearSelection()
      drag = null
      downAt = null
      controls.enabled = true
    }
    const dom = renderer.domElement
    dom.addEventListener('pointerdown', onDown)
    dom.addEventListener('pointermove', onMove)
    dom.addEventListener('pointerup', onUp)
    dom.addEventListener('pointercancel', onUp)

    return () => {
      window.removeEventListener('rossi-camera', onCamera)
      cancelAnimationFrame(raf)
      ro.disconnect()
      dom.removeEventListener('pointerdown', onDown)
      dom.removeEventListener('pointermove', onMove)
      dom.removeEventListener('pointerup', onUp)
      dom.removeEventListener('pointercancel', onUp)
      disposeGroup(room)
      disposeGroup(couch)
      controls.dispose()
      renderer.dispose()
      el.removeChild(dom)
      ctx.current = null
    }
  }, [])

  // ----- room -----
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    disposeGroup(c.room)
    c.wallMeshes = []
    c.scene.background = new THREE.Color(sketch ? '#f7f2e6' : '#e7e3dc')
    c.hemi.intensity = sketch ? 2.6 : 2.0
    c.sun.intensity = sketch ? 0.7 : 2.4
    c.renderer.toneMapping = sketch ? THREE.NoToneMapping : THREE.NeutralToneMapping

    const floorGeo = new THREE.ShapeGeometry(polyShape(s.room))
    floorGeo.rotateX(-Math.PI / 2)
    const floorMat = sketch
      ? new THREE.MeshLambertMaterial({ color: '#fbf8f0' })
      : new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.75 })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.receiveShadow = true
    c.room.add(floor)
    if (sketch) {
      const grid = new THREE.GridHelper(40, 80, '#e2d9c4', '#ebe4d3')
      grid.position.y = 0.001
      const xs = s.room.map((p) => p.x * M), zs = s.room.map((p) => p.y * M)
      grid.position.x = Math.round((Math.min(...xs) + Math.max(...xs)) / 2)
      grid.position.z = Math.round((Math.min(...zs) + Math.max(...zs)) / 2)
      c.room.add(grid)
    }

    const outer = outerRing(s.room)
    const wallMat = sketch
      ? new THREE.MeshLambertMaterial({ color: '#fdfbf6' })
      : new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.95 })
    const glassMat = new THREE.MeshStandardMaterial({ color: '#cfe3ee', transparent: true, opacity: sketch ? 0.25 : 0.35, roughness: 0.1 })
    const frameMat = sketch ? new THREE.MeshLambertMaterial({ color: '#fdfbf6' }) : new THREE.MeshStandardMaterial({ color: '#e9e5de', roughness: 0.6 })
    walls(s.room).forEach((w) => {
      const j = (w.i + 1) % s.room.length
      const dir = { x: (w.b.x - w.a.x) / w.length, y: (w.b.y - w.a.y) / w.length }
      const at = (t: number) => ({ x: w.a.x + dir.x * t, y: w.a.y + dir.y * t })
      const out = (t: number) => (t <= 0 ? outer[w.i] : t >= w.length ? outer[j] : { x: at(t).x - w.inward.x * WALL_T, y: at(t).y - w.inward.y * WALL_T })
      // Pieces of this wall: [from, to] along it and [bottom, top] in height (cm).
      const pieces: [number, number, number, number][] = []
      let t = 0
      const ops = s.openings.filter((o) => o.wall === w.i).sort((a, b) => a.offset - b.offset)
      for (const o of ops) {
        if (o.offset > t) pieces.push([t, o.offset, 0, s.wallHeight])
        const top = Math.min(OPENING_DEFAULTS[o.kind].top, s.wallHeight - 1)
        pieces.push([o.offset, o.offset + o.width, top, s.wallHeight])
        if (o.kind === 'window') pieces.push([o.offset, o.offset + o.width, 0, OPENING_DEFAULTS.window.sill])
        t = o.offset + o.width
      }
      if (t < w.length) pieces.push([t, w.length, 0, s.wallHeight])

      const g = new THREE.Group()
      for (const [t0, t1, z0, z1] of pieces) {
        const quad = [at(t0), at(t1), out(t1), out(t0)]
        const geo = new THREE.ExtrudeGeometry(polyShape(quad), { depth: (z1 - z0) * M, bevelEnabled: false })
        geo.rotateX(-Math.PI / 2)
        geo.translate(0, z0 * M, 0)
        const mesh = new THREE.Mesh(geo, wallMat)
        mesh.castShadow = !sketch
        mesh.receiveShadow = true
        g.add(mesh)
        if (sketch) g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#3b3a36' })))
      }
      for (const o of ops) {
        const a = at(o.offset), b = at(o.offset + o.width)
        const mid = { x: (a.x + b.x) / 2 - w.inward.x * WALL_T / 2, y: (a.y + b.y) / 2 - w.inward.y * WALL_T / 2 }
        const angle = Math.atan2(-(b.y - a.y), b.x - a.x)
        if (o.kind === 'window') {
          const h = OPENING_DEFAULTS.window.top - OPENING_DEFAULTS.window.sill
          const pane = new THREE.Mesh(new THREE.BoxGeometry(o.width * M, h * M, 0.01), glassMat)
          pane.position.set(mid.x * M, (OPENING_DEFAULTS.window.sill + h / 2) * M, mid.y * M)
          pane.rotation.y = angle
          g.add(pane)
          const sill = new THREE.Mesh(new THREE.BoxGeometry((o.width + 6) * M, 0.03, (WALL_T + 6) * M), frameMat)
          sill.position.set((mid.x + w.inward.x * 3) * M, OPENING_DEFAULTS.window.sill * M + 0.015, (mid.y + w.inward.y * 3) * M)
          sill.rotation.y = angle
          g.add(sill)
        } else {
          // Door leaf standing ajar into the room, hinged at the opening's start.
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(o.width * M, (OPENING_DEFAULTS.door.top - 1) * M, 0.04), frameMat)
          const swing = Math.atan2(-w.inward.y, w.inward.x)
          const diff = Math.atan2(Math.sin(swing - angle), Math.cos(swing - angle))
          const open = angle + diff * 0.35
          leaf.position.set(a.x * M + Math.cos(open) * o.width * M / 2, (OPENING_DEFAULTS.door.top / 2) * M, a.y * M - Math.sin(open) * o.width * M / 2)
          leaf.rotation.y = open
          leaf.castShadow = !sketch
          g.add(leaf)
          if (sketch) {
            const e = new THREE.LineSegments(new THREE.EdgesGeometry(leaf.geometry), new THREE.LineBasicMaterial({ color: '#3b3a36' }))
            e.position.copy(leaf.position)
            e.rotation.copy(leaf.rotation)
            g.add(e)
          }
        }
      }
      c.room.add(g)
      c.wallMeshes.push({
        obj: g,
        c: new THREE.Vector3(((w.a.x + w.b.x) / 2) * M, 0, ((w.a.y + w.b.y) / 2) * M),
        n: new THREE.Vector3(-w.inward.x, 0, -w.inward.y),
      })
    })
    // Floor outline so the room reads even with walls cut away.
    const ring = s.room.map((p) => new THREE.Vector3(p.x * M, 0.002, p.y * M))
    ring.push(ring[0].clone())
    c.room.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), new THREE.LineBasicMaterial({ color: sketch ? '#3b3a36' : '#8a7a66' })))

    // Shadow camera covering the room.
    const xs = s.room.map((p) => p.x * M), zs = s.room.map((p) => p.y * M)
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2 + 1
    c.sun.position.set(cx + 2.5, 5, cz + 4)
    c.sun.target.position.set(cx, 0, cz)
    Object.assign(c.sun.shadow.camera, { left: -span * 1.6, right: span * 1.6, top: span * 1.6, bottom: -span * 1.6, near: 0.5, far: 20 })
    c.sun.shadow.camera.updateProjectionMatrix()
  }, [s.room, s.openings, s.wallHeight, sketch])

  // ----- couch -----
  const built = useRef<{ sig: string; groups: Map<string, THREE.Group>; parent: THREE.Group } | null>(null)
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    const issues = moduleIssues(s.modules, s.room, s.openings, s.items)
    // While dragging only positions change: move the existing meshes instead of rebuilding them.
    const sig = JSON.stringify([
      s.modules.map((m) => [m.uid, m.defId, m.rot]), s.items.map((it) => [it.uid, it.type, it.rot, it.w, it.d, it.h, it.color]),
      [...issues], s.selected, s.armStyle, s.fabric, s.fabricImage, s.showPillows, sketch,
    ])
    if (built.current?.sig === sig && built.current.parent === c.couch && built.current.groups.size === s.modules.length + s.items.length) {
      for (const m of [...s.modules, ...s.items]) built.current.groups.get(m.uid)?.position.set(m.x * M, 0, m.y * M)
      return
    }
    disposeGroup(c.couch)
    const groups = new Map<string, THREE.Group>()
    const tex = sketch ? null : s.fabricImage ? { map: imageTexture(s.fabricImage), bumpMap: null } : fabricTextures(s.fabric)
    const mats = new Map<string, THREE.Material>()
    const matFor = (kind: Part['kind'], bad: boolean): THREE.Material => {
      const key = kind + bad
      const hit = mats.get(key)
      if (hit) return hit
      let m: THREE.Material
      if (sketch) {
        m = new THREE.MeshLambertMaterial({ color: bad ? '#f2c4bd' : kind === 'leg' ? '#6b6760' : '#fbf9f4' })
      } else if (kind === 'leg') {
        m = new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 0.55, metalness: 0.05 }) // wengé-stained
      } else {
        const tint = { base: -0.12, back: -0.06, arm: -0.03, backCushion: 0, seat: 0.04, pillow: -0.02 }[kind]
        m = new THREE.MeshStandardMaterial({
          color: shade('#ffffff', tint),
          map: tex?.map ?? null,
          bumpMap: tex?.bumpMap ?? null,
          bumpScale: 0.25,
          roughness: 0.95,
          emissive: bad ? new THREE.Color('#ff2a1a') : new THREE.Color('#000000'),
          emissiveIntensity: bad ? 0.35 : 0,
        })
      }
      mats.set(key, m)
      return m
    }

    s.modules.forEach((pm: Placed) => {
      const def = MODULE_BY_ID[pm.defId]
      const g = new THREE.Group()
      g.userData.uid = pm.uid
      g.position.set(pm.x * M, 0, pm.y * M)
      g.rotation.y = (-pm.rot * Math.PI) / 180
      const bad = issues.has(pm.uid)
      for (const p of [...moduleParts(def, s.armStyle), ...(s.showPillows ? pillowParts(def) : [])]) {
        const w = (p.x1 - p.x0) * M, d = (p.y1 - p.y0) * M, h = (p.z1 - p.z0) * M
        const r = Math.min(p.r * M, Math.min(w, d, h) / 2 - 0.001)
        const geo = sketch || r <= 0.002 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 4, r)
        const mesh = new THREE.Mesh(geo, matFor(p.kind, bad))
        mesh.position.set(((p.x0 + p.x1) / 2 - def.width / 2) * M, ((p.z0 + p.z1) / 2) * M, ((p.y0 + p.y1) / 2 - def.depth / 2) * M)
        if (p.kind === 'pillow') {
          // Lean back against the cushion behind it.
          if (p.x1 - p.x0 > p.y1 - p.y0) mesh.rotation.x = -0.22
          else mesh.rotation.z = 0.22
        }
        mesh.castShadow = !sketch
        mesh.receiveShadow = !sketch
        g.add(mesh)
        if (sketch) {
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#2f2e2a' }))
          edges.position.copy(mesh.position)
          edges.rotation.copy(mesh.rotation)
          g.add(edges)
        }
      }
      if (s.selected.includes(pm.uid)) {
        const box = new THREE.Box3Helper(
          new THREE.Box3(new THREE.Vector3((-def.width / 2) * M - 0.01, 0, (-def.depth / 2) * M - 0.01), new THREE.Vector3((def.width / 2) * M + 0.01, def.height * M + 0.01, (def.depth / 2) * M + 0.01)),
          new THREE.Color('#2f6fed'),
        )
        g.add(box)
      }
      c.couch.add(g)
      groups.set(pm.uid, g)
    })
    s.items.forEach((it) => {
      const g = buildItem(it, sketch, issues.has(it.uid))
      g.userData.uid = it.uid
      g.position.set(it.x * M, 0, it.y * M)
      g.rotation.y = (-it.rot * Math.PI) / 180
      if (s.selected.includes(it.uid)) {
        const box = new THREE.Box3Helper(
          new THREE.Box3(new THREE.Vector3((-it.w / 2) * M - 0.01, 0, (-it.d / 2) * M - 0.01), new THREE.Vector3((it.w / 2) * M + 0.01, it.h * M + 0.01, (it.d / 2) * M + 0.01)),
          new THREE.Color('#2f6fed'),
        )
        g.add(box)
      }
      c.couch.add(g)
      groups.set(it.uid, g)
    })
    built.current = { sig, groups, parent: c.couch }
  }, [s.modules, s.items, s.room, s.openings, s.showPillows, s.armStyle, s.fabric, s.fabricImage, s.selected, sketch])

  return (
    <>
      <div className="view3d" ref={host} />
      <div className="plan-tools">
        <button onClick={() => requestCamera('corner')} title="Overview from a corner">Overview</button>
        <button onClick={() => requestCamera('top')} title="Straight down">Top</button>
        <button onClick={() => requestCamera('eye')} title="Standing in the room, facing the couch">Eye level</button>
        <button onClick={() => {
          const c = ctx.current
          if (!c) return
          c.renderer.render(c.scene, c.camera)
          s.set({ exportPreview: { kind: 'image', data: c.renderer.domElement.toDataURL('image/png'), name: 'rossi-3d.png', title: '3D image' } })
        }} title="Save this view as an image">Save image</button>
      </div>
    </>
  )
}
