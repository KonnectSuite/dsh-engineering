/**
 * The interactive display surface: zoom, inspection, navigation and PNG export.
 *
 * Kept separate from the registration in `face.ts` so the behaviour can grow
 * without touching the module-loader plumbing.
 *
 * Every colour, border and type size comes from the shell's `--dsw-*` tokens so
 * the surface follows the active theme, and every user-visible string comes from
 * the locale dictionary registered in `face.ts`.
 *
 * @module dsh-engineering-ftview-viewer/face/display
 */

import * as React from 'react'
import { parseXml, attribute, type XmlNode } from '../src/xml.ts'
import { detectArtifact, renderDisplay, renderDisplayWithReport, responsiveSvg, type ArtifactSummary, type GeometryNote, type RenderReport } from '../src/render.ts'
import { elementFacts } from '../src/vocabulary.generated.ts'

/** Create-element alias; the bundle compiles without JSX. */
const h = React.createElement

/** Theme tokens, with the values the shell falls back to when a token is unset. */
const T = {
  canvas: 'var(--dsw-alias-bg-document-preview, #202020)',
  border: 'var(--dsw-alias-border-l3, rgba(128,128,128,.25))',
  rule: 'var(--dsw-alias-border-l3, rgba(128,128,128,.35))',
  text: 'var(--dsw-alias-label-primary, inherit)',
  muted: 'var(--dsw-alias-label-secondary, #666)',
  faint: 'var(--dsw-alias-label-tertiary, #888)',
  hover: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.16))',
  error: 'var(--dsw-alias-state-error-primary, #a00)',
  warn: 'var(--dsw-alias-state-warn-primary, #b26b00)',
  warnText: 'var(--dsw-alias-state-warn-label, #b26b00)',
  layer: 'var(--dsw-alias-bg-layer-1, transparent)',
  font: 'var(--dsw-font-family, system-ui)',
  radius: 'var(--dsw-radius-sm, 6px)',
  focusRing: 'var(--dsw-focus-ring-color, currentColor)',
} as const

/** One selectable object in the display. */
interface IndexedObject {
  readonly name: string
  readonly type: string
  readonly attributes: Readonly<Record<string, string>>
  readonly connections: readonly { readonly name?: string; readonly expression?: string }[]
  readonly states: number
}

/** A toolbar button: 24 px minimum target, token colours, visible focus. */
function ToolbarButton(props: {
  label: string
  title?: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  expanded?: boolean
}): React.ReactElement {
  return h('button', {
    type: 'button',
    title: props.title,
    onClick: props.onClick,
    disabled: props.disabled === true,
    'aria-pressed': props.active === undefined ? undefined : props.active,
    'aria-expanded': props.expanded,
    style: {
      minWidth: 24,
      height: 24,
      padding: '0 8px',
      font: 'inherit',
      fontSize: 11,
      fontFamily: T.font,
      color: props.active === true ? T.text : T.muted,
      background: props.active === true ? T.hover : 'transparent',
      border: `1px solid ${T.border}`,
      borderRadius: T.radius,
      cursor: props.disabled === true ? 'default' : 'pointer',
      opacity: props.disabled === true ? 0.45 : 1,
      fontWeight: props.active === true ? 600 : 400,
      outlineColor: T.focusRing,
    },
  }, props.label)
}

