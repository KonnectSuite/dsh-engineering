/**
 * The right-panel drawing body: the sheet on a theme-aware canvas, the drawing's
 * layers, the selected primitive, and the one action that leaves the pane.
 *
 * The document preview shell above this body owns the file path, reload and
 * renderer choice; this component owns only the sheet. It registers no second
 * chrome, keeps the drawing as the hero, and reports every state — loading,
 * unavailable, failed, empty and truncated — inside the same stage so the pane
 * is never blank.
 *
 * The model arrives as a cached `EcadSheetModel`; `open` and `ask` are injected
 * by `./index.tsx`, which is the only module that touches the Remote service and
 * the conversation.
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
import type { EcadEntity, EcadSheetModel, EcadTitleBlock, EcadTitleBlockField } from '../engine/types.ts'
import { conversionOf, sourceFormatOf, type EcadApply, type EcadApplyEnvelope, type EcadCapabilities, type EcadConversionSummary, type EcadFailure, type EcadOpen, type EcadOpenEnvelope } from './artifacts.ts'
import {
  coverageOf,
  factsOf,
  fitBox,
  formatPoint,
  layerCounts,
  layerInk,
  layersOf,
  layerNameOf,
  sceneOf,
  textLines,
  unitLabel,
  type EcadCoverage,
  type EcadFit,
  type EcadScene,
  type EcadSceneGeometry,
  type EcadScenePrimitive,
} from './scene.ts'
import {
  defaultLayer,
  defaultTextHeight,
  draftCounts,
  draftOps,
  draftPreview,
  editableEntityId,
  parseNumberField,
  stageErase,
  stageMove,
  stageText,
  worldAt,
  worldDelta,
  type EcadDraftCounts,
  type EcadStagedOp,
} from './edits.ts'
import {
  ApplyOutcomePanel,
  DraftPanel,
  EditBar,
  EditModeToggle,
  WrittenBanner,
  type EcadApplyOutcome,
  type EcadMode,
  type EcadPlacementDraft,
} from './EcadDraft.tsx'
import { parseFileAddress } from './vendor/workspace-path.ts'
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
  /** Apply one staged draft; the host writes a new drawing and never the source. */
  readonly apply: EcadApply
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

/** What one panel can be showing. */
type PanelSection = 'layers' | 'entity'

/** Which panes the reader has open. */
interface PanelState {
  readonly open: boolean
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 60
const FIT_MARGIN = 24
const PAN_STEP = 40
const DRAG_THRESHOLD = 3

/** One glyph's geometry, drawn in the theme's label colour. */
interface IconProps {
  readonly size?: number
}

/**
 * The eye shows a layer that draws; the struck copy shows one hidden in the pane.
 * @param props - icon size.
 */
function EyeIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4S1.5 8 1.5 8Z' }),
    createElement('circle', { cx: 8, cy: 8, r: 1.9 }))
}

/**
 * The struck eye marks a layer hidden in this pane.
 * @param props - icon size.
 */
function EyeOffIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M2 2l12 12' }),
    createElement('path', { d: 'M6.3 4.4A7.4 7.4 0 0 1 8 4.2c4.1 0 6.5 3.8 6.5 3.8a12 12 0 0 1-2.4 2.9M4 6.2A12.3 12.3 0 0 0 1.5 8S3.9 11.8 8 11.8c.9 0 1.7-.2 2.4-.4' }))
}

/**
 * Plus, for zooming in.
 * @param props - icon size.
 */
function PlusIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M8 3.5v9M3.5 8h9' }))
}

/**
 * Minus, for zooming out.
 * @param props - icon size.
 */
function MinusIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M3.5 8h9' }))
}

/**
 * Fit, drawn as a frame with its corners pulled in.
 * @param props - icon size.
 */
function FitIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10' }),
    createElement('rect', { x: 5.5, y: 5.5, width: 5, height: 5, rx: 0.5 }))
}

/**
 * The layers control opens and closes the side panel.
 * @param props - icon size.
 */
function LayersIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M8 2.2 14 5.3 8 8.4 2 5.3 8 2.2Z' }),
    createElement('path', { d: 'M2 8.4l6 3.1 6-3.1M2 11.2l6 3.1 6-3.1' }))
}

/**
 * The lock reads as the row-level write posture, never as a warning.
 * @param props - icon size.
 */
function LockIcon({ size = 12 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('rect', { x: 3.5, y: 7.5, width: 9, height: 6.5, rx: 1 }),
    createElement('path', { d: 'M5.5 7.5V5.6a2.5 2.5 0 0 1 5 0v1.9' }))
}

/**
 * The warning triangle marks truncated coverage.
 * @param props - icon size.
 */
function WarningIcon({ size = 13 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M8 2.4 14.4 13H1.6L8 2.4Z' }),
    createElement('path', { d: 'M8 6.4v3.1M8 11.5v.1' }))
}

/**
 * The chat glyph marks the action that leaves the pane for the conversation.
 * @param props - icon size.
 */
function ChatIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M13.5 8.6a5.7 5.7 0 0 1-6 5.5 6.6 6.6 0 0 1-1.9-.3L2.5 14.5l.7-2.7a5.3 5.3 0 0 1-1-3.2 5.7 5.7 0 0 1 6-5.5 5.7 5.7 0 0 1 5.3 5.5Z' }))
}

/**
 * The close glyph dismisses the narrow-pane panel overlay.
 * @param props - icon size.
 */
function CloseIcon({ size = 13 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M4 4l8 8M12 4l-8 8' }))
}

/** The status a body is showing. */
type BodyState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly summary: EcadOpenEnvelope; readonly model: EcadSheetModel; readonly capabilities?: EcadCapabilities }
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

