/**
 * Cross-reference candidates across one drawing set.
 *
 * This module is deliberately loud about what it is not: it groups text values
 * that look like device tags, wire labels and sheet references, and it says
 * where each candidate was seen. It does not know what a wire connects to, does
 * not follow a schematic, and cannot prove two identical tags are the same
 * device. Every row carries a confidence and a note saying what matched.
 *
 * @module dsh-engineering-ecad/engine/crossref
 */

import type { EcadCrossReferenceRow, EcadProfile, EcadSheetModel } from './types.ts'
import { fileStem } from './parse.ts'
import { normalizeLabel } from './text.ts'

/** One drawing in the set. */
export interface CrossrefModel {
  /** Path of the drawing, as the caller names it. */
  readonly path: string
  /** Its built model. */
  readonly model: EcadSheetModel
}

/** Options of {@link crossReference}. */
export interface CrossrefOptions {
  /** Cap on returned rows. Defaults to 5000; the last row notes a cap. */
  readonly maxRows?: number
  /** Include text that came out of a block reference (`g` set). Defaults to false. */
  readonly includeBlockText?: boolean
}

/** One occurrence of a candidate value. */
interface Occurrence {
  readonly path: string
  readonly layout: string
  readonly layer: string
  readonly entityId: string
  readonly position: readonly [number, number]
  readonly text: string
}

/** Cached per-model context. */
interface SheetContext {
  readonly path: string
  readonly model: EcadSheetModel
  readonly titleLayers: ReadonlySet<string>
  readonly wireLayers: ReadonlySet<string>
  readonly tagLayers: ReadonlySet<string>
  /** Layer names present on this sheet, for the layer-evidence decisions. */
  readonly layers: ReadonlySet<string>
  /** Layer names the sheet's entities actually use, not just declares. */
  readonly usedLayers: ReadonlySet<string>
  /** Numbers that identify this sheet from its file name. */
  readonly sheetNumbers: readonly number[]
  /** Normalized title-block label texts, never cross-reference candidates. */
  readonly labelTexts: ReadonlySet<string>
}

/** Candidate kinds in output order. */
const KIND_ORDER: Readonly<Record<EcadCrossReferenceRow['kind'], number>> = {
  'device-tag': 0,
  'wire-label': 1,
  'sheet-reference': 2
}

/**
 * Build cross-reference candidates for a set of drawings.
 *
 * @param models - every drawing in the set, with its model.
 * @param profile - the confirmed (or inferred) ECAD profile.
 * @param options - row cap and block-text switch.
 * @returns rows grouped by kind and value, each with status, confidence and note.
 */
