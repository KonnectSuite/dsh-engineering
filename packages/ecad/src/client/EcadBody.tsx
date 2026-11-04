/**
 * The right-panel drawing body: a CAD workspace over the sheet model.
 *
 * The document preview shell above this body owns the file path, reload and
 * renderer choice; this component owns the sheet, the selection, the drawing
 * tools, the staged draft and the one action that writes a new drawing. The M4
 * review/redline surface it grew from is preserved: View/Edit, the staged text,
 * move and erase operations, apply-as-new-file with verification, the
 * written-drawing banner and read-only mode when the row's writes are off.
 *
 * The pure geometry lives in `cad.ts`, the tool/op model in `cadTools.ts`; this
 * file owns pointer state and the SVG the reader sees.
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
import type { EcadEntity, EcadPoint, EcadSheetModel, EcadTitleBlock, EcadTitleBlockField } from '../engine/types.ts'
import { conversionOf, sourceFormatOf, type EcadApply, type EcadCapabilities, type EcadConversionSummary, type EcadFailure, type EcadOpen, type EcadOpenEnvelope } from './artifacts.ts'
import {
  coverageOf,
  entityBounds,
  fitBox,
  fmt,
  layersOf,
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
  stageText,
  type EcadStagedOp,
} from './edits.ts'
import {
  angleDegrees,
  buildIndex,
  DRAG_THRESHOLD,
  gripsOf,
  gridLinesOf,
  gripRequestFor,
  marqueeOf,
  marqueeSelect,
  orthoPoint,
  pickEntity,
  roundValue,
  screenBoxOfPoints,
  snapNear,
  toScreen,
  toWorld,
  viewForBox,
  zoomAt,
  type CadGrip,
  type CadGridView,
  type CadIndex,
  type CadMarquee,
  type CadScreenBox,
  type CadSnapKind,
  type CadSnapResult,
} from './cad.ts'
import {
  asEcadOp,
  commandClick,
  commandFinish,
  commandHover,
  commandNumeric,
  commandStart,
  draftAddMany,
  draftCanRedo,
  draftCanUndo,
  draftClear,
  draftRedo,
  draftRemove,
  draftReset,
  draftUndo,
  EMPTY_DRAFT_STATE,
  engineOpAvailable,
  stageAddBlock,
  stageAddLayer,
  stageEraseMany,
  stageExtend,
  stageMoveMany,
  stageRenameLayer,
  stageRotate,
  stageSetAttribute,
  stageSetColor,
  stageSetLayerColor,
  stageSetLayerMany,
  stageSetText,
  stageTrim,
  toolAvailable,
  toolForShortcut,
  toolOf,
  type CadCommand,
  type CadCommandContext,
  type CadCommandStep,
  type CadDraftState,
  type CadToolId,
} from './cadTools.ts'
import {
  BlockPlacementForm,
  DraftPanel,
  EditBar,
  EditModeToggle,
  WrittenBanner,
  type EcadApplyOutcome,
  type EcadBlockPlacementDraft,
  type EcadMode,
  type EcadPlacementDraft,
} from './EcadDraft.tsx'
import {
  CadLayersPanel,
  CadNoticeView,
  CadStatusBar,
  CommandBar,
  ContextMenu,
  DrawingAidButtons,
  PropertiesPanel,
  SheetActionButtons,
  ToolPalette,
  UndoRedoButtons,
  type CadMenuItem,
  type CadNotice,
} from './EcadCad.tsx'
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

/** Which panes the reader has open. */
interface PanelState {
  readonly open: boolean
}

/** The drawing aids toggled from the toolbar and the keyboard. */
interface CadAidState {
  readonly osnap: boolean
  readonly ortho: boolean
  readonly grid: boolean
}

const FIT_MARGIN = 24
const PAN_STEP = 40
/** Screen-pixel tolerance for picking a primitive. */
const PICK_TOLERANCE_PX = 6
/** Screen-pixel radius inside which an object snap wins. */
const SNAP_RADIUS_PX = 12
/** Screen-pixel half-size of a grip square. */
const GRIP_HALF_PX = 4
/** Screen-pixel half-size of the square that starts a grip drag. */
const GRIP_HIT_PX = 7
/** A second pointer-down this close, in time and space, finishes a command. */
const DOUBLE_CLICK_MS = 320
const DOUBLE_CLICK_PX = 5

/** The active pointer gesture, owned outside React state so a move is cheap. */
type CadGesture =
  | { readonly kind: 'pan'; readonly button: number; readonly startX: number; readonly startY: number; readonly panX: number; readonly panY: number; readonly pointerId: number; moved: boolean }
  | { readonly kind: 'marquee'; readonly start: { readonly x: number; readonly y: number }; readonly pointerId: number; moved: boolean; readonly additive: boolean; readonly toggle: boolean }
  | { readonly kind: 'zoomWindow'; readonly start: { readonly x: number; readonly y: number }; readonly pointerId: number; moved: boolean }
  | { readonly kind: 'moveDrag'; readonly startWorld: EcadPoint; readonly ids: readonly string[]; readonly pointerId: number; moved: boolean; dx: number; dy: number }
  | { readonly kind: 'grip'; readonly entityId: string; readonly grip: CadGrip; readonly original: EcadPoint; readonly pointerId: number; moved: boolean; point: EcadPoint }

/** One preview shape drawn under the pointer while a command is in progress. */
type CadPreviewElement =
  | { readonly kind: 'line'; readonly a: EcadPoint; readonly b: EcadPoint }
  | { readonly kind: 'polyline'; readonly points: readonly EcadPoint[]; readonly closed?: boolean }
  | { readonly kind: 'rect'; readonly a: EcadPoint; readonly b: EcadPoint }
  | { readonly kind: 'circle'; readonly c: EcadPoint; readonly r: number }
  | { readonly kind: 'arc'; readonly c: EcadPoint; readonly r: number; readonly a0: number; readonly a1: number }

/** One glyph's geometry, drawn in the theme's label colour. */
interface IconProps {
  readonly size?: number
}

/** Minus, for zooming out. */
function MinusIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M3.5 8h9' }))
}

/** Plus, for zooming in. */
function PlusIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M8 3.5v9M3.5 8h9' }))
}

/** Fit, drawn as a frame with its corners pulled in. */
function FitIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10' }),
    createElement('rect', { x: 5.5, y: 5.5, width: 5, height: 5, rx: 0.5 }))
}

/** The panel toggle glyph. */
function LayersIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M8 2.2 14 5.3 8 8.4 2 5.3 8 2.2Z' }),
    createElement('path', { d: 'M2 8.4l6 3.1 6-3.1M2 11.2l6 3.1 6-3.1' }))
}

/** The lock reads as the row-level write posture, never as a warning. */
function LockIcon({ size = 12 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('rect', { x: 3.5, y: 7.5, width: 9, height: 6.5, rx: 1 }),
    createElement('path', { d: 'M5.5 7.5V5.6a2.5 2.5 0 0 1 5 0v1.9' }))
}

/** The warning triangle marks truncated coverage. */
function WarningIcon({ size = 13 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M8 2.4 14.4 13H1.6L8 2.4Z' }),
    createElement('path', { d: 'M8 6.4v3.1M8 11.5v.1' }))
}

/** The chat glyph marks the action that leaves the pane for the conversation. */
function ChatIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M13.5 8.6a5.7 5.7 0 0 1-6 5.5 6.6 6.6 0 0 1-1.9-.3L2.5 14.5l.7-2.7a5.3 5.3 0 0 1-1-3.2 5.7 5.7 0 0 1 6-5.5 5.7 5.7 0 0 1 5.3 5.5Z' }))
}

/** The close glyph dismisses the narrow-pane panel overlay. */
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
 * Render one primitive's text runs, shared by the sheet, its ghosts and the
 * selection overlay.
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

/** Props of one sheet primitive. */
interface ScenePrimitiveProps {
  readonly primitive: EcadScenePrimitive
}

/**
 * One sheet primitive: its geometry in the reading paint plus its text runs.
 * There is no per-primitive interaction here — the canvas hit-tests in world
 * space — so a selection or a pan does not repaint the sheet.
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
    primitive.geometry.t === 'none' ? null : createElement(SceneShape, { geometry: primitive.geometry, paint: paintOf(primitive, false, filled) }),
    textRuns(primitive, primitive.ink, false),
  )
}

/** Memoized primitive: a pan, a zoom or a selection never repaints the sheet. */
const MemoPrimitive = memo(ScenePrimitive)

/** Props of {@link PreviewView}. */
interface PreviewViewProps {
  readonly elements: readonly CadPreviewElement[]
}

/**
 * The rubber-band preview of the armed command, in drawing units.
 * @param props - the preview geometry.
 */
function PreviewView({ elements }: PreviewViewProps): ReactElement | null {
  if (elements.length === 0) return null
  return createElement(
    'g',
    { className: css.selectionOverlay, 'data-ecad-preview': 'true', 'aria-hidden': true },
    elements.map((element, index) => {
      const key = `preview-${index}`
      switch (element.kind) {
        case 'line':
          return createElement('line', { key, className: css.previewLine, x1: element.a[0], y1: element.a[1], x2: element.b[0], y2: element.b[1] })
        case 'polyline': {
          const parts: string[] = []
          element.points.forEach((point, pointIndex) => {
            parts.push(`${pointIndex === 0 ? 'M' : 'L'} ${fmt(point[0])} ${fmt(point[1])}`)
          })
          if (element.closed === true) parts.push('Z')
          return createElement('path', { key, className: css.previewLine, d: parts.join(' ') })
        }
        case 'rect':
          return createElement('rect', {
            key,
            className: css.previewShape,
            x: Math.min(element.a[0], element.b[0]),
            y: Math.min(element.a[1], element.b[1]),
            width: Math.abs(element.b[0] - element.a[0]),
            height: Math.abs(element.b[1] - element.a[1]),
          })
        case 'circle':
          return createElement('circle', { key, className: css.previewShape, cx: element.c[0], cy: element.c[1], r: Math.abs(element.r) })
        case 'arc': {
          const start = [element.c[0] + element.r * Math.cos(element.a0), element.c[1] + element.r * Math.sin(element.a0)]
          const end = [element.c[0] + element.r * Math.cos(element.a1), element.c[1] + element.r * Math.sin(element.a1)]
          const large = element.a1 - element.a0 > Math.PI ? 1 : 0
          return createElement('path', {
            key,
            className: css.previewShape,
            d: `M ${fmt(start[0]!)} ${fmt(start[1]!)} A ${fmt(Math.abs(element.r))} ${fmt(Math.abs(element.r))} 0 ${large} 1 ${fmt(end[0]!)} ${fmt(end[1]!)}`,
          })
        }
        default:
          return null
      }
    }),
  )
}

