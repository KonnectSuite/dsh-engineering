/**
 * The edit model of the drawing pane: what a staged operation is, how a click on
 * the sheet becomes drawing coordinates, and what the pane previews before the
 * host writes anything.
 *
 * Everything here is pure. The React body owns the pointer and the form state;
 * this module owns the geometry of placing, moving and erasing, so the same
 * functions are what the node tests judge without a browser.
 *
 * The face never writes a file: it stages `EcadOp` values from
 * `packages/ecad/src/engine/types.ts`, and `ctx.remote.ecad.apply` is the only
 * writer. The ops this module builds are the three the M4 pane offers—`addText`,
 * `move` and `erase`—and every one of them names a layout id and entity ids that
 * came from the sheet model the service returned.
 *
 * @module dsh-engineering-ecad/client/edits
 */

import type { EcadBox, EcadEntity, EcadLayout, EcadOp, EcadSheetModel } from '../engine/types.ts'
import type { EcadFit } from './scene.ts'

/** The pane's pan and zoom on top of the fitted drawing. */
export interface EcadEditView {
  readonly zoom: number
  readonly panX: number
  readonly panY: number
}

/** One staged operation plus the client-side identity the list needs. */
export interface EcadStagedOp {
  /** Stable per-session key; the entity ids the op names are not unique per op. */
  readonly key: string
  readonly op: EcadOp
  /** Layout id the op targets. */
  readonly layout: string
}

/** One staged operation's kind, for the list and the tests. */
export interface EcadDraftCounts {
  readonly addText: number
  readonly move: number
  readonly erase: number
}

/** What the canvas overlays while a draft is staged. */
export interface EcadDraftPreview {
  /** Text annotations to draw as ghosts. */
  readonly adds: readonly {
    readonly key: string
    readonly point: readonly [number, number]
    readonly text: string
    readonly height: number
    readonly rotation: number
    readonly layer: string | undefined
  }[]
  /** Entity offsets to draw as ghosts, keyed by the entity they move. */
  readonly moves: readonly {
    readonly key: string
    readonly id: string
    readonly delta: readonly [number, number]
  }[]
  /** Entities an `erase` op removes; the sheet fades them until the draft is applied. */
  readonly erases: ReadonlySet<string>
}

/**
 * The world point under one screen point, through the fit and the user's view.
 *
 * The rendered transform is `translate(pan) scale(zoom)` around
 * `translate(fit.t) scale(s, -s)`, so inverting it is: draw coordinates from
 * the screen point, then undo the Y flip.
 *
 * @param screen - point in the canvas element's CSS pixels.
 * @param fit - the fitted transform.
 * @param view - the user's pan and zoom.
 * @returns the point in drawing units.
 */
export function worldAt(
  screen: { readonly x: number; readonly y: number },
  fit: EcadFit,
  view: EcadEditView,
): readonly [number, number] {
  const scale = fit.scale * view.zoom
  if (!Number.isFinite(scale) || scale === 0) return [0, 0]
  const fittedX = (screen.x - view.panX) / view.zoom
  const fittedY = (screen.y - view.panY) / view.zoom
  return [roundCoord((fittedX - fit.translateX) / fit.scale), roundCoord((fit.translateY - fittedY) / fit.scale)]
}

/**
 * The drawing-unit delta of a screen drag.
 * @param delta - pixels moved on the canvas.
 * @param fit - the fitted transform.
 * @param view - the user's pan and zoom.
 * @returns the world delta; dragging down the screen lowers world Y.
 */
export function worldDelta(
  delta: { readonly x: number; readonly y: number },
  fit: EcadFit,
  view: EcadEditView,
): readonly [number, number] {
  const scale = fit.scale * view.zoom
  if (!Number.isFinite(scale) || scale === 0) return [0, 0]
  return [roundCoord(delta.x / scale), roundCoord(-delta.y / scale)]
}

/**
 * Round a drawing coordinate for an op, so a stage does not carry float noise.
 * @param value - coordinate in drawing units.
 * @returns the value at six decimals; `-0` is normalised to `0`.
 */
export function roundCoord(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000
  return Object.is(rounded, -0) ? 0 : rounded
}

/**
 * Whether an entity can be named directly by an edit op.
 *
 * The sheet model flattens block content and suffixes those ids with `/`; the
 * engine refuses such ids because the geometry belongs to the block definition.
 * @param id - entity id as the sheet model carries it.
 * @returns true when the id can be edited in place.
 */
export function editableEntityId(id: string): boolean {
  return id.length > 0 && !id.includes('/')
}

/**
 * Build a staged text-annotation op.
 * @param key - client-side list key.
 * @param layout - layout id the model reports.
 * @param point - placement in drawing units.
 * @param text - the annotation text.
 * @param height - text height in drawing units.
 * @param layer - target layer; omitted means the drawing's current layer.
 * @param rotation - rotation in radians.
 * @returns the staged op.
 */
export function stageText(
  key: string,
  layout: string,
  point: readonly [number, number],
  text: string,
  height: number,
  layer?: string,
  rotation?: number,
): EcadStagedOp {
  const op: EcadOp = {
    op: 'addText',
    layout,
    p: [roundCoord(point[0]), roundCoord(point[1])],
    text,
    height: roundCoord(height),
    ...(layer === undefined || layer === '' ? {} : { layer }),
    ...(rotation === undefined ? {} : { rotation }),
  }
  return { key, op, layout }
}

