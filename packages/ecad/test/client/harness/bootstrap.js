/*
 * The screenshot harness's page bootstrap: a fake model, a fake shell context,
 * and the REAL committed face bundle loaded through its own module-loader
 * registration exactly as the shell would.
 *
 * Nothing here is part of the product. It exists so the committed
 * `packages/ecad/lib/client.js` can be mounted in a plain headless Chrome page
 * and driven with real pointer input for the review screenshots.
 */

/* global window, document, setTimeout, TextEncoder, Promise, URLSearchParams, ReactDOM, __HARNESS_REACT__ */

const params = new URLSearchParams(window.location.search)
const LARGE = params.get('large') === '1'
// The second source variant: a DWG that reached the sheet model through the
// embedded converter, so the pane's provenance row and format badge are exercised.
const DWG = params.get('dwg') === '1'

/** Build the fake sheet model the face will draw. */
function buildModel() {
  const entities = []
  const add = entity => {
    entities.push({ layer: 'FRAME', color: 7, ...entity })
  }
  // The outer border is what fixes the sheet's bounds to 420 × 297.
  add({ id: 'border-top', k: 'line', pts: [[0, 0], [420, 0]] })
  add({ id: 'border-right', k: 'line', pts: [[420, 0], [420, 297]] })
  add({ id: 'border-bottom', k: 'line', pts: [[420, 297], [0, 297]] })
  add({ id: 'border-left', k: 'line', pts: [[0, 297], [0, 0]] })
  // Title block.
  add({ id: 'tb-1', k: 'line', pts: [[300, 10], [410, 10]] })
  add({ id: 'tb-2', k: 'line', pts: [[300, 10], [300, 60]] })
  add({ id: 'tb-3', k: 'line', pts: [[410, 10], [410, 60]] })
  add({ id: 'tb-4', k: 'line', pts: [[300, 60], [410, 60]] })
  add({ id: 'tb-sheet', k: 'text', layer: 'TEXT', color: 2, p: [304, 48], t: 'A-101', h: 10 })
  add({ id: 'tb-title', k: 'text', layer: 'TEXT', color: 2, p: [304, 36], t: 'LAMINATOR CONTROL', h: 4.5 })
  add({ id: 'tb-rev', k: 'text', layer: 'TEXT', color: 2, p: [304, 22], t: 'REV C', h: 3.5 })
  // Wires.
  add({ id: 'wire-1', k: 'polyline', layer: 'WIRES', color: 1, pts: [[20, 40], [120, 40], [120, 80], [200, 80]] })
  add({ id: 'wire-2', k: 'line', layer: 'WIRES', color: 1, pts: [[20, 60], [200, 60]] })
  add({ id: 'wire-3', k: 'line', layer: 'WIRES', color: 1, pts: [[200, 40], [250, 40], [250, 120]] })
  add({ id: 'wire-label', k: 'text', layer: 'TEXT', color: 2, p: [24, 44], t: '24 VDC', h: 3.5 })
  // Devices.
  add({ id: 'dev-circle', k: 'circle', layer: 'DEVICES', color: 3, c: [250, 150], r: 30 })
  add({ id: 'dev-arc', k: 'arc', layer: 'DEVICES', color: 3, c: [250, 150], r: 45, a0: 0, a1: Math.PI / 2 })
  add({ id: 'dev-box', k: 'polyline', layer: 'DEVICES', color: 3, pts: [[320, 120], [380, 120], [380, 160], [320, 160]], closed: true })
  add({ id: 'dev-label', k: 'text', layer: 'TEXT', color: 2, p: [330, 140], t: 'M1', h: 4 })
  // An ellipse: the setEllipse grip's fixture.
  add({ id: 'dev-ellipse', k: 'ellipse', layer: 'DEVICES', color: 3, c: [350, 200], rx: 30, ry: 12, rot: 0, a0: 0, a1: Math.PI * 2, closed: true })
  // Terminals.
  for (let index = 0; index < 6; index += 1) {
    add({ id: `term-${index}`, k: 'circle', layer: 'DEVICES', color: 3, c: [40 + index * 24, 130], r: 4 })
    add({ id: `term-lead-${index}`, k: 'line', layer: 'WIRES', color: 1, pts: [[40 + index * 24, 134], [40 + index * 24, 170]] })
  }
  // Hatch and a dimension.
  add({ id: 'hatch-1', k: 'hatch', layer: 'HATCH', color: 8, pts: [[40, 200], [160, 200], [160, 250], [40, 250]], closed: true, approx: true, src: 'HATCH' })
  add({ id: 'dim-1', k: 'dimension', layer: 'DIM', color: 4, pts: [[40, 190], [160, 190]], p: [100, 195], t: '120', h: 3, approx: true, src: 'DIMENSION' })
  // A leader and a block attribute text (the owning INSERT is not drawn).
  add({ id: 'note-1', k: 'leader', layer: 'TEXT', color: 2, pts: [[220, 220], [260, 240], [300, 240]] })
  add({ id: 'attr-1', k: 'text', layer: 'TEXT', color: 2, p: [300, 260], t: 'WD_M', h: 3, g: 'insert-wd-m' })
  // Revision cloud-ish polyline and a few more notes.
  add({ id: 'cloud-1', k: 'polyline', layer: 'REVISIONS', color: 6, pts: [[210, 70], [240, 66], [250, 90], [220, 96]], closed: true, approx: true, src: 'LWPOLYLINE' })
  add({ id: 'note-2', k: 'text', layer: 'REVISIONS', color: 2, p: [214, 78], t: 'REV C', h: 3 })
  // Two wires crossing in free space: the intersection object snap's fixture.
  add({ id: 'cross-a', k: 'line', layer: 'WIRES', color: 1, pts: [[240, 40], [280, 80]] })
  add({ id: 'cross-b', k: 'line', layer: 'WIRES', color: 1, pts: [[240, 80], [280, 40]] })
  if (LARGE) {
    for (let index = 0; index < 10000; index += 1) {
      const x = 20 + (index % 100) * 3.6
      const y = 20 + Math.floor(index / 100) * 2.4
      add({ id: `grid-${index}`, k: 'line', layer: 'LARGE', color: 9, pts: [[x, y], [x + 2.4, y + 1.8]] })
    }
  }
  const layers = [
    { name: '0', color: 7, visible: true },
    { name: 'FRAME', color: 7, visible: true },
    { name: 'WIRES', color: 1, visible: true },
    { name: 'DEVICES', color: 3, visible: true },
    { name: 'TEXT', color: 2, visible: true },
    { name: 'HATCH', color: 8, visible: true },
    { name: 'REVISIONS', color: 6, visible: true },
    { name: 'DIM', color: 4, visible: true },
    { name: 'LARGE', color: 9, visible: true },
  ]
  return {
    schema: 1,
    path: 'Prints/A-101.dxf',
    version: 'harness-v1',
    dxfVersion: 'AC1032',
    units: 4,
    layouts: [
      {
        id: 'Model',
        name: 'Model',
        kind: 'model',
        extents: { min: [0, 0], max: [420, 297] },
        entities,
      },
      {
        id: 'Layout1',
        name: 'Layout1',
        kind: 'paper',
        extents: { min: [0, 0], max: [210, 148] },
        entities: [
          { id: 'paper-border', k: 'line', layer: 'FRAME', color: 7, pts: [[5, 5], [205, 5], [205, 143], [5, 143], [5, 5]] },
          { id: 'paper-title', k: 'text', layer: 'TEXT', color: 2, p: [20, 120], t: 'A-101 LAYOUT', h: 6 },
          { id: 'paper-note', k: 'text', layer: 'TEXT', color: 2, p: [20, 100], t: 'SHEET LAYOUT', h: 4 },
        ],
      },
    ],
    layers,
    blocks: [{ name: 'WD_M', entities: 12, external: false }, { name: 'MOTOR', entities: 8, external: false }],
    stats: {
      entities: entities.length,
      byKind: entities.reduce((byKind, entity) => {
        byKind[entity.k] = (byKind[entity.k] ?? 0) + 1
        return byKind
      }, {}),
      unsupported: {},
      approximate: entities.filter(entity => entity.approx === true).length,
      truncated: false,
    },
  }
}

