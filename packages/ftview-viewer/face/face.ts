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
import { Display, decodeSource } from './display.ts'
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

/** The document-preview body: bytes in, display out. */
function Body(props: { content?: { kind?: string; data?: Uint8Array }; resourceAddress?: string; t: (key: string) => string }): React.ReactElement | null {
  const { content, t } = props
  const source = React.useMemo(() => {
    if (content === undefined || content.kind !== 'bytes' || content.data === undefined) return null
    return decodeSource(content.data)
  }, [content])
  if (source === null) return null
  return h(Display, { source, address: props.resourceAddress, t: typeof t === 'function' ? t : (key: string) => key })
}

/** The better-sidebar file viewer component: text in, display out. */
function fileViewer(t: (key: string) => string): (props: { content?: unknown }) => React.ReactElement | null {
  return function FtViewFile(props) {
    if (typeof props.content !== 'string') return null
    return h(Display, { source: props.content, t, address: typeof props.path === 'string' ? props.path : undefined })
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