/** Clamp a zoom factor into the pane's usable range. */
function clampZoom(zoom: number): number {
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
export function zoomAt(view: ViewState, factor: number, cx: number, cy: number): ViewState {
  const zoom = clampZoom(view.zoom * factor)
  if (zoom === view.zoom) return view
  const ratio = zoom / view.zoom
  return { zoom, panX: cx - ratio * (cx - view.panX), panY: cy - ratio * (cy - view.panY) }
}

/**
 * The paint for one piece of geometry.
 * @param primitive - the primitive.
 * @param selected - whether the selection accent wins.
 * @param forFill - whether a filled polygon is being drawn.
 * @returns the style.
 */
function paintOf(primitive: EcadScenePrimitive, selected: boolean, forFill: boolean): CSSProperties {
  const dash = primitive.approx ? '4 2' : undefined
  if (forFill) {
    return {
      fill: primitive.ink,
      fillOpacity: primitive.geometry.t === 'path' && primitive.geometry.hatch ? 0.22 : 0.9,
      stroke: selected ? 'var(--ecad-accent)' : 'none',
      strokeWidth: selected ? 1.5 : 0,
    }
  }
  return {
    fill: 'none',
    stroke: selected ? 'var(--ecad-accent)' : primitive.ink,
    strokeWidth: selected ? 2.5 : 1,
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
 * Draw one geometry with one paint, without selection knowledge.
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
      // A point marker is painted, not stroked; the paint's stroke slot carries
      // whichever ink the caller is drawing with (entity ink, selection accent).
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

/** The screen point a pointer event carries, for placement and dragging. */
interface ScreenPointEvent {
  readonly clientX: number
  readonly clientY: number
  readonly pointerId: number
  readonly button: number
  readonly stopPropagation: () => void
  readonly preventDefault?: () => void
}

/** Props of {@link ScenePrimitiveView}. */
interface ScenePrimitiveViewProps {
  readonly primitive: EcadScenePrimitive
  readonly selected: boolean
  readonly hovered: boolean
  readonly faded: boolean
  readonly onSelect: (id: string, event: { readonly stopPropagation: () => void; readonly clientX: number; readonly clientY: number }) => void
  readonly onHover: (id: string | undefined) => void
  readonly onEditPointerDown: ((id: string, event: ScreenPointEvent) => void) | undefined
}

/**
 * Render one primitive's text runs, shared by the sheet and its ghosts.
 * @param primitive - the primitive whose runs to draw.
 * @param fill - CSS paint for the glyphs.
 * @param underline - whether the run is the selected one.
 * @returns the text elements.
 */
function textRuns(primitive: EcadScenePrimitive, fill: string, underline: boolean): ReactElement[] {
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
      ...(underline ? { textDecoration: 'underline' } : {}),
      'aria-hidden': true,
    },
    line.text,
  ))
}

/**
 * One primitive: its geometry in the reading paint, then the selection halo and
 * accent on top so the highlight is legible over any layer colour. A staged
 * erase fades it; an edit-mode drag starts on it.
 * @param props - the primitive and its interaction state.
 */
function ScenePrimitiveView({ primitive, selected, hovered, faded, onSelect, onHover, onEditPointerDown }: ScenePrimitiveViewProps): ReactElement {
  const filled = primitive.geometry.t === 'path' && (primitive.geometry.fill || primitive.geometry.hatch)
  const interaction = {
    onClick: (event: { stopPropagation: () => void; clientX: number; clientY: number }) => {
      event.stopPropagation()
      onSelect(primitive.id, event)
    },
    onPointerEnter: () => {
      onHover(primitive.id)
    },
    onPointerLeave: () => {
      onHover(undefined)
    },
    ...(onEditPointerDown === undefined
      ? {}
      : {
        onPointerDown: (event: ScreenPointEvent) => {
          onEditPointerDown(primitive.id, event)
        },
      }),
  }
  return createElement(
    'g',
    {
      ...interaction,
      className: [css.primitive, hovered ? css.hovered : '', faded ? css.faded : ''].filter(Boolean).join(' ') || undefined,
      'data-ecad-id': primitive.id,
      'data-ecad-kind': primitive.kind,
      'data-ecad-layer': primitive.layer,
      ...(primitive.approx ? { 'data-ecad-approx': 'true' } : {}),
      ...(selected ? { 'data-ecad-selected': 'true' } : {}),
      ...(faded ? { 'data-ecad-faded': 'true' } : {}),
    },
    primitive.geometry.t === 'none' ? null : createElement(SceneShape, { geometry: primitive.geometry, paint: paintOf(primitive, selected, filled) }),
    // A filled primitive already carries the accent on its outline; an unfilled
    // one gets a paper halo under an accent stroke so the highlight reads over
    // any layer colour the drawing uses.
    selected && primitive.geometry.t !== 'none' && !filled
      ? createElement(SceneShape, { geometry: primitive.geometry, paint: { fill: 'none', stroke: 'var(--ecad-paper)', strokeWidth: 5 }, className: css.selectionHalo })
      : null,
    selected && primitive.geometry.t !== 'none' && !filled
      ? createElement(SceneShape, { geometry: primitive.geometry, paint: { fill: 'none', stroke: 'var(--ecad-accent)', strokeWidth: 2.5 }, className: css.selection })
      : null,
    textRuns(primitive, selected ? 'var(--ecad-accent)' : primitive.ink, selected),
  )
}

/** Memoized primitive: a pan or a selection does not repaint the whole sheet. */
const MemoPrimitive = memo(ScenePrimitiveView)

/** Props of {@link SceneView}. */
interface SceneViewProps {
  readonly scene: EcadScene
  readonly fit: EcadFit
  readonly view: ViewState
  readonly selectedId: string | undefined
  readonly hoveredId: string | undefined
  readonly onSelect: (id: string, event: { readonly stopPropagation: () => void; readonly clientX: number; readonly clientY: number }) => void
  readonly onHover: (id: string | undefined) => void
  readonly onEditPointerDown: ((id: string, event: ScreenPointEvent) => void) | undefined
  readonly label: string
  /** Entities a staged erase removes; faded on the sheet until the draft applies. */
  readonly fadedIds?: ReadonlySet<string>
  /** Staged moves, drawn as accent ghosts over the source geometry. */
  readonly ghostMoves?: readonly { readonly key: string; readonly id: string; readonly delta: readonly [number, number] }[]
  /** Text annotations a draft adds, or the annotation a click is placing. */
  readonly ghostTexts?: readonly { readonly key: string; readonly point: readonly [number, number]; readonly text: string; readonly height: number; readonly rotation: number }[]
  /** The point a placement click chose, marked with a crosshair. */
  readonly pendingPoint?: readonly [number, number] | undefined
}

/**
 * The sheet as SVG: one outer group for the user's pan and zoom, one inner group
 * for the fit with the Y axis flipped, so CAD orientation reads correctly and a
 * zoom never rebuilds a primitive.
 *
 * Staged changes are drawn here as accent ghosts: the source model is not
 * mutated, and the ghosts are what "staged" looks like before the host writes.
 * @param props - the scene, its view state and the draft overlay.
 */