export function crossReference(models: readonly CrossrefModel[], profile: EcadProfile, options: CrossrefOptions = {}): EcadCrossReferenceRow[] {
  const maxRows = Math.max(1, Math.trunc(options.maxRows ?? 5000))
  const contexts = models.map(model => contextOf(model, profile))
  const sheetNumbers = new Set<number>()
  for (const context of contexts) for (const number of context.sheetNumbers) sheetNumbers.add(number)

  const deviceTag = new RegExp(profile.deviceTagPattern)
  const wireLabel = new RegExp(profile.wireLabelPattern)
  const sheetReference = new RegExp(profile.sheetReferencePattern, 'i')

  /** kind|value → occurrences. */
  const groups = new Map<string, { kind: EcadCrossReferenceRow['kind']; value: string; occurrences: Occurrence[]; target?: number }>()

  const add = (kind: EcadCrossReferenceRow['kind'], value: string, occurrence: Occurrence, target?: number): void => {
    const key = `${kind}|${value.toUpperCase()}`
    let group = groups.get(key)
    if (!group) {
      group = { kind, value, occurrences: [] }
      groups.set(key, group)
    }
    if (target !== undefined && group.target === undefined) group.target = target
    group.occurrences.push(occurrence)
  }

  for (const context of contexts) {
    for (const layout of context.model.layouts) {
      for (const entity of layout.entities) {
        if (entity.k !== 'text' && entity.k !== 'mtext') continue
        if (!entity.p) continue
        if (entity.g && options.includeBlockText !== true) continue
        if (context.titleLayers.has(entity.layer.toUpperCase())) continue
        if (context.layers.has('Defpoints') && entity.layer.toUpperCase() === 'DEFPOINTS') continue
        const text = (entity.t ?? '').replace(/\s+/g, ' ').trim()
        if (text.length === 0 || text.length > 64) continue
        if (context.labelTexts.has(normalizeLabel(text))) continue
        const occurrence: Occurrence = {
          path: context.path,
          layout: layout.id,
          layer: entity.layer,
          entityId: entity.id,
          position: entity.p,
          text
        }

        const referenceMatch = sheetReference.exec(text)
        if (referenceMatch) {
          const target = Number.parseInt(referenceMatch[1] ?? '', 10)
          if (Number.isFinite(target)) add('sheet-reference', `SHEET ${target}`, occurrence, target)
          continue
        }
        if (deviceTag.test(text)) {
          const onTagLayer = context.tagLayers.has(entity.layer.toUpperCase())
          if (context.tagLayers.size > 0 && hasAnyLayer(context, context.tagLayers) && !onTagLayer) continue
          add('device-tag', text, occurrence)
          continue
        }
        if (wireLabel.test(text) && /^[0-9]/.test(text)) {
          const onWireLayer = context.wireLayers.has(entity.layer.toUpperCase())
          if (context.wireLayers.size > 0 && hasAnyLayer(context, context.wireLayers) && !onWireLayer) continue
          add('wire-label', text, occurrence)
        }
      }
    }
  }

  const rows: EcadCrossReferenceRow[] = []
  // Rows that carry no layer evidence are withheld unless they are duplicate
  // candidates, so pattern-only noise never reaches the review list.
  for (const group of groups.values()) {
    if (rows.length >= maxRows) break
    const sheets = group.occurrences.map(occurrence => ({
      path: occurrence.path,
      layout: occurrence.layout,
      layer: occurrence.layer,
      entityId: occurrence.entityId,
      position: occurrence.position,
      text: occurrence.text
    }))
    const bySheet = new Set(group.occurrences.map(occurrence => `${occurrence.path}|${occurrence.layout}`))
    const perSheet = new Map<string, number>()
    for (const occurrence of group.occurrences) {
      const key = `${occurrence.path}|${occurrence.layout}`
      perSheet.set(key, (perSheet.get(key) ?? 0) + 1)
    }
    const maxPerSheet = Math.max(0, ...perSheet.values())
    let status: EcadCrossReferenceRow['status']
    let confidence: number
    let note: string
    if (group.kind === 'sheet-reference') {
      status = group.target !== undefined && sheetNumbers.has(group.target) ? 'ok' : 'unresolved'
      confidence = status === 'ok' ? 0.7 : 0.6
      note =
        status === 'ok'
          ? `text names sheet ${group.target}, which a file in this set carries; a reference is not proof the target sheet shows this circuit`
          : `text names sheet ${group.target}, but no file in this set carries that sheet number; the set may be partial`
    } else if (group.kind === 'device-tag') {
      status = maxPerSheet > 1 ? 'duplicate' : 'ok'
      const onTagLayer = group.occurrences.some(occurrence => contexts.find(context => context.path === occurrence.path)?.tagLayers.has(occurrence.layer.toUpperCase()) === true)
      confidence = round2((onTagLayer ? 0.65 : 0.45) + Math.min(0.2, 0.05 * (group.occurrences.length - 1)))
      note =
        status === 'duplicate'
          ? `${group.occurrences.length} occurrences of ${group.value}, more than one on the same sheet/layout; a duplicate candidate, not proof of a doubled device`
          : `matched the device-tag pattern on layer ${[...new Set(group.occurrences.map(occurrence => occurrence.layer))].join(', ')}; one reference, so completeness is not proven`
    } else {
      status = group.occurrences.length === 1 ? 'one-sided' : maxPerSheet > 2 ? 'duplicate' : 'ok'
      const onWireLayer = group.occurrences.some(occurrence => contexts.find(context => context.path === occurrence.path)?.wireLayers.has(occurrence.layer.toUpperCase()) === true)
      // Without a wire layer at the occurrence, a bare number is only a pattern
      // match: repeat occurrences are still worth reporting as duplicate
      // candidates, but "ok"/"one-sided" rows would be noise and are withheld.
      if (!onWireLayer && status !== 'duplicate') continue
      confidence = round2(onWireLayer ? (status === 'ok' ? 0.55 : 0.45) + (bySheet.size > 1 ? -0.05 : 0.05) : 0.3)
      note =
        status === 'one-sided'
          ? `wire number ${group.value} appears once; a wire label normally appears at both ends, so this may be one end of a cross-sheet wire`
          : status === 'duplicate'
            ? `wire number ${group.value} appears ${group.occurrences.length} times, more than two on the same sheet; duplicate candidate across ${bySheet.size} sheet/layout(s)${onWireLayer ? '' : ' on no declared wire layer'}`
            : `wire number ${group.value} appears ${group.occurrences.length} times; pattern match on layer ${[...new Set(group.occurrences.map(occurrence => occurrence.layer))].join(', ')}, no connectivity check`
    }
    rows.push({ kind: group.kind, value: group.value, sheets, status, confidence, note })
  }

  rows.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.value.localeCompare(b.value))
  if (rows.length >= maxRows) {
    const last = rows[rows.length - 1]
    if (last) rows[rows.length - 1] = { ...last, note: `${last.note ?? ''} (results capped at ${maxRows} rows)` }
  }
  return rows
}