/** Props of {@link SceneView}. */
interface SceneViewProps {
  readonly scene: EcadScene
  readonly fit: EcadFit
  readonly view: ViewState
  readonly label: string
  /** Canvas size in CSS pixels, for the screen-space grid. */
  readonly width: number
  readonly height: number
  /** Selected entity ids; the highlight layer is the only thing selection repaints. */
  readonly selectedIds: readonly string[]
  /** Entities a staged erase removes; faded on the sheet until the draft applies. */
  readonly fadedIds: ReadonlySet<string>
  /** Staged and preview moves, drawn as accent ghosts over the source geometry. */
  readonly ghostMoves: readonly { readonly key: string; readonly id: string; readonly delta: readonly [number, number] }[]
  /** Text annotations a draft adds, or the annotation a click is placing. */
  readonly ghostTexts: readonly { readonly key: string; readonly point: readonly [number, number]; readonly text: string; readonly height: number; readonly rotation: number }[]
  /** The point a placement click chose, marked with a crosshair. */
  readonly pendingPoint: readonly [number, number] | undefined
  /** The marquee rectangle in canvas pixels. */
  readonly marquee: CadMarquee | undefined
  /** The zoom-window rectangle in canvas pixels. */
  readonly zoomBox: CadScreenBox | undefined
  /** The visible grid lines in canvas pixels. */
  readonly grid: CadGridView | undefined
  /** The selection's grip handles in drawing units. */
  readonly grips: readonly CadGrip[]
  /** The grip being dragged, when one is active. */
  readonly activeGripKey: string | undefined
  /** The grip drag's preview segment in drawing units. */
  readonly gripPreview: readonly [EcadPoint, EcadPoint] | undefined
  /** The current object snap and its label, in drawing units. */
  readonly snap: { readonly point: EcadPoint; readonly kind: CadSnapKind; readonly label: string } | undefined
  /** The armed command's preview geometry, in drawing units. */
  readonly preview: readonly CadPreviewElement[]
}

/**
 * The sheet as SVG: one outer group for the user's pan and zoom, one inner group
 * for the fit with the Y axis flipped, so CAD orientation reads correctly and a
 * zoom never rebuilds a primitive. The selection, marquee, grips, snap marker
 * and command preview are overlays; the base primitives are memoized once per
 * scene so a pointer move never walks 36k shapes.
 * @param props - the scene, its view state and the overlay state.
 */
