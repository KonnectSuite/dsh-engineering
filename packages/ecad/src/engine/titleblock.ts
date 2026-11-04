/**
 * Title-block extraction.
 *
 * Two shapes are supported, because real drawing sets use both:
 *
 * 1. **Attribute block** — a block reference whose attributes carry the field
 *    labels or tags (`SHEET_NUMBER`, `TITLE`, `REV`). This reads the database
 *    directly, because the JSON model does not carry attribute tags.
 * 2. **Label/value text on the title-block layer** — the owner's corpus shape:
 *    `SHEET NUMBER:` as TEXT on `TITLE_BLOCK` with the value in the cell below
 *    it. The pairing is positional, so every field says how sure it is.
 *
 * A filename fallback fills `sheetNumber` (`<set>-<sheet>`) when neither shape
 * yields one. Every value records its source and confidence; nothing here
 * claims more than it measured.
 *
 * @module dsh-engineering-ecad/engine/titleblock
 */

import type { AcDbBlockReference, AcDbDatabase } from '@mlightcad/data-model'
import type { EcadPoint, EcadProfile, EcadSheetModel, EcadTitleBlock, EcadTitleBlockField, EcadTitleBlockValue } from './types.ts'
import type { OpenedSheet } from './parse.ts'
import { buildSheetModel } from './model.ts'
import { fileStem } from './parse.ts'
import { decodeDxfText, normalizeLabel, singleLine, textWidthEm } from './text.ts'

/** Either an opened drawing (attribute path available) or an already-built model. */
export type TitleBlockSource = OpenedSheet | EcadSheetModel

/** One unmatched title-block label, which the checks report as a blank field. */
export interface TitleBlockBlank {
  readonly field?: EcadTitleBlockField
  readonly label: string
  readonly layout: string
  readonly layer: string
  readonly entityId: string
  readonly position: EcadPoint
}

/** One label the pairing recognised. */
export interface TitleBlockLabel {
  readonly field?: EcadTitleBlockField
  readonly label: string
  readonly layout: string
  readonly layer: string
  readonly entityId: string
  readonly position: EcadPoint
}

/** The result of label/value pairing on one model. */
export interface TitleBlockPairing {
  readonly layout?: string
  readonly labels: readonly TitleBlockLabel[]
  readonly blanks: readonly TitleBlockBlank[]
  readonly fields: Readonly<Partial<Record<EcadTitleBlockField, EcadTitleBlockValue>>>
}

/** One attribute value read from an insert. */
export interface InsertAttributeRow {
  /** Attribute tag as stored, for example `SHEET_NUMBER`. */
  readonly tag: string
  /** Attribute value as stored, with DXF control codes decoded. */
  readonly value: string
}

/** One insert and its attribute values, as {@link extractInsertAttributes} reports it. */
export interface InsertRecord {
  readonly layout: string
  readonly insertId: string
  readonly blockName: string
  readonly attributes: readonly InsertAttributeRow[]
}

/** Options of {@link detectTitleBlock}. */
export interface DetectTitleBlockOptions {
  /** Use this model instead of building one from {@link OpenedSheet}. */
  readonly model?: EcadSheetModel
  /** Attribute rows from {@link extractInsertAttributes}; read from the database when omitted. */
  readonly inserts?: readonly InsertRecord[]
}

/** The field order used wherever fields are listed or merged. */
export const TITLE_BLOCK_FIELDS: readonly EcadTitleBlockField[] = [
  'sheetNumber',
  'sheetCount',
  'title',
  'revision',
  'date',
  'scale',
  'project',
  'customer',
  'drawnBy',
  'checkedBy'
]

/**
 * Field a label text belongs to, from the profile's label lists.
 *
 * @param profile - the ECAD profile.
 * @param label - decoded label text.
 */
export function fieldOfLabel(profile: EcadProfile, label: string): EcadTitleBlockField | undefined {
  const normalized = normalizeLabel(label)
  if (normalized.length === 0) return undefined
  for (const field of TITLE_BLOCK_FIELDS) {
    for (const candidate of profile.titleBlockLabels[field] ?? []) {
      if (normalizeLabel(candidate) === normalized) return field
    }
  }
  return undefined
}