const MODEL = buildModel()
const MODEL_TEXT = JSON.stringify({ schema: 1, version: 'harness-v1', model: MODEL })
const MODEL_BYTES = new TextEncoder().encode(MODEL_TEXT)

/** The shell's fake Remote service. */
const fakeEcad = {
  open: async () => ({
    ok: true,
    path: MODEL.path,
    format: DWG ? 'dwg' : 'dxf',
    ...(DWG
      ? { converted: { converter: 'acadrust', version: '0.4.2', warnings: ['A proxy object on layout Model was skipped'] } }
      : {}),
    version: MODEL.version,
    dxfVersion: MODEL.dxfVersion,
    units: MODEL.units,
    layouts: MODEL.layouts.map(layout => ({ id: layout.id, name: layout.name, kind: layout.kind, entities: layout.entities.length })),
    entities: MODEL.stats.entities,
    unsupported: 0,
    approximate: MODEL.stats.approximate,
    truncated: false,
    titleBlock: {
      layout: 'Model',
      fields: {
        sheetNumber: { value: 'A-101', source: 'text', confidence: 0.95 },
        title: { value: 'LAMINATOR CONTROL', source: 'text', confidence: 0.9 },
        revision: { value: 'C', source: 'text', confidence: 0.9 },
        date: { value: '2026-11-04', source: 'text', confidence: 0.8 },
        scale: { value: '1:1', source: 'text', confidence: 0.8 },
        project: { value: 'KONNECT', source: 'text', confidence: 0.7 },
        drawnBy: { value: 'A. RYA', source: 'text', confidence: 0.7 },
        checkedBy: { value: 'M. LEAD', source: 'text', confidence: 0.7 },
      },
    },
    modelPath: '.ecad/previews/harness.json',
    // The pane no longer reads this: the face has no editing surface to gate.
    writes: true,
  }),
  capabilities: async () => ({
    ok: true,
    contractVersion: 2,
    writes: false,
    engine: 'harness',
    profileSource: 'inferred',
    cad: {
      serverName: 'ocs',
      entryTool: 'mcp__ocs__ocs_sessions',
      mounted: false,
      tools: [],
      hint: 'No AryaCAD Electrical MCP row is visible to this composition; see docs/aryacad-bridge.md.',
    },
  }),
  sheets: async () => ({ ok: true, sheets: [{ path: MODEL.path, entityCount: MODEL.stats.entities }] }),
}