/**
 * Build a staged move op for one entity.
 * @param key - client-side list key.
 * @param layout - layout id the model reports.
 * @param id - entity id as the sheet model carries it.
 * @param dx - drawing-unit x delta.
 * @param dy - drawing-unit y delta.
 * @returns the staged op.
 */
export function stageMove(key: string, layout: string, id: string, dx: number, dy: number): EcadStagedOp {
  const op: EcadOp = { op: 'move', layout, ids: [id], dx: roundCoord(dx), dy: roundCoord(dy) }
  return { key, op, layout }
}

/**
 * Build a staged erase op for one entity.
 * @param key - client-side list key.
 * @param layout - layout id the model reports.
 * @param id - entity id as the sheet model carries it.
 * @returns the staged op.
 */
export function stageErase(key: string, layout: string, id: string): EcadStagedOp {
  const op: EcadOp = { op: 'erase', layout, ids: [id] }
  return { key, op, layout }
}

/** @param staged - the draft. @returns counts by kind, for the toolbar and tests. */
export function draftCounts(staged: readonly EcadStagedOp[]): EcadDraftCounts {
  let addText = 0
  let move = 0
  let erase = 0
  for (const item of staged) {
    if (item.op.op === 'addText') addText += 1
    else if (item.op.op === 'move') move += 1
    else if (item.op.op === 'erase') erase += 1
  }
  return { addText, move, erase }
}

/**
 * The staged operations as the wire array the host's `apply` takes.
 * @param staged - the draft.
 * @returns the ops, in staging order.
 */
export function draftOps(staged: readonly EcadStagedOp[]): readonly EcadOp[] {
  return staged.map(item => item.op)
}

/**
 * What the canvas previews for a draft: ghost text, ghost offsets, faded erases.
 * @param staged - the draft.
 * @returns the preview overlay.
 */
export function draftPreview(staged: readonly EcadStagedOp[]): EcadDraftPreview {
  const adds: EcadDraftPreview['adds'][number][] = []
  const moves: EcadDraftPreview['moves'][number][] = []
  const erases = new Set<string>()
  for (const item of staged) {
    const op = item.op
    if (op.op === 'addText') {
      adds.push({ key: item.key, point: op.p, text: op.text, height: op.height, rotation: op.rotation ?? 0, layer: op.layer })
    } else if (op.op === 'move') {
      for (const id of op.ids) moves.push({ key: item.key, id, delta: [op.dx, op.dy] })
    } else if (op.op === 'erase') {
      for (const id of op.ids) erases.add(id)
    }
  }
  return { adds, moves, erases }
}

/**
 * A sensible default annotation height for a sheet: the drawing's own typical
 * text height when it has text, so a note matches its neighbours instead of
 * being invented from the sheet span.
 * @param bounds - the drawn bounds in drawing units.
 * @param layout - the layout being edited, when the pane knows it.
 * @returns the height at six decimals, never zero.
 */
export function defaultTextHeight(bounds: EcadBox, layout?: EcadLayout): number {
  const heights = (layout?.entities ?? [])
    .filter(entity => (entity.k === 'text' || entity.k === 'mtext') && entity.h !== undefined && entity.h > 0)
    .map(entity => entity.h as number)
    .sort((a, b) => a - b)
  if (heights.length > 0) {
    return roundCoord(heights[Math.floor(heights.length / 2)] as number)
  }
  const span = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1])
  if (!Number.isFinite(span) || span <= 0) return 1
  return Math.max(roundCoord(span * 0.01), 0.000001)
}

/**
 * The layer a new annotation starts on: the drawing's default layer when it
 * exists, else the first layer, else undefined (the drawing's current layer).
 * @param model - the sheet model.
 * @param layout - the layout being edited.
 * @returns the layer name, or undefined when the model carries none.
 */
export function defaultLayer(model: EcadSheetModel, layout: EcadLayout | undefined): string | undefined {
  const names = model.layers.map(layer => layer.name)
  const exact = names.find(name => name === '0')
  if (exact !== undefined) return exact
  const firstEntityLayer = layout?.entities.find(entity => entity.layer !== '')?.layer
  if (firstEntityLayer !== undefined) return firstEntityLayer
  return names[0]
}

/**
 * A layer name the engine's validator accepts (DXF forbids <>/\":;?*|,=` and
 * caps the name at 255 characters).
 * @param name - candidate layer.
 * @returns true when the name can be sent.
 */
export function validLayerName(name: string): boolean {
  return name.length > 0 && name.length <= 255 && !/[<>/\\":;?*|,=`]/u.test(name)
}

/**
 * Parse a form field into a finite number.
 * @param raw - the field's text.
 * @returns the number, or undefined for an empty or invalid field.
 */
export function parseNumberField(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

/**
 * The entity an op names, looked up in one layout.
 * @param layout - the layout the pane is editing.
 * @param id - entity id.
 * @returns the entity, when the layout carries it.
 */
export function entityOf(layout: EcadLayout | undefined, id: string): EcadEntity | undefined {
  return layout?.entities.find(entity => entity.id === id)
}