/** The coverage panel lists what the preview could not draw as authored. */
function CoveragePanel(props: { report: RenderReport; t: (key: string) => string; onClose: () => void }): React.ReactElement {
  const { report, t } = props
  const known = report.drawn
  const sections: React.ReactElement[] = []
  if (report.markers.length > 0) {
    sections.push(h('div', { key: 'markers' },
      h('div', { style: { color: T.warnText, fontWeight: 600, marginTop: 6 } }, `${report.markers.length} ${t('placeholders')}`),
      ...report.markers.map((marker, index) => h('div', { key: `m${index}`, style: { marginTop: 2 } },
        h('code', { style: { color: T.text } }, marker.name === undefined ? marker.type : `${marker.type} ${marker.name}`),
        h('span', { style: { color: T.muted } }, ` — ${marker.reason}`)))))
  }
  if (report.unknown.length > 0) {
    sections.push(h('div', { key: 'unknown' },
      h('div', { style: { color: T.warnText, fontWeight: 600, marginTop: 6 } }, `${report.unknown.length} ${t('unknownTypes')}`),
      ...report.unknown.map((entry, index) => h('div', { key: `u${index}`, style: { marginTop: 2 } },
        h('code', { style: { color: T.text } }, entry.name === undefined ? entry.type : `${entry.type} ${entry.name}`),
        h('span', { style: { color: T.muted } }, ` — ${entry.reason}`)))))
  }
  if (report.geometry.length > 0) {
    sections.push(h('div', { key: 'geometry' },
      h('div', { style: { fontWeight: 600, marginTop: 6 } }, t('coordinates')),
      ...report.geometry.map((note, index) => h('div', { key: `g${index}`, style: { marginTop: 2 } },
        h('code', { style: { color: T.text } }, `${note.type}${note.name === undefined ? '' : ` ${note.name}`}`),
        h('span', { style: { color: T.muted } }, ` · ${note.attribute}: ${ruleLabel(note, t)}`)))))
  }
  if (sections.length === 0) sections.push(h('div', { key: 'none', style: { marginTop: 6, color: T.muted } }, t('nothingSkipped')))
  return h('div', {
    style: {
      flex: 'none',
      maxHeight: '40%',
      overflow: 'auto',
      padding: '6px 10px 8px',
      borderBottom: `1px solid ${T.border}`,
      background: T.layer,
      fontSize: 11,
      fontFamily: T.font,
      color: T.text,
    },
  },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      h('strong', null, t('coverage')),
      h('span', { style: { color: T.muted, marginLeft: 'auto' } }, `${known}/${report.objects} ${t('drawn')}`),
      h(ToolbarButton, { label: '×', title: t('close'), onClick: props.onClose })),
    ...sections)
}

/** Localized label for one coordinate rule. */
function ruleLabel(note: GeometryNote, t: (key: string) => string): string {
  if (note.rule === 'percent') return t('rulePercent')
  if (note.rule === 'box-diagonal') return t('ruleDiagonal')
  return t('ruleAbsolute')
}

/** Decode the bytes a document preview hands over. */
export function decodeSource(data: Uint8Array | ArrayBuffer | string): string {
  if (typeof data === 'string') return data
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  return new TextDecoder('utf-8').decode(bytes)
}

/** The export folder a display path belongs to. */
function exportRootOf(address: string | undefined): string | undefined {
  if (address === undefined || address === '') return undefined
  const match = /^(.*?)[\\/]Displays[\\/][^\\/]+$/u.exec(address)
  return match?.[1]
}

/** Every HMI tag a display binds, in document order. */
function referencedTags(node: XmlNode, out: Set<string>): Set<string> {
  for (const value of Object.values(node.attributes)) {
    for (const match of value.matchAll(/\{([^}]+)\}/gu)) out.add((match[1] ?? '').trim())
    const name = value.trim()
    if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) out.add(name)
  }
  for (const child of node.children) referencedTags(child, out)
  return out
}

/** Index named objects so a click can find the object it landed on. */
function indexObjects(display: XmlNode): Map<string, IndexedObject> {
  const index = new Map<string, IndexedObject>()
  const walk = (node: XmlNode): void => {
    const name = attribute(node, 'name')
    if (name !== undefined && !index.has(name)) {
      const states = node.children.find(child => child.tag === 'states')
      const connections = node.children.find(child => child.tag === 'connections')
      index.set(name, {
        name,
        type: node.tag,
        attributes: node.attributes,
        connections: (connections?.children ?? []).map(connection => ({
          name: attribute(connection, 'name'),
          expression: attribute(connection, 'expression'),
        })),
        states: states?.children.length ?? 0,
      })
    }
    for (const child of node.children) walk(child)
  }
  walk(display)
  return index
}

