/**
 * The right-panel drawing body: a read-only viewer over the sheet model.
 *
 * The document preview shell above this body owns the file path, reload and
 * renderer choice; this component owns the sheet, the layers the reader can
 * see, the search over carried text, and the print/SVG/PNG exports of the
 * current view. It draws nothing the reader can move: authoring a drawing
 * happens in AryaCAD Electrical, which the owner mounts as an MCP server (see
 * docs/products/ecad/aryacad-bridge.md), and the review layer that reads these files stays
 * in the `ecad_*` tools.
 *
 * The pure geometry lives in `scene.ts`; this file owns pointer state and the
 * SVG the reader sees.
 *
 * @module dsh-engineering-ecad/client/EcadBody
 */

import {
  createElement,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { EcadSheetModel, EcadTitleBlock, EcadTitleBlockField } from '../engine/types.ts'
import { conversionOf, sourceFormatOf, type EcadConversionSummary, type EcadFailure, type EcadOpen, type EcadOpenEnvelope } from './artifacts.ts'
import {
  coverageOf,
  fitBox,
  fmt,
  layerCounts,
  layerInk,
  layersOf,
  sceneOf,
  unitLabel,
  type EcadCoverage,
  type EcadFit,
  type EcadScene,
  type EcadSceneGeometry,
  type EcadScenePrimitive,
} from './scene.ts'
import { parseFileAddress } from './vendor/workspace-path.ts'
import { svgDocumentOf } from './svgExport.ts'
import css from './EcadBody.module.css'

/** The translated string reader the slot hands down. */
export type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string

/** The renderer-mode content descriptor the document preview passes. */
export interface EcadRendererContent {
  readonly kind: 'renderer'
  readonly revision: number
  readonly loaded: (version?: string) => void
  readonly failed: () => void
  readonly reload: () => void
}

/** The capabilities the registration injects into the body. */
export interface EcadBodyInjected {
  /** Open one drawing and return its sheet model, or the failure envelope. */
  readonly open: EcadOpen
  /** Append a review prompt to the conversation draft; false when chat is absent. */
  readonly ask: (address: string, context: string) => boolean
}

/** The props the shell hands a document-preview body. */
export interface EcadBodyProps extends EcadBodyInjected {
  readonly resourceAddress: string
  readonly content?: { readonly kind?: string } & Partial<EcadRendererContent>
  readonly scrollportRef?: (element: HTMLElement | null) => void
  readonly wrap?: boolean
  readonly t: Translate
}

/** The user's pan and zoom on top of the fitted drawing. */
interface ViewState {
  readonly zoom: number
  readonly panX: number
  readonly panY: number
}

const FIT_MARGIN = 24
const MIN_ZOOM = 0.25
const MAX_ZOOM = 60
const PAN_STEP = 40
/** Text matches beyond this count are counted but not outlined. */
const HIGHLIGHT_LIMIT = 400

/** The active pointer gesture, owned outside React state so a move is cheap. */
type PanGesture = { readonly startX: number; readonly startY: number; readonly panX: number; readonly panY: number; readonly pointerId: number }

/** A failure the reader can dismiss inside the pane. */
interface Notice {
  readonly kind: 'error'
  readonly text: string
}

/** One glyph's geometry, drawn in the theme's label colour. */
interface IconProps {
  readonly size?: number
}

function MinusIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M3.5 8h9' }))
}

function PlusIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M8 3.5v9M3.5 8h9' }))
}

function FitIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M2.5 5.5v-3h3M13.5 5.5v-3h-3M2.5 10.5v3h3M13.5 10.5v3h-3' }))
}

function LayersIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M8 2.5 14 6l-6 3.5L2 6l6-3.5ZM2 10l6 3.5L14 10' }))
}

function ExpandIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M9.5 2.5h4v4M6.5 13.5h-4v-4' }))
}

function CollapseIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M13.5 6.5h-4v4M2.5 9.5h4v-4' }))
}

function WarningIcon({ size = 13 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M8 2.5 14.5 14h-13L8 2.5ZM8 6.5v3.5M8 11.8v.6' }))
}

function ChatIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M2.5 4.5h11v7h-6l-3 2.5v-2.5h-2v-7Z' }))
}

