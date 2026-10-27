/**
 * The engineering preview face for FactoryTalk View ME displays.
 *
 * Source form of the client face. `scripts/build-ftview-face.mjs` bundles this
 * file into `lib/client.js` in the module-loader format the shell expects, so the
 * panel now renders through the maintained renderer in `src/render.ts` instead
 * of the original closure bundle.
 *
 * The face draws the SVG itself (no DOM mutation), scales it to the tab, and
 * shows the display size and object count in a small toolbar. Errors render as
 * text rather than an empty panel.
 *
 * @module dsh-engineering-ftview-viewer/face
 */

import * as React from 'react'
import { parseXml } from '../src/xml.ts'
import { renderDisplay } from '../src/render.ts'

/** Locale namespace for this face. */
const NS = 'factorytalkView'

/** Document preview id (kept stable so the shell remembers the tab kind). */
const ID = 'dsh-engineering-ftview-viewer/display'

const en = {
  title: 'FactoryTalk View display',
  fit: 'Fit',
  actual: '100%',
  objects: 'objects',
  invalid: 'This file is not a FactoryTalk View display export.',
}
const zh = {
  title: 'FactoryTalk View 画面',
  fit: '适应',
  actual: '100%',
  objects: '个对象',
  invalid: '该文件不是 FactoryTalk View 画面导出。',
}

type CreateElement = typeof React.createElement
const h: CreateElement = React.createElement

/** Decode the bytes a document preview hands over. */
function decodeSource(data: Uint8Array | ArrayBuffer | string): string {
  if (typeof data === 'string') return data
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  return new TextDecoder('utf-8').decode(bytes)
}

/** Count top-level objects in a display, for the toolbar. */
function objectCount(source: string): number {
  try {
    const display = parseXml(source)
    return display.children.filter(child => child.tag !== 'displaySettings').length
  } catch {
    return 0
  }
}

/** The display surface. */
function Display(props: { source: string; t: (key: string) => string }): React.ReactElement {
  const { source, t } = props
  // A render failure must be visible, not an empty tab.
  const rendered = React.useMemo(() => {
    try {
      return { svg: renderDisplay(source), count: objectCount(source), error: '' }
    } catch (error) {
      return { svg: '', count: 0, error: error instanceof Error ? error.message : String(error) }
    }
  }, [source])
  const [fit, setFit] = React.useState(true)
  if (rendered.error !== '') {
    return h('div', { style: { padding: 16, font: '13px system-ui', color: '#a00' } },
      h('p', null, t('invalid')),
      h('pre', { style: { whiteSpace: 'pre-wrap', color: '#666' } }, rendered.error))
  }
  const size = /width="(\d+)" height="(\d+)"/u.exec(rendered.svg)
  const width = Number(size?.[1] ?? 0)
  const height = Number(size?.[2] ?? 0)
  return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
    h('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 11,
        borderBottom: '1px solid rgba(128,128,128,.25)', flex: 'none', opacity: 0.85,
      },
    },
      h('span', null, `${width}×${height}`),
      h('span', null, `${rendered.count} ${t('objects')}`),
      h('span', { style: { marginLeft: 'auto', display: 'flex', gap: 4 } },
        h('button', { type: 'button', onClick: () => setFit(true), style: { font: 'inherit' } }, t('fit')),
        h('button', { type: 'button', onClick: () => setFit(false), style: { font: 'inherit' } }, t('actual')))),
    h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto', background: '#202020', padding: 8 } },
      h('div', {
        style: fit
          ? { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }
          : { width, height },
        // The renderer returns a complete SVG document; no untrusted input reaches
        // this string beyond the display file the user opened.
        dangerouslySetInnerHTML: { __html: rendered.svg },
      })))
}

/** The document-preview body: bytes in, display out. */
function Body(props: { content?: { kind?: string; data?: Uint8Array }; resourceAddress?: string; t: (key: string) => string }): React.ReactElement | null {
  const { content, t } = props
  const source = React.useMemo(() => {
    if (content === undefined || content.kind !== 'bytes' || content.data === undefined) return null
    return decodeSource(content.data)
  }, [content])
  if (source === null) return null
  return h(Display, { source, t: typeof t === 'function' ? t : (key: string) => key })
}

/** The better-sidebar file viewer component: text in, display out. */
function fileViewer(t: (key: string) => string): (props: { content?: unknown }) => React.ReactElement | null {
  return function FtViewFile(props) {
    if (typeof props.content !== 'string') return null
    return h(Display, { source: props.content, t })
  }
}

/** Plugin services this face needs. */
export const inject = ['slots', 'locale', 'documentPreviews']

/**
 * Register the preview.
 * @param ctx - client context.
 */
export function apply(ctx: {
  locale: { register(ns: string, dictionaries: unknown): void; bind(ns: string): (key: string) => string }
  documentPreviews: { register(definition: unknown): void }
  slots: { inject(name: string, callback: () => void): void; register(definition: unknown, component: unknown): void }
  betterSidebar?: { registerFileViewer(definition: unknown): void }
  inject(services: string[], callback: (scope: { betterSidebar?: { registerFileViewer(definition: unknown): void } }) => void): void
  effect(callback: () => void | (() => void), label?: string): void
}): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'factorytalk-view: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.documentPreviews.register({
    id: ID,
    extensions: ['xml'],
    priority: 'extension',
    title: () => t('title'),
    loading: 'bytes-complete',
  }), 'factorytalk-view: document viewer')
  ctx.inject(['betterSidebar'], scope => scope.effect?.(() => scope.betterSidebar?.registerFileViewer({
    id: ID,
    title: () => t('title'),
    exts: ['xml'],
    priority: 0,
    fetchStrategy: 'fsRead',
    component: fileViewer(t),
  }), 'factorytalk-view: sidebar file viewer'))
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(
    { name: 'sidebar.right.tab.document', key: ID, locale: NS }, Body,
  )), 'factorytalk-view: document body')
}
