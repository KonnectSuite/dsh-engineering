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
  back: 'Back',
  compare: 'Compare',
  compareOff: 'Stop comparing',
  compareLabel: 'compare',
  compareMissing: 'not in that export',
  png: 'PNG',
  live: 'Live',
  liveOn: 'Live on',
  liveNeedsExport: 'Open the export folder, not a single file',
  liveReadFailed: 'live read failed',
  liveFailed: 'failed',
  liveNotLive: 'not live',
  tags: 'tag(s) bound',
  openDisplay: 'Open display',
  connections: 'Connections',
  current: 'current',
  states: 'state(s)',
  family: 'family',
  drawn: 'drawn',
  placeholders: 'placeholder(s)',
  unknownTypes: 'not in the installed schema',
  coverage: 'Coverage',
  nothingSkipped: 'Every object in this display is drawn from the installed schema.',
  coordinates: 'Coordinates',
  rulePercent: 'a percentage of the object box',
  ruleAbsolute: 'display pixels',
  ruleDiagonal: 'the object box diagonal',
  modeDraft: 'Draft',
  modeExport: 'Export',
  modeDraftHint: 'Staged coordinates: a value inside an object is a percentage of its box.',
  modeExportHint: 'Exported coordinates: a value inside an object is a display pixel.',
  close: 'Close',
  controllerPrompt: 'Controller IPv4 address',
  comparePrompt: 'Compare with another export folder',
  detectedFrom: 'Detected from file content',
  notDisplay: 'Not a display, so nothing is drawn. Open a file under Displays/ to render.',
}
const zh = {
  title: 'FactoryTalk View 画面',
  fit: '适应',
  actual: '100%',
  objects: '个对象',
  invalid: '该文件不是 FactoryTalk View 画面导出。',
  back: '返回',
  compare: '对比',
  compareOff: '结束对比',
  compareLabel: '对比',
  compareMissing: '不在该导出中',
  png: 'PNG',
  live: '实时',
  liveOn: '实时开',
  liveNeedsExport: '请打开导出文件夹，而不是单个文件',
  liveReadFailed: '实时读取失败',
  liveFailed: '失败',
  liveNotLive: '非实时',
  tags: '个已绑定标签',
  openDisplay: '打开画面',
  connections: '连接',
  current: '当前',
  states: '个状态',
  family: '类别',
  drawn: '已绘制',
  placeholders: '个占位',
  unknownTypes: '个不在已安装架构中',
  coverage: '覆盖情况',
  nothingSkipped: '此画面中的每个对象都按已安装架构绘制。',
  coordinates: '坐标',
  rulePercent: '相对于对象框的百分比',
  ruleAbsolute: '画面像素',
  ruleDiagonal: '对象框对角线',
  modeDraft: '草稿',
  modeExport: '导出',
  modeDraftHint: '草稿坐标：对象内部的值相对于其对象框的百分比。',
  modeExportHint: '导出坐标：对象内部的值是画面像素。',
  close: '关闭',
  controllerPrompt: '控制器 IPv4 地址',
  comparePrompt: '与另一个导出文件夹对比',
  detectedFrom: '从文件内容识别',
  notDisplay: '这不是画面，因此没有绘制任何内容。请打开 Displays/ 下的文件进行渲染。',
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