function SceneView({ scene, fit, view, selectedId, hoveredId, onSelect, onHover, onEditPointerDown, label, fadedIds, ghostMoves, ghostTexts, pendingPoint }: SceneViewProps): ReactElement {
  const byId = useMemo(() => {
    const map = new Map<string, EcadScenePrimitive>()
    for (const primitive of scene.primitives) map.set(primitive.id, primitive)
    return map
  }, [scene])
  const span = Math.max(scene.bounds.max[0] - scene.bounds.min[0], scene.bounds.max[1] - scene.bounds.min[1])
  const marker = Math.max(span * 0.012, 1e-6)
  const ghosts = (ghostMoves ?? []).flatMap((move) => {
    const primitive = byId.get(move.id)
    if (primitive === undefined) return []
    return [{ move, primitive }]
  })
  return createElement(
    'svg',
    { className: css.canvas, role: 'img', 'aria-label': label, 'data-ecad-canvas': 'true' },
    createElement(
      'g',
      { transform: `translate(${view.panX} ${view.panY}) scale(${view.zoom})` },
      createElement(
        'g',
        { transform: `translate(${fit.translateX} ${fit.translateY}) scale(${fit.scale} ${-fit.scale})` },
        scene.primitives.map(primitive => createElement(MemoPrimitive, {
          key: primitive.id,
          primitive,
          selected: primitive.id === selectedId,
          hovered: primitive.id === hoveredId,
          faded: fadedIds?.has(primitive.id) === true,
          onSelect,
          onHover,
          onEditPointerDown,
        })),
        ...ghosts.map(({ move, primitive }) => createElement(
          'g',
          {
            key: `ghost-${move.key}-${move.id}`,
            transform: `translate(${move.delta[0]} ${move.delta[1]})`,
            className: css.ghostGroup,
            'data-ecad-ghost': move.id,
            'aria-hidden': true,
            style: { pointerEvents: 'none' },
          },
          primitive.geometry.t === 'none' ? null : createElement(SceneShape, {
            geometry: primitive.geometry,
            paint: { fill: 'none', stroke: 'var(--ecad-accent)', strokeWidth: 1.5, strokeDasharray: '5 3' },
          }),
          textRuns(primitive, 'var(--ecad-accent)', false),
        )),
        (ghostTexts ?? []).flatMap((ghost) => {
          const runs = textLines({ id: `ghost-${ghost.key}`, k: 'text', layer: '', color: 7, p: ghost.point, t: ghost.text, h: ghost.height, rot: ghost.rotation })
          return runs.map((line, index) => createElement(
            'text',
            {
              key: `ghost-text-${ghost.key}-${index}`,
              x: 0,
              y: 0,
              transform: `translate(${line.x} ${line.y}) scale(1 -1) rotate(${Number((-line.degrees).toFixed(4))})`,
              fontSize: line.height,
              textAnchor: line.anchor,
              dominantBaseline: line.baseline,
              className: css.ghostText,
              fontFamily: 'inherit',
              'aria-hidden': true,
            },
            line.text,
          ))
        }),
        pendingPoint === undefined
          ? null
          : createElement(
            'g',
            { key: 'placement-marker', 'aria-hidden': true, style: { pointerEvents: 'none' }, 'data-ecad-placement': `${pendingPoint[0]},${pendingPoint[1]}` },
            createElement('line', { className: css.placementMarker, x1: pendingPoint[0] - marker, y1: pendingPoint[1], x2: pendingPoint[0] + marker, y2: pendingPoint[1] }),
            createElement('line', { className: css.placementMarker, x1: pendingPoint[0], y1: pendingPoint[1] - marker, x2: pendingPoint[0], y2: pendingPoint[1] + marker }),
            createElement('circle', { className: css.placementMarker, cx: pendingPoint[0], cy: pendingPoint[1], r: marker * 0.45 }),
          ),
      ),
    ),
  )
}

/** Props of {@link LayerPanel}. */
interface LayerPanelProps {
  readonly model: EcadSheetModel
  readonly layoutEntities: readonly EcadEntity[]
  readonly hidden: ReadonlySet<string>
  readonly onToggle: (name: string) => void
  readonly onShowAll: () => void
  readonly t: Translate
}

/**
 * The drawing's layers, with visibility switched in this pane only.
 * @param props - model, layout contents and the pane's visibility override.
 */
function LayerPanel({ model, layoutEntities, hidden, onToggle, onShowAll, t }: LayerPanelProps): ReactElement {
  const counts = useMemo(() => layerCounts(layoutEntities), [layoutEntities])
  const anyHidden = model.layers.some(layer => hidden.has(layer.name.toUpperCase()))
  return createElement(
    'section',
    { className: `${css.panelSection} ${css.layersSection}` },
    createElement(
      'div',
      { className: css.panelHeading },
      t('layers'),
      createElement('span', { className: css.panelHeadingSpacer }),
      anyHidden
        ? createElement('button', {
          type: 'button',
          className: `${css.button} ${css.panelHeadingButton}`,
          onClick: onShowAll,
        }, t('layersShowAll'))
        : null,
    ),
    createElement(
      'div',
      { className: css.layerList, role: 'group', 'aria-label': t('layers') },
      model.layers.map((layer) => {
        const key = layer.name.toUpperCase()
        const visible = !hidden.has(key)
        return createElement(
          'button',
          {
            key: layer.name,
            type: 'button',
            className: css.layerToggle,
            'aria-pressed': visible,
            title: `${visible ? t('layerHide', { layer: layer.name }) : t('layerShow', { layer: layer.name })}${layer.frozen === true ? ` · ${t('layerFrozen')}` : ''}${layer.locked === true ? ` · ${t('layerLocked')}` : ''}`,
            onClick: () => {
              onToggle(layer.name)
            },
          },
          createElement('span', { className: css.layerEye }, createElement(visible ? EyeIcon : EyeOffIcon, {})),
          createElement('span', { className: css.swatch, style: { background: layerInk(layer) } }),
          createElement('span', { className: css.layerName }, layer.name),
          createElement('span', { className: css.layerCount }, String(counts.get(key) ?? 0)),
        )
      }),
    ),
  )
}

/** Props of {@link Inspector}. */
interface InspectorProps {
  readonly entity: EcadEntity | undefined
  readonly model: EcadSheetModel
  readonly chatUnavailable: boolean
  readonly editing: boolean
  readonly moveDx: string
  readonly moveDy: string
  readonly onMoveDx: (value: string) => void
  readonly onMoveDy: (value: string) => void
  readonly onStageMove: () => void
  readonly onStageErase: () => void
  readonly onAsk: (entity: EcadEntity) => void
  readonly onClear: () => void
  readonly t: Translate
}

/**
 * The edit controls for the selected entity: the delta fields and the two
 * staged operations. A flattened block member cannot be edited in place.
 * @param props - the entity, the move fields and the stage actions.
 */
function EditActions({ entity, editing, moveDx, moveDy, onMoveDx, onMoveDy, onStageMove, onStageErase, t }: Pick<InspectorProps, 'entity' | 'editing' | 'moveDx' | 'moveDy' | 'onMoveDx' | 'onMoveDy' | 'onStageMove' | 'onStageErase' | 't'>): ReactElement | null {
  if (entity === undefined || !editing) return null
  if (!editableEntityId(entity.id)) return createElement('p', { className: css.editHint }, t('editFlattened'))
  const dx = parseNumberField(moveDx)
  const dy = parseNumberField(moveDy)
  const canMove = dx !== undefined && dy !== undefined && (dx !== 0 || dy !== 0)
  return createElement(
    'div',
    { className: css.editActionsBlock, 'data-ecad-edit-actions': 'true' },
    createElement('p', { className: css.editHint }, t('editEntityHint')),
    createElement(
      'div',
      { className: css.moveFields },
      createElement('label', { className: css.moveField },
        createElement('span', {}, t('moveDx')),
        createElement('input', {
          type: 'text',
          inputMode: 'decimal',
          value: moveDx,
          'aria-label': t('moveDx'),
          onChange: (event: { target: { value: string } }) => {
            onMoveDx(event.target.value)
          },
          'data-ecad-move-dx': 'true',
        }),
      ),
      createElement('label', { className: css.moveField },
        createElement('span', {}, t('moveDy')),
        createElement('input', {
          type: 'text',
          inputMode: 'decimal',
          value: moveDy,
          'aria-label': t('moveDy'),
          onChange: (event: { target: { value: string } }) => {
            onMoveDy(event.target.value)
          },
          'data-ecad-move-dy': 'true',
        }),
      ),
    ),
    createElement(
      'div',
      { className: css.inspectorActions },
      createElement('button', {
        type: 'button',
        className: css.applyButton,
        disabled: !canMove,
        onClick: onStageMove,
        'data-ecad-stage-move': 'true',
      }, t('moveAction')),
      createElement('button', {
        type: 'button',
        className: css.button,
        onClick: onStageErase,
        'data-ecad-stage-erase': 'true',
      }, t('eraseAction')),
    ),
  )
}