function CloseIcon({ size = 13 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M4 4l8 8M12 4l-8 8' }))
}

function SearchIcon({ size = 13 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM10.5 10.5 14 14' }))
}

function EyeGlyph({ open }: { readonly open: boolean }): ReactElement {
  return createElement('svg', { className: css.icon, width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    open
      ? createElement('path', { d: 'M1.5 8C3.4 4.9 5.6 3.4 8 3.4c2.4 0 4.6 1.5 6.5 4.6-1.9 3.1-4.1 4.6-6.5 4.6-2.4 0-4.6-1.5-6.5-4.6Zm6.5 1.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z' })
      : createElement('path', { d: 'M2 3l12 10M6.2 4.2A6.9 6.9 0 0 1 8 3.9c2.4 0 4.6 1.5 6.5 4.6-.7 1.2-1.5 2.1-2.4 2.8M4.3 5.6C3.4 6.4 2.5 7.2 1.5 8c1.9 3.1 4.1 4.6 6.5 4.6.8 0 1.5-.2 2.2-.5' }))
}

/** The status a body is showing. */
type BodyState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly summary: EcadOpenEnvelope; readonly model: EcadSheetModel }
  | { readonly phase: 'error'; readonly error: EcadFailure }

/**
 * Subscribe to one element's content box.
 * @param element - the element to measure; `null` while the state has no sheet.
 * @returns its inner size in pixels.
 */
function useElementSize(element: HTMLElement | null): { readonly width: number; readonly height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (element === null) return
    const measure = (): void => {
      setSize({ width: element.clientWidth, height: element.clientHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [element])
  return size
}

/**
 * Keep a zoom inside the pane's limits.
 * @param zoom - the requested zoom.
 * @returns the zoom the viewer will use.
 */
function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/**
 * Zoom around one screen point, keeping it fixed under the pointer.
 * @param view - current view.
 * @param factor - multiplier.
 * @param cx - screen x.
 * @param cy - screen y.
 * @returns the next view.
 */
function zoomAt(view: ViewState, factor: number, cx: number, cy: number): ViewState {
  const zoom = clampZoom(view.zoom * factor)
  if (zoom === view.zoom || !Number.isFinite(cx) || !Number.isFinite(cy)) return view
  const ratio = zoom / view.zoom
  return { zoom, panX: cx - ratio * (cx - view.panX), panY: cy - ratio * (cy - view.panY) }
}

/**
 * The paint for one piece of geometry.
 * @param primitive - the primitive.
 * @param forFill - whether a filled polygon is being drawn.
 * @returns the style.
 */
function paintOf(primitive: EcadScenePrimitive, forFill: boolean): CSSProperties {
  const dash = primitive.approx ? '4 2' : undefined
  if (forFill) {
    return {
      fill: primitive.ink,
      fillOpacity: primitive.geometry.t === 'path' && primitive.geometry.hatch ? 0.22 : 0.9,
      stroke: 'none',
      strokeWidth: 0,
    }
  }
  return {
    fill: 'none',
    stroke: primitive.ink,
    strokeWidth: 1,
    ...(dash === undefined ? {} : { strokeDasharray: dash }),
  }
}

/** Props of {@link SceneShape}. */
interface SceneShapeProps {
  readonly geometry: EcadSceneGeometry
  readonly paint: CSSProperties
  readonly className?: string
}

/**
 * Draw one geometry with one paint.
 * @param props - geometry and paint.
 */
function SceneShape({ geometry, paint, className }: SceneShapeProps): ReactElement | null {
  const shared = {
    className,
    style: paint,
    vectorEffect: 'non-scaling-stroke' as const,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
    'aria-hidden': true,
  }
  switch (geometry.t) {
    case 'line':
      return createElement('line', { ...shared, x1: geometry.x1, y1: geometry.y1, x2: geometry.x2, y2: geometry.y2 })
    case 'path':
      return createElement('path', { ...shared, d: geometry.d })
    case 'rect':
      return createElement('rect', { ...shared, x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height, rx: 0 })
    case 'circle':
      return createElement('circle', { ...shared, cx: geometry.cx, cy: geometry.cy, r: geometry.r })
    case 'ellipse':
      return createElement('ellipse', {
        ...shared,
        cx: geometry.cx,
        cy: geometry.cy,
        rx: geometry.rx,
        ry: geometry.ry,
        transform: `rotate(${Number(geometry.degrees.toFixed(4))} ${geometry.cx} ${geometry.cy})`,
      })
    case 'dot':
      return createElement('circle', {
        ...shared,
        cx: geometry.cx,
        cy: geometry.cy,
        r: geometry.r,
        style: { fill: paint.stroke ?? paint.fill ?? 'var(--ecad-ink)', stroke: 'none' },
      })
    case 'none':
      return null
    default:
      return null
  }
}

/**
 * Render one primitive's text runs.
 * @param primitive - the primitive whose runs to draw.
 * @param fill - CSS paint for the glyphs.
 * @returns the text elements.
 */
function textRuns(primitive: EcadScenePrimitive, fill: string): ReactElement[] {
  return primitive.text.map((line, index) => createElement(
    'text',
    {
      key: `${primitive.id}:text:${index}`,
      x: 0,
      y: 0,
      transform: `translate(${line.x} ${line.y}) scale(1 -1) rotate(${Number((-line.degrees).toFixed(4))})`,
      fontSize: line.height,
      textAnchor: line.anchor,
      dominantBaseline: line.baseline,
      fill,
      fontFamily: 'inherit',
      'aria-hidden': true,
    },
    line.text,
  ))
}

/** Props of one sheet primitive. */
interface ScenePrimitiveProps {
  readonly primitive: EcadScenePrimitive
}

/**
 * One sheet primitive: its geometry in the reading paint plus its text runs.
 * There is no per-primitive interaction here — the pane never edits — so a pan
 * or a zoom does not repaint the sheet.
 * @param props - the primitive.
 */
function ScenePrimitive({ primitive }: ScenePrimitiveProps): ReactElement {
  const filled = primitive.geometry.t === 'path' && (primitive.geometry.fill || primitive.geometry.hatch)
  return createElement(
    'g',
    {
      className: css.primitive,
      'data-ecad-id': primitive.id,
      'data-ecad-kind': primitive.kind,
      'data-ecad-layer': primitive.layer,
      ...(primitive.approx ? { 'data-ecad-approx': 'true' } : {}),
    },
    primitive.geometry.t === 'none' ? null : createElement(SceneShape, { geometry: primitive.geometry, paint: paintOf(primitive, filled) }),
    textRuns(primitive, primitive.ink),
  )
}

/** Memoized primitive: a pan, a zoom or a search never repaints the sheet. */
const MemoPrimitive = memo(ScenePrimitive)

/** Props of {@link SceneView}. */
interface SceneViewProps {
  readonly scene: EcadScene
  readonly fit: EcadFit
  readonly view: ViewState
  readonly label: string
  /** Primitives whose carried text matches the search, outlined in the accent. */
  readonly highlight: readonly EcadScenePrimitive[]
}

/**
 * The sheet as SVG: one outer group for the user's pan and zoom, one inner
 * group for the fit with the Y axis flipped, so CAD orientation reads correctly
 * and a zoom never rebuilds a primitive. The search outline is the only
 * overlay; the base primitives are memoized once per scene so a pointer move
 * never walks 36k shapes.
 * @param props - the scene, its view state and the search matches.
 */
function SceneView({ scene, fit, view, label, highlight }: SceneViewProps): ReactElement {
  const base = useMemo(() => scene.primitives.map(primitive => createElement(MemoPrimitive, { key: primitive.id, primitive })), [scene])
  return createElement(
    'svg',
    { className: css.canvas, role: 'img', 'aria-label': label, 'data-ecad-canvas': 'true' },
    createElement(
      'g',
      { transform: `translate(${view.panX} ${view.panY}) scale(${view.zoom})`, 'data-ecad-view': 'true' },
      createElement(
        'g',
        { transform: `translate(${fit.translateX} ${fit.translateY}) scale(${fit.scale} ${-fit.scale})` },
        base,
        highlight.map(primitive => (
          primitive.geometry.t === 'none'
            ? createElement('g', { key: `find-text-${primitive.id}`, className: css.selectionOverlay, 'data-ecad-found': primitive.id }, textRuns(primitive, 'var(--ecad-accent)'))
            : createElement('g', { key: `find-${primitive.id}`, className: css.selectionOverlay, 'data-ecad-found': primitive.id },
              createElement(SceneShape, { geometry: primitive.geometry, paint: { fill: 'none', stroke: 'var(--ecad-paper)', strokeWidth: 5 }, className: css.selectionHalo }),
              createElement(SceneShape, { geometry: primitive.geometry, paint: { fill: 'none', stroke: 'var(--ecad-accent)', strokeWidth: 2.5 }, className: css.selection }),
              textRuns(primitive, 'var(--ecad-accent)'),
            )
        )),
      ),
    ),
  )
}

/** Props of {@link CadToolbar}. */
interface CadToolbarProps {
  readonly coverage: EcadCoverage
  readonly coverageText: string
  readonly coverageTitle: string | undefined
  readonly ready: boolean
  readonly format: string | undefined
  readonly conversion: EcadConversionSummary | undefined
  readonly panelsOpen: boolean
  readonly chatUnavailable: boolean
  readonly query: string
  readonly onQuery: (value: string) => void
  readonly matchText: string | undefined
  readonly onPrint: () => void
  readonly onExportSvg: () => void
  readonly onExportPng: () => void
  readonly onFit: () => void
  readonly onZoom: (factor: number) => void
  readonly onTogglePanels: () => void
  readonly onAsk: () => void
  readonly focused: boolean
  readonly onToggleFocus: () => void
  readonly t: Translate
}

/**
 * The pane's top row: coverage, search, view controls, exports, panels and Ask
 * Arya. There is no mode switch and no command palette: this pane does not edit.
 * @param props - coverage, read posture and control callbacks.
 */
function CadToolbar({ coverage, coverageText, coverageTitle, ready, format, conversion, panelsOpen, chatUnavailable, query, onQuery, matchText, onPrint, onExportSvg, onExportPng, onFit, onZoom, onTogglePanels, onAsk, focused, onToggleFocus, t }: CadToolbarProps): ReactElement {
  return createElement(
    'div',
    { className: `${css.toolbar} ${css.noPrint}` },
    createElement(
      'div',
      { className: css.toolbarGroup },
      ready && format !== undefined
        ? createElement('span', { className: css.badge, title: formatTitleOf(format, conversion, t) }, format.toUpperCase())
        : null,
      ready
        ? createElement('span', { className: css.badge, title: t('readOnlyHint') }, createElement(LayersIcon, {}), t('readOnly'))
        : null,
      ready && coverage.truncated
        ? createElement('span', { className: `${css.badge} ${css.badgeWarn}` }, createElement(WarningIcon, {}), t('truncatedBadge'))
        : null,
      ready && coverage.approximate > 0
        ? createElement('span', { className: css.badge, title: t('approximateHint', { count: coverage.approximate }) }, createElement('span', { className: css.badgeDot }), t('approximateBadge'))
        : null,
    ),
    ready ? createElement('span', { className: css.coverage, title: coverageTitle }, coverageText) : createElement('span', { className: css.coverage }),
    createElement('span', { className: css.toolbarSpacer }),
    createElement(
      'div',
      { className: css.toolbarGroup, 'data-ecad-search': 'true' },
      createElement(SearchIcon, {}),
      createElement('input', {
        type: 'search',
        className: css.formInput,
        value: query,
        placeholder: t('searchHint'),
        'aria-label': t('search'),
        disabled: !ready,
        onChange: (event: { target: { value: string } }) => {
          onQuery(event.target.value)
        },
      }),
      matchText === undefined ? null : createElement('span', { className: css.badge, 'data-ecad-match': 'true' }, matchText),
    ),
    createElement(
      'div',
      { className: css.toolbarGroup },
      createElement('button', { type: 'button', className: `${css.button} ${css.iconButton}`, title: t('zoomExtentsHint'), 'aria-label': t('zoomExtents'), disabled: !ready, onClick: onFit }, createElement(FitIcon, {})),
      createElement('button', { type: 'button', className: `${css.button} ${css.iconButton}`, title: t('zoomOut'), 'aria-label': t('zoomOut'), disabled: !ready, onClick: () => { onZoom(1 / 1.3) } }, createElement(MinusIcon, {})),
      createElement('button', { type: 'button', className: `${css.button} ${css.iconButton}`, title: t('zoomIn'), 'aria-label': t('zoomIn'), disabled: !ready, onClick: () => { onZoom(1.3) } }, createElement(PlusIcon, {})),
      createElement('button', {
        type: 'button',
        className: `${css.button} ${css.iconButton}`,
        title: t('panels'),
        'aria-label': t('panels'),
        'aria-pressed': panelsOpen,
        disabled: !ready,
        onClick: onTogglePanels,
      }, createElement(LayersIcon, {})),
      createElement('button', { type: 'button', className: `${css.button}`, title: t('printHint'), disabled: !ready, onClick: onPrint }, t('print')),
      createElement('button', { type: 'button', className: `${css.button}`, title: t('exportSvgHint'), disabled: !ready, onClick: onExportSvg }, t('exportSvg')),
      createElement('button', { type: 'button', className: `${css.button}`, title: t('exportPngHint'), disabled: !ready, onClick: onExportPng }, t('exportPng')),
      createElement('button', {
        type: 'button',
        className: `${css.button} ${css.iconButton}`,
        title: focused ? t('focusExit') : t('focusEnter'),
        'aria-label': focused ? t('focusExit') : t('focusEnter'),
        'aria-pressed': focused,
        disabled: !ready,
        onClick: onToggleFocus,
        'data-ecad-focus': 'true',
      }, focused ? createElement(CollapseIcon, {}) : createElement(ExpandIcon, {})),
      createElement('button', {
        type: 'button',
        className: `${css.button} ${css.primaryButton}`,
        title: chatUnavailable ? t('askUnavailable') : t('ask'),
        disabled: !ready || chatUnavailable,
        onClick: onAsk,
      }, createElement(ChatIcon, {}), createElement('span', { className: css.toolbarLabel }, t('ask'))),
    ),
  )
}

/**
 * The centered loading state; the same rhythm the document previewers use.
 * @param props - the status text.
 */
function LoadingState({ label }: { readonly label: string }): ReactElement {
  return createElement(
    'div',
    { className: css.state, role: 'status' },
    createElement('span', { className: css.spinner }),
    createElement('p', { className: css.stateBody }, label),
  )
}

/** Props of {@link FailureState}. */
interface FailureStateProps {
  readonly error: EcadFailure
  readonly onRetry: () => void
  readonly onAsk: () => void
  readonly chatUnavailable: boolean
  readonly t: Translate
}

/**
 * A failure the reader can act on: code, explanation and the fix it names.
 * @param props - the failure and its recourses.
 */
function FailureState({ error, onRetry, onAsk, chatUnavailable, t }: FailureStateProps): ReactElement {
  const unavailable = error.code === 'ECAD_DISABLED'
  return createElement(
    'div',
    { className: css.state, role: 'alert' },
    createElement('h3', { className: css.stateTitle }, unavailable ? t('unavailable') : t('errorTitle')),
    createElement('code', { className: css.stateCode }, `${t('errorCode')}: ${error.code}`),
    createElement('p', { className: css.stateBody }, error.message),
    createElement('p', { className: css.stateBody }, `${t('errorFix')}: ${unavailable ? t('unavailableFix') : error.fix}`),
    createElement(
      'div',
      { className: css.stateActions },
      createElement('button', { type: 'button', className: css.button, onClick: onRetry }, t('retry')),
      createElement('button', { type: 'button', className: css.button, disabled: chatUnavailable, onClick: onAsk }, createElement(ChatIcon, {}), t('ask')),
    ),
    chatUnavailable ? createElement('p', { className: css.stateBody }, t('askUnavailable')) : null,
  )
}

/**
 * A transient problem inside the pane, such as a failed export.
 * @param props - the notice and its dismiss action.
 */
function NoticeView({ notice, onDismiss, t }: { readonly notice: Notice; readonly onDismiss: () => void; readonly t: Translate }): ReactElement {
  return createElement(
    'div',
    { className: css.notice, role: 'status' },
    createElement(WarningIcon, {}),
    createElement('span', { className: css.noticeText }, notice.text),
    createElement('button', { type: 'button', className: `${css.button} ${css.iconButton}`, 'aria-label': t('retry'), onClick: onDismiss }, createElement(CloseIcon, {})),
  )
}

/** The title-block fields the side panel prints, in reading order. */
const TITLE_BLOCK_ROWS: readonly { readonly field: EcadTitleBlockField; readonly key: string }[] = [
  { field: 'sheetNumber', key: 'sheetNumber' },
  { field: 'revision', key: 'revision' },
  { field: 'date', key: 'date' },
  { field: 'title', key: 'sheetTitle' },
  { field: 'scale', key: 'scale' },
  { field: 'project', key: 'project' },
  { field: 'customer', key: 'customer' },
  { field: 'drawnBy', key: 'drawnBy' },
  { field: 'checkedBy', key: 'checkedBy' },
]

/** Props of {@link SheetSection}. */
interface SheetSectionProps {
  readonly titleBlock: EcadTitleBlock | undefined
  readonly coverage: EcadCoverage
  readonly coverageText: string
  readonly coverageTitle: string | undefined
  readonly format: string
  readonly conversion: EcadConversionSummary
  readonly dxfVersion: string
  readonly units: number
  readonly version: string
  readonly t: Translate
}

/**
 * The sheet's identity, read from the title block the host extracted, plus the
 * source format and the conversion the service named.
 * @param props - title block, format provenance, units and file version.
 */
function SheetSection({ titleBlock, coverage, coverageText, coverageTitle, format, conversion, dxfVersion, units, version, t }: SheetSectionProps): ReactElement {
  const unit = unitLabel(units)
  const fields = titleBlock?.fields ?? {}
  const rows: { readonly label: string; readonly value: string; readonly title?: string; readonly wrap?: boolean }[] = []
  for (const row of TITLE_BLOCK_ROWS) {
    const value = fields[row.field]?.value
    if (value !== undefined && value !== '') rows.push({ label: t(row.key), value })
  }
  const converted = conversionLabel(conversion)
  rows.push({ label: t('coverageLabel'), value: coverageText, wrap: true, ...(coverageTitle === undefined ? {} : { title: coverageTitle }) })
  if (coverage.truncated) rows.push({ label: t('truncatedBadge'), value: t('truncated'), wrap: true })
  rows.push({ label: t('format'), value: format.toUpperCase(), ...(format === 'dwg' ? { title: t('dwgSupport') } : {}) })
  if (converted !== undefined) rows.push({ label: t('converted'), value: converted })
  if (conversion.warnings > 0) {
    rows.push({
      label: t('conversionWarningsShort'),
      value: String(conversion.warnings),
      title: conversion.warningTexts.length > 0 ? conversion.warningTexts.join('\n') : t('conversionWarningsHint'),
    })
  }
  rows.push({ label: t('dxfVersionLabel'), value: dxfVersion })
  rows.push({ label: t('units'), value: unit ?? t('unitsUnset') })
  rows.push({ label: t('version'), value: version.slice(0, 12) })
  return createElement(
    'section',
    { className: `${css.panelSection} ${css.sheetSection}` },
    createElement('div', { className: css.panelHeading }, t('sheet')),
    createElement(
      'div',
      { className: css.sheetRows },
      rows.map(row => createElement(
        'div',
        { key: row.label, className: css.propertyRow, title: row.value },
        createElement('span', { className: css.propertyLabel }, row.label),
        createElement('span', { className: `${css.propertyValue} ${row.wrap === true ? css.sheetValueWrap : css.sheetValue}` }, row.value),
      )),
    ),
  )
}

/** Props of {@link LayerPanel}. */
interface LayerPanelProps {
  readonly model: EcadSheetModel
  readonly counts: ReadonlyMap<string, number>
  readonly hidden: ReadonlySet<string>
  readonly onToggle: (name: string) => void
  readonly onShowAll: () => void
  readonly onHideAll: () => void
  readonly t: Translate
}

/**
 * The layer list: visibility, colour and how many entities of the current
 * layout each layer carries. Visibility is local to the pane; the drawing is
 * never rewritten, so there is no create, rename or colour form here.
 * @param props - the model, the local visibility and the callbacks.
 */
function LayerPanel({ model, counts, hidden, onToggle, onShowAll, onHideAll, t }: LayerPanelProps): ReactElement {
  const anyHidden = model.layers.some(layer => hidden.has(layer.name.toUpperCase()))
  return createElement(
    'section',
    { className: `${css.panelSection} ${css.layersSection}`, 'data-ecad-layers': 'true' },
    createElement(
      'div',
      { className: css.panelHeading },
      t('layers'),
      createElement('span', { className: css.panelHeadingSpacer }),
      anyHidden
        ? createElement('button', { type: 'button', className: `${css.button} ${css.panelHeadingButton}`, onClick: onShowAll }, t('layersShowAll'))
        : null,
      createElement('button', { type: 'button', className: `${css.button} ${css.panelHeadingButton}`, onClick: onHideAll }, t('layerHideAll')),
    ),
    createElement(
      'div',
      { className: css.layerList, role: 'group', 'aria-label': t('layers') },
      model.layers.map((layer) => {
        const key = layer.name.toUpperCase()
        const visible = !hidden.has(key)
        const title = `${visible ? t('layerHide', { layer: layer.name }) : t('layerShow', { layer: layer.name })}${layer.frozen === true ? ` · ${t('layerFrozen')}` : ''}${layer.locked === true ? ` · ${t('layerLocked')}` : ''}`
        return createElement(
          'div',
          { key: layer.name, className: css.layerRow, 'data-ecad-layer-row': layer.name },
          createElement(
            'button',
            {
              type: 'button',
              className: css.layerToggle,
              'aria-pressed': visible,
              title,
              onClick: () => {
                onToggle(layer.name)
              },
            },
            createElement('span', { className: css.layerEye }, createElement(EyeGlyph, { open: visible })),
            createElement('span', { className: css.swatch, style: { background: layerInk(layer) } }),
            createElement('span', { className: css.layerName }, layer.name),
            createElement('span', { className: css.layerCount }, String(counts.get(key) ?? 0)),
          ),
        )
      }),
    ),
  )
}

/** The drawing body. */
export function EcadBody(props: EcadBodyProps): ReactNode {
  const { resourceAddress, content, t, open, ask } = props
  const request = content?.kind === 'renderer' ? content as EcadRendererContent : undefined
  const revision = request?.revision ?? 0
  const [localRevision, setLocalRevision] = useState(0)
  const [state, setState] = useState<BodyState>({ phase: 'loading' })
  const [layoutId, setLayoutId] = useState<string | undefined>(undefined)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [panelsOpen, setPanelsOpen] = useState(true)
  const panelsTouchedRef = useRef(false)
  const [chatUnavailable, setChatUnavailable] = useState(false)
  const [view, setView] = useState<ViewState>({ zoom: 1, panX: 0, panY: 0 })
  const [panning, setPanning] = useState(false)
  /** The drawing pane fills the whole window instead of the narrow sidebar. */
  const [focused, setFocused] = useState(false)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<Notice | undefined>(undefined)
  const gestureRef = useRef<PanGesture | undefined>(undefined)
  // The sheet element is state, not a ref, because the first render is the
  // loading state: the wheel listener and the size observer must attach when the
  // canvas actually mounts.
  const [canvasElement, setCanvasElement] = useState<HTMLDivElement | null>(null)
  const size = useElementSize(canvasElement)

  // A narrow preview opens the sheet first; the panel is one click away. A
  // reader who has already toggled keeps their choice.
  useEffect(() => {
    if (panelsTouchedRef.current) return
    const paneWidth = canvasElement?.parentElement?.clientWidth ?? 0
    if (paneWidth === 0) return
    if (paneWidth <= 520) setPanelsOpen(false)
  }, [canvasElement, size.width])

  // Focus mode is the full-window viewer; opening it shows the panels and
  // Escape returns to the sidebar.
  useEffect(() => {
    if (!focused) return
    setPanelsOpen(true)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setFocused(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [focused])

  const retry = useCallback(() => {
    if (request !== undefined) request.reload()
    else setLocalRevision(value => value + 1)
    setState({ phase: 'loading' })
  }, [request])

  /** Reset every per-sheet surface; a reload retires the reader's view. */
  const resetSheetState = useCallback(() => {
    setView({ zoom: 1, panX: 0, panY: 0 })
    setHidden(new Set())
    setLayoutId(undefined)
    setQuery('')
    setNotice(undefined)
    gestureRef.current = undefined
    setPanning(false)
  }, [])

  // Load the drawing whenever the shell's revision changes. The renderer owns
  // its content: it reads the model, reports the displayed version, and cancels
  // its own request on unmount or replace.
  useEffect(() => {
    if (resourceAddress === '') return
    const controller = new AbortController()
    setState({ phase: 'loading' })
    resetSheetState()
    void open(resourceAddress, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) {
        setState({ phase: 'ready', summary: result.summary, model: result.model })
        request?.loaded(result.summary.version)
      } else {
        setState({ phase: 'error', error: result.error })
        request?.failed()
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setState({
        phase: 'error',
        error: {
          code: 'ECAD_DISABLED',
          message: error instanceof Error ? error.message : String(error),
          fix: t('unavailableFix'),
        },
      })
      request?.failed()
    })
    return () => {
      controller.abort()
    }
  }, [resourceAddress, revision, localRevision, open, resetSheetState, t])

  const model = state.phase === 'ready' ? state.model : undefined
  const summary = state.phase === 'ready' ? state.summary : undefined
  const format = summary === undefined ? undefined : sourceFormatOf(summary)
  const conversion = summary === undefined ? undefined : conversionOf(summary.converted)
  const formatLabel = format === undefined ? 'ECAD' : format.toUpperCase()
  const layers = useMemo(() => (model === undefined ? new Map() : layersOf(model)), [model])
  const activeLayout = useMemo(() => {
    if (model === undefined) return undefined
    return model.layouts.find(layout => layout.id === layoutId)
      ?? model.layouts.find(layout => layout.kind === 'model')
      ?? model.layouts[0]
  }, [model, layoutId])
  const activeLayoutId = activeLayout?.id
  const scene = useMemo(
    () => (activeLayout === undefined ? undefined : sceneOf(activeLayout, layers, hidden)),
    [activeLayout, layers, hidden],
  )
  const counts = useMemo(() => (activeLayout === undefined ? new Map<string, number>() : layerCounts(activeLayout.entities)), [activeLayout])
  const coverage = useMemo(() => (model === undefined ? undefined : coverageOf(model)), [model])
  const coverageText = coverage === undefined
    ? ''
    : coverage.unsupportedTotal > 0
      ? t('coverage', { entities: coverage.entities.toLocaleString(), approximate: coverage.approximate, unsupported: coverage.unsupportedTotal })
      : t('coverageClean', { entities: coverage.entities.toLocaleString() })
  const coverageTitle = coverage === undefined || coverage.unsupportedTotal === 0
    ? undefined
    : t('coverageUndrawn', { list: coverage.unsupported.map(([kind, count]) => `${kind} ×${count}`).join(', ') })
  const fit = useMemo(() => {
    if (scene === undefined) return { scale: 1, translateX: 0, translateY: 0 }
    return fitBox(scene.bounds, Math.max(size.width, 1), Math.max(size.height, 1), FIT_MARGIN)
  }, [scene, size.width, size.height])

  // The search reads the text the sheet already carries; it never edits.
  const matches = useMemo(() => {
    if (scene === undefined) return []
    const needle = query.trim().toLowerCase()
    if (needle === '') return []
    const found: EcadScenePrimitive[] = []
    for (const primitive of scene.primitives) {
      if (primitive.text.length === 0) continue
      if (primitive.text.some(line => line.text.toLowerCase().includes(needle))) found.push(primitive)
    }
    return found
  }, [scene, query])
  const matchText = query.trim() === ''
    ? undefined
    : matches.length === 0
      ? t('searchNoMatches')
      : matches.length === 1
        ? t('searchMatchOne')
        : matches.length > HIGHLIGHT_LIMIT
          ? t('searchManyMatches', { count: matches.length.toLocaleString() })
          : t('searchMatches', { count: matches.length })

  const zoomBy = useCallback((factor: number) => {
    setView(current => zoomAt(current, factor, size.width / 2, size.height / 2))
  }, [size.width, size.height])
  const fitView = useCallback(() => {
    setView({ zoom: 1, panX: 0, panY: 0 })
  }, [])

  // Wheel zoom must be a non-passive native listener: React's synthetic wheel
  // handler cannot prevent the converse scroll when the pane is in a preview tab.
  useEffect(() => {
    const element = canvasElement
    if (element === null) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15
      setView(current => zoomAt(current, factor, event.clientX - rect.left, event.clientY - rect.top))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', onWheel)
    }
  }, [canvasElement])

  const localPoint = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const rect = canvasElement?.getBoundingClientRect()
    if (rect === undefined) return { x: clientX, y: clientY }
    return { x: clientX - rect.left, y: clientY - rect.top }
  }, [canvasElement])

  const onPointerDown = useCallback((event: { button: number; clientX: number; clientY: number; pointerId: number; preventDefault: () => void; currentTarget: EventTarget | null }) => {
    if (event.button !== 0 && event.button !== 1) return
    event.preventDefault()
    const current = event.currentTarget as HTMLElement | null
    current?.focus()
    setView(current2 => {
      gestureRef.current = { startX: event.clientX, startY: event.clientY, panX: current2.panX, panY: current2.panY, pointerId: event.pointerId }
      return current2
    })
    setPanning(true)
    current?.setPointerCapture?.(event.pointerId)
  }, [])

  const onPointerMove = useCallback((event: { clientX: number; clientY: number; pointerId: number }) => {
    const gesture = gestureRef.current
    if (gesture === undefined || gesture.pointerId !== event.pointerId) return
    setView(current => ({
      zoom: current.zoom,
      panX: gesture.panX + (event.clientX - gesture.startX),
      panY: gesture.panY + (event.clientY - gesture.startY),
    }))
  }, [])

  const endGesture = useCallback((event: { pointerId: number }) => {
    const gesture = gestureRef.current
    if (gesture === undefined || gesture.pointerId !== event.pointerId) return
    gestureRef.current = undefined
    setPanning(false)
  }, [])

  const onKeyDown = useCallback((event: { key: string; ctrlKey: boolean; metaKey: boolean; preventDefault: () => void }) => {
    if (event.ctrlKey || event.metaKey) return
    switch (event.key) {
      case '+':
      case '=':
        event.preventDefault()
        zoomBy(1.3)
        return
      case '-':
        event.preventDefault()
        zoomBy(1 / 1.3)
        return
      case '0':
        event.preventDefault()
        fitView()
        return
      case 'ArrowLeft':
        event.preventDefault()
        setView(current => ({ ...current, panX: current.panX + PAN_STEP }))
        return
      case 'ArrowRight':
        event.preventDefault()
        setView(current => ({ ...current, panX: current.panX - PAN_STEP }))
        return
      case 'ArrowUp':
        event.preventDefault()
        setView(current => ({ ...current, panY: current.panY + PAN_STEP }))
        return
      case 'ArrowDown':
        event.preventDefault()
        setView(current => ({ ...current, panY: current.panY - PAN_STEP }))
        return
      default:
        return
    }
  }, [fitView, zoomBy])

  const toggleLayer = useCallback((name: string) => {
    const key = name.toUpperCase()
    setHidden(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])
  const showAllLayers = useCallback(() => {
    setHidden(new Set())
  }, [])
  const hideAllLayers = useCallback(() => {
    setHidden(new Set((model?.layers ?? []).map(layer => layer.name.toUpperCase())))
  }, [model])

  const askReview = useCallback(() => {
    const path = pathOf(resourceAddress)
    const ok = ask(resourceAddress, t('askReview', { format: formatLabel, path }))
    if (!ok) setChatUnavailable(true)
  }, [ask, formatLabel, resourceAddress, t])

  const fileStem = useMemo(() => {
    const path = pathOf(resourceAddress)
    const name = path.split('/').pop() ?? 'drawing'
    return name.replace(/\.[^.]+$/u, '') || 'drawing'
  }, [resourceAddress])
  const sheetLabel = useMemo(() => {
    if (scene === undefined) return ''
    const width = scene.bounds.max[0] - scene.bounds.min[0]
    const height = scene.bounds.max[1] - scene.bounds.min[1]
    const unit = model === undefined ? undefined : unitLabel(model.units)
    return t('statusSheet', { width: fmt(width), height: fmt(height), unit: unit ?? '' })
  }, [model, scene, t])
  const printSheet = useCallback(() => {
    window.print()
  }, [])
  const downloadText = useCallback((name: string, text: string, mime: string) => {
    try {
      const blob = new Blob([text], { type: mime })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = name
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
    } catch (error) {
      void error
      setNotice({ kind: 'error', text: t('exportFailed') })
    }
  }, [t])
  const exportSvg = useCallback(() => {
    if (scene === undefined || model === undefined) return
    try {
      const svg = svgDocumentOf(scene, fit, view, {
        title: t('exportSvgTitle', { path: pathOf(resourceAddress), layout: activeLayout?.name ?? '' }),
        width: Math.max(1, Math.round(size.width)),
        height: Math.max(1, Math.round(size.height)),
      })
      downloadText(`${t('exportName', { name: fileStem, layout: activeLayout?.id ?? 'Model' })}.svg`, svg, 'image/svg+xml')
    } catch (error) {
      void error
      setNotice({ kind: 'error', text: t('exportFailed') })
    }
  }, [activeLayout, downloadText, fileStem, fit, model, resourceAddress, scene, size.height, size.width, t, view])
  const exportPng = useCallback(() => {
    if (scene === undefined || size.width <= 0 || size.height <= 0) {
      setNotice({ kind: 'error', text: t('exportFailed') })
      return
    }
    try {
      const svg = svgDocumentOf(scene, fit, view, {
        title: t('exportSvgTitle', { path: pathOf(resourceAddress), layout: activeLayout?.name ?? '' }),
        width: Math.max(1, Math.round(size.width)),
        height: Math.max(1, Math.round(size.height)),
      })
      const image = new Image()
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(size.width))
          canvas.height = Math.max(1, Math.round(size.height))
          const context = canvas.getContext('2d')
          if (context === null) throw new Error('no 2d context')
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, canvas.width, canvas.height)
          context.drawImage(image, 0, 0)
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url)
            if (blob === null) {
              setNotice({ kind: 'error', text: t('exportFailed') })
              return
            }
            const link = document.createElement('a')
            link.href = URL.createObjectURL(blob)
            link.download = `${t('exportName', { name: fileStem, layout: activeLayout?.id ?? 'Model' })}.png`
            document.body.appendChild(link)
            link.click()
            link.remove()
          }, 'image/png')
        } catch (error) {
          void error
          URL.revokeObjectURL(url)
          setNotice({ kind: 'error', text: t('exportFailed') })
        }
      }
      image.onerror = () => {
        URL.revokeObjectURL(url)
        setNotice({ kind: 'error', text: t('exportFailed') })
      }
      image.src = url
    } catch (error) {
      void error
      setNotice({ kind: 'error', text: t('exportFailed') })
    }
  }, [activeLayout, fileStem, fit, resourceAddress, scene, size.height, size.width, t, view])

  const layouts = model?.layouts ?? []
  const layoutTabs = layouts.length > 1
    ? createElement(
      'div',
      { className: `${css.layoutTabs} ${css.noPrint}`, role: 'tablist', 'aria-label': t('layout') },
      layouts.map(layout => createElement(
        'button',
        {
          key: layout.id,
          type: 'button',
          role: 'tab',
          'aria-selected': layout.id === activeLayoutId,
          title: t('layoutTab', { name: layout.name }),
          className: `${css.layoutTab}${layout.id === activeLayoutId ? ` ${css.layoutTabActive}` : ''}`,
          onClick: () => {
            setLayoutId(layout.id)
            setView({ zoom: 1, panX: 0, panY: 0 })
          },
        },
        layout.kind === 'model' ? t('modelSpace') : layout.name,
        createElement('span', { className: css.tabCount }, String(layout.entities.length)),
      )),
    )
    : null

  const sheetUnit = model === undefined ? undefined : unitLabel(model.units)
  const printMeta = t('printFooter', {
    format: formatLabel,
    width: scene === undefined ? '' : fmt(scene.bounds.max[0] - scene.bounds.min[0]),
    height: scene === undefined ? '' : fmt(scene.bounds.max[1] - scene.bounds.min[1]),
    unit: sheetUnit ?? '',
    selection: sheetLabel,
  })

  let stage: ReactElement
  if (state.phase === 'loading') {
    stage = createElement(LoadingState, { label: t('loading') })
  } else if (state.phase === 'error') {
    stage = createElement(FailureState, {
      error: state.error,
      onRetry: retry,
      onAsk: askReview,
      chatUnavailable,
      t,
    })
  } else if (scene === undefined || coverage === undefined || summary === undefined) {
    stage = createElement(LoadingState, { label: t('loadingModel') })
  } else if (scene.primitives.length === 0) {
    stage = createElement(
      'div',
      { className: css.state, role: 'status' },
      createElement('h3', { className: css.stateTitle }, t('empty')),
      createElement('p', { className: css.stateBody }, t('emptyHint', { entities: coverage.entities.toLocaleString() })),
      createElement('div', { className: css.stateActions }, createElement('button', { type: 'button', className: css.button, onClick: retry }, t('retry'))),
    )
  } else {
    const panelToggle = panelsOpen ? '' : ` ${css.sidePanelHidden}`
    const canvasLabel = t('canvasLabel', { path: pathOf(resourceAddress) })
    stage = createElement(
      'div',
      { className: css.stage },
      createElement(
        'div',
        { className: css.canvasColumn },
        createElement(
          'div',
          {
            ref: setCanvasElement,
            className: `${css.canvasWrap}${panning ? ` ${css.panning}` : ''}`,
            tabIndex: 0,
            role: 'group',
            'aria-label': canvasLabel,
            title: t('panHint'),
            style: { cursor: panning ? 'grabbing' : 'grab' },
            onKeyDown,
            onPointerDown,
            onPointerMove,
            onPointerUp: endGesture,
            onPointerCancel: endGesture,
          },
          createElement(SceneView, {
            scene,
            fit,
            view,
            label: canvasLabel,
            highlight: matches.length > HIGHLIGHT_LIMIT ? matches.slice(0, HIGHLIGHT_LIMIT) : matches,
          }),
          coverage.truncated
            ? createElement(
              'div',
              { className: css.notice, role: 'status' },
              createElement(WarningIcon, {}),
              createElement('span', { className: css.noticeText }, t('truncated')),
            )
            : null,
          notice === undefined ? null : createElement(NoticeView, { t, notice, onDismiss: () => { setNotice(undefined) } }),
        ),
        createElement(
          'div',
          { className: css.statusBar, role: 'status', 'aria-label': t('statusBarLabel') },
          createElement('span', { className: css.statusItem }, sheetLabel),
          createElement('span', { className: css.statusItem }, `${t('zoomIn')}: ${Math.round(view.zoom * 100)}%`),
          ...(matches.length === 0 || query.trim() === ''
            ? []
            : [createElement('span', { className: css.statusItem }, matchText ?? '')]),
        ),
      ),
      createElement(
        'div',
        { className: `${css.sidePanel}${panelToggle} ${css.noPrint}` },
        createElement(
          'div',
          { className: css.panelHeading },
          createElement('span', { className: css.panelHeadingSpacer }),
          createElement('button', {
            type: 'button',
            className: `${css.button} ${css.iconButton} ${css.panelClose}`,
            title: t('panels'),
            'aria-label': t('panels'),
            onClick: () => {
              panelsTouchedRef.current = true
              setPanelsOpen(false)
            },
          }, createElement(CloseIcon, {})),
        ),
        createElement(LayerPanel, {
          t,
          model,
          counts,
          hidden,
          onToggle: toggleLayer,
          onShowAll: showAllLayers,
          onHideAll: hideAllLayers,
        }),
        createElement(SheetSection, {
          titleBlock: summary.titleBlock,
          coverage,
          coverageText,
          coverageTitle,
          format: format ?? 'dxf',
          conversion: conversion ?? { warnings: 0, warningTexts: [] },
          dxfVersion: summary.dxfVersion,
          units: summary.units,
          version: summary.version,
          t,
        }),
      ),
    )
  }

  return createElement(
    'div',
    {
      className: `${css.root}${focused ? ` ${css.focused}` : ''}`,
      'data-ecad-pane': 'drawing',
      'data-ecad-state': state.phase,
      ...(format === undefined ? {} : { 'data-ecad-format': format }),
    },
    createElement('div', { className: `${css.printOnly} ${css.printHeader}` },
      createElement('div', { className: css.printTitle }, t('printHeader', { path: pathOf(resourceAddress), layout: activeLayout?.name ?? '' })),
      createElement('div', { className: css.printMeta }, printMeta),
    ),
    createElement(CadToolbar, {
      coverage: coverage ?? { entities: 0, approximate: 0, unsupportedTotal: 0, unsupported: [], truncated: false },
      coverageText,
      coverageTitle,
      ready: state.phase === 'ready' && coverage !== undefined,
      format,
      conversion,
      panelsOpen,
      chatUnavailable,
      query,
      onQuery: setQuery,
      matchText,
      onPrint: printSheet,
      onExportSvg: exportSvg,
      onExportPng: exportPng,
      onFit: fitView,
      onZoom: zoomBy,
      onTogglePanels: () => {
        panelsTouchedRef.current = true
        setPanelsOpen(value => !value)
      },
      onAsk: askReview,
      focused,
      onToggleFocus: () => { setFocused(value => !value) },
      t,
    }),
    layoutTabs,
    stage,
  )
}