/**
 * True when a value is one of the profile's label texts, so it is never paired
 * as a value.
 *
 * @param profile - the ECAD profile.
 * @param text - candidate value.
 */
function isLabelText(profile: EcadProfile, text: string): boolean {
  return fieldOfLabel(profile, text) !== undefined
}

/**
 * Extract insert attribute rows from an opened drawing.
 *
 * @param opened - the opened drawing.
 * @param options - optional block-name filter.
 */
export function extractInsertAttributes(opened: OpenedSheet, options: { blockName?: string | RegExp; layouts?: readonly string[] } = {}): InsertRecord[] {
  const db = opened.db
  const rows: InsertRecord[] = []
  const nameFilter = options.blockName
  for (const record of db.tables.blockTable.newIterator()) {
    const isModel = record.isModelSapce === true
    const isPaper = record.isPaperSapce === true
    if (!isModel && !isPaper) continue
    const layoutName = isModel ? 'Model' : layoutNameFor(db, record.objectId) ?? record.name
    if (options.layouts && !options.layouts.includes(layoutName)) continue
    for (const entity of record.newIterator()) {
      const typed = entity as unknown as { dxfTypeName?: string }
      if (typed.dxfTypeName !== 'INSERT') continue
      const insert = entity as AcDbBlockReference
      const blockName = String(insert.blockName ?? '')
      if (nameFilter !== undefined) {
        const matches = typeof nameFilter === 'string' ? blockName === nameFilter : nameFilter.test(blockName)
        if (!matches) continue
      }
      const attributes: InsertAttributeRow[] = []
      for (const attribute of insert.attributeIterator()) {
        const tag = String(attribute.tag ?? '')
        const value = decodeDxfText(String(attribute.textString ?? ''))
        attributes.push({ tag, value })
      }
      if (attributes.length === 0) continue
      rows.push({ layout: layoutName, insertId: String(insert.objectId ?? ''), blockName, attributes })
    }
  }
  return rows
}

/**
 * Layout name for a block table record id.
 *
 * @param db - drawing database.
 * @param objectId - block table record id.
 */
function layoutNameFor(db: AcDbDatabase, objectId: string): string | undefined {
  const layout = db.objects.layout.getBtrIdAt(objectId)
  const name = layout?.layoutName
  return typeof name === 'string' && name.length > 0 ? name : undefined
}

/**
 * Detect the title block of one sheet.
 *
 * @param source - opened drawing or built model.
 * @param profile - the ECAD profile supplying title-block layers and labels.
 * @param options - optional model/attribute rows to avoid rebuilding or re-reading.
 */
export function detectTitleBlock(source: TitleBlockSource, profile: EcadProfile, options: DetectTitleBlockOptions = {}): EcadTitleBlock {
  const opened = isOpenedSheet(source) ? source : undefined
  const model = options.model ?? (opened ? buildSheetModel(opened) : (source as EcadSheetModel))
  const inserts = options.inserts ?? (opened ? extractInsertAttributes(opened) : [])
  const fromAttributes = detectFromAttributes(inserts, profile)
  const pairing = pairTitleBlockValues(model, profile)

  const fields: Partial<Record<EcadTitleBlockField, EcadTitleBlockValue>> = {}
  for (const [field, value] of Object.entries(pairing.fields) as Array<[EcadTitleBlockField, EcadTitleBlockValue]>) {
    fields[field] = value
  }
  let layout = pairing.layout
  if (fromAttributes) {
    layout = fromAttributes.layout ?? layout
    for (const [field, value] of Object.entries(fromAttributes.fields) as Array<[EcadTitleBlockField, EcadTitleBlockValue]>) {
      const existing = fields[field]
      if (!existing || value.confidence >= existing.confidence) fields[field] = value
    }
  }
  if (!fields.sheetNumber) {
    const fallback = sheetNumberFromPath(model.path)
    if (fallback) fields.sheetNumber = fallback
  }
  const titleBlock: EcadTitleBlock = layout ? { layout, fields } : { fields }
  return titleBlock
}

/**
 * The title-block layer names to search: the profile's, or every layer when the
 * profile names none.
 *
 * @param profile - the ECAD profile.
 */