/**
 * The selected primitive's properties.
 * @param props - the selection and the actions on it.
 */
function Inspector({ entity, model, chatUnavailable, editing, moveDx, moveDy, onMoveDx, onMoveDy, onStageMove, onStageErase, onAsk, onClear, t }: InspectorProps): ReactElement {
  if (entity === undefined) {
    return createElement(
      'section',
      { className: `${css.panelSection} ${css.inspectorSection}` },
      createElement('div', { className: css.panelHeading }, t('inspector')),
      createElement('div', { className: css.inspector }, createElement('p', { className: css.inspectorHint }, editing ? t('editNoEntity') : t('noSelection'))),
    )
  }
  const facts = factsOf(entity)
  const rows: { readonly label: string; readonly value: string; readonly mono?: boolean }[] = [
    { label: t('kind'), value: facts.kind, mono: true },
    { label: t('layer'), value: layerNameOf(model, facts.layer) },
    ...(facts.text === undefined ? [] : [{ label: t('text'), value: facts.text }]),
    ...(facts.point === undefined ? [] : [{ label: t('position'), value: formatPoint(facts.point), mono: true }]),
    ...(facts.points === undefined ? [] : [{ label: t('points'), value: String(facts.points), mono: true }]),
    ...(facts.block === undefined ? [] : [{ label: t('block'), value: facts.block }]),
    { label: t('entityId'), value: facts.id, mono: true },
  ]
  return createElement(
    'section',
    { className: `${css.panelSection} ${css.inspectorSection}` },
    createElement('div', { className: css.panelHeading }, t('inspector')),
    createElement(
      'div',
      { className: css.inspector },
      rows.map(row => createElement(
        'div',
        { key: row.label, className: css.propertyRow },
        createElement('span', { className: css.propertyLabel }, row.label),
        createElement('span', { className: `${css.propertyValue}${row.mono === true ? ` ${css.mono}` : ''}` }, row.value),
      )),
      facts.approximate
        ? createElement('p', { className: css.approxNote }, facts.source === undefined ? t('approximateNoteGeneric') : t('approximateNote', { src: facts.source }))
        : null,
      createElement(
        'div',
        { className: css.inspectorActions },
        createElement('button', { type: 'button', className: css.button, onClick: () => { onAsk(entity) } }, createElement(ChatIcon, {}), t('askAboutEntity')),
        createElement('button', { type: 'button', className: css.button, onClick: onClear }, t('clearSelection')),
      ),
      chatUnavailable ? createElement('p', { className: css.inspectorHint }, t('askUnavailable')) : null,
      createElement(EditActions, { entity, editing, moveDx, moveDy, onMoveDx, onMoveDy, onStageMove, onStageErase, t }),
    ),
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
 * source format and—when the host converted it—the conversion the service named.
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
  rows.push({
    label: t('format'),
    value: format.toUpperCase(),
    ...(format === 'dwg' ? { title: t('dwgSupport') } : {}),
  })
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

/** Props of {@link DrawingToolbar}. */
interface DrawingToolbarProps {
  readonly coverage: EcadCoverage
  readonly coverageText: string
  readonly coverageTitle: string | undefined
  readonly ready: boolean
  readonly format: string | undefined
  readonly conversion: EcadConversionSummary | undefined
  readonly writes: boolean
  readonly editable: boolean
  readonly mode: EcadMode
  readonly onModeChange: (mode: EcadMode) => void
  readonly panelsOpen: boolean
  readonly chatUnavailable: boolean
  readonly onFit: () => void
  readonly onZoom: (factor: number) => void
  readonly onTogglePanels: () => void
  readonly onAsk: () => void
  readonly t: Translate
}

/**
 * The pane's one quiet toolbar: coverage, view controls, panels and Ask Arya.
 * @param props - coverage, read posture and control callbacks.
 */
function DrawingToolbar({ coverage, coverageText, coverageTitle, ready, format, conversion, writes, editable, mode, onModeChange, panelsOpen, chatUnavailable, onFit, onZoom, onTogglePanels, onAsk, t }: DrawingToolbarProps): ReactElement {
  return createElement(
    'div',
    { className: css.toolbar },
    createElement(
      'div',
      { className: css.toolbarGroup },
      ready && format !== undefined
        ? createElement('span', { className: css.badge, title: formatTitleOf(format, conversion, t) }, format.toUpperCase())
        : null,
      ready && !writes
        ? createElement('span', { className: css.badge, title: t('readOnlyHint') }, createElement(LockIcon, {}), t('readOnly'))
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
      { className: css.toolbarGroup },
      editable
        ? createElement(EditModeToggle, { mode, onChange: onModeChange, t })
        : null,
      createElement('button', { type: 'button', className: `${css.button} ${css.iconButton}`, title: t('fit'), 'aria-label': t('fit'), disabled: !ready, onClick: onFit }, createElement(FitIcon, {})),
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
 * The drawing body.
 * @param props - shell props plus the injected service and conversation bridges.
 */
export function EcadBody(props: EcadBodyProps): ReactNode {
  const { resourceAddress, content, t, open, apply, ask } = props
  const request = content?.kind === 'renderer' ? content as EcadRendererContent : undefined
  const revision = request?.revision ?? 0
  const [localRevision, setLocalRevision] = useState(0)
  const [state, setState] = useState<BodyState>({ phase: 'loading' })
  const [layoutId, setLayoutId] = useState<string | undefined>(undefined)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [hoveredId, setHoveredId] = useState<string | undefined>(undefined)
  const [panelsOpen, setPanelsOpen] = useState(true)
  const panelsTouchedRef = useRef(false)
  const [chatUnavailable, setChatUnavailable] = useState(false)
  const [view, setView] = useState<ViewState>({ zoom: 1, panX: 0, panY: 0 })
  const [panning, setPanning] = useState(false)
  // -- editing state -------------------------------------------------------
  // The mode is the reader's choice; the host's write switch is the permission.
  const [mode, setMode] = useState<EcadMode>('view')
  const [tool, setTool] = useState<'text' | undefined>(undefined)
  const [placement, setPlacement] = useState<EcadPlacementDraft | undefined>(undefined)
  const [staged, setStaged] = useState<readonly EcadStagedOp[]>([])
  const [dragGhost, setDragGhost] = useState<{ readonly id: string; readonly dx: number; readonly dy: number } | undefined>(undefined)
  const [moveDx, setMoveDx] = useState('0')
  const [moveDy, setMoveDy] = useState('0')
  const [applying, setApplying] = useState(false)
  const [outcome, setOutcome] = useState<EcadApplyOutcome | undefined>(undefined)
  // The written drawing replaces the displayed model, never the source view's
  // state: returning to the source is one action and needs no remote call.
  const [written, setWritten] = useState<{ readonly path: string; readonly model: EcadSheetModel; readonly version: string } | undefined>(undefined)
  /** The written sheet a successful apply produced, shown only when opened. */
  const [writtenCandidate, setWrittenCandidate] = useState<{ readonly path: string; readonly model: EcadSheetModel; readonly version: string } | undefined>(undefined)
  const draftKeyRef = useRef(0)
  const editDragRef = useRef<{ id: string; startX: number; startY: number; pointerId: number; moved: boolean; dx: number; dy: number } | undefined>(undefined)
  const applyAbortRef = useRef<AbortController | undefined>(undefined)
  // The sheet element is state, not a ref, because the first render is the
  // loading state: the wheel listener and the size observer must attach when the
  // canvas actually mounts.
  const [canvasElement, setCanvasElement] = useState<HTMLDivElement | null>(null)
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | undefined>(undefined)
  const suppressClickRef = useRef(false)
  const size = useElementSize(canvasElement)

  // A narrow preview opens the sheet first; the panel is one click away in the
  // toolbar. A reader who has already toggled keeps their choice. The threshold
  // reads the pane, not the canvas column, or the panel's own width would keep
  // the canvas under it after the first render.
  useEffect(() => {
    if (panelsTouchedRef.current) return
    const paneWidth = canvasElement?.parentElement?.clientWidth ?? 0
    if (paneWidth === 0) return
    if (paneWidth <= 520) setPanelsOpen(false)
  }, [canvasElement, size.width])

  const retry = useCallback(() => {
    if (request !== undefined) request.reload()
    else setLocalRevision(value => value + 1)
    setState({ phase: 'loading' })
  }, [request])

  // Load the drawing whenever the shell's revision changes. The renderer owns
  // its content: it reads the model, reports the displayed version, and cancels
  // its own request on unmount or replace.
  useEffect(() => {
    if (resourceAddress === '') return
    const controller = new AbortController()
    applyAbortRef.current?.abort()
    applyAbortRef.current = undefined
    setState({ phase: 'loading' })
    setSelectedId(undefined)
    setHoveredId(undefined)
    setView({ zoom: 1, panX: 0, panY: 0 })
    setHidden(new Set())
    setLayoutId(undefined)
    // A reload retires the draft: it was staged against the version being replaced.
    setMode('view')
    setTool(undefined)
    setPlacement(undefined)
    setStaged([])
    setApplying(false)
    setOutcome(undefined)
    setWritten(undefined)
    setWrittenCandidate(undefined)
    setDragGhost(undefined)
    setMoveDx('0')
    setMoveDy('0')
    void open(resourceAddress, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) {
        setState({ phase: 'ready', summary: result.summary, model: result.model, ...(result.capabilities === undefined ? {} : { capabilities: result.capabilities }) })
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
      applyAbortRef.current?.abort()
    }
  }, [resourceAddress, revision, localRevision, open, t])

  const model = state.phase === 'ready' ? state.model : undefined
  const summary = state.phase === 'ready' ? state.summary : undefined
  const capabilities = state.phase === 'ready' ? state.capabilities : undefined
  // What the pane draws: the source sheet, or the drawing the host just wrote.
  const displayModel = written?.model ?? model
  // The source format the service reports, and the conversion it names for a
  // DWG source. The face defaults to DXF only for an older service that sent no
  // format, and never claims more fidelity than the service reports.
  const format = summary === undefined ? undefined : sourceFormatOf(summary)
  const conversion = summary === undefined ? undefined : conversionOf(summary.converted)
  const formatLabel = format === undefined ? 'ECAD' : format.toUpperCase()
  // The host owns the write switch: the capability report wins over the open
  // envelope's snapshot, and an edit is offered only while both would allow it.
  const writesAuthoritative = state.phase === 'ready' ? (capabilities?.writes ?? state.summary.writes) : false
  const editable = state.phase === 'ready' && writesAuthoritative && written === undefined
  const editing = editable && mode === 'edit'
  const layers = useMemo(() => (displayModel === undefined ? new Map() : layersOf(displayModel)), [displayModel])
  const activeLayout = useMemo(() => {
    if (displayModel === undefined) return undefined
    return displayModel.layouts.find(layout => layout.id === layoutId)
      ?? displayModel.layouts.find(layout => layout.kind === 'model')
      ?? displayModel.layouts[0]
  }, [displayModel, layoutId])
  const activeLayoutId = activeLayout?.id
  const scene = useMemo(
    () => (activeLayout === undefined ? undefined : sceneOf(activeLayout, layers, hidden)),
    [activeLayout, layers, hidden],
  )
  const coverage = useMemo(() => (displayModel === undefined ? undefined : coverageOf(displayModel)), [displayModel])
  const coverageText = coverage === undefined
    ? ''
    : coverage.unsupportedTotal > 0
      ? t('coverage', { entities: coverage.entities.toLocaleString(), approximate: coverage.approximate, unsupported: coverage.unsupportedTotal })
      : t('coverageClean', { entities: coverage.entities.toLocaleString() })
  const coverageTitle = coverage === undefined || coverage.unsupportedTotal === 0
    ? undefined
    : t('coverageUndrawn', { list: coverage.unsupported.map(([kind, count]) => `${kind} ×${count}`).join(', ') })
  const selected = useMemo(
    () => (activeLayout === undefined || selectedId === undefined ? undefined : activeLayout.entities.find(entity => entity.id === selectedId)),
    [activeLayout, selectedId],
  )
  const fit = useMemo(() => {
    if (scene === undefined) return { scale: 1, translateX: 0, translateY: 0 }
    return fitBox(scene.bounds, Math.max(size.width, 1), Math.max(size.height, 1), FIT_MARGIN)
  }, [scene, size.width, size.height])

  // -- draft derived values -------------------------------------------------
  const counts = useMemo(() => draftCounts(staged), [staged])
  const preview = useMemo(() => draftPreview(staged), [staged])
  // The draft's layout as the panel prints it: one layout, or an explicit
  // "several" when the reader staged across layout tabs.
  const draftLayoutName = useMemo(() => {
    const ids = [...new Set(staged.map(item => item.layout))]
    if (ids.length === 0) return activeLayout?.name ?? ''
    if (ids.length > 1) return ''
    return displayModel?.layouts.find(layout => layout.id === ids[0])?.name ?? (ids[0] as string)
  }, [activeLayout, displayModel, staged])
  const placementLayers = useMemo(() => (displayModel?.layers ?? []).map(layer => layer.name), [displayModel])
  const defaultAnnotationHeight = activeLayout === undefined
    ? 1
    : defaultTextHeight(scene?.bounds ?? activeLayout.extents, activeLayout)
  const defaultAnnotationLayer = displayModel === undefined
    ? undefined
    : defaultLayer(displayModel, activeLayout) ?? placementLayers[0]
  const ghostMoves = useMemo(() => {
    const moves = [...preview.moves]
    if (dragGhost !== undefined) moves.push({ key: 'drag', id: dragGhost.id, delta: [dragGhost.dx, dragGhost.dy] as const })
    return moves
  }, [preview.moves, dragGhost])
  const ghostTexts = useMemo(() => {
    const texts: { key: string; point: readonly [number, number]; text: string; height: number; rotation: number }[] = preview.adds.map(add => ({
      key: add.key, point: add.point, text: add.text, height: add.height, rotation: add.rotation,
    }))
    if (placement !== undefined) {
      const height = parseNumberField(placement.height)
      texts.push({
        key: 'placement',
        point: placement.point,
        text: placement.text,
        height: height !== undefined && height > 0 ? height : defaultAnnotationHeight,
        rotation: 0,
      })
    }
    return texts
  }, [preview.adds, placement, defaultAnnotationHeight])
  const pendingPoint = placement?.point
  const canStageMove = parseNumberField(moveDx) !== undefined && parseNumberField(moveDy) !== undefined
  const applyDisabledReason = staged.length === 0
    ? t('applyDisabledEmpty')
    : !editable
      ? t('readOnlyHint')
      : undefined

  const applyView = useCallback((next: (current: ViewState) => ViewState) => {
    setView(next)
  }, [])
  const zoomBy = useCallback((factor: number) => {
    applyView(current => zoomAt(current, factor, size.width / 2, size.height / 2))
  }, [applyView, size.width, size.height])
  const fitView = useCallback(() => {
    applyView(() => ({ zoom: 1, panX: 0, panY: 0 }))
  }, [applyView])

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

  // One appended draft entry; the key counter keeps React keys stable while an
  // op's own ids repeat (two moves of one entity are two entries).
  const addStaged = useCallback((item: EcadStagedOp) => {
    setStaged(current => [...current, item])
  }, [])
  const nextDraftKey = useCallback((): string => {
    draftKeyRef.current += 1
    return `draft-${draftKeyRef.current}`
  }, [])

  // -- edit handlers -------------------------------------------------------
  const placeAnnotation = useCallback((screen: { readonly x: number; readonly y: number }) => {
    const element = canvasElement
    if (element === null || !editing || tool !== 'text') return
    const rect = element.getBoundingClientRect()
    const point = worldAt({ x: screen.x - rect.left, y: screen.y - rect.top }, fit, view)
    setPlacement(current => ({
      point,
      text: current?.text ?? '',
      height: current?.height ?? String(Number(defaultAnnotationHeight.toFixed(4))),
      layer: current?.layer ?? defaultAnnotationLayer ?? '',
    }))
  }, [canvasElement, defaultAnnotationHeight, defaultAnnotationLayer, editing, fit, tool, view])

  const handleSelect = useCallback((id: string, event: { readonly stopPropagation: () => void; readonly clientX: number; readonly clientY: number }) => {
    if (suppressClickRef.current) return
    if (editing && tool === 'text') {
      placeAnnotation({ x: event.clientX, y: event.clientY })
      return
    }
    setSelectedId(id)
  }, [editing, placeAnnotation, tool])

  const changeMode = useCallback((next: EcadMode) => {
    setMode(next)
    if (next === 'view') {
      setTool(undefined)
      setPlacement(undefined)
      setDragGhost(undefined)
    }
  }, [])

  const toggleTextTool = useCallback(() => {
    if (!editing) return
    setTool(current => (current === 'text' ? undefined : 'text'))
    setPlacement(undefined)
  }, [editing])

  const changePlacement = useCallback((field: 'text' | 'height' | 'layer', value: string) => {
    setPlacement(current => (current === undefined ? current : { ...current, [field]: value }))
  }, [])

  const cancelPlacement = useCallback(() => {
    setPlacement(undefined)
    setTool(undefined)
  }, [])

  const stagePlacement = useCallback(() => {
    if (!editing || placement === undefined || activeLayout === undefined) return
    const text = placement.text.trim()
    const height = parseNumberField(placement.height)
    if (text === '' || height === undefined || height <= 0) return
    addStaged(stageText(
      nextDraftKey(),
      activeLayout.id,
      placement.point,
      text,
      height,
      placement.layer === '' ? undefined : placement.layer,
    ))
    setPlacement(undefined)
  }, [activeLayout, addStaged, editing, nextDraftKey, placement])

  const stageMoveNow = useCallback(() => {
    if (!editing || activeLayout === undefined || selected === undefined || !editableEntityId(selected.id)) return
    const dx = parseNumberField(moveDx)
    const dy = parseNumberField(moveDy)
    if (dx === undefined || dy === undefined || (dx === 0 && dy === 0)) return
    addStaged(stageMove(nextDraftKey(), activeLayout.id, selected.id, dx, dy))
    setMoveDx('0')
    setMoveDy('0')
  }, [activeLayout, addStaged, editing, moveDx, moveDy, nextDraftKey, selected])

  const stageEraseNow = useCallback(() => {
    if (!editing || activeLayout === undefined || selected === undefined || !editableEntityId(selected.id)) return
    addStaged(stageErase(nextDraftKey(), activeLayout.id, selected.id))
  }, [activeLayout, addStaged, editing, nextDraftKey, selected])

  const removeStaged = useCallback((key: string) => {
    setStaged(current => current.filter(item => item.key !== key))
  }, [])

  const clearDraft = useCallback(() => {
    setStaged([])
    setPlacement(undefined)
    setTool(undefined)
  }, [])

  const dismissOutcome = useCallback(() => {
    setOutcome(undefined)
  }, [])

  const backToSource = useCallback(() => {
    setWritten(undefined)
    setSelectedId(undefined)
    setHoveredId(undefined)
    setLayoutId(undefined)
    setView({ zoom: 1, panX: 0, panY: 0 })
    setOutcome(current => (current?.kind === 'applied' ? { ...current, showingWritten: false } : current))
  }, [])

  /** Show the sheet the host just wrote; this is the reader's explicit choice. */
  const openWritten = useCallback(() => {
    if (writtenCandidate === undefined) return
    setWritten(writtenCandidate)
    setSelectedId(undefined)
    setHoveredId(undefined)
    setLayoutId(undefined)
    setView({ zoom: 1, panX: 0, panY: 0 })
    setOutcome(current => (current?.kind === 'applied' ? { ...current, showingWritten: true } : current))
  }, [writtenCandidate])

  const applyNow = useCallback(() => {
    if (!editable || applying || staged.length === 0 || summary === undefined) return
    const controller = new AbortController()
    applyAbortRef.current?.abort()
    applyAbortRef.current = controller
    setApplying(true)
    setOutcome(undefined)
    const ops = draftOps(staged)
    void apply(resourceAddress, summary.version, ops, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setApplying(false)
      if (!result.ok) {
        setOutcome({ kind: 'failed', error: result.error })
        return
      }
      setStaged([])
      setPlacement(undefined)
      setTool(undefined)
      // The write is done; the pane keeps showing the source until the reader
      // asks to open the written drawing.
      if (result.written !== undefined) {
        setWrittenCandidate({ path: result.result.outputPath, model: result.written.model, version: result.written.version })
        setOutcome({ kind: 'applied', result: result.result, hasWritten: true })
      } else {
        setOutcome({ kind: 'applied', result: result.result, ...(result.writtenError === undefined ? {} : { writtenNote: result.writtenError.message }) })
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setApplying(false)
      setOutcome({
        kind: 'failed',
        error: {
          code: 'ECAD_DISABLED',
          message: error instanceof Error ? error.message : String(error),
          fix: t('applyFailureFix'),
        },
      })
    })
  }, [apply, applying, editable, resourceAddress, staged, summary, t])

  // A composition that turns writes off (a reload with the switch closed) must
  // not keep an edit surface that cannot be applied.
  useEffect(() => {
    if (!editable && mode === 'edit') setMode('view')
  }, [editable, mode])

  // The placement form lives in the side panel; a placement opens that panel so
  // the form is visible at any pane width.
  useEffect(() => {
    if (placement === undefined || panelsOpen) return
    panelsTouchedRef.current = true
    setPanelsOpen(true)
  }, [placement, panelsOpen])

  // Escape cancels an armed tool or a pending placement even while focus is in
  // the form's fields: the sheet's own key handler cannot see that focus.
  useEffect(() => {
    if (!editing || (tool === undefined && placement === undefined)) return
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setPlacement(undefined)
      setTool(undefined)
    }
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('keydown', onEscape)
    }
  }, [editing, placement, tool])

  // The sheet is a large click target: a pointer down on one of its own overlays
  // (the written banner, a form control) belongs to that control, not to a pan.
  const interactiveTarget = (target: unknown): boolean => {
    const element = target as { closest?: (selector: string) => unknown } | null
    if (element === null || typeof element?.closest !== 'function') return false
    return element.closest('button, a, input, select, textarea, form, summary') !== null
  }

  const beginPan = useCallback((event: { button: number; clientX: number; clientY: number; pointerId: number; currentTarget: HTMLElement; target: unknown }) => {
    if (event.button !== 0) return
    if (interactiveTarget(event.target)) return
    // Clicking the sheet focuses the pane for its keyboard controls; nothing
    // takes focus away from the conversation on mount.
    event.currentTarget.focus({ preventScroll: true })
    dragRef.current = { x: event.clientX, y: event.clientY, panX: view.panX, panY: view.panY, moved: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setPanning(true)
  }, [view.panX, view.panY])

  const movePan = useCallback((event: { clientX: number; clientY: number }) => {
    const editDrag = editDragRef.current
    if (editDrag !== undefined) {
      const dxPx = event.clientX - editDrag.startX
      const dyPx = event.clientY - editDrag.startY
      if (!editDrag.moved && Math.abs(dxPx) < DRAG_THRESHOLD && Math.abs(dyPx) < DRAG_THRESHOLD) return
      editDrag.moved = true
      const [dx, dy] = worldDelta({ x: dxPx, y: dyPx }, fit, view)
      editDrag.dx = dx
      editDrag.dy = dy
      setDragGhost({ id: editDrag.id, dx, dy })
      return
    }
    const drag = dragRef.current
    if (drag === undefined) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
    drag.moved = true
    setView(current => ({ zoom: current.zoom, panX: drag.panX + dx, panY: drag.panY + dy }))
  }, [fit, view])

  const endPan = useCallback(() => {
    const editDrag = editDragRef.current
    if (editDrag !== undefined) {
      editDragRef.current = undefined
      setDragGhost(undefined)
      if (editDrag.moved && (editDrag.dx !== 0 || editDrag.dy !== 0) && activeLayout !== undefined) {
        addStaged(stageMove(nextDraftKey(), activeLayout.id, editDrag.id, editDrag.dx, editDrag.dy))
        suppressClickRef.current = true
        window.setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
      }
      return
    }
    const drag = dragRef.current
    dragRef.current = undefined
    setPanning(false)
    if (drag !== undefined && drag.moved) {
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
    }
  }, [activeLayout, addStaged, nextDraftKey])

  const beginEditDrag = useCallback((id: string, event: ScreenPointEvent) => {
    if (!editing || tool !== undefined || !editableEntityId(id)) return
    // The entity drag replaces the pan for this gesture, so the sheet does not
    // move underneath the primitive the reader is adjusting.
    event.stopPropagation()
    event.preventDefault?.()
    editDragRef.current = { id, startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, moved: false, dx: 0, dy: 0 }
    canvasElement?.setPointerCapture?.(event.pointerId)
    setSelectedId(id)
  }, [canvasElement, editing, tool])

  const onKeyDown = useCallback((event: { key: string; preventDefault: () => void }) => {
    switch (event.key) {
      case 'Escape':
        if (placement !== undefined) {
          setPlacement(undefined)
          setTool(undefined)
        } else if (tool !== undefined) {
          setTool(undefined)
        } else {
          setSelectedId(undefined)
          setHoveredId(undefined)
        }
        break
      case 'Enter':
        if (editing && tool === 'text') {
          event.preventDefault()
          placeAnnotation({ x: size.width / 2, y: size.height / 2 })
        }
        break
      case 'ArrowLeft':
        event.preventDefault()
        applyView(current => ({ ...current, panX: current.panX + PAN_STEP }))
        break
      case 'ArrowRight':
        event.preventDefault()
        applyView(current => ({ ...current, panX: current.panX - PAN_STEP }))
        break
      case 'ArrowUp':
        event.preventDefault()
        applyView(current => ({ ...current, panY: current.panY + PAN_STEP }))
        break
      case 'ArrowDown':
        event.preventDefault()
        applyView(current => ({ ...current, panY: current.panY - PAN_STEP }))
        break
      case '+':
      case '=':
        event.preventDefault()
        zoomBy(1.3)
        break
      case '-':
      case '_':
        event.preventDefault()
        zoomBy(1 / 1.3)
        break
      default:
        break
    }
  }, [applyView, editing, placement, placeAnnotation, size.height, size.width, tool, zoomBy])

  const askReview = useCallback(() => {
    const told = ask(resourceAddress, t('askReview', { format: formatLabel, path: pathOf(resourceAddress) }))
    setChatUnavailable(!told)
  }, [ask, formatLabel, resourceAddress, t])

  const askEntity = useCallback((entity: EcadEntity) => {
    const told = ask(resourceAddress, t('askEntity', {
      id: entity.id,
      kind: entity.k,
      layer: entity.layer,
      format: formatLabel,
      path: pathOf(resourceAddress),
    }))
    setChatUnavailable(!told)
  }, [ask, formatLabel, resourceAddress, t])

  const hover = useCallback((id: string | undefined) => {
    setHoveredId(id)
  }, [])
  const clearSelection = useCallback(() => {
    setSelectedId(undefined)
  }, [])
  const toggleLayer = useCallback((name: string) => {
    const key = name.toUpperCase()
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setSelectedId((current) => {
      if (current === undefined) return current
      const entity = activeLayout?.entities.find(candidate => candidate.id === current)
      return entity !== undefined && entity.layer.toUpperCase() === key ? undefined : current
    })
  }, [activeLayout])
  const showAllLayers = useCallback(() => {
    setHidden(new Set())
  }, [])

  const layouts = displayModel?.layouts ?? []
  const layoutTabs = layouts.length > 1
    ? createElement(
      'div',
      { className: css.layoutTabs, role: 'tablist', 'aria-label': t('layout') },
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
            setSelectedId(undefined)
            setHoveredId(undefined)
            setView({ zoom: 1, panX: 0, panY: 0 })
          },
        },
        layout.kind === 'model' ? t('modelSpace') : layout.name,
        createElement('span', { className: css.tabCount }, String(layout.entities.length)),
      )),
    )
    : null

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
        {
          ref: setCanvasElement,
          className: `${css.canvasWrap}${panning ? ` ${css.panning}` : ''}${editing && tool === 'text' ? ` ${css.placingText}` : ''}`,
          tabIndex: 0,
          role: 'group',
          'aria-label': canvasLabel,
          title: editing && tool === 'text' ? t('placementHint') : `${t('panHint')} · ${t('keyboardHint')}`,
          onKeyDown,
          onPointerDown: beginPan,
          onPointerMove: movePan,
          onPointerUp: endPan,
          onPointerCancel: endPan,
          onClick: (event: { clientX: number; clientY: number; target: unknown }) => {
            if (suppressClickRef.current) return
            if (interactiveTarget(event.target)) return
            if (editing && tool === 'text') {
              placeAnnotation({ x: event.clientX, y: event.clientY })
              return
            }
            setSelectedId(undefined)
          },
        },
        // SceneView is a component, not an inlined helper: it owns hooks (the
        // ghost lookup memo), so it must be rendered through React.
        createElement(SceneView, {
          scene,
          fit,
          view,
          selectedId,
          hoveredId,
          onSelect: handleSelect,
          onHover: hover,
          onEditPointerDown: beginEditDrag,
          label: canvasLabel,
          fadedIds: preview.erases,
          ghostMoves: editing ? ghostMoves : [],
          ghostTexts: editing ? ghostTexts : [],
          pendingPoint: editing ? pendingPoint : undefined,
        }),
        written === undefined
          ? null
          : createElement(WrittenBanner, { t, path: written.path, onBackToSource: backToSource }),
        coverage.truncated
          ? createElement(
            'div',
            { className: `${css.notice}${written === undefined ? '' : ` ${css.noticeBelowBanner}`}`, role: 'status' },
            createElement(WarningIcon, {}),
            createElement('span', { className: css.noticeText }, t('truncated')),
          )
          : null,
      ),
      createElement(
        'div',
        { className: `${css.sidePanel}${panelToggle}` },
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
        editing || outcome !== undefined
          ? createElement(DraftPanel, {
            t,
            staged,
            counts,
            layoutName: draftLayoutName,
            placement: editing ? placement : undefined,
            layers: placementLayers,
            invalidHeight: placement !== undefined && (parseNumberField(placement.height) === undefined || (parseNumberField(placement.height) ?? 0) <= 0),
            onPlacementChange: changePlacement,
            onStagePlacement: stagePlacement,
            onCancelPlacement: cancelPlacement,
            onRemove: removeStaged,
            outcome,
            onDismissOutcome: dismissOutcome,
            onOpenWritten: openWritten,
            onBackToSource: backToSource,
          })
          : null,
        createElement(LayerPanel, {
          model: displayModel ?? (state.model),
          layoutEntities: activeLayout?.entities ?? [],
          hidden,
          onToggle: toggleLayer,
          onShowAll: showAllLayers,
          t,
        }),
        createElement(Inspector, {
          entity: selected,
          model: displayModel ?? state.model,
          chatUnavailable,
          editing,
          moveDx,
          moveDy,
          onMoveDx: setMoveDx,
          onMoveDy: setMoveDy,
          onStageMove: stageMoveNow,
          onStageErase: stageEraseNow,
          onAsk: askEntity,
          onClear: clearSelection,
          t,
        }),
        // The sheet's identity gives way to the draft while the pane is editing:
        // the panel has no room for both, and the read state returns in view mode.
        editing || outcome !== undefined
          ? null
          : createElement(SheetSection, {
            titleBlock: summary.titleBlock,
            coverage: coverage ?? { entities: 0, approximate: 0, unsupportedTotal: 0, unsupported: [], truncated: false },
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
      className: css.root,
      'data-ecad-pane': 'drawing',
      'data-ecad-state': state.phase,
      ...(format === undefined ? {} : { 'data-ecad-format': format }),
      ...(editable ? { 'data-ecad-editable': 'true' } : {}),
      ...(editing ? { 'data-ecad-editing': 'true' } : {}),
    },
    createElement(DrawingToolbar, {
      coverage: coverage ?? { entities: 0, approximate: 0, unsupportedTotal: 0, unsupported: [], truncated: false },
      coverageText,
      coverageTitle,
      ready: state.phase === 'ready' && coverage !== undefined,
      format,
      conversion,
      writes: writesAuthoritative,
      editable,
      mode,
      onModeChange: changeMode,
      panelsOpen,
      chatUnavailable,
      onFit: fitView,
      onZoom: zoomBy,
      onTogglePanels: () => {
        panelsTouchedRef.current = true
        setPanelsOpen(value => !value)
      },
      onAsk: askReview,
      t,
    }),
    layoutTabs,
    editing
      ? createElement(EditBar, {
        t,
        tool,
        onToggleText: toggleTextTool,
        stagedCount: staged.length,
        applying,
        canApply: staged.length > 0 && !applying,
        applyDisabledReason,
        onApply: applyNow,
        onClear: clearDraft,
      })
      : null,
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
 * The hover text of the format badge: format, conversion provenance and warnings.
 * @param format - source format, lower case.
 * @param conversion - conversion provenance, when the host converted the source.
 * @param t - translator.
 * @returns the title.
 */
function formatTitleOf(format: string, conversion: EcadConversionSummary | undefined, t: Translate): string {
  const parts = [format.toUpperCase()]
  const converted = conversion === undefined ? undefined : conversionLabel(conversion)
  if (converted !== undefined) parts.push(t('convertedVia', { converter: converted }))
  if (conversion !== undefined && conversion.warnings > 0) parts.push(t('conversionWarnings', { count: conversion.warnings }))
  if (format === 'dwg') parts.push(t('dwgSupport'))
  return parts.join(' · ')
}

/** The workspace path an address carries, for prompts and labels. */
function pathOf(address: string): string {
  return parseFileAddress(address)?.path ?? address
}