/** Save the rendered SVG as a PNG next to the display view. */
function downloadPng(container: HTMLElement | null, name: string): void {
  const svg = container?.querySelector('svg')
  if (svg === null || svg === undefined) return
  const size = /width="(\d+)" height="(\d+)"/u.exec(svg.outerHTML)
  const width = Number(size?.[1] ?? 1280)
  const height = Number(size?.[2] ?? 1024)
  const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const image = new Image()
  image.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.drawImage(image, 0, 0)
    URL.revokeObjectURL(url)
    canvas.toBlob(result => {
      if (result === null) return
      const link = document.createElement('a')
      link.href = URL.createObjectURL(result)
      link.download = `${name || 'display'}.png`
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    }, 'image/png')
  }
  image.src = url
}

/** The display surface with its toolbar, inspector and preview. */
function DisplaySurface(props: { source: string; t: (key: string) => string; address?: string }): React.ReactElement {
  const { source, t, address } = props
  const root = exportRootOf(address)
  const [xml, setXml] = React.useState(source)
  const [displayName, setDisplayName] = React.useState('')
  const [history, setHistory] = React.useState<{ name: string; xml: string }[]>([])
  const [selected, setSelected] = React.useState<string | undefined>(undefined)
  const [fit, setFit] = React.useState(true)
  const [live, setLive] = React.useState(false)
  const [liveValues, setLiveValues] = React.useState<Record<string, number | string | boolean>>({})
  const [liveNotice, setLiveNotice] = React.useState('')
  const [globals, setGlobals] = React.useState<Record<string, unknown>>({})
  const [coverageOpen, setCoverageOpen] = React.useState(false)
  const container = React.useRef<HTMLDivElement | null>(null)
  const [compare, setCompare] = React.useState<{ name: string; xml: string } | undefined>(undefined)
  const parsed = React.useMemo(() => {
    try {
      const display = parseXml(xml)
      return { display, index: indexObjects(display), tags: [...referencedTags(display, new Set<string>())], error: '' }
    } catch (error) {
      return { display: undefined, index: new Map<string, IndexedObject>(), tags: [] as string[], error: error instanceof Error ? error.message : String(error) }
    }
  }, [xml])

  React.useEffect(() => {
    if (!live || root === undefined) return undefined
    let cancelled = false
    const stored = ((): { ip: string; slot: number } | undefined => {
      try {
        const raw = window.localStorage.getItem('ftview.live.controller')
        if (raw === null) return undefined
        const value = JSON.parse(raw) as { ip?: string; slot?: number }
        return typeof value.ip === 'string' ? { ip: value.ip, slot: typeof value.slot === 'number' ? value.slot : 0 } : undefined
      } catch {
        return undefined
      }
    })()
    const controller = stored ?? { ip: window.prompt(t('controllerPrompt')) ?? '', slot: 0 }
    if (controller.ip === '') {
      setLive(false)
      return undefined
    }
    try {
      window.localStorage.setItem('ftview.live.controller', JSON.stringify(controller))
    } catch {
      // Blocked storage must not disable live mode.
    }
    const tick = async (): Promise<void> => {
      const query = `root=${encodeURIComponent(root)}&ip=${encodeURIComponent(controller.ip)}&slot=${controller.slot}&tags=${encodeURIComponent(parsed.tags.join(','))}`
      try {
        const response = await fetch(`/engineering/ftview/live?${query}`, { cache: 'no-store' })
        const body = await response.json() as { values?: Record<string, { value?: number | string | boolean; quality?: string }>; not_live?: unknown[]; error?: string }
        if (cancelled) return
        if (!response.ok) {
          setLiveNotice(body.error ?? `${t('liveReadFailed')} (${response.status})`)
          return
        }
        const values: Record<string, number | string | boolean> = {}
        let good = 0
        let bad = 0
        for (const [hmi, entry] of Object.entries(body.values ?? {})) {
          if (entry.quality === 'good' && entry.value !== undefined) {
            values[hmi] = entry.value
            good += 1
          } else bad += 1
        }
        setLiveValues(values)
        const parts = [`${good} ${t('live')}`]
        if (bad > 0) parts.push(`${bad} ${t('liveFailed')}`)
        if ((body.not_live?.length ?? 0) > 0) parts.push(`${(body.not_live ?? []).length} ${t('liveNotLive')}`)
        setLiveNotice(parts.join(', '))
      } catch (error) {
        if (!cancelled) setLiveNotice(error instanceof Error ? error.message : String(error))
      }
    }
    void tick()
    const timer = window.setInterval(() => { void tick() }, 500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [live, root, parsed.tags])

  const rendered = React.useMemo(() => {
    try {
      const result = renderDisplayWithReport(xml, { tagValues: liveValues, globals: globals as never, imageHref, mode: 'auto' })
      return { svg: result.svg, report: result.report, count: parsed.index.size, error: '' }
    } catch (error) {
      return { svg: '', report: undefined, count: 0, error: error instanceof Error ? error.message : String(error) }
    }
  }, [xml, liveValues, globals, parsed.index.size])

  const navigate = React.useCallback(async (target: string): Promise<void> => {
    if (root === undefined || target === '') return
    try {
      const response = await fetch(`/engineering/ftview/display?root=${encodeURIComponent(root)}&name=${encodeURIComponent(target)}`, { cache: 'no-store' })
      if (!response.ok) {
        setLiveNotice(`${target}: ${t('cannotOpen')} (${response.status})`)
        return
      }
      const text = await response.text()
      setHistory(entries => [...entries, { name: displayName, xml }])
      setXml(text)
      setDisplayName(target)
      setSelected(undefined)
      setLiveNotice('')
    } catch (error) {
      setLiveNotice(error instanceof Error ? error.message : String(error))
    }
  }, [root, xml, displayName, t])

  const back = (): void => {
    const previous = history[history.length - 1]
    if (previous === undefined) return
    setHistory(entries => entries.slice(0, -1))
    setXml(previous.xml)
    setDisplayName(previous.name)
    setSelected(undefined)
  }

  // Reference objects inherit their states, captions and children from a Global
  // Objects file; without it the header and footer draw as empty placements.
  React.useEffect(() => {
    if (root === undefined) return undefined
    let cancelled = false
    const globalsOf: Record<string, unknown> = {}
    const walk = (node: { attributes?: Record<string, string>; children: readonly unknown[] }, file: string): void => {
      const name = node.attributes?.name
      if (typeof name === 'string' && name !== '') globalsOf[`${file}.${name}`] = node
      for (const child of node.children) walk(child as { attributes?: Record<string, string>; children: readonly unknown[] }, file)
    }
    fetch(`/engineering/ftview/globals?root=${encodeURIComponent(root)}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : { files: [] })
      .then((body: { files?: { name: string; xml: string }[] }) => {
        if (cancelled) return
        for (const entry of body.files ?? []) {
          try {
            walk(parseXml(entry.xml), entry.name)
          } catch {
            // A broken global file must not hide the display.
          }
        }
        setGlobals(globalsOf)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [root])

  function imageHref(name: string): string | undefined {
    return root === undefined
      ? undefined
      : `/engineering/ftview/image?root=${encodeURIComponent(root)}&name=${encodeURIComponent(name)}`
  }

  /** Load the same display from a second export and show them side by side. */
  const startCompare = React.useCallback(async (): Promise<void> => {
    if (root === undefined) return
    const other = window.prompt(t('comparePrompt'))
    if (other === null || other.trim() === '') return
    const name = displayName !== ''
      ? displayName
      : ((address ?? '').split(/[\\/]/u).pop() ?? '').replace(/\.xml$/iu, '')
    try {
      const response = await fetch(`/engineering/ftview/display?root=${encodeURIComponent(other.trim())}&name=${encodeURIComponent(name)}`, { cache: 'no-store' })
      if (!response.ok) {
        setLiveNotice(`${name}: ${t('compareMissing')} (${response.status})`)
        return
      }
      setCompare({ name, xml: await response.text() })
    } catch (error) {
      setLiveNotice(error instanceof Error ? error.message : String(error))
    }
  }, [root, displayName, address, t])

  const compareSvg = React.useMemo(() => {
    if (compare === undefined) return ''
    try {
      return renderDisplay(compare.xml, { globals: globals as never, imageHref })
    } catch {
      return ''
    }
  }, [compare])

  if (rendered.error !== '') {
    return h('div', { style: { padding: 16, fontFamily: T.font, fontSize: 13, color: T.error } },
      h('p', null, t('invalid')),
      h('pre', { style: { whiteSpace: 'pre-wrap', color: T.muted } }, rendered.error))
  }
  const report = rendered.report
  const size = /width="(\d+)" height="(\d+)"/u.exec(rendered.svg)
  const width = Number(size?.[1] ?? 0)
  const height = Number(size?.[2] ?? 0)
  const chosen = selected === undefined ? undefined : parsed.index.get(selected)
  const modeDraft = report?.mode === 'draft'
  const issues = (report?.markers.length ?? 0) + (report?.unknown.length ?? 0)
  const note = chosen === undefined ? undefined : report?.geometry.find(entry => entry.name === chosen.name)
  const marker = chosen === undefined ? undefined : report?.markers.find(entry => entry.name === chosen.name)
  return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontFamily: T.font } },
    h('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 32,
        padding: '4px 8px',
        fontSize: 11,
        color: T.muted,
        borderBottom: `1px solid ${T.border}`,
        flex: 'none',
      },
    },
    displayName === '' ? null : h('span', { style: { fontWeight: 600, color: T.text } }, displayName),
    h('span', null, `${width}×${height}`),
    report === undefined ? null : h('span', null, `${report.drawn}/${report.objects} ${t('drawn')}`),
    report === undefined ? null : h('span', {
      title: modeDraft ? t('modeDraftHint') : t('modeExportHint'),
      style: {
        padding: '0 6px',
        height: 18,
        lineHeight: '18px',
        borderRadius: T.radius,
        border: `1px solid ${T.border}`,
        color: T.text,
        fontWeight: 600,
      },
    }, modeDraft ? t('modeDraft') : t('modeExport')),
    h('span', { style: { marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' } },
      live && liveNotice !== '' ? h('span', { style: { color: T.muted } }, liveNotice) : null,
      report === undefined ? null : h(ToolbarButton, {
        label: issues === 0 ? t('coverage') : `${t('coverage')} ${issues}`,
        title: t('coverage'),
        onClick: () => setCoverageOpen(!coverageOpen),
        active: coverageOpen || issues > 0,
        expanded: coverageOpen,
      }),
      history.length > 0 ? h(ToolbarButton, { label: `← ${t('back')}`, onClick: back }) : null,
      h(ToolbarButton, {
        label: compare === undefined ? t('compare') : t('compareOff'),
        disabled: root === undefined,
        active: compare !== undefined,
        onClick: () => { if (compare === undefined) void startCompare(); else setCompare(undefined) },
      }),
      h(ToolbarButton, { label: t('png'), onClick: () => downloadPng(container.current, displayName) }),
      h(ToolbarButton, {
        label: live ? t('liveOn') : t('live'),
        title: root === undefined ? t('liveNeedsExport') : `${parsed.tags.length} ${t('tags')}`,
        disabled: root === undefined,
        active: live,
        onClick: () => setLive(!live),
      }),
      h(ToolbarButton, { label: t('fit'), onClick: () => setFit(true), active: fit }),
      h(ToolbarButton, { label: t('actual'), onClick: () => { setFit(false) }, active: !fit }))),
    coverageOpen && report !== undefined ? h(CoveragePanel, { report, t, onClose: () => setCoverageOpen(false) }) : null,
    h('div', { style: { flex: 1, minHeight: 0, display: 'flex', gap: 6 } },
      h('div', {
        ref: container,
        onClick: event => {
          const element = (event.target as HTMLElement).closest('[data-ftv-name]')
          setSelected(element?.getAttribute('data-ftv-name') ?? undefined)
        },
        onDoubleClick: event => {
          const element = (event.target as HTMLElement).closest('[data-ftv-type]')
          if (element?.getAttribute('data-ftv-type') !== 'gotoButton') return
          const name = element.getAttribute('data-ftv-name') ?? ''
          const object = parsed.index.get(name)
          const target = object === undefined ? undefined : attribute({ tag: 'gotoButton', attributes: object.attributes, children: [], text: '' }, 'display')
          if (target !== undefined) void navigate(target)
        },
        style: { flex: 1, minWidth: 0, overflow: 'auto', background: T.canvas, padding: 8 },
      },
      compare === undefined ? null : h('div', { style: { fontSize: 10, color: T.faint, marginBottom: 4 } }, displayName === '' ? t('current') : displayName),
      h('div', {
        style: fit ? { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' } : { width, height },
        dangerouslySetInnerHTML: { __html: fit ? responsiveSvg(rendered.svg) : rendered.svg },
      })),
      compare === undefined ? null : h('div', { style: { flex: 1, minWidth: 0, overflow: 'auto', background: T.canvas, padding: 8, borderLeft: `1px solid ${T.rule}` } },
        h('div', { style: { fontSize: 10, color: T.faint, marginBottom: 4 } }, `${t('compareLabel')}: ${compare.name}`),
        h('div', {
          style: fit ? { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' } : { width, height },
          dangerouslySetInnerHTML: { __html: fit ? responsiveSvg(compareSvg) : compareSvg },
        })),
      chosen === undefined ? null : h('div', { style: { width: 260, flex: 'none', borderLeft: `1px solid ${T.border}`, overflow: 'auto', padding: 8, fontSize: 11, color: T.text } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          h('strong', null, chosen.type),
          h('span', { style: { color: T.muted } }, chosen.name),
          h(ToolbarButton, { label: '×', title: t('close'), onClick: () => setSelected(undefined) })),
        h('div', { style: { color: T.muted, marginTop: 2 } }, `${t('family')}: ${elementFacts(chosen.type)?.family ?? '—'}`),
        marker === undefined ? null : h('div', { style: { color: T.warnText, marginTop: 4 } }, `${t('placeholders')}: ${marker.reason}`),
        note === undefined ? null : h('div', { style: { color: T.muted, marginTop: 4 } }, `${note.attribute}: ${ruleLabel(note, t)}`),
        chosen.type === 'gotoButton' && attribute({ tag: 'gotoButton', attributes: chosen.attributes, children: [], text: '' }, 'display') !== undefined
          ? h('div', { style: { margin: '6px 0' } }, h(ToolbarButton, {
            label: t('openDisplay'),
            onClick: () => { const target = attribute({ tag: 'gotoButton', attributes: chosen.attributes, children: [], text: '' }, 'display'); if (target !== undefined) void navigate(target) },
          }))
          : null,
        h('table', { style: { borderCollapse: 'collapse', width: '100%', marginTop: 6 } },
          h('tbody', null, Object.entries(chosen.attributes).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => h('tr', { key }, h('td', { style: { color: T.muted, paddingRight: 6, verticalAlign: 'top' } }, key), h('td', null, value))))),
        chosen.connections.length === 0 ? null : h('div', { style: { marginTop: 6 } },
          h('strong', null, t('connections')),
          chosen.connections.map((connection, index) => h('div', { key: index }, `${connection.name ?? '?'} ← ${connection.expression ?? '?'}`))),
        h('div', { style: { color: T.faint, marginTop: 4 } }, `${chosen.states} ${t('states')}`))))
}

/** Summary card for a FactoryTalk View artifact that is not a display. */
function ArtifactCard(props: { artifact: ArtifactSummary; t: (key: string) => string; address?: string }): React.ReactElement {
  const { artifact } = props
  return h('div', { style: { padding: 16, fontFamily: T.font, fontSize: 13, color: T.text, display: 'flex', flexDirection: 'column', gap: 6 } },
    h('div', { style: { fontWeight: 600, fontSize: 14 } }, artifact.title),
    ...artifact.details.map((line, index) => h('div', { key: `d${index}`, style: { color: T.muted } }, line)),
    h('div', { style: { color: T.faint, fontSize: 11, marginTop: 8 } },
      props.address === undefined || props.address === '' ? props.t('detectedFrom') : props.address),
    h('div', { style: { color: T.faint, fontSize: 11 } }, artifact.kind === 'unknown' ? props.t('invalid') : props.t('notDisplay')))
}

/**
 * The document preview entry: detect the artifact, then render a display or a summary.
 *
 * @param props - File source, locale lookup and address.
 * @returns A display surface or an artifact summary card.
 */
export function Display(props: { source: string; t: (key: string) => string; address?: string }): React.ReactElement {
  const artifact = detectArtifact(props.source)
  if (artifact.kind === 'display') return h(DisplaySurface, props)
  return h(ArtifactCard, { artifact, t: props.t, address: props.address })
}
