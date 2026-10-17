import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useStore, moduleIssues } from '../store'
import { MODULE_BY_ID } from '../data/modules'
import { moduleParts, type Part } from '../model/parts'
import { footprint, walls, snapGroupDelta, pointInPolygon, type Placed, type Pt } from '../model/geometry'
import { fabricTextures, woodTexture, imageTexture } from '../three/textures'
import { shade } from '../model/color'
import { exportCanvas, requestCamera, type CameraView } from '../exportImage'

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

const shapeOf = (pts: Pt[]) => new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x * M, -p.y * M)))

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
    let drag: { start: Pt; base: Placed[]; moved: boolean } | null = null
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
      const sel = new Set(useStore.getState().selected)
      if (!sel.has(uid)) return
      controls.enabled = false
      state.snapshot()
      drag = { start: p, base: state.modules.filter((x) => sel.has(x.uid)), moved: false }
      renderer.domElement.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!drag) return
      setNdc(e)
      const p = floorPt()
      if (!p) return
      const state = useStore.getState()
      const ids = new Set(drag.base.map((m) => m.uid))
      const others = state.modules.filter((x) => !ids.has(x.uid)).map(footprint)
      const d = snapGroupDelta(drag.base.map(footprint), { x: p.x - drag.start.x, y: p.y - drag.start.y }, others, state.room, 8)
      const moved = new Map(drag.base.map((m) => [m.uid, { ...m, x: Math.round((m.x + d.x) * 2) / 2, y: Math.round((m.y + d.y) * 2) / 2 }]))
      state.setModules(state.modules.map((m) => moved.get(m.uid) ?? m), false)
      drag.moved = true
    }
    const onUp = (e: PointerEvent) => {
      if (drag && !drag.moved) useStore.setState((st) => ({ past: st.past.slice(0, -1) }))
      if (!drag && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4) useStore.getState().clearSelection()
      drag = null
      downAt = null
      controls.enabled = true
    }
    const dom = renderer.domElement
    dom.addEventListener('pointerdown', onDown)
    dom.addEventListener('pointermove', onMove)
    dom.addEventListener('pointerup', onUp)

    return () => {
      window.removeEventListener('rossi-camera', onCamera)
      cancelAnimationFrame(raf)
      ro.disconnect()
      dom.removeEventListener('pointerdown', onDown)
      dom.removeEventListener('pointermove', onMove)
      dom.removeEventListener('pointerup', onUp)
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

    const floorGeo = new THREE.ShapeGeometry(shapeOf(s.room))
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
    const h = s.wallHeight * M
    const wallMat = sketch
      ? new THREE.MeshLambertMaterial({ color: '#fdfbf6' })
      : new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.95 })
    walls(s.room).forEach((w) => {
      const j = (w.i + 1) % s.room.length
      const quad = [s.room[w.i], s.room[j], outer[j], outer[w.i]]
      const geo = new THREE.ExtrudeGeometry(shapeOf(quad), { depth: h, bevelEnabled: false })
      geo.rotateX(-Math.PI / 2)
      const mesh = new THREE.Mesh(geo, wallMat)
      mesh.castShadow = !sketch
      mesh.receiveShadow = true
      const g = new THREE.Group()
      g.add(mesh)
      if (sketch) g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#3b3a36' })))
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
  }, [s.room, s.wallHeight, sketch])

  // ----- couch -----
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    disposeGroup(c.couch)
    const issues = moduleIssues(s.modules, s.room)
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
        m = new THREE.MeshStandardMaterial({ color: '#2b2724', roughness: 0.5, metalness: 0.2 })
      } else {
        const tint = { base: -0.12, back: -0.06, arm: -0.03, backCushion: 0, seat: 0.04 }[kind]
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
      for (const p of moduleParts(def, s.armStyle)) {
        const w = (p.x1 - p.x0) * M, d = (p.y1 - p.y0) * M, h = (p.z1 - p.z0) * M
        const r = Math.min(p.r * M, Math.min(w, d, h) / 2 - 0.001)
        const geo = sketch || r <= 0.002 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 4, r)
        const mesh = new THREE.Mesh(geo, matFor(p.kind, bad))
        mesh.position.set(((p.x0 + p.x1) / 2 - def.width / 2) * M, ((p.z0 + p.z1) / 2) * M, ((p.y0 + p.y1) / 2 - def.depth / 2) * M)
        mesh.castShadow = !sketch
        mesh.receiveShadow = !sketch
        g.add(mesh)
        if (sketch) {
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#2f2e2a' }))
          edges.position.copy(mesh.position)
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
    })
  }, [s.modules, s.room, s.armStyle, s.fabric, s.fabricImage, s.selected, sketch])

  return (
    <>
      <div className="view3d" ref={host} />
      <div className="plan-tools">
        <button onClick={() => requestCamera('corner')} title="Overview from a corner">Overview</button>
        <button onClick={() => requestCamera('top')} title="Straight down">Top</button>
        <button onClick={() => requestCamera('eye')} title="Standing in the room, facing the couch">Eye level</button>
        <button onClick={() => { const c = ctx.current; if (c) { c.renderer.render(c.scene, c.camera); exportCanvas(c.renderer.domElement, 'rossi-3d.png') } }} title="Save this view as an image">Save image</button>
      </div>
    </>
  )
}