function titleBlockLayers(profile: EcadProfile): Set<string> {
  return new Set((profile.titleBlockLayers ?? []).map(name => name.toUpperCase()))
}

/**
 * Pair labels to values on the title-block layer(s) of one model.
 *
 * Values sit below a label (the owner's corpus) or to its right (common on
 * attribute-style title blocks); both are searched and the closer, better-aligned
 * candidate wins. The comparison is in units of the label's text height, so it
 * works whatever the drawing scale is.
 *
 * @param model - the sheet model.
 * @param profile - the ECAD profile.
 */
export function pairTitleBlockValues(model: EcadSheetModel, profile: EcadProfile): TitleBlockPairing {
  const allowedLayers = titleBlockLayers(profile)
  const labels: TitleBlockLabel[] = []
  const blanks: TitleBlockBlank[] = []
  const fields: Partial<Record<EcadTitleBlockField, EcadTitleBlockValue>> = {}
  if (allowedLayers.size === 0) return { labels, blanks, fields }

  /** Candidate value texts per layout. */
  const byLayout = new Map<string, Array<{ id: string; layer: string; text: string; p: EcadPoint; h: number; entityKind: string }>>()
  for (const layout of model.layouts) {
    for (const entity of layout.entities) {
      if (entity.k !== 'text' && entity.k !== 'mtext') continue
      if (!allowedLayers.has(entity.layer.toUpperCase())) continue
      if (!entity.p) continue
      const text = singleLine(entity.t ?? '')
      if (text.length === 0) continue
      const list = byLayout.get(layout.id) ?? []
      list.push({ id: entity.id, layer: entity.layer, text, p: entity.p, h: Math.max(entity.h ?? 0, 1e-9), entityKind: entity.k })
      byLayout.set(layout.id, list)
    }
  }

  let bestLayout: { id: string; score: number; fields: Partial<Record<EcadTitleBlockField, EcadTitleBlockValue>>; labels: TitleBlockLabel[]; blanks: TitleBlockBlank[] } | undefined

  for (const [layoutId, texts] of byLayout) {
    const labelHits: TitleBlockLabel[] = []
    const layoutFields: Partial<Record<EcadTitleBlockField, EcadTitleBlockValue>> = {}
    const layoutBlanks: TitleBlockBlank[] = []
    /** Every label row and the value cell it would claim on its own. */
    const proposals: Array<{ field: EcadTitleBlockField; label: { id: string; text: string; p: EcadPoint; h: number; layer: string }; candidate: PairedValue }> = []

    for (const text of texts) {
      const field = fieldOfLabel(profile, text.text)
      if (field === undefined) continue
      labelHits.push({ field, label: singleLine(text.text), layout: layoutId, layer: text.layer, entityId: text.id, position: text.p })
      const value = findPairedValue(text, texts, profile)
      if (value) proposals.push({ field, label: text, candidate: value })
    }

    // A value cell belongs to the label that best explains it, so a label whose
    // only nearby cell is another label's value does not steal it; that label
    // stays blank, which is what the drawing actually shows.
    const owner = new Map<string, (typeof proposals)[number]>()
    for (const proposal of proposals) {
      const existing = owner.get(proposal.candidate.text.id)
      if (!existing || proposal.candidate.confidence > existing.candidate.confidence || (proposal.candidate.confidence === existing.candidate.confidence && proposal.candidate.distance < existing.candidate.distance)) owner.set(proposal.candidate.text.id, proposal)
    }
    const winners = new Set(owner.values())
    for (const proposal of proposals) {
      if (!winners.has(proposal)) continue
      const existing = layoutFields[proposal.field]
      if (existing && existing.confidence >= proposal.candidate.confidence) continue
      layoutFields[proposal.field] = {
        value: proposal.candidate.text.text,
        source: 'text',
        label: singleLine(proposal.label.text),
        confidence: proposal.candidate.confidence
      }
    }
    const blankLabels = new Set<string>()
    for (const labelHit of labelHits) {
      if (labelHit.field === undefined) continue
      if (layoutFields[labelHit.field]) continue
      const key = `${labelHit.field}|${labelHit.label}`
      if (blankLabels.has(key)) continue
      blankLabels.add(key)
      layoutBlanks.push({ field: labelHit.field, label: labelHit.label, layout: layoutId, layer: labelHit.layer, entityId: labelHit.entityId, position: labelHit.position })
    }

    const score = Object.keys(layoutFields).length * 10 + labelHits.length
    if (!bestLayout || score > bestLayout.score) {
      bestLayout = { id: layoutId, score, fields: layoutFields, labels: labelHits, blanks: layoutBlanks }
    }
  }

  if (!bestLayout) return { labels, blanks, fields }
  return { layout: bestLayout.id, labels: bestLayout.labels, blanks: bestLayout.blanks, fields: bestLayout.fields }
}