/**
 * The conversion label the sheet prints, e.g. `acadrust 0.6.8`.
 * @param conversion - normalised provenance.
 * @returns the label, or `undefined` when nothing converted the source.
 */
function conversionLabel(conversion: EcadConversionSummary): string | undefined {
  if (conversion.converter === undefined) return conversion.warnings > 0 ? 'converted' : undefined
  return conversion.version === undefined ? conversion.converter : `${conversion.converter} ${conversion.version}`
}

/**
 * The title the format badge carries.
 * @param format - the source format.
 * @param conversion - normalised provenance.
 * @param t - the translated reader.
 * @returns the joined title.
 */
function formatTitleOf(format: string, conversion: EcadConversionSummary | undefined, t: Translate): string {
  const parts = [format.toUpperCase()]
  const converted = conversion === undefined ? undefined : conversionLabel(conversion)
  if (converted !== undefined) parts.push(t('convertedVia', { converter: converted }))
  if (conversion !== undefined && conversion.warnings > 0) parts.push(t('conversionWarnings', { count: conversion.warnings }))
  if (format === 'dwg') parts.push(t('dwgSupport'))
  return parts.join(' · ')
}

/**
 * The path a resource address carries.
 * @param address - the resource address.
 * @returns the path, or the address when it is not a file address.
 */
function pathOf(address: string): string {
  return parseFileAddress(address)?.path ?? address
}