/**
 * Build the per-model context once.
 *
 * @param model - one drawing.
 * @param profile - ECAD profile.
 */
function contextOf(model: CrossrefModel, profile: EcadProfile): SheetContext {
  const titleLayers = new Set((profile.titleBlockLayers ?? []).map(name => name.toUpperCase()))
  const wireLayers = new Set((profile.wireLayers ?? []).map(name => name.toUpperCase()))
  const tagLayers = new Set((profile.tagLayers ?? []).map(name => name.toUpperCase()))
  const layers = new Set(model.model.layers.map(layer => layer.name.toUpperCase()))
  const usedLayers = new Set<string>()
  for (const layout of model.model.layouts) {
    for (const entity of layout.entities) usedLayers.add(entity.layer.toUpperCase())
  }
  const stem = fileStem(model.path)
  const numbers: number[] = []
  for (const match of stem.matchAll(/(\d{1,4})(?:\D|$)/g)) {
    const value = Number.parseInt(match[1] ?? '', 10)
    if (Number.isFinite(value)) numbers.push(value)
  }
  for (const match of stem.matchAll(/(\d{1,4})/g)) {
    const value = Number.parseInt(match[1] ?? '', 10)
    if (Number.isFinite(value) && !numbers.includes(value)) numbers.push(value)
  }
  const labelTexts = new Set<string>()
  for (const labels of Object.values(profile.titleBlockLabels)) {
    for (const label of labels ?? []) labelTexts.add(normalizeLabel(label))
  }
  return { path: model.path, model: model.model, titleLayers, wireLayers, tagLayers, layers, usedLayers, sheetNumbers: numbers, labelTexts }
}

/**
 * True when the sheet's entities actually use any layer of a set.
 *
 * A layer that only exists in the layer table is not evidence: the owner's
 * corpus declares the ACADE `WIRES`/`TAGS` layers without drawing anything on
 * them, so a name check alone would claim layer evidence the drawing lacks.
 *
 * @param context - sheet context.
 * @param wanted - upper-case layer names.
 */
function hasAnyLayer(context: SheetContext, wanted: ReadonlySet<string>): boolean {
  for (const name of wanted) if (context.usedLayers.has(name)) return true
  return false
}

/**
 * Round a confidence to two decimals.
 *
 * @param value - 0–1 value.
 */
function round2(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100
}