function SceneView({ scene, fit, view, label, width, height, selectedIds, fadedIds, ghostMoves, ghostTexts, pendingPoint, marquee, zoomBox, grid, grips, activeGripKey, gripPreview, snap, preview }: SceneViewProps): ReactElement {
  const base = useMemo(() => scene.primitives.map(primitive => createElement(MemoPrimitive, { key: primitive.id, primitive })), [scene])
  const byId = useMemo(() => {
    const map = new Map<string, EcadScenePrimitive>()
    for (const primitive of scene.primitives) map.set(primitive.id, primitive)
    return map
  }, [scene])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selected = useMemo(() => scene.primitives.filter(primitive => selectedSet.has(primitive.id)), [scene, selectedSet])
  const faded = useMemo(() => scene.primitives.filter(primitive => fadedIds.has(primitive.id)), [scene, fadedIds])
  const span = Math.max(scene.bounds.max[0] - scene.bounds.min[0], scene.bounds.max[1] - scene.bounds.min[1])
  const marker = Math.max(span * 0.012, 1e-6)
  const ghosts = (ghostMoves ?? []).flatMap((move) => {
    const primitive = byId.get(move.id)
    if (primitive === undefined) return []
    return [{ move, primitive }]
  })
  const snapScreen = snap === undefined ? undefined : toScreen(snap.point, fit, view)
  const gripScreens = grips.map(grip => ({ grip, screen: toScreen(grip.point, fit, view) }))
  const gripLine = gripPreview === undefined
    ? undefined
    : { from: toScreen(gripPreview[0], fit, view), to: toScreen(gripPreview[1], fit, view) }
  return createElement(
    'svg',
    { className: css.canvas, role: 'img', 'aria-label': label, 'data-ecad-canvas': 'true' },
    grid === undefined
      ? null
      : createElement(
        'g',
        { 'aria-hidden': true },
        grid.xs.map(x => createElement('line', { key: `gx-${x}`, className: css.gridLine, x1: x, y1: 0, x2: x, y2: height })),
        grid.ys.map(y => createElement('line', { key: `gy-${y}`, className: css.gridLine, x1: 0, y1: y, x2: width, y2: y })),
      ),
    createElement(
      'g',
      { transform: `translate(${view.panX} ${view.panY}) scale(${view.zoom})`, 'data-ecad-view': 'true' },
      createElement(
        'g',
        { transform: `translate(${fit.translateX} ${fit.translateY}) scale(${fit.scale} ${-fit.scale})` },
        base,
        faded.map(primitive => createElement(
          'g',
          { key: `fade-${primitive.id}`, className: css.faded, 'data-ecad-faded': primitive.id, 'aria-hidden': true },
          primitive.geometry.t === 'none' ? null : createElement(SceneShape, {
            geometry: primitive.geometry,
            paint: { fill: 'none', stroke: primitive.ink, strokeWidth: 1 },
          }),
          textRuns(primitive, primitive.ink, false),
        )),
        selected.flatMap((primitive) => {
          const filled = primitive.geometry.t === 'path' && (primitive.geometry.fill || primitive.geometry.hatch)
          // A selected filled shape keeps the accent as an outline and a wash,
          // never as a solid block that hides the sheet underneath.
          const shade: CSSProperties = filled
            ? { fill: 'var(--ecad-accent)', fillOpacity: 0.14, stroke: 'var(--ecad-accent)', strokeWidth: 2.5 }
            : { fill: 'none', stroke: 'var(--ecad-accent)', strokeWidth: 2.5 }
          if (primitive.geometry.t === 'none') {
            return [createElement('g', { key: `sel-text-${primitive.id}`, className: css.selectionOverlay }, textRuns(primitive, 'var(--ecad-accent)', true))]
          }
          return [
            createElement('g', { key: `sel-${primitive.id}`, className: css.selectionOverlay, 'data-ecad-selected': primitive.id },
              createElement(SceneShape, { geometry: primitive.geometry, paint: { fill: 'none', stroke: 'var(--ecad-paper)', strokeWidth: 5 }, className: css.selectionHalo }),
              createElement(SceneShape, { geometry: primitive.geometry, paint: shade, className: css.selection }),
              textRuns(primitive, 'var(--ecad-accent)', true),
            ),
          ]
        }),
        ...ghosts.map(({ move, primitive }) => createElement(
          'g',
          {
            key: `ghost-${move.key}-${move.id}`,
            transform: `translate(${move.delta[0]} ${move.delta[1]})`,
            className: css.ghostGroup,
            'data-ecad-ghost': move.id,
            'aria-hidden': true,
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
        createElement(PreviewView, { elements: preview }),
        pendingPoint === undefined
          ? null
          : createElement(
            'g',
            { key: 'placement-marker', 'aria-hidden': true, 'data-ecad-placement': `${pendingPoint[0]},${pendingPoint[1]}` },
            createElement('line', { className: css.placementMarker, x1: pendingPoint[0] - marker, y1: pendingPoint[1], x2: pendingPoint[0] + marker, y2: pendingPoint[1] }),
            createElement('line', { className: css.placementMarker, x1: pendingPoint[0], y1: pendingPoint[1] - marker, x2: pendingPoint[0], y2: pendingPoint[1] + marker }),
            createElement('circle', { className: css.placementMarker, cx: pendingPoint[0], cy: pendingPoint[1], r: marker * 0.45 }),
          ),
      ),
      createElement(
        'g',
        { className: css.selectionOverlay, 'aria-hidden': true },
        fadedIds.size === 0 ? null : null,
        marquee === undefined
          ? null
          : createElement('rect', {
            className: marquee.mode === 'window' ? css.marqueeWindow : css.marqueeCrossing,
            x: marquee.box.minX,
            y: marquee.box.minY,
            width: marquee.box.maxX - marquee.box.minX,
            height: marquee.box.maxY - marquee.box.minY,
            'data-ecad-marquee': marquee.mode,
          }),
        zoomBox === undefined
          ? null
          : createElement('rect', {
            className: css.marqueeWindow,
            x: zoomBox.minX,
            y: zoomBox.minY,
            width: zoomBox.maxX - zoomBox.minX,
            height: zoomBox.maxY - zoomBox.minY,
            'data-ecad-zoom-window': 'true',
          }),
        gripScreens.map(({ grip, screen }) => createElement('rect', {
          key: `grip-${grip.key}`,
          className: grip.key === activeGripKey ? css.gripHandleActive : css.gripHandle,
          x: screen[0] - GRIP_HALF_PX,
          y: screen[1] - GRIP_HALF_PX,
          width: GRIP_HALF_PX * 2,
          height: GRIP_HALF_PX * 2,
          'data-ecad-grip': grip.key,
        })),
        gripLine === undefined
          ? null
          : createElement('g', null,
            createElement('line', { className: css.gripLine, x1: gripLine.from[0], y1: gripLine.from[1], x2: gripLine.to[0], y2: gripLine.to[1] }),
            createElement('circle', { className: css.gripHandleActive, cx: gripLine.to[0], cy: gripLine.to[1], r: GRIP_HALF_PX }),
          ),
        snapScreen === undefined || snap === undefined
          ? null
          : createElement('g', { transform: `translate(${snapScreen[0]} ${snapScreen[1]})`, 'data-ecad-snap': snap.kind },
            createElement('line', { className: css.snapMarker, x1: -7, y1: 0, x2: 7, y2: 0 }),
            createElement('line', { className: css.snapMarker, x1: 0, y1: -7, x2: 0, y2: 7 }),
            createElement('circle', { className: css.snapMarker, cx: 0, cy: 0, r: 3.5 }),
            createElement('text', { className: css.snapLabel, x: 9, y: -8 }, snap.label),
          ),
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
  readonly writes: boolean
  readonly editable: boolean
  readonly mode: EcadMode
  readonly onModeChange: (mode: EcadMode) => void
  readonly panelsOpen: boolean
  readonly chatUnavailable: boolean
  readonly aids: CadAidState
  readonly onToggleAid: (aid: keyof CadAidState) => void
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly onUndo: () => void
  readonly onRedo: () => void
  readonly onPrint: () => void
  readonly onExportSvg: () => void
  readonly onExportPng: () => void
  readonly onFit: () => void
  readonly onZoom: (factor: number) => void
  readonly onTogglePanels: () => void
  readonly onAsk: () => void
  readonly t: Translate
}

/**
 * The pane's top row: coverage, view controls, drawing aids, drafts, sheet
 * actions, panels and Ask Arya.
 * @param props - coverage, read posture and control callbacks.
 */
function CadToolbar({ coverage, coverageText, coverageTitle, ready, format, conversion, writes, editable, mode, onModeChange, panelsOpen, chatUnavailable, aids, onToggleAid, canUndo, canRedo, onUndo, onRedo, onPrint, onExportSvg, onExportPng, onFit, onZoom, onTogglePanels, onAsk, t }: CadToolbarProps): ReactElement {
  return createElement(
    'div',
    { className: `${css.toolbar} ${css.noPrint}` },
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
      editable && mode === 'edit' ? createElement(UndoRedoButtons, { t, canUndo, canRedo, onUndo, onRedo }) : null,
      createElement('button', { type: 'button', className: `${css.button} ${css.iconButton}`, title: t('zoomExtentsHint'), 'aria-label': t('zoomExtents'), disabled: !ready, onClick: onFit }, createElement(FitIcon, {})),
      createElement('button', { type: 'button', className: `${css.button} ${css.iconButton}`, title: t('zoomOut'), 'aria-label': t('zoomOut'), disabled: !ready, onClick: () => { onZoom(1 / 1.3) } }, createElement(MinusIcon, {})),
      createElement('button', { type: 'button', className: `${css.button} ${css.iconButton}`, title: t('zoomIn'), 'aria-label': t('zoomIn'), disabled: !ready, onClick: () => { onZoom(1.3) } }, createElement(PlusIcon, {})),
      createElement(DrawingAidButtons, {
        t,
        osnap: aids.osnap,
        ortho: aids.ortho,
        grid: aids.grid,
        onToggleOsnap: () => { onToggleAid('osnap') },
        onToggleOrtho: () => { onToggleAid('ortho') },
        onToggleGrid: () => { onToggleAid('grid') },
      }),
      createElement('button', {
        type: 'button',
        className: `${css.button} ${css.iconButton}`,
        title: t('panels'),
        'aria-label': t('panels'),
        'aria-pressed': panelsOpen,
        disabled: !ready,
        onClick: onTogglePanels,
      }, createElement(LayersIcon, {})),
      createElement(SheetActionButtons, { t, disabled: !ready, onPrint, onExportSvg, onExportPng }),
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

/** The drawing body. */
export function EcadBody(props: EcadBodyProps): ReactNode {
  const { resourceAddress, content, t, open, apply, ask } = props
  const request = content?.kind === 'renderer' ? content as EcadRendererContent : undefined
  const revision = request?.revision ?? 0
  const [localRevision, setLocalRevision] = useState(0)
  const [state, setState] = useState<BodyState>({ phase: 'loading' })
  const [layoutId, setLayoutId] = useState<string | undefined>(undefined)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [lockedLayers, setLockedLayers] = useState<ReadonlySet<string>>(new Set())
  const [currentLayer, setCurrentLayer] = useState<string | undefined>(undefined)
  const [panelsOpen, setPanelsOpen] = useState(true)
  const panelsTouchedRef = useRef(false)
  const [chatUnavailable, setChatUnavailable] = useState(false)
  const [view, setView] = useState<ViewState>({ zoom: 1, panX: 0, panY: 0 })
  const [panning, setPanning] = useState(false)
  // -- selection and CAD state --------------------------------------------
  const [selected, setSelected] = useState<readonly string[]>([])
  const [tool, setTool] = useState<CadToolId>('select')
  const [command, setCommand] = useState<CadCommand | undefined>(undefined)
  const [commandError, setCommandError] = useState<string | undefined>(undefined)
  const [numericText, setNumericText] = useState('')
  const [aids, setAids] = useState<CadAidState>({ osnap: true, ortho: false, grid: false })
  const [cursorWorld, setCursorWorld] = useState<EcadPoint | undefined>(undefined)
  const [snap, setSnap] = useState<CadSnapResult | undefined>(undefined)
  const [marquee, setMarquee] = useState<CadMarquee | undefined>(undefined)
  const [zoomBox, setZoomBox] = useState<CadScreenBox | undefined>(undefined)
  const [contextMenu, setContextMenu] = useState<{ readonly x: number; readonly y: number } | undefined>(undefined)
  const [notice, setNotice] = useState<CadNotice | undefined>(undefined)
  const [spaceDown, setSpaceDown] = useState(false)
  const [dragGhost, setDragGhost] = useState<{ readonly ids: readonly string[]; readonly dx: number; readonly dy: number } | undefined>(undefined)
  const [gripDrag, setGripDrag] = useState<{ readonly entityId: string; readonly grip: CadGrip; readonly original: EcadPoint; readonly point: EcadPoint } | undefined>(undefined)
  // -- draft ---------------------------------------------------------------
  const [draft, setDraft] = useState<CadDraftState>(EMPTY_DRAFT_STATE)
  const [mode, setMode] = useState<EcadMode>('view')
  const [placement, setPlacement] = useState<EcadPlacementDraft | undefined>(undefined)
  const [blockPlacement, setBlockPlacement] = useState<EcadBlockPlacementDraft | undefined>(undefined)
  const [moveDx, setMoveDx] = useState('0')
  const [moveDy, setMoveDy] = useState('0')
  const [rotateAngle, setRotateAngle] = useState('90')
  const [applying, setApplying] = useState(false)
  const [outcome, setOutcome] = useState<EcadApplyOutcome | undefined>(undefined)
  const [written, setWritten] = useState<{ readonly path: string; readonly model: EcadSheetModel; readonly version: string } | undefined>(undefined)
  const [writtenCandidate, setWrittenCandidate] = useState<{ readonly path: string; readonly model: EcadSheetModel; readonly version: string } | undefined>(undefined)
  const draftKeyRef = useRef(0)
  const applyAbortRef = useRef<AbortController | undefined>(undefined)
  const gestureRef = useRef<CadGesture | undefined>(undefined)
  const indexRef = useRef<{ readonly key: string; readonly index: CadIndex } | undefined>(undefined)
  /** True after a right-drag, so the native contextmenu that follows is swallowed. */
  const suppressContextMenuRef = useRef(false)
  const lastClickRef = useRef<{ readonly time: number; readonly x: number; readonly y: number } | undefined>(undefined)
  const spaceHeldRef = useRef(false)
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

  const retry = useCallback(() => {
    if (request !== undefined) request.reload()
    else setLocalRevision(value => value + 1)
    setState({ phase: 'loading' })
  }, [request])

  /** Reset every per-sheet surface; a reload retires the draft. */
  const resetSheetState = useCallback(() => {
    setSelected([])
    setView({ zoom: 1, panX: 0, panY: 0 })
    setHidden(new Set())
    setLockedLayers(new Set())
    setLayoutId(undefined)
    setMode('view')
    setTool('select')
    setCommand(undefined)
    setCommandError(undefined)
    setNumericText('')
    setPlacement(undefined)
    setBlockPlacement(undefined)
    setDraft(EMPTY_DRAFT_STATE)
    setApplying(false)
    setOutcome(undefined)
    setWritten(undefined)
    setWrittenCandidate(undefined)
    setDragGhost(undefined)
    setGripDrag(undefined)
    setMarquee(undefined)
    setZoomBox(undefined)
    setContextMenu(undefined)
    setNotice(undefined)
    setMoveDx('0')
    setMoveDy('0')
    setRotateAngle('90')
  }, [])

  // Load the drawing whenever the shell's revision changes. The renderer owns
  // its content: it reads the model, reports the displayed version, and cancels
  // its own request on unmount or replace.
  useEffect(() => {
    if (resourceAddress === '') return
    const controller = new AbortController()
    applyAbortRef.current?.abort()
    applyAbortRef.current = undefined
    setState({ phase: 'loading' })
    resetSheetState()
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
  }, [resourceAddress, revision, localRevision, open, resetSheetState, t])

  const model = state.phase === 'ready' ? state.model : undefined
  const summary = state.phase === 'ready' ? state.summary : undefined
  const capabilities = state.phase === 'ready' ? state.capabilities : undefined
  // What the pane draws: the source sheet, or the drawing the host just wrote.
  const displayModel = written?.model ?? model
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
  const drawableIds = useMemo(() => new Set((scene?.primitives ?? []).map(primitive => primitive.id.split('#')[0] as string)), [scene])
  // The entities the pointer can pick, marquee and snap to: drawable, visible,
  // and — for a hidden layer — out of the picture entirely.
  const pickableEntities = useMemo(() => {
    if (activeLayout === undefined) return []
    return activeLayout.entities.filter(entity => entity.k !== 'insert' && entity.k !== 'unsupported' && drawableIds.has(entity.id) && !hidden.has(entity.layer.toUpperCase()))
  }, [activeLayout, drawableIds, hidden])
  const hiddenKey = useMemo(() => [...hidden].sort().join(','), [hidden])
  const indexKey = `${activeLayoutId ?? ''}|${hiddenKey}`
  const ensureIndex = useCallback((): CadIndex => {
    const cached = indexRef.current
    if (cached !== undefined && cached.key === indexKey) return cached.index
    const index = buildIndex(pickableEntities)
    indexRef.current = { key: indexKey, index }
    return index
  }, [indexKey, pickableEntities])
  const coverage = useMemo(() => (displayModel === undefined ? undefined : coverageOf(displayModel)), [displayModel])
  const coverageText = coverage === undefined
    ? ''
    : coverage.unsupportedTotal > 0
      ? t('coverage', { entities: coverage.entities.toLocaleString(), approximate: coverage.approximate, unsupported: coverage.unsupportedTotal })
      : t('coverageClean', { entities: coverage.entities.toLocaleString() })
  const coverageTitle = coverage === undefined || coverage.unsupportedTotal === 0
    ? undefined
    : t('coverageUndrawn', { list: coverage.unsupported.map(([kind, count]) => `${kind} ×${count}`).join(', ') })
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const selectedEntities = useMemo(
    () => (activeLayout === undefined ? [] : activeLayout.entities.filter(entity => selectedSet.has(entity.id))),
    [activeLayout, selectedSet],
  )
  const selectedOne = selectedEntities.length === 1 ? selectedEntities[0] : undefined
  const fit = useMemo(() => {
    if (scene === undefined) return { scale: 1, translateX: 0, translateY: 0 }
    return fitBox(scene.bounds, Math.max(size.width, 1), Math.max(size.height, 1), FIT_MARGIN)
  }, [scene, size.width, size.height])
  const worldScale = fit.scale * view.zoom
  const pickTolerance = worldScale > 0 ? PICK_TOLERANCE_PX / worldScale : 0
  const snapRadius = worldScale > 0 ? SNAP_RADIUS_PX / worldScale : 0
  const grid = useMemo(
    () => (aids.grid ? gridLinesOf(fit, view, size.width, size.height) : undefined),
    [aids.grid, fit, view, size.width, size.height],
  )

  // -- default layer and annotation values ---------------------------------
  const placementLayers = useMemo(() => (displayModel?.layers ?? []).map(layer => layer.name), [displayModel])
  const defaultAnnotationHeight = activeLayout === undefined
    ? 1
    : defaultTextHeight(scene?.bounds ?? activeLayout.extents, activeLayout)
  const defaultAnnotationLayer = displayModel === undefined
    ? undefined
    : currentLayer ?? defaultLayer(displayModel, activeLayout) ?? placementLayers[0]
  useEffect(() => {
    if (displayModel === undefined) return
    if (currentLayer !== undefined && displayModel.layers.some(layer => layer.name === currentLayer)) return
    setCurrentLayer(defaultLayer(displayModel, activeLayout))
  }, [displayModel, activeLayout, currentLayer])

  // -- draft derived values -------------------------------------------------
  const staged = draft.ops
  const counts = useMemo(() => draftCounts(staged), [staged])
  const preview = useMemo(() => draftPreview(staged), [staged])
  const draftHint = useMemo(() => {
    const ids = [...new Set(staged.map(item => item.layout).filter(id => id !== ''))]
    const layerOps = staged.some(item => item.layout === '')
    if (ids.length > 1) return t('draftSeveralLayouts')
    if (ids.length === 1) {
      const name = displayModel?.layouts.find(layout => layout.id === ids[0])?.name ?? (ids[0] as string)
      return t('draftLayoutHint', { layout: name })
    }
    if (layerOps) return t('draftLayerOps')
    return t('draftLayoutHint', { layout: activeLayout?.name ?? '' })
  }, [activeLayout, displayModel, staged, t])
  const ghostMoves = useMemo(() => {
    const moves: { key: string; id: string; delta: readonly [number, number] }[] = [...preview.moves]
    if (dragGhost !== undefined) {
      for (const id of dragGhost.ids) moves.push({ key: `drag-${id}`, id, delta: [dragGhost.dx, dragGhost.dy] })
    }
    return moves
  }, [preview.moves, dragGhost])
  const commandGhostMoves = useMemo(() => {
    if (command === undefined || command.points.length === 0) return []
    const cursor = command.cursor
    if (cursor === undefined) return []
    const base = command.points[0] as EcadPoint
    const dx = roundValue(cursor[0] - base[0])
    const dy = roundValue(cursor[1] - base[1])
    const wanted = command.tool === 'move' || command.tool === 'copy'
    if (!wanted) return []
    return selectedEntities
      .filter(entity => editableEntityId(entity.id))
      .map(entity => ({ key: `command-${entity.id}`, id: entity.id, delta: [dx, dy] as readonly [number, number] }))
  }, [command, selectedEntities])
  const allGhostMoves = useMemo(() => [...ghostMoves, ...commandGhostMoves], [ghostMoves, commandGhostMoves])
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
  const pendingPoint = placement?.point ?? blockPlacement?.point
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

  // -- draft commit helpers -------------------------------------------------
  const nextDraftKey = useCallback((): string => {
    draftKeyRef.current += 1
    return `draft-${draftKeyRef.current}`
  }, [])
  const commitOps = useCallback((ops: readonly EcadStagedOp[]) => {
    if (ops.length === 0) return
    setDraft(current => draftAddMany(current, ops))
  }, [])
  const reportPending = useCallback((op: string) => {
    setNotice({ kind: 'warn', text: t('engineOpPending', { op }) })
  }, [t])

  // -- selection helpers ----------------------------------------------------
  const clearSelection = useCallback(() => {
    setSelected([])
  }, [])
  const selectAll = useCallback(() => {
    const ids = pickableEntities
      .filter(entity => !lockedLayers.has(entity.layer.toUpperCase()))
      .map(entity => entity.id)
    setSelected(ids)
  }, [pickableEntities, lockedLayers])
  const toggleLayer = useCallback((name: string) => {
    const key = name.toUpperCase()
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setSelected(current => current.filter((id) => {
      const entity = activeLayout?.entities.find(candidate => candidate.id === id)
      return entity === undefined || entity.layer.toUpperCase() !== key
    }))
  }, [activeLayout])
  const showAllLayers = useCallback(() => {
    setHidden(new Set())
  }, [])
  const hideAllLayers = useCallback(() => {
    if (displayModel === undefined) return
    setHidden(new Set(displayModel.layers.map(layer => layer.name.toUpperCase())))
    setSelected([])
  }, [displayModel])
  const toggleLayerLock = useCallback((name: string) => {
    const key = name.toUpperCase()
    setLockedLayers((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setSelected(current => current.filter((id) => {
      const entity = activeLayout?.entities.find(candidate => candidate.id === id)
      return !(entity !== undefined && entity.layer.toUpperCase() === key)
    }))
  }, [activeLayout])

  // -- tool switching -------------------------------------------------------
  const cancelCommand = useCallback(() => {
    setCommand(undefined)
    setCommandError(undefined)
    setNumericText('')
  }, [])
  const chooseTool = useCallback((next: CadToolId) => {
    const spec = toolOf(next)
    if (spec === undefined) return
    if (!toolAvailable(spec, editing)) return
    setTool(next)
    cancelCommand()
    setMarquee(undefined)
    setZoomBox(undefined)
    setContextMenu(undefined)
    setGripDrag(undefined)
    if (next !== 'text') setPlacement(undefined)
    if (next !== 'block') setBlockPlacement(undefined)
    setNotice(undefined)
  }, [cancelCommand, editing])
  const changeMode = useCallback((next: EcadMode) => {
    setMode(next)
    if (next === 'view') {
      setPlacement(undefined)
      setBlockPlacement(undefined)
      setDragGhost(undefined)
      setGripDrag(undefined)
      cancelCommand()
      setTool('select')
    }
  }, [cancelCommand])

  // -- staging helpers ------------------------------------------------------
  const stageOps = useCallback((items: readonly EcadStagedOp[], nextTool: CadToolId | undefined) => {
    commitOps(items)
    if (nextTool !== undefined) setTool(nextTool)
  }, [commitOps])

  const stagePlacement = useCallback(() => {
    if (!editing || placement === undefined || activeLayout === undefined) return
    const text = placement.text.trim()
    const height = parseNumberField(placement.height)
    if (text === '' || height === undefined || height <= 0) return
    stageOps([stageText(
      nextDraftKey(),
      activeLayout.id,
      placement.point,
      text,
      height,
      placement.layer === '' ? undefined : placement.layer,
    )], 'select')
    setPlacement(undefined)
  }, [activeLayout, editing, nextDraftKey, placement, stageOps])

  const stageBlock = useCallback(() => {
    if (!editing || blockPlacement === undefined || activeLayout === undefined) return
    const rotation = parseNumberField(blockPlacement.rotation) ?? 0
    const scale = parseNumberField(blockPlacement.scale)
    if (blockPlacement.block === '' || scale === undefined || scale <= 0) return
    stageOps([stageAddBlock(nextDraftKey(), activeLayout.id, blockPlacement.block, blockPlacement.point, rotation, [scale, scale], currentLayer)], 'select')
    setBlockPlacement(undefined)
  }, [activeLayout, blockPlacement, currentLayer, editing, nextDraftKey, stageOps])

  const editableSelection = useMemo(
    () => selectedEntities.filter(entity => editableEntityId(entity.id)),
    [selectedEntities],
  )

  const stageMoveFromPanel = useCallback(() => {
    if (!editing || activeLayout === undefined || editableSelection.length === 0) return
    const dx = parseNumberField(moveDx)
    const dy = parseNumberField(moveDy)
    if (dx === undefined || dy === undefined || (dx === 0 && dy === 0)) return
    stageOps([stageMoveMany(nextDraftKey(), activeLayout.id, editableSelection.map(entity => entity.id), dx, dy)], 'select')
    setMoveDx('0')
    setMoveDy('0')
  }, [activeLayout, editing, editableSelection, moveDx, moveDy, nextDraftKey, stageOps])

  const stageRotateFromPanel = useCallback(() => {
    if (!editing || activeLayout === undefined || editableSelection.length === 0) return
    const angle = parseNumberField(rotateAngle)
    if (angle === undefined) return
    let box: ReturnType<typeof entityBounds>
    for (const entity of editableSelection) {
      const bounds = entityBounds(entity)
      if (bounds === undefined) continue
      box = box === undefined
        ? bounds
        : {
          min: [Math.min(box.min[0], bounds.min[0]), Math.min(box.min[1], bounds.min[1])],
          max: [Math.max(box.max[0], bounds.max[0]), Math.max(box.max[1], bounds.max[1])],
        }
    }
    if (box === undefined) return
    const center: EcadPoint = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2]
    stageOps([stageRotate(nextDraftKey(), activeLayout.id, editableSelection.map(entity => entity.id), center, angle)], 'select')
  }, [activeLayout, editing, editableSelection, nextDraftKey, rotateAngle, stageOps])

  const stageEraseSelection = useCallback(() => {
    if (!editing || activeLayout === undefined || selectedEntities.length === 0) return
    if (editableSelection.length === 0) {
      setNotice({ kind: 'warn', text: t('editFlattened') })
      return
    }
    stageOps([stageEraseMany(nextDraftKey(), activeLayout.id, editableSelection.map(entity => entity.id))], undefined)
    setSelected(current => current.filter(id => !editableSelection.some(entity => entity.id === id)))
  }, [activeLayout, editableSelection, editing, nextDraftKey, selectedEntities, stageOps, t])

  const stageTextChange = useCallback((entity: EcadEntity, text: string) => {
    if (!editing || activeLayout === undefined) return
    if (!editableEntityId(entity.id)) {
      setNotice({ kind: 'warn', text: t('editFlattened') })
      return
    }
    stageOps([stageSetText(nextDraftKey(), activeLayout.id, entity.id, text)], undefined)
  }, [activeLayout, editing, nextDraftKey, stageOps, t])

  const stageLayerChange = useCallback((entities: readonly EcadEntity[], layer: string) => {
    if (!editing || activeLayout === undefined || layer === '') return
    const editable = entities.filter(entity => editableEntityId(entity.id))
    if (editable.length === 0) {
      setNotice({ kind: 'warn', text: t('editFlattened') })
      return
    }
    stageOps(stageSetLayerMany(nextDraftKey(), activeLayout.id, editable.map(entity => entity.id), layer), undefined)
    if (editable.length < entities.length) setNotice({ kind: 'info', text: t('editFlattened') })
  }, [activeLayout, editing, nextDraftKey, stageOps, t])

  const stageColorChange = useCallback((entities: readonly EcadEntity[], color: number) => {
    if (!editing || activeLayout === undefined) return
    const editable = entities.filter(entity => editableEntityId(entity.id))
    if (editable.length === 0) {
      setNotice({ kind: 'warn', text: t('editFlattened') })
      return
    }
    // Prepared against the parallel engine change: until `setColor` is in the
    // engine's list the pane names the pending operation instead of staging a
    // draft the host would reject at apply time.
    if (!engineOpAvailable('setColor')) {
      reportPending('setColor')
      return
    }
    stageOps([stageSetColor(nextDraftKey(), activeLayout.id, editable.map(entity => entity.id), color)], undefined)
    if (editable.length < entities.length) setNotice({ kind: 'info', text: t('editFlattened') })
  }, [activeLayout, editing, nextDraftKey, reportPending, stageOps, t])

  const stageAttributeChange = useCallback((ownerId: string, tag: string, value: string) => {
    if (!editing || activeLayout === undefined) return
    stageOps([stageSetAttribute(nextDraftKey(), activeLayout.id, ownerId, tag, value)], undefined)
  }, [activeLayout, editing, nextDraftKey, stageOps])

  const removeStaged = useCallback((key: string) => {
    setDraft(current => draftRemove(current, key))
  }, [])
  const clearDraft = useCallback(() => {
    setDraft(current => draftClear(current))
    setPlacement(undefined)
    setBlockPlacement(undefined)
    cancelCommand()
  }, [cancelCommand])
  const undoDraft = useCallback(() => {
    setDraft(draftUndo)
    setCommandError(undefined)
  }, [])
  const redoDraft = useCallback(() => {
    setDraft(draftRedo)
    setCommandError(undefined)
  }, [])

  // -- command machine glue -------------------------------------------------
  const commandContext = useMemo((): CadCommandContext => ({
    layout: activeLayout?.id ?? '',
    ...(defaultAnnotationLayer === undefined ? {} : { layer: defaultAnnotationLayer }),
    selection: editableSelection.map(entity => entity.id),
    ...(displayModel?.blocks[0] === undefined ? {} : { block: displayModel.blocks[0].name }),
  }), [activeLayout, defaultAnnotationLayer, editableSelection, displayModel])

  const rejectKeyToMessage = useCallback((reasonKey: string): string => {
    if (reasonKey === 'commandNeedsPoints') return t('commandNeedsPoints', { count: 2 })
    const known = new Set([
      'commandNeedsSelection', 'commandNeedsBlock', 'commandNeedsPoint', 'commandNeedsRadius',
      'commandNeedsDistance', 'commandInvalidNumber', 'commandArcCollinear', 'commandUnknown', 'commandNoNumeric',
    ])
    return t(known.has(reasonKey) ? reasonKey : 'commandUnknown')
  }, [t])

  const applyCommandStep = useCallback((step: CadCommandStep) => {
    if (step.kind === 'rejected') {
      setCommandError(rejectKeyToMessage(step.reasonKey))
      return
    }
    if (step.kind === 'pending') {
      setCommand(step.command)
      setCommandError(undefined)
      return
    }
    if (step.kind === 'form') {
      if (step.form === 'text') {
        setPlacement({
          point: step.point,
          text: '',
          height: String(Number(defaultAnnotationHeight.toFixed(4))),
          layer: defaultAnnotationLayer ?? '',
        })
      } else {
        const blocks = displayModel?.blocks ?? []
        if (blocks.length === 0) {
          setNotice({ kind: 'warn', text: t('noBlocks') })
          return
        }
        setBlockPlacement({ point: step.point, block: blocks[0]?.name ?? '', rotation: '0', scale: '1' })
      }
      setTool('select')
      setCommand(undefined)
      return
    }
    // Complete: stage the supported operations, name the pending ones.
    const stagedOps: EcadStagedOp[] = []
    let pendingOp: string | undefined
    for (const item of step.ops) {
      if (engineOpAvailable(item.op)) {
        stagedOps.push({ key: nextDraftKey(), layout: activeLayout?.id ?? '', op: asEcadOp(item) })
      } else if (pendingOp === undefined) {
        pendingOp = item.op
      }
    }
    if (stagedOps.length > 0) commitOps(stagedOps)
    if (pendingOp !== undefined) reportPending(pendingOp)
    setCommand(step.command)
    setCommandError(undefined)
    setNumericText('')
  }, [activeLayout, commitOps, defaultAnnotationHeight, defaultAnnotationLayer, displayModel, nextDraftKey, rejectKeyToMessage, reportPending, t])

  const beginCommand = useCallback((next: CadToolId): CadCommand | undefined => {
    const started = commandStart(next)
    setCommand(started)
    setCommandError(undefined)
    setNumericText('')
    return started
  }, [])

  const finishCommand = useCallback(() => {
    if (command === undefined) return
    applyCommandStep(commandFinish(command, commandContext))
  }, [applyCommandStep, command, commandContext])

  const applyNumeric = useCallback(() => {
    if (command === undefined) return
    const value = parseNumberField(numericText)
    if (value === undefined) {
      setCommandError(t('commandInvalidNumber'))
      return
    }
    applyCommandStep(commandNumeric(command, value, commandContext))
  }, [applyCommandStep, command, commandContext, numericText, t])

  // -- pointer interaction --------------------------------------------------
  const localPoint = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const element = canvasElement
    if (element === null) return { x: 0, y: 0 }
    const rect = element.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }, [canvasElement])

  /** The cursor point with the drawing aids applied. */
  const assistedPoint = useCallback((screen: { x: number; y: number }, base: EcadPoint | undefined): { point: EcadPoint; snap: CadSnapResult | undefined } => {
    const raw = toWorld(screen, fit, view)
    let point: EcadPoint = raw
    let result: CadSnapResult | undefined
    if (aids.osnap) {
      try {
        result = snapNear(ensureIndex(), raw, snapRadius, {
          ...(aids.grid && grid !== undefined ? { includeGrid: true, grid: grid.step } : {}),
          locked: lockedLayers,
          // Screen-space projection turns on the intersection candidate and lets
          // its neighbourhood prefilter skip a sheet-wide pairwise search.
          project: candidate => toScreen(candidate, fit, view),
          screenRadius: SNAP_RADIUS_PX,
        })
      } catch {
        result = undefined
      }
      if (result !== undefined) point = result.point
    }
    if (aids.ortho && base !== undefined) point = orthoPoint(base, point) as EcadPoint
    return { point, snap: result }
  }, [aids.grid, aids.osnap, aids.ortho, ensureIndex, fit, grid, lockedLayers, snapRadius, view])

  const beginPan = useCallback((screen: { x: number; y: number }, pointerId: number, button: number): void => {
    gestureRef.current = { kind: 'pan', button, startX: screen.x, startY: screen.y, panX: view.panX, panY: view.panY, pointerId, moved: false }
    canvasElement?.setPointerCapture?.(pointerId)
    setPanning(true)
  }, [canvasElement, view.panX, view.panY])

  /** Open the context menu at one canvas point, clamped inside the sheet. */
  const openContextMenuAt = useCallback((screen: { x: number; y: number }) => {
    const maxX = Math.max(8, size.width - 220)
    const maxY = Math.max(8, size.height - (selected.length > 0 ? 340 : 300))
    setContextMenu({ x: Math.min(screen.x, maxX), y: Math.min(screen.y, maxY) })
    setCommandError(undefined)
  }, [selected.length, size.height, size.width])

  const pointForSnapPreview = useCallback((point: EcadPoint, result: CadSnapResult | undefined): void => {
    setCursorWorld(point)
    setSnap(result)
  }, [])

  const onPointerDown = useCallback((event: { button: number; clientX: number; clientY: number; pointerId: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; preventDefault: () => void; currentTarget: EventTarget | null }) => {
    const element = canvasElement
    if (element === null) return
    element.focus({ preventScroll: true })
    const screen = localPoint(event.clientX, event.clientY)
    // A menu opened by a previous right click gives way to the next press.
    suppressContextMenuRef.current = false
    // Middle-drag, right-drag and Space+left-drag all pan; a plain left-drag
    // is always a marquee (or a command pick, or a selection move in Edit mode).
    if (event.button === 1 || event.button === 2 || (event.button === 0 && (spaceHeldRef.current || tool === 'pan'))) {
      event.preventDefault()
      beginPan(screen, event.pointerId, event.button)
      return
    }
    if (event.button !== 0) return
    setContextMenu(undefined)
    const base = command?.points[command.points.length - 1]
    const { point } = assistedPoint(screen, base)
    // A double-click finishes a multi-point command instead of adding a point.
    const now = Date.now()
    const last = lastClickRef.current
    const isDouble = command !== undefined && last !== undefined && now - last.time < DOUBLE_CLICK_MS
      && Math.abs(last.x - screen.x) < DOUBLE_CLICK_PX && Math.abs(last.y - screen.y) < DOUBLE_CLICK_PX
    lastClickRef.current = { time: now, x: screen.x, y: screen.y }
    if (isDouble) {
      lastClickRef.current = undefined
      finishCommand()
      return
    }
    // A grip is the most specific target: in edit mode, pressing a selected
    // entity's grip starts a point edit instead of a selection or a whole-entity
    // move.
    if (editing && selectedEntities.length > 0) {
      for (const entity of selectedEntities) {
        for (const grip of gripsOf(entity)) {
          const gripScreen = toScreen(grip.point, fit, view)
          if (Math.hypot(gripScreen[0] - screen.x, gripScreen[1] - screen.y) > GRIP_HIT_PX) continue
          gestureRef.current = { kind: 'grip', entityId: entity.id, grip, original: grip.point, pointerId: event.pointerId, moved: false, point: grip.point }
          canvasElement?.setPointerCapture?.(event.pointerId)
          setGripDrag({ entityId: entity.id, grip, original: grip.point, point: grip.point })
          return
        }
      }
    }
    if (tool === 'select') {
      const hit = pickEntity(ensureIndex(), point, pickTolerance, { locked: lockedLayers })
      if (hit !== undefined) {
        const additive = event.shiftKey || event.ctrlKey || event.metaKey
        const mode2 = event.ctrlKey || event.metaKey ? 'toggle' : event.shiftKey ? 'add' : 'replace'
        const already = selected.includes(hit)
        setSelected(current => (additive ? (mode2 === 'add' ? [...current, ...(current.includes(hit) ? [] : [hit])] : current.filter(id => id !== hit).concat(current.includes(hit) ? [] : [hit])) : [hit]))
        // Edit mode drags an already-selected primitive: this is the only
        // left-drag that moves something instead of drawing a marquee.
        if (editing && !additive && already) {
          gestureRef.current = { kind: 'moveDrag', startWorld: point, ids: [...selected], pointerId: event.pointerId, moved: false, dx: 0, dy: 0 }
          canvasElement?.setPointerCapture?.(event.pointerId)
        }
        return
      }
      gestureRef.current = { kind: 'marquee', start: screen, pointerId: event.pointerId, moved: false, additive: event.shiftKey || event.ctrlKey, toggle: event.ctrlKey || event.metaKey }
      canvasElement?.setPointerCapture?.(event.pointerId)
      setMarquee({ box: screenBoxOfPoints(screen, screen), mode: 'window' })
      return
    }
    if (tool === 'zoomWindow') {
      gestureRef.current = { kind: 'zoomWindow', start: screen, pointerId: event.pointerId, moved: false }
      canvasElement?.setPointerCapture?.(event.pointerId)
      setZoomBox(screenBoxOfPoints(screen, screen))
      return
    }
    if (tool === 'text') {
      setPlacement({
        point,
        text: '',
        height: String(Number(defaultAnnotationHeight.toFixed(4))),
        layer: defaultAnnotationLayer ?? '',
      })
      return
    }
    if (tool === 'block') {
      const blocks = displayModel?.blocks ?? []
      if (blocks.length === 0) {
        setNotice({ kind: 'warn', text: t('noBlocks') })
        return
      }
      setBlockPlacement({ point, block: blocks[0]?.name ?? '', rotation: '0', scale: '1' })
      return
    }
    if (tool === 'erase' || tool === 'trim' || tool === 'extend') {
      const hit = pickEntity(ensureIndex(), point, pickTolerance, { locked: lockedLayers })
      if (hit === undefined) return
      const entity = activeLayout?.entities.find(candidate => candidate.id === hit)
      if (entity === undefined || activeLayout === undefined) return
      if (!editableEntityId(entity.id)) {
        setNotice({ kind: 'warn', text: t('editFlattened') })
        return
      }
      if (tool === 'erase') {
        stageOps([stageEraseMany(nextDraftKey(), activeLayout.id, [entity.id])], undefined)
        setSelected(current => current.filter(id => id !== entity.id))
        return
      }
      // The engine cuts/extends a LINE against another LINE, so the selected
      // boundary line is the second operand and the clicked line is the target.
      const boundary = editableSelection[0]?.id
      if (boundary === undefined) {
        setCommandError(t('commandTrimNeedsBoundary'))
        return
      }
      if (boundary === hit) {
        setCommandError(t('commandTrimSame'))
        return
      }
      const key = nextDraftKey()
      if (tool === 'trim') stageOps([stageTrim(key, activeLayout.id, hit, boundary, point)], undefined)
      else stageOps([stageExtend(key, activeLayout.id, hit, boundary)], undefined)
      return
    }
    // Armed point commands (draw and modify).
    const started = command ?? commandStart(tool)
    if (started === undefined) return
    setCommand(started)
    applyCommandStep(commandClick(started, point, commandContext))
  }, [activeLayout, applyCommandStep, assistedPoint, beginPan, canvasElement, command, commandContext, defaultAnnotationHeight, defaultAnnotationLayer, displayModel, editableSelection, editing, ensureIndex, finishCommand, fit, localPoint, lockedLayers, nextDraftKey, pickTolerance, selected, selectedEntities, stageOps, t, tool, view])

  const onPointerMove = useCallback((event: { clientX: number; clientY: number; pointerId: number }) => {
    const element = canvasElement
    if (element === null) return
    const screen = localPoint(event.clientX, event.clientY)
    const gesture = gestureRef.current
    if (gesture !== undefined) {
      if (gesture.kind === 'pan') {
        const dx = screen.x - gesture.startX
        const dy = screen.y - gesture.startY
        if (!gesture.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
        gesture.moved = true
        setView(current => ({ zoom: current.zoom, panX: gesture.panX + dx, panY: gesture.panY + dy }))
        return
      }
      if (gesture.kind === 'marquee') {
        const dx = screen.x - gesture.start.x
        const dy = screen.y - gesture.start.y
        if (!gesture.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
        gesture.moved = true
        setMarquee(marqueeOf(gesture.start, screen))
        setCursorWorld(toWorld(screen, fit, view))
        return
      }
      if (gesture.kind === 'zoomWindow') {
        const dx = screen.x - gesture.start.x
        const dy = screen.y - gesture.start.y
        if (!gesture.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
        gesture.moved = true
        setZoomBox(screenBoxOfPoints(gesture.start, screen))
        return
      }
      if (gesture.kind === 'moveDrag') {
        const { point } = assistedPoint(screen, gesture.startWorld)
        const dx = roundValue(point[0] - gesture.startWorld[0])
        const dy = roundValue(point[1] - gesture.startWorld[1])
        if (!gesture.moved && Math.abs(dx) === 0 && Math.abs(dy) === 0) return
        gesture.moved = true
        gesture.dx = dx
        gesture.dy = dy
        setDragGhost({ ids: gesture.ids, dx, dy })
        setCursorWorld(point)
        return
      }
      if (gesture.kind === 'grip') {
        const { point } = assistedPoint(screen, gesture.original)
        gesture.moved = true
        gesture.point = point
        setGripDrag({ entityId: gesture.entityId, grip: gesture.grip, original: gesture.original, point })
        setCursorWorld(point)
        return
      }
    }
    const base = command?.points[command.points.length - 1]
    const { point, snap: result } = assistedPoint(screen, base)
    pointForSnapPreview(point, result)
    if (command !== undefined) setCommand(current => (current === undefined ? current : commandHover(current, point)))
  }, [assistedPoint, canvasElement, command, fit, localPoint, pointForSnapPreview, view])

  const dispatchGrip = useCallback((entityId: string, grip: CadGrip, original: EcadPoint, point: EcadPoint) => {
    const entity = activeLayout?.entities.find(candidate => candidate.id === entityId)
    if (entity === undefined || activeLayout === undefined) return
    const request = gripRequestFor(entity, grip, point)
    if (request.kind === 'move') {
      if (request.dx === 0 && request.dy === 0) return
      stageOps([stageMoveMany(nextDraftKey(), activeLayout.id, [entityId], request.dx, request.dy)], undefined)
      setNotice({ kind: 'info', text: t('gripMoveStaged', { dx: request.dx, dy: request.dy }) })
      return
    }
    if (engineOpAvailable(request.op)) {
      stageOps([{ key: nextDraftKey(), layout: activeLayout.id, op: asEcadOp({ op: request.op, layout: activeLayout.id, ...request.payload }) }], undefined)
      return
    }
    setNotice({ kind: 'warn', text: t('gripOpPending', { op: request.op }) })
    void original
  }, [activeLayout, nextDraftKey, stageOps, t])

  const onPointerUp = useCallback((event: { pointerId: number; clientX: number; clientY: number; button: number }) => {
    const element = canvasElement
    const screen = localPoint(event.clientX, event.clientY)
    const gesture = gestureRef.current
    gestureRef.current = undefined
    if (element !== null) {
      try {
        element.releasePointerCapture(event.pointerId)
      } catch {
        // The capture was already released (pointercancel); nothing to do.
      }
    }
    if (gesture === undefined) return
    if (gesture.kind === 'pan') {
      setPanning(false)
      if (gesture.button === 2) {
        if (gesture.moved) {
          // A right-drag pans; the context menu it would otherwise raise is
          // swallowed by the handler below.
          suppressContextMenuRef.current = true
        } else {
          openContextMenuAt(screen)
        }
      }
      return
    }
    if (gesture.kind === 'marquee') {
      setMarquee(undefined)
      if (gesture.moved) {
        const next = marqueeOf(gesture.start, screen)
        const ids = marqueeSelect(ensureIndex(), next, fit, view, { locked: lockedLayers })
        setSelected(current => {
          if (gesture.additive) {
            let result = [...current]
            for (const id of ids) {
              if (gesture.toggle && result.includes(id)) result = result.filter(candidate => candidate !== id)
              else if (!result.includes(id)) result.push(id)
            }
            return result
          }
          return ids
        })
      } else if (!gesture.additive) {
        setSelected([])
      }
      return
    }
    if (gesture.kind === 'zoomWindow') {
      setZoomBox(undefined)
      if (!gesture.moved) return
      const box = screenBoxOfPoints(gesture.start, screen)
      setView(current => viewForBox(box, fit, current, Math.max(size.width, 1), Math.max(size.height, 1), 16))
      return
    }
    if (gesture.kind === 'moveDrag') {
      setDragGhost(undefined)
      if (gesture.moved && activeLayout !== undefined && (gesture.dx !== 0 || gesture.dy !== 0)) {
        stageOps([stageMoveMany(nextDraftKey(), activeLayout.id, gesture.ids, gesture.dx, gesture.dy)], undefined)
      }
      return
    }
    if (gesture.kind === 'grip') {
      setGripDrag(undefined)
      if (gesture.moved) dispatchGrip(gesture.entityId, gesture.grip, gesture.original, gesture.point)
      return
    }
  }, [activeLayout, canvasElement, dispatchGrip, ensureIndex, fit, localPoint, lockedLayers, nextDraftKey, openContextMenuAt, size.height, size.width, stageOps, view])

  const onContextMenu = useCallback((event: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }) => {
    // The browser menu never appears on the canvas; the pane's own menu is
    // opened by the right press/release, not by a right-drag.
    event.preventDefault()
    event.stopPropagation()
    if (suppressContextMenuRef.current) {
      suppressContextMenuRef.current = false
      return
    }
    openContextMenuAt(localPoint(event.clientX, event.clientY))
  }, [localPoint, openContextMenuAt])

  const askSelection = useCallback(() => {
    if (selectedEntities.length === 0) return
    const kinds = [...new Set(selectedEntities.map(entity => entity.k))].join(', ')
    const layers = [...new Set(selectedEntities.map(entity => entity.layer))].join(', ')
    const ids = selectedEntities.slice(0, 8).map(entity => entity.id).join(', ')
    const told = ask(resourceAddress, t('askSelection', {
      count: selectedEntities.length,
      kinds,
      layers,
      ids,
      format: formatLabel,
      path: pathOf(resourceAddress),
    }))
    setChatUnavailable(!told)
  }, [ask, formatLabel, resourceAddress, selectedEntities, t])

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

  // -- sheet workflow -------------------------------------------------------
  const fileStem = useMemo(() => {
    const path = pathOf(resourceAddress)
    const name = path.split('/').pop() ?? 'drawing'
    return name.replace(/\.[^.]+$/u, '') || 'drawing'
  }, [resourceAddress])
  const sheetLabel = useMemo(() => {
    if (scene === undefined) return ''
    const width = scene.bounds.max[0] - scene.bounds.min[0]
    const height = scene.bounds.max[1] - scene.bounds.min[1]
    const unit = displayModel === undefined ? undefined : unitLabel(displayModel.units)
    return t('statusSheet', { width: fmt(width), height: fmt(height), unit: unit ?? '' })
  }, [displayModel, scene, t])
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
    } catch {
      setNotice({ kind: 'error', text: t('exportFailed') })
    }
  }, [t])
  const exportSvg = useCallback(() => {
    if (scene === undefined || displayModel === undefined) return
    try {
      const svg = svgDocumentOf(scene, fit, view, {
        title: t('exportSvgTitle', { path: pathOf(resourceAddress), layout: activeLayout?.name ?? '' }),
        width: Math.max(1, Math.round(size.width)),
        height: Math.max(1, Math.round(size.height)),
      })
      downloadText(`${t('exportName', { name: fileStem, layout: activeLayout?.id ?? 'Model' })}.svg`, svg, 'image/svg+xml')
    } catch {
      setNotice({ kind: 'error', text: t('exportFailed') })
    }
  }, [activeLayout, displayModel, downloadText, fileStem, fit, resourceAddress, scene, size.height, size.width, t, view])
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
        } catch {
          URL.revokeObjectURL(url)
          setNotice({ kind: 'error', text: t('exportFailed') })
        }
      }
      image.onerror = () => {
        URL.revokeObjectURL(url)
        setNotice({ kind: 'error', text: t('exportFailed') })
      }
      image.src = url
    } catch {
      setNotice({ kind: 'error', text: t('exportFailed') })
    }
  }, [activeLayout, fileStem, fit, resourceAddress, scene, size.height, size.width, t, view])

  // -- context menu items ----------------------------------------------------
  const menuItems = useMemo((): readonly CadMenuItem[] => {
    if (contextMenu === undefined) return []
    const hasSelection = selected.length > 0
    return [
      { id: 'selectAll', label: t('selectAll'), shortcut: 'Ctrl+A', disabled: pickableEntities.length === 0, onSelect: selectAll },
      { id: 'zoomExtents', label: t('menuZoomExtents'), shortcut: 'F', onSelect: fitView },
      { id: 'zoomWindow', label: t('menuZoomWindow'), shortcut: 'Z', onSelect: () => { chooseTool('zoomWindow') } },
      { id: 'pan', label: t('toolPan'), shortcut: 'H', onSelect: () => { chooseTool('pan') } },
      { id: 'move', label: t('menuMove'), shortcut: 'M', disabled: !editing || !hasSelection, separatorBefore: true, onSelect: () => { chooseTool('move') } },
      { id: 'copy', label: t('menuCopy'), shortcut: 'Y', disabled: !editing || !hasSelection, onSelect: () => { chooseTool('copy') } },
      { id: 'erase', label: t('menuErase'), shortcut: 'Del', disabled: !editing || !hasSelection, onSelect: stageEraseSelection },
      { id: 'properties', label: t('menuProperties'), disabled: !hasSelection, separatorBefore: true, onSelect: () => { panelsTouchedRef.current = true; setPanelsOpen(true) } },
      { id: 'ask', label: t('menuAskSelection'), disabled: !hasSelection, onSelect: askSelection },
      { id: 'print', label: t('menuPrint'), disabled: state.phase !== 'ready', separatorBefore: true, onSelect: printSheet },
      { id: 'exportSvg', label: t('menuExportSvg'), disabled: state.phase !== 'ready', onSelect: exportSvg },
    ]
  }, [askSelection, chooseTool, contextMenu, editing, exportSvg, fitView, pickableEntities.length, printSheet, selectAll, selected.length, stageEraseSelection, state.phase, t])

  const dismissOutcome = useCallback(() => {
    setOutcome(undefined)
  }, [])
  const backToSource = useCallback(() => {
    setWritten(undefined)
    setSelected([])
    setLayoutId(undefined)
    setView({ zoom: 1, panX: 0, panY: 0 })
    setOutcome(current => (current?.kind === 'applied' ? { ...current, showingWritten: false } : current))
  }, [])
  const openWritten = useCallback(() => {
    if (writtenCandidate === undefined) return
    setWritten(writtenCandidate)
    setSelected([])
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
      setDraft(draftReset())
      setPlacement(undefined)
      setBlockPlacement(undefined)
      cancelCommand()
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
  }, [apply, applying, cancelCommand, editable, resourceAddress, staged, summary, t])

  // A composition that turns writes off (a reload with the switch closed) must
  // not keep an edit surface that cannot be applied.
  useEffect(() => {
    if (!editable && mode === 'edit') setMode('view')
  }, [editable, mode])

  // A tool that needs writes is disarmed when the mode leaves edit.
  useEffect(() => {
    if (editing) return
    const spec = toolOf(tool)
    if (spec?.writes === true) {
      setTool('select')
      cancelCommand()
    }
  }, [cancelCommand, editing, tool])

  // The placement form lives in the side panel; a placement opens that panel so
  // the form is visible at any pane width.
  useEffect(() => {
    if ((placement === undefined && blockPlacement === undefined) || panelsOpen) return
    panelsTouchedRef.current = true
    setPanelsOpen(true)
  }, [blockPlacement, panelsOpen, placement])

  // Escape cancels a pending placement, the context menu and an armed command
  // even while focus is in a field: the sheet's own key handler cannot see it.
  useEffect(() => {
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setContextMenu(undefined)
      setPlacement(undefined)
      setBlockPlacement(undefined)
      setNotice(undefined)
      setMarquee(undefined)
      setZoomBox(undefined)
      if (command !== undefined) cancelCommand()
    }
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('keydown', onEscape)
    }
  }, [cancelCommand, command])

  // Space held for panning must release even when the pointer leaves the pane.
  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key !== ' ' && event.code !== 'Space') return
      spaceHeldRef.current = false
      setSpaceDown(false)
    }
    const onBlur = (): void => {
      spaceHeldRef.current = false
      setSpaceDown(false)
    }
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // -- keyboard -------------------------------------------------------------
  const onKeyDown = useCallback((event: { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; preventDefault: () => void }) => {
    const key = event.key
    const commandModifier = event.ctrlKey || event.metaKey
    if (commandModifier) {
      if (key === 'z' || key === 'Z') {
        event.preventDefault()
        if (event.shiftKey) redoDraft()
        else undoDraft()
        return
      }
      if (key === 'y' || key === 'Y') {
        event.preventDefault()
        redoDraft()
        return
      }
      if (key === 'a' || key === 'A') {
        event.preventDefault()
        selectAll()
        return
      }
      return
    }
    switch (key) {
      case 'Escape':
        event.preventDefault()
        if (contextMenu !== undefined) {
          setContextMenu(undefined)
        } else if (placement !== undefined || blockPlacement !== undefined) {
          setPlacement(undefined)
          setBlockPlacement(undefined)
          setTool('select')
        } else if (command !== undefined) {
          cancelCommand()
          setTool('select')
        } else if (gripDrag !== undefined) {
          setGripDrag(undefined)
        } else {
          setSelected([])
          setSnap(undefined)
        }
        return
      case 'Delete':
      case 'Backspace':
        if (editing && selected.length > 0) {
          event.preventDefault()
          stageEraseSelection()
        }
        return
      case 'Enter':
        if (command !== undefined) {
          event.preventDefault()
          finishCommand()
          return
        }
        if (editing && tool === 'text' && placement === undefined) {
          event.preventDefault()
          setPlacement({
            point: toWorld({ x: size.width / 2, y: size.height / 2 }, fit, view),
            text: '',
            height: String(Number(defaultAnnotationHeight.toFixed(4))),
            layer: defaultAnnotationLayer ?? '',
          })
        }
        return
      case 'F3':
        event.preventDefault()
        setAids(current => ({ ...current, osnap: !current.osnap }))
        return
      case 'F7':
        event.preventDefault()
        setAids(current => ({ ...current, grid: !current.grid }))
        return
      case 'F8':
        event.preventDefault()
        setAids(current => ({ ...current, ortho: !current.ortho }))
        return
      case ' ':
      case 'Spacebar':
        event.preventDefault()
        spaceHeldRef.current = true
        setSpaceDown(true)
        return
      case 'ArrowLeft':
        event.preventDefault()
        applyView(current => ({ ...current, panX: current.panX + PAN_STEP }))
        return
      case 'ArrowRight':
        event.preventDefault()
        applyView(current => ({ ...current, panX: current.panX - PAN_STEP }))
        return
      case 'ArrowUp':
        event.preventDefault()
        applyView(current => ({ ...current, panY: current.panY + PAN_STEP }))
        return
      case 'ArrowDown':
        event.preventDefault()
        applyView(current => ({ ...current, panY: current.panY - PAN_STEP }))
        return
      case '+':
      case '=':
        event.preventDefault()
        zoomBy(1.3)
        return
      case '-':
      case '_':
        event.preventDefault()
        zoomBy(1 / 1.3)
        return
      default: {
        const shortcut = toolForShortcut(key)
        if (shortcut !== undefined) {
          event.preventDefault()
          chooseTool(shortcut)
        }
      }
    }
  }, [applyView, blockPlacement, cancelCommand, chooseTool, command, contextMenu, defaultAnnotationHeight, defaultAnnotationLayer, editing, finishCommand, fit, gripDrag, placement, redoDraft, selectAll, selected.length, size.height, size.width, stageEraseSelection, t, tool, undoDraft, view, zoomBy])

  // -- preview geometry -----------------------------------------------------
  const previewElements = useMemo((): readonly CadPreviewElement[] => {
    if (gripDrag !== undefined) {
      return [{ kind: 'line', a: gripDrag.original, b: gripDrag.point }]
    }
    if (command === undefined || command.points.length === 0) return []
    const cursor = command.cursor
    if (cursor === undefined) return []
    const points = command.points
    const first = points[0] as EcadPoint
    switch (command.tool) {
      case 'line':
      case 'polyline':
      case 'leader':
      case 'revisionCloud': {
        const path: EcadPoint[] = [...points, cursor]
        return path.length >= 2 ? [{ kind: 'polyline', points: path }] : []
      }
      case 'rectangle':
        return [{ kind: 'rect', a: first, b: cursor }]
      case 'circle': {
        const radius = Math.hypot(cursor[0] - first[0], cursor[1] - first[1])
        return radius > 0 ? [{ kind: 'circle', c: first, r: radius }] : []
      }
      case 'arc': {
        if (points.length < 2) return [{ kind: 'line', a: first, b: cursor }]
        const second = points[1] as EcadPoint
        const arc = arcThroughPoints(first, second, cursor)
        return arc === undefined ? [{ kind: 'polyline', points: [first, second, cursor] }] : [{ kind: 'arc', c: arc.center, r: arc.radius, a0: arc.a0, a1: arc.a1 }]
      }
      case 'move':
      case 'copy':
      case 'mirror':
        return [{ kind: 'line', a: first, b: cursor }]
      case 'rotate':
        return [{ kind: 'line', a: first, b: cursor }]
      case 'scale':
      case 'offset':
        return [{ kind: 'line', a: first, b: cursor }]
      case 'trim':
      case 'extend':
        return [{ kind: 'line', a: first, b: cursor }]
      default:
        return []
    }
  }, [command, gripDrag])

  const grips = useMemo((): readonly CadGrip[] => {
    if (!editing) return []
    const result: CadGrip[] = []
    for (const entity of selectedEntities) {
      for (const grip of gripsOf(entity)) {
        result.push(grip)
        if (result.length >= 200) return result
      }
    }
    return result
  }, [editing, selectedEntities])

  const snapLabel = snap === undefined ? undefined
    : snap.kind === 'endpoint' ? t('snapEndpoint')
      : snap.kind === 'intersection' ? t('snapIntersection')
        : snap.kind === 'midpoint' ? t('snapMidpoint')
          : snap.kind === 'center' ? t('snapCenter')
            : snap.kind === 'nearest' ? t('snapNearest')
              : t('snapGrid')

  const layouts = displayModel?.layouts ?? []
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
            setSelected([])
            setView({ zoom: 1, panX: 0, panY: 0 })
            cancelCommand()
            setTool('select')
          },
        },
        layout.kind === 'model' ? t('modelSpace') : layout.name,
        createElement('span', { className: css.tabCount }, String(layout.entities.length)),
      )),
    )
    : null

  const sheetUnit = displayModel === undefined ? undefined : unitLabel(displayModel.units)
  const printMeta = t('printFooter', {
    format: formatLabel,
    width: scene === undefined ? '' : fmt(scene.bounds.max[0] - scene.bounds.min[0]),
    height: scene === undefined ? '' : fmt(scene.bounds.max[1] - scene.bounds.min[1]),
    unit: sheetUnit ?? '',
    selection: t('selectionCount', { count: selected.length }),
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
      createElement(ToolPalette, { t, active: tool, editing, editable, onPick: chooseTool }),
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
            title: spaceDown ? t('toolPanHint') : `${t('panHint')} · ${t('keyboardHint')}`,
            style: {
              cursor: panning ? 'grabbing'
                : spaceDown || tool === 'pan' ? 'grab'
                  : tool === 'select' ? 'default'
                    : 'crosshair',
            },
            onKeyDown,
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel: onPointerUp,
            onContextMenu,
            'data-ecad-tool': tool,
          },
          createElement(SceneView, {
            scene,
            fit,
            view,
            label: canvasLabel,
            width: Math.max(1, size.width),
            height: Math.max(1, size.height),
            selectedIds: selected,
            fadedIds: preview.erases,
            ghostMoves: allGhostMoves,
            ghostTexts,
            pendingPoint,
            marquee,
            zoomBox,
            grid,
            grips,
            activeGripKey: gripDrag?.grip.key,
            gripPreview: gripDrag === undefined ? undefined : [gripDrag.original, gripDrag.point],
            snap: snap === undefined || snapLabel === undefined ? undefined : { point: snap.point, kind: snap.kind, label: snapLabel },
            preview: previewElements,
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
          notice === undefined ? null : createElement(CadNoticeView, { t, notice, onDismiss: () => { setNotice(undefined) } }),
          contextMenu === undefined ? null : createElement(ContextMenu, {
            t,
            x: contextMenu.x,
            y: contextMenu.y,
            items: menuItems,
            onClose: () => { setContextMenu(undefined) },
          }),
        ),
        createElement(CadStatusBar, {
          t,
          cursor: cursorWorld,
          selectionCount: selected.length,
          snapKind: snap?.kind,
          osnap: aids.osnap,
          ortho: aids.ortho,
          grid: aids.grid,
          sheet: sheetLabel,
          onToggleOsnap: () => { setAids(current => ({ ...current, osnap: !current.osnap })) },
          onToggleOrtho: () => { setAids(current => ({ ...current, ortho: !current.ortho })) },
          onToggleGrid: () => { setAids(current => ({ ...current, grid: !current.grid })) },
        }),
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
        editing || outcome !== undefined
          ? createElement(DraftPanel, {
            t,
            staged,
            counts,
            hint: draftHint,
            placement: editing ? placement : undefined,
            layers: placementLayers,
            invalidHeight: placement !== undefined && (parseNumberField(placement.height) === undefined || (parseNumberField(placement.height) ?? 0) <= 0),
            onPlacementChange: (field, value) => {
              setPlacement(current => (current === undefined ? current : { ...current, [field]: value }))
            },
            onStagePlacement: stagePlacement,
            onCancelPlacement: () => { setPlacement(undefined); setTool('select') },
            blockPlacement: editing ? blockPlacement : undefined,
            blocks: (displayModel?.blocks ?? []).map(block => block.name),
            onBlockChange: (field, value) => {
              setBlockPlacement(current => (current === undefined ? current : { ...current, [field]: value }))
            },
            onStageBlock: stageBlock,
            onCancelBlock: () => { setBlockPlacement(undefined); setTool('select') },
            onRemove: removeStaged,
            outcome,
            onDismissOutcome: dismissOutcome,
            onOpenWritten: openWritten,
            onBackToSource: backToSource,
          })
          : null,
        createElement(CadLayersPanel, {
          t,
          model: displayModel ?? state.model,
          layoutEntities: activeLayout?.entities ?? [],
          hidden,
          locked: lockedLayers,
          current: currentLayer,
          editing,
          onToggle: (name) => { toggleLayer(name) },
          onShowAll: () => { showAllLayers() },
          onHideAll: () => { hideAllLayers() },
          onLock: (name) => { toggleLayerLock(name) },
          onCurrent: (name) => { setCurrentLayer(name) },
          onCreateLayer: (name, color) => {
            commitOps([stageAddLayer(nextDraftKey(), name, color)])
            return undefined
          },
          onRenameLayer: (from, to) => {
            commitOps([stageRenameLayer(nextDraftKey(), from, to)])
            return undefined
          },
          onSetLayerColor: (name, color) => {
            commitOps([stageSetLayerColor(nextDraftKey(), name, color)])
            return undefined
          },
        }),
        createElement(PropertiesPanel, {
          t,
          entities: selectedEntities,
          model: displayModel ?? state.model,
          editing,
          moveDx,
          moveDy,
          rotateAngle,
          onMoveDx: setMoveDx,
          onMoveDy: setMoveDy,
          onRotateAngle: setRotateAngle,
          onStageMove: stageMoveFromPanel,
          onStageRotate: stageRotateFromPanel,
          onStageErase: stageEraseSelection,
          onStageText: stageTextChange,
          onStageLayer: stageLayerChange,
          onStageColor: stageColorChange,
          onStageAttribute: stageAttributeChange,
          onAsk: () => {
            if (selectedOne !== undefined) askEntity(selectedOne)
            else askSelection()
          },
          onClear: clearSelection,
        }),
        createElement(SheetSection, {
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
      ...(editing ? { 'data-ecad-mode': mode } : {}),
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
      writes: writesAuthoritative,
      editable,
      mode,
      onModeChange: changeMode,
      panelsOpen,
      chatUnavailable,
      aids,
      onToggleAid: (aid: keyof CadAidState) => { setAids(current => ({ ...current, [aid]: !current[aid] })) },
      canUndo: draftCanUndo(draft),
      canRedo: draftCanRedo(draft),
      onUndo: undoDraft,
      onRedo: redoDraft,
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
      t,
    }),
    layoutTabs,
    editing
      ? createElement(CommandBar, {
        t,
        tool,
        points: command?.points.length ?? 0,
        numeric: numericText,
        onNumeric: setNumericText,
        onApplyNumeric: applyNumeric,
        onCancel: () => {
          cancelCommand()
          setTool('select')
        },
        error: commandError,
      })
      : null,
    editing
      ? createElement(EditBar, {
        t,
        tool: tool === 'text' ? 'text' : undefined,
        onToggleText: () => {
          chooseTool(tool === 'text' ? 'select' : 'text')
        },
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

/**
 * The circle through three points, with the arc swept from the first to the
 * third through the second. Re-exported through the body for the preview.
 * @param a - arc start.
 * @param b - a point on the arc.
 * @param c - arc end.
 * @returns the circle and angles, or undefined when the points are collinear.
 */
function arcThroughPoints(a: EcadPoint, b: EcadPoint, c: EcadPoint): { readonly center: EcadPoint; readonly radius: number; readonly a0: number; readonly a1: number } | undefined {
  // Local implementation keeps the preview independent of the command machine's
  // rounding; the command machine owns the op's own arc-through maths.
  const ax = a[0]; const ay = a[1]
  const bx = b[0]; const by = b[1]
  const cx = c[0]; const cy = c[1]
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  if (Math.abs(d) < 1e-12) return undefined
  const a2 = ax * ax + ay * ay
  const b2 = bx * bx + by * by
  const c2 = cx * cx + cy * cy
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d
  const radius = Math.hypot(ax - ux, ay - uy)
  const angleOf = (point: EcadPoint): number => Math.atan2(point[1] - uy, point[0] - ux)
  const start = angleOf(a)
  const normalise = (value: number): number => ((value % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  let sweep = normalise(angleOf(c) - start)
  if (normalise(angleOf(b) - start) > sweep) sweep -= Math.PI * 2
  return { center: [ux, uy], radius, a0: start, a1: start + sweep }
}