const dictionaries = {}
const registrations = []
let capturedBody
let capturedInjected
const t = (key, values) => {
  let text = (dictionaries.sidebarEcad?.en ?? {})[key] ?? key
  if (values !== undefined) {
    for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}

/** The fake shell context: the same calls the real registration makes. */
const ctx = {
  effect: callback => {
    callback()
  },
  inject: (services, callback) => {
    if (services.includes('remote.ecad')) {
      setTimeout(() => callback({ remote: { ecad: fakeEcad } }), 0)
    }
  },
  locale: {
    register: (namespace, value) => {
      dictionaries[namespace] = value
      return () => {}
    },
    bind: namespace => t,
  },
  documentPreviews: { register: () => () => {} },
  slots: {
    inject: (_name, callback) => callback(),
    register: (options, component) => {
      if (options.name === 'sidebar.right.tab.document') {
        capturedBody = component
        capturedInjected = typeof options.inject === 'function' ? options.inject() : undefined
      }
      return () => {}
    },
  },
  remote: {
    $mount: async () => ({}),
    workspaceFiles: {
      readBytes: async (_sessionId, path, options) => {
        void path
        const offset = options.range.offset
        const data = MODEL_BYTES.slice(offset, offset + options.range.length)
        return { ok: true, value: { data, eof: offset + data.length >= MODEL_BYTES.length, version: 'harness-v1' } }
      },
    },
  },
}

window.__ModuleLoader__ = {
  load: registration => registrations.push(registration),
}

/** The module table the committed face bundle asks for `react` through. */
const requireStub = (name) => {
  if (name === 'react') return window.__HARNESS_REACT__.react
  if (name === 'react/jsx-runtime') return window.__HARNESS_REACT__.jsxRuntime
  throw new Error(`harness: the face required unknown module ${name}`)
}

/** Install a URL query so the harness script can reload with a different mode. */
const ready = (async () => {
  try {
  // Load the committed face artifact the way the page would.
  await new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'face.js'
    script.onload = resolve
    script.onerror = () => reject(new Error('harness: the face bundle did not load'))
    document.head.appendChild(script)
  })
  if (registrations.length !== 1) throw new Error(`harness: expected one registration, got ${registrations.length}`)
  const plugin = registrations[0].factory(requireStub)
  plugin.apply(ctx)
  if (typeof capturedBody !== 'function') throw new Error('harness: the drawing body did not register')
  const root = document.getElementById('root')
  const address = 'dsh-resource://file/session/harness/Prints/A-101.dxf'
  const content = { kind: 'renderer', revision: 0, loaded: () => {}, failed: () => {}, reload: () => {} }
  const React = window.__HARNESS_REACT__.react
  const ReactDOM = window.__HARNESS_REACT__.reactDom
  const mountedAt = performance.now()
  ReactDOM.createRoot(root).render(React.createElement(capturedBody, {
    resourceAddress: address,
    content,
    scrollportRef: () => {},
    t,
    ...capturedInjected,
  }))
  // Wait for the sheet to be in the DOM.
  const deadline = Date.now() + 20000
  while (document.querySelector('[data-ecad-canvas]') === null) {
    if (Date.now() > deadline) throw new Error('harness: the drawing never rendered')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  const elapsed = performance.now() - mountedAt
  // The fit the face uses, recomputed per call: entering Edit mode adds the edit
  // bar and Refits the canvas, so a cached transform would map old pixels.
  const fitOf = () => {
    const wrap = document.querySelector('[data-ecad-canvas]').parentElement
    const width = Math.max(1, wrap.clientWidth)
    const height = Math.max(1, wrap.clientHeight)
    const margin = 24
    const minX = 0
    const minY = 0
    const maxX = 420
    const maxY = 297
    const spanX = maxX - minX
    const spanY = maxY - minY
    const usableWidth = Math.max(1, width - margin * 2)
    const usableHeight = Math.max(1, height - margin * 2)
    const scale = Math.min(usableWidth / spanX, usableHeight / spanY)
    return { scale, translateX: (width - scale * spanX) / 2 - scale * minX, translateY: (height + scale * spanY) / 2 + scale * minY, width, height }
  }
  const wrap = document.querySelector('[data-ecad-canvas]').parentElement
  const rect = () => wrap.getBoundingClientRect()
  /** The current user pan/zoom, read from the rendered transform group. */
  const viewOf = () => {
    const transform = document.querySelector('[data-ecad-view]')?.getAttribute('transform') ?? ''
    const translate = /translate\(([-\d.]+) ([-\d.]+)\)/u.exec(transform)
    const scale = /scale\(([-\d.]+)\)/u.exec(transform)
    return {
      panX: translate === null ? 0 : Number(translate[1]),
      panY: translate === null ? 0 : Number(translate[2]),
      zoom: scale === null ? 1 : Number(scale[1]),
    }
  }
  const worldToClient = (x, y) => {
    const box = rect()
    const fit = fitOf()
    const view = viewOf()
    const fittedX = fit.translateX + fit.scale * x
    const fittedY = fit.translateY - fit.scale * y
    return { x: box.left + view.panX + fittedX * view.zoom, y: box.top + view.panY + fittedY * view.zoom }
  }
  const clientToWorld = (x, y) => {
    const box = rect()
    const fit = fitOf()
    const view = viewOf()
    return {
      x: ((x - box.left - view.panX) / view.zoom - fit.translateX) / fit.scale,
      y: (fit.translateY - (y - box.top - view.panY) / view.zoom) / fit.scale,
    }
  }
  window.__HARNESS__ = {
    model: MODEL,
    large: LARGE,
    dwg: DWG,
    renderMs: elapsed,
    primitives: document.querySelectorAll('[data-ecad-id]').length,
    worldToClient,
    clientToWorld,
    canvasRect: () => {
      const box = rect()
      return { left: box.left, top: box.top, width: box.width, height: box.height }
    },
    /** Click the first element that carries the data attribute. */
    click: (attribute) => {
      const element = document.querySelector(`[${attribute}]`)
      if (element === null) throw new Error(`harness: no element for ${attribute}`)
      element.click()
      return true
    },
    /**
     * A screen point that is empty of geometry: the top-left inside the border,
     * away from every primitive.
     */
    emptyPoint: () => worldToClient(370, 270),
    /** The client point over one primitive's own geometry, by world point. */
    pointOn: (x, y) => worldToClient(x, y),
    statusText: () => document.querySelector('[role="status"]')?.textContent ?? '',
    /** The zoom percentage the status line reports. */
    zoomPercent: () => /(\d+)%/.exec(document.querySelector('[role="status"]')?.textContent ?? '')?.[1] ?? '',
    /** The outer pan/zoom group's transform, so a pan and a zoom can be measured. */
    viewTransform: () => document.querySelector('[data-ecad-view]')?.getAttribute('transform') ?? '',
    /** The primitives currently drawn, so a hidden layer can be proved by count. */
    primitiveCount: () => document.querySelectorAll('[data-ecad-id]').length,
    /** The primitives the current text search highlighted on the sheet. */
    foundCount: () => document.querySelectorAll('[data-ecad-found]').length,
    matchBadge: () => document.querySelector('[data-ecad-match]')?.textContent ?? '',
    /** The layer rows the panel lists, and how many of them are hidden. */
    layerRowCount: () => document.querySelectorAll('[data-ecad-layer-row]').length,
    hiddenLayerCount: () => [...document.querySelectorAll('[data-ecad-layer-row] button[aria-pressed]')]
      .filter(button => button.getAttribute('aria-pressed') === 'false').length,
    /** The sheet-action buttons the pane offers, matched on their accessible name. */
    actionButton: (name) => {
      const button = [...document.querySelectorAll('button')].find(candidate =>
        (candidate.getAttribute('aria-label') ?? candidate.textContent.trim()) === name)
      return button === undefined ? null : { name, disabled: button.disabled }
    },
    /** Press the control whose accessible name is `name`. */
    clickNamed: (name) => {
      const button = [...document.querySelectorAll('button')].find(candidate =>
        (candidate.getAttribute('aria-label') ?? candidate.textContent.trim()) === name)
      if (button === undefined) throw new Error(`harness: no control named ${name}`)
      button.click()
      return true
    },
    setTheme: (theme) => {
      document.documentElement.setAttribute('data-theme', theme)
    },
    setPrintMedia: (print) => {
      // The screenshot script drives the real CDP emulation; this is the
      // fallback for a manual page.
      document.documentElement.setAttribute('data-print', print ? '1' : '0')
    },
  }
  } catch (error) {
    // Leave the failure where the screenshot driver can read it instead of a
    // blank page and an unexplained timeout.
    window.__HARNESS_ERROR__ = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
    const root = document.getElementById('root')
    if (root !== null) root.textContent = `HARNESS FAILED: ${window.__HARNESS_ERROR__}`
    throw error
  }
})()

window.__HARNESS_READY__ = ready