/** One value candidate paired with a label. */
interface PairedValue {
  readonly text: { id: string; text: string; p: EcadPoint; h: number }
  readonly confidence: number
  /** Distance from the label anchor, used only to break confidence ties. */
  readonly distance: number
}

/**
 * Find the value cell for one label.
 *
 * @param label - the label text row.
 * @param texts - every text on the same title-block layer in the layout.
 * @param profile - the ECAD profile, so another label is never taken as a value.
 */
function findPairedValue(
  label: { id: string; text: string; p: EcadPoint; h: number },
  texts: ReadonlyArray<{ id: string; text: string; p: EcadPoint; h: number }>,
  profile: EcadProfile
): PairedValue | undefined {
  const labelWidth = Math.max(textWidthEm(label.text) * label.h, label.h)
  const labelCenterX = label.p[0] + labelWidth / 2
  let best: PairedValue | undefined
  for (const candidate of texts) {
    if (candidate.id === label.id) continue
    if (candidate.text.length === 0) continue
    if (isLabelText(profile, candidate.text)) continue
    const dx = candidate.p[0] - label.p[0]
    const dy = candidate.p[1] - label.p[1]
    const unit = Math.max(label.h, candidate.h)
    // Value below the label, roughly under the label cell.
    const belowLimit = Math.max(10 * unit, label.h * 10)
    if (dy < -0.001 && -dy <= belowLimit) {
      const centerOffset = Math.abs(candidate.p[0] + (textWidthEm(candidate.text) * candidate.h) / 2 - labelCenterX)
      const horizontalLimit = Math.max(labelWidth, textWidthEm(candidate.text) * candidate.h) + 4 * unit
      if (centerOffset <= horizontalLimit) {
        const proximity = 1 - Math.min(1, (-dy - 0.0001) / belowLimit) * 0.5
        const alignment = 1 - Math.min(1, centerOffset / horizontalLimit) * 0.5
        const confidence = round2(0.6 + 0.2 * proximity + 0.2 * alignment)
        if (!best || confidence > best.confidence) best = { text: candidate, confidence, distance: Math.hypot(dx, dy) }
      }
    }
    // Value to the right on the same row.
    const rowLimit = Math.max(0.6 * unit, 0.6 * label.h)
    if (Math.abs(dy) <= rowLimit && dx > 0.001) {
      const rightLimit = labelWidth + 6 * unit
      if (dx <= rightLimit) {
        const proximity = 1 - Math.min(1, dx / rightLimit) * 0.6
        const rowAlign = 1 - Math.min(1, Math.abs(dy) / rowLimit) * 0.3
        const confidence = round2(0.55 + 0.25 * proximity + 0.15 * rowAlign)
        if (!best || confidence > best.confidence) best = { text: candidate, confidence, distance: Math.hypot(dx, dy) }
      }
    }
  }
  return best
}

/** One field's value from an attribute block. */
interface AttributeDetection {
  readonly layout?: string
  readonly fields: Partial<Record<EcadTitleBlockField, EcadTitleBlockValue>>
}

/**
 * Match attribute tags to title-block fields across every insert.
 *
 * @param inserts - attribute rows from the drawing.
 * @param profile - the ECAD profile.
 */
