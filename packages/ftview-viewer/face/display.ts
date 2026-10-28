/**
 * The interactive display surface: zoom, inspection, navigation and PNG export.
 *
 * Kept separate from the registration in `face.ts` so the behaviour can grow
 * without touching the module-loader plumbing.
 *
 * @module dsh-engineering-ftview-viewer/face/display
 */

import * as React from 'react'
import { parseXml, attribute, type XmlNode } from '../src/xml.ts'
import { renderDisplay, responsiveSvg } from '../src/render.ts'

/** Create-element alias; the bundle compiles without JSX. */
const h = React.createElement

/** One selectable object in the display. */
interface IndexedObject {
  readonly name: string
  readonly type: string
  readonly attributes: Readonly<Record<string, string>>
  readonly connections: readonly { readonly name?: string; readonly expression?: string }[]
  readonly states: number
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
export function Display(props: { source: string; t: (key: string) => string; address?: string }): React.ReactElement {
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
    const controller = stored ?? { ip: window.prompt('Controller IPv4 address') ?? '', slot: 0 }
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
          setLiveNotice(body.error ?? `live read failed (${response.status})`)
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
        setLiveNotice(`${good} live${bad > 0 ? `, ${bad} failed` : ''}${(body.not_live?.length ?? 0) > 0 ? `, ${body.not_live.length} not live` : ''}`)
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
      return { svg: renderDisplay(xml, { tagValues: liveValues }), count: parsed.index.size, error: '' }
    } catch (error) {
      return { svg: '', count: 0, error: error instanceof Error ? error.message : String(error) }
    }
  }, [xml, liveValues, parsed.index.size])

  const navigate = React.useCallback(async (target: string): Promise<void> => {
    if (root === undefined || target === '') return
    try {
      const response = await fetch(`/engineering/ftview/display?root=${encodeURIComponent(root)}&name=${encodeURIComponent(target)}`, { cache: 'no-store' })
      if (!response.ok) {
        setLiveNotice(`cannot open ${target} (${response.status})`)
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
  }, [root, xml, displayName])

  const back = (): void => {
    const previous = history[history.length - 1]
    if (previous === undefined) return
    setHistory(entries => entries.slice(0, -1))
    setXml(previous.xml)
    setDisplayName(previous.name)
    setSelected(undefined)
  }

  /** Load the same display from a second export and show them side by side. */
  const startCompare = React.useCallback(async (): Promise<void> => {
    if (root === undefined) return
    const other = window.prompt('Compare with another export folder')
    if (other === null || other.trim() === '') return
    const name = displayName !== ''
      ? displayName
      : ((address ?? '').split(/[\\/]/u).pop() ?? '').replace(/\.xml$/iu, '')
    try {
      const response = await fetch(`/engineering/ftview/display?root=${encodeURIComponent(other.trim())}&name=${encodeURIComponent(name)}`, { cache: 'no-store' })
      if (!response.ok) {
        setLiveNotice(`compare: ${name} is not in that export (${response.status})`)
        return
      }
      setCompare({ name, xml: await response.text() })
    } catch (error) {
      setLiveNotice(error instanceof Error ? error.message : String(error))
    }
  }, [root, displayName, address])

  const compareSvg = React.useMemo(() => {
    if (compare === undefined) return ''
    try {
      return renderDisplay(compare.xml)
    } catch {
      return ''
    }
  }, [compare])

  if (rendered.error !== '') {
    return h('div', { style: { padding: 16, font: '13px system-ui', color: '#a00' } },
      h('p', null, t('invalid')),
      h('pre', { style: { whiteSpace: 'pre-wrap', color: '#666' } }, rendered.error))
  }
  const size = /width="(\d+)" height="(\d+)"/u.exec(rendered.svg)
  const width = Number(size?.[1] ?? 0)
  const height = Number(size?.[2] ?? 0)
  const chosen = selected === undefined ? undefined : parsed.index.get(selected)
  return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 11, borderBottom: '1px solid rgba(128,128,128,.25)', flex: 'none', opacity: 0.85 } },
      displayName === '' ? null : h('span', { style: { fontWeight: 600 } }, displayName),
      h('span', null, `${width}×${height}`),
      h('span', null, `${rendered.count} ${t('objects')}`),
      h('span', { style: { marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' } },
        live && liveNotice !== '' ? h('span', { style: { opacity: 0.7 } }, liveNotice) : null,
        history.length > 0 ? h('button', { type: 'button', onClick: back, style: { font: 'inherit' } }, '← Back') : null,
        h('button', {
          type: 'button',
          disabled: root === undefined,
          onClick: () => { if (compare === undefined) void startCompare(); else setCompare(undefined) },
          style: { font: 'inherit', fontWeight: compare === undefined ? 400 : 600 },
        }, compare === undefined ? 'Compare' : 'Compare ×'),
        h('button', { type: 'button', onClick: () => downloadPng(container.current, displayName), style: { font: 'inherit' } }, 'PNG'),
        h('button', { type: 'button', disabled: root === undefined, title: root === undefined ? 'Open the export folder, not a single file' : `${parsed.tags.length} tag(s) bound`, onClick: () => setLive(!live), style: { font: 'inherit', fontWeight: live ? 600 : 400 } }, live ? 'Live on' : 'Live'),
        h('button', { type: 'button', onClick: () => setFit(true), style: { font: 'inherit' } }, t('fit')),
        h('button', { type: 'button', onClick: () => setFit(false), style: { font: 'inherit' } }, t('actual')))),
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
        style: { flex: 1, minWidth: 0, overflow: 'auto', background: '#202020', padding: 8 },
      },
        compare === undefined ? null : h('div', { style: { fontSize: 10, opacity: 0.7, marginBottom: 4 } }, displayName === '' ? 'current' : displayName),
        h('div', {
          style: fit ? { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' } : { width, height },
          dangerouslySetInnerHTML: { __html: fit ? responsiveSvg(rendered.svg) : rendered.svg },
        })),
      compare === undefined ? null : h('div', { style: { flex: 1, minWidth: 0, overflow: 'auto', background: '#202020', padding: 8, borderLeft: '1px solid rgba(128,128,128,.35)' } },
        h('div', { style: { fontSize: 10, opacity: 0.7, marginBottom: 4 } }, `compare: ${compare.name}`),
        h('div', {
          style: fit ? { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' } : { width, height },
          dangerouslySetInnerHTML: { __html: fit ? responsiveSvg(compareSvg) : compareSvg },
        })),
      chosen === undefined ? null : h('div', { style: { width: 260, flex: 'none', borderLeft: '1px solid rgba(128,128,128,.25)', overflow: 'auto', padding: 8, fontSize: 11 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          h('strong', null, chosen.type),
          h('span', { style: { opacity: 0.6 } }, chosen.name),
          h('button', { type: 'button', onClick: () => setSelected(undefined), style: { marginLeft: 'auto', font: 'inherit' } }, '×')),
        chosen.type === 'gotoButton' && attribute({ tag: 'gotoButton', attributes: chosen.attributes, children: [], text: '' }, 'display') !== undefined
          ? h('button', { type: 'button', onClick: () => { const target = attribute({ tag: 'gotoButton', attributes: chosen.attributes, children: [], text: '' }, 'display'); if (target !== undefined) void navigate(target) }, style: { font: 'inherit', margin: '6px 0' } }, 'Open display')
          : null,
        h('table', { style: { borderCollapse: 'collapse', width: '100%' } },
          h('tbody', null, Object.entries(chosen.attributes).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => h('tr', { key }, h('td', { style: { opacity: 0.6, paddingRight: 6, verticalAlign: 'top' } }, key), h('td', null, value))))),
        chosen.connections.length === 0 ? null : h('div', null, h('strong', null, 'Connections'), chosen.connections.map((connection, index) => h('div', { key: index }, `${connection.name ?? '?'} ← ${connection.expression ?? '?'}`))),
        h('div', { style: { opacity: 0.6, marginTop: 4 } }, `${chosen.states} state(s)`)))) 
}