function detectFromAttributes(inserts: readonly InsertRecord[], profile: EcadProfile): AttributeDetection | undefined {
  if (inserts.length === 0) return undefined
  let best: { record: InsertRecord; fields: Partial<Record<EcadTitleBlockField, EcadTitleBlockValue>> } | undefined
  for (const record of inserts) {
    const fields: Partial<Record<EcadTitleBlockField, EcadTitleBlockValue>> = {}
    for (const attribute of record.attributes) {
      const match = fieldOfAttribute(profile, attribute.tag)
      if (!match) continue
      if (!attribute.value || attribute.value.trim().length === 0) continue
      if (fields[match.field]) continue
      fields[match.field] = {
        value: singleLine(attribute.value),
        source: 'attribute',
        label: attribute.tag,
        confidence: match.exact ? 0.96 : attributeConfidence(profile, attribute.tag)
      }
    }
    const count = Object.keys(fields).length
    if (count === 0) continue
    if (!best || count > Object.keys(best.fields).length) best = { record, fields }
  }
  if (!best) return undefined
  return { layout: best.record.layout, fields: best.fields }
}

/**
 * Confidence for a conventional attribute tag.
 *
 * @param profile - the ECAD profile.
 * @param tag - attribute tag.
 */
function attributeConfidence(profile: EcadProfile, tag: string): number {
  return fieldOfLabel(profile, tag) !== undefined ? 0.96 : 0.88
}

/**
 * Field whose tag matches one attribute tag, and whether the match was exact.
 *
 * @param profile - the ECAD profile.
 * @param tag - attribute tag.
 */
function fieldOfAttribute(profile: EcadProfile, tag: string): { field: EcadTitleBlockField; exact: boolean } | undefined {
  const direct = fieldOfLabel(profile, tag)
  if (direct) return { field: direct, exact: true }
  const normalized = tag.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (normalized.length === 0) return undefined
  const known: Array<[EcadTitleBlockField, readonly string[]]> = [
    ['sheetNumber', ['SHEETNUMBER', 'SHEETNO', 'SHEET', 'DWGNO', 'DRAWINGNUMBER']],
    ['sheetCount', ['SHEETCOUNT', 'TOTALSHEETS', 'SHEETTOTAL']],
    ['title', ['TITLE', 'DRAWINGTITLE']],
    ['revision', ['REVISION', 'REV', 'REVISIONLEVEL']],
    ['date', ['DATE', 'RELEASEDATE']],
    ['scale', ['SCALE']],
    ['project', ['PROJECT', 'JOBNUMBER', 'JOB']],
    ['customer', ['CUSTOMER', 'CLIENT']],
    ['drawnBy', ['DRAWNBY', 'DRAWN', 'DESIGNER']],
    ['checkedBy', ['CHECKEDBY', 'CHECKED', 'CHECKER']]
  ]
  for (const [field, tags] of known) {
    for (const candidate of tags) {
      if (candidate === normalized) return { field, exact: true }
      // Prefix matches the long attribute names ACADE templates use, e.g.
      // `SHEET_NUMBER_FIELD`; require the prefix to be at least half the tag so
      // `SHEET` alone cannot swallow `SHEETCOUNT`.
      if (normalized.startsWith(candidate) && candidate.length >= Math.ceil(normalized.length / 2)) return { field, exact: false }
    }
  }
  return undefined
}

/**
 * `sheetNumber` from the file name: `<set>-<sheet>`.
 *
 * @param path - the drawing path.
 */
function sheetNumberFromPath(path: string): EcadTitleBlockValue | undefined {
  const stem = fileStem(path)
  if (stem.length === 0) return undefined
  const match = /^(.*?)[-_ ]?(\d{1,4})$/.exec(stem)
  if (!match) return undefined
  const set = match[1] ?? ''
  const sheet = match[2] ?? ''
  const value = set.length > 0 ? `${set}-${sheet}` : sheet
  return {
    value,
    source: 'filename',
    label: '<set>-<sheet>',
    confidence: 0.5
  }
}

/**
 * True when a value is an {@link OpenedSheet}.
 *
 * @param value - opened drawing or model.
 */
export function isOpenedSheet(value: TitleBlockSource): value is OpenedSheet {
  return typeof value === 'object' && value !== null && 'db' in value && 'sha256' in value && !('layouts' in value)
}

/**
 * Round a confidence to two decimals so JSON snapshots stay stable.
 *
 * @param value - 0–1 confidence.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}
