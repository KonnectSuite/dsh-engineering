/**
 * The ECAD profile: the conventions one drawing set follows.
 *
 * The profile is inferred from what the drawings actually carry — the ACADE
 * `WD_M` drawing-properties block first, then the measured title-block layers
 * and labels — and every derived value records the evidence that produced it.
 * Nothing here invents a convention the drawings did not show; the defaults are
 * the ACADE IEC baseline and the inference either confirms them or leaves them
 * alone.
 *
 * @module dsh-engineering-ecad/engine/profile
 */

import type { EcadProfile, EcadProfileInference, EcadSheetModel, EcadTitleBlock, EcadTitleBlockField } from './types.ts'
import { EcadError } from './errors.ts'
import type { InsertRecord } from './titleblock.ts'
import { TITLE_BLOCK_FIELDS } from './titleblock.ts'
import { normalizeLabel } from './text.ts'

/** Default device tag pattern: one to three family letters, a number, an optional suffix letter. */
export const DEFAULT_DEVICE_TAG_PATTERN = '^[A-Z]{1,3}[0-9]{1,4}[A-Z]?$'

/** Default wire label pattern: a short number with an optional suffix letter. */
export const DEFAULT_WIRE_LABEL_PATTERN = '^[0-9]{1,4}[A-Z]?$'

/** Default sheet reference pattern: `SEE SHEET 12`, `SHEET #12`, `SHEET 12`. */
export const DEFAULT_SHEET_REFERENCE_PATTERN = '(?:SEE\\s+)?SHEET\\s*#?\\s*([0-9]{1,4})'

/** One sheet handed to {@link inferProfile}. */
export interface InferProfileSheet {
  /** The built sheet model. */
  readonly model: EcadSheetModel
  /** Title block already extracted for this sheet (with whatever profile was in force). */
  readonly titleBlock: EcadTitleBlock
  /** Insert attribute rows, so `WD_M` can be read. Omit when unavailable. */
  readonly inserts?: readonly InsertRecord[]
}

/** Options of {@link inferProfile}. */
export interface InferProfileOptions {
  /** Starting profile; defaults to {@link defaultProfile}. */
  readonly base?: EcadProfile
}

/** A profile check result, used by {@link loadProfile}. */
export interface ProfileValidation {
  readonly ok: boolean
  readonly problems: readonly string[]
}

/** Field → default label variants the detector recognises. */
const DEFAULT_LABELS: Readonly<Partial<Record<EcadTitleBlockField, readonly string[]>>> = {
  sheetNumber: ['SHEET NUMBER', 'SHEET NO', 'SHEET #', 'DWG NO', 'DRAWING NUMBER', 'SHEET'],
  sheetCount: ['SHEET COUNT', 'TOTAL SHEETS', 'SHEETS', 'SHEET TOTAL'],
  title: ['TITLE', 'DRAWING TITLE'],
  revision: ['REVISION LEVEL', 'REVISION', 'REV'],
  date: ['RELEASE DATE', 'DATE'],
  scale: ['SCALE'],
  project: ['PROJECT', 'JOB NUMBER', 'JOB'],
  customer: ['CUSTOMER', 'CLIENT'],
  drawnBy: ['DRAWN BY', 'DRAWN', 'DESIGNER'],
  checkedBy: ['CHECKED BY', 'CHECKED']
}

/** `WD_M` attributes the inference reads, with the profile field each feeds. */
const WD_M_ATTRIBUTES = ['WIRELAYS', 'WIREFIXED_LAY', 'XREF_LAY', 'LOC_LAY', 'TAG_LAY', 'TAGFMT', 'XREFFMT', 'PLC_STYLE', 'WIREFMT', 'WIRENO_LAY']

/**
 * The ACADE IEC baseline profile.
 *
 * Deliberately close to the owner's corpus: `TITLE_BLOCK` labels, ACADE default
 * layer names from `WD_M`, and the three patterns the skill quotes. `minTextHeight`
 * is small enough to be useful and can be set to 0 to disable the rule.
 */
export function defaultProfile(): EcadProfile {
  const labels: Partial<Record<EcadTitleBlockField, readonly string[]>> = {}
  for (const field of TITLE_BLOCK_FIELDS) {
    const variants = DEFAULT_LABELS[field]
    if (variants) labels[field] = [...variants]
  }
  return {
    schema: 1,
    titleBlockLayers: ['TITLE_BLOCK'],
    titleBlockLabels: labels,
    wireLayers: ['WIRES'],
    tagLayers: ['TAGS'],
    xrefLayers: ['XREF'],
    locLayers: ['LOC'],
    deviceTagPattern: DEFAULT_DEVICE_TAG_PATTERN,
    wireLabelPattern: DEFAULT_WIRE_LABEL_PATTERN,
    sheetReferencePattern: DEFAULT_SHEET_REFERENCE_PATTERN,
    minTextHeight: 0.05,
    standardLayers: ['0', 'TITLE_BLOCK', 'BLOCKS', 'Defpoints'],
    units: 0
  }
}

/**
 * Infer a profile from a set of built sheets.
 *
 * @param sheets - models with their detected title blocks and, when available, insert attributes.
 * @param options - optional base profile to extend.
 * @returns the profile, the evidence rows that justify it, and an overall confidence.
 */
export function inferProfile(sheets: readonly InferProfileSheet[], options: InferProfileOptions = {}): EcadProfileInference {
  const base = options.base ?? defaultProfile()
  const evidence: string[] = []
  if (sheets.length === 0) {
    return { profile: base, evidence: ['no sheets supplied; returning the default profile'], confidence: 0.2 }
  }

  const { labelsByField, labelLayers, labelHeights } = measureTitleBlockLabels(sheets, base)
  const titleBlockLayers = labelLayers.length > 0 ? labelLayers.slice(0, 8) : base.titleBlockLayers
  if (labelLayers.length > 0) {
    evidence.push(`title-block labels observed on ${labelLayers.map(name => JSON.stringify(name)).join(', ')} across ${sheets.length} sheet(s)`)
  } else {
    evidence.push(`no title-block label matched on any sheet; keeping the default layers ${JSON.stringify(base.titleBlockLayers)}`)
  }

  const titleBlockLabels: Partial<Record<EcadTitleBlockField, readonly string[]>> = {}
  for (const field of TITLE_BLOCK_FIELDS) {
    const observed = labelsByField.get(field) ?? []
    const defaults = base.titleBlockLabels[field] ?? DEFAULT_LABELS[field] ?? []
    const merged = dedupe([...observed, ...defaults])
    if (merged.length > 0) titleBlockLabels[field] = merged
  }
  const observedFields = [...labelsByField.keys()]
  if (observedFields.length > 0) {
    evidence.push(`label variants observed: ${observedFields.map(field => `${field}=${JSON.stringify([...(labelsByField.get(field) ?? [])].slice(0, 3))}`).join(', ')}`)
  }

  const wd = readWdM(sheets)
  for (const [tag, value] of wd) evidence.push(`WD_M ${tag}=${JSON.stringify(value)} read from the drawing-properties block`)

  const wireLayers = layersFromWdM(wd, ['WIRELAYS'], sheets, /WIRE(?!NO|COPY|FIXED|REF)/i, base.wireLayers)
  const tagLayers = layersFromWdM(wd, ['TAG_LAY'], sheets, /^TAG/i, base.tagLayers)
  const xrefLayers = layersFromWdM(wd, ['XREF_LAY'], sheets, /XREF/i, base.xrefLayers)
  const locLayers = layersFromWdM(wd, ['LOC_LAY'], sheets, /^LOC/i, base.locLayers)

  const deviceTagPattern = patternFromFormat(wd.get('TAGFMT'), DEFAULT_DEVICE_TAG_PATTERN, 'device tag', evidence)
  const wireLabelPattern = defaultPatternUnlessMeasured(base.wireLabelPattern, DEFAULT_WIRE_LABEL_PATTERN, 'wire label', evidence)
  const sheetReferencePattern = defaultPatternUnlessMeasured(base.sheetReferencePattern, DEFAULT_SHEET_REFERENCE_PATTERN, 'sheet reference', evidence)

  const minTextHeight = inferMinTextHeight(labelHeights, base.minTextHeight, evidence)

  const standardLayers = measureStandardLayers(sheets, base)
  evidence.push(`standardLayers measured from ${standardLayers.length} layer(s) in use across ${sheets.length} sheet(s)`)

  const units = inferUnits(sheets)
  evidence.push(units === 0 ? 'drawing units are unset ($INSUNITS=0); lengths are drawing units only' : `drawing units $INSUNITS=${units} declared by the set`)

  const profile: EcadProfile = {
    schema: 1,
    titleBlockLayers,
    titleBlockLabels,
    wireLayers,
    tagLayers,
    xrefLayers,
    locLayers,
    deviceTagPattern,
    wireLabelPattern,
    sheetReferencePattern,
    minTextHeight,
    standardLayers,
    units
  }

  const sheetsWithTitleBlock = sheets.filter(sheet => Object.keys(sheet.titleBlock.fields).length > 0).length
  let confidence = 0.35
  if (wd.size > 0) confidence += 0.2
  if (sheetsWithTitleBlock === sheets.length) confidence += 0.2
  else if (sheetsWithTitleBlock > 0) confidence += 0.1
  if (observedFields.length >= 2) confidence += 0.1
  if (standardLayers.length > 0) confidence += 0.05
  if (unitAgreement(sheets)) confidence += 0.05
  confidence = Math.round(Math.min(0.95, confidence) * 100) / 100

  return { profile, evidence, confidence }
}

/**
 * Measure which layers carry title-block labels and which variants appear.
 *
 * @param sheets - sheets to measure.
 * @param base - profile whose label variants seed the search.
 */
function measureTitleBlockLabels(
  sheets: readonly InferProfileSheet[],
  base: EcadProfile
): { labelsByField: Map<EcadTitleBlockField, string[]>; labelLayers: string[]; labelHeights: number[] } {
  const variants = new Map<string, EcadTitleBlockField>()
  for (const field of TITLE_BLOCK_FIELDS) {
    for (const label of base.titleBlockLabels[field] ?? DEFAULT_LABELS[field] ?? []) {
      variants.set(normalizeLabel(label), field)
    }
  }
  const labelsByField = new Map<EcadTitleBlockField, string[]>()
  const layerScore = new Map<string, number>()
  const labelHeights: number[] = []
  for (const sheet of sheets) {
    for (const layout of sheet.model.layouts) {
      for (const entity of layout.entities) {
        if (entity.k !== 'text' && entity.k !== 'mtext') continue
        const text = (entity.t ?? '').trim()
        if (text.length === 0) continue
        const field = variants.get(normalizeLabel(text))
        if (field === undefined) continue
        const list = labelsByField.get(field) ?? []
        const clean = text.replace(/[\s:]+$/, '').trim()
        if (!list.includes(clean)) list.push(clean)
        labelsByField.set(field, list)
        layerScore.set(entity.layer, (layerScore.get(entity.layer) ?? 0) + 1)
        if (typeof entity.h === 'number' && Number.isFinite(entity.h) && entity.h > 0) labelHeights.push(entity.h)
      }
    }
  }
  const labelLayers = [...layerScore.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  return { labelsByField, labelLayers, labelHeights }
}

/**
 * Collect `WD_M` attribute values across the sheets.
 *
 * @param sheets - sheets with optional insert rows.
 */
function readWdM(sheets: readonly InferProfileSheet[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const sheet of sheets) {
    for (const insert of sheet.inserts ?? []) {
      for (const attribute of insert.attributes) {
        const tag = attribute.tag.trim().toUpperCase()
        if (!WD_M_ATTRIBUTES.includes(tag)) continue
        if (out.has(tag)) continue
        const value = attribute.value.trim()
        if (value.length === 0) continue
        out.set(tag, value)
      }
    }
  }
  return out
}

/**
 * Layers named by one `WD_M` attribute, falling back to measured layer names.
 *
 * @param wd - attribute values.
 * @param tags - attribute tags to read.
 * @param sheets - sheets, for the measured fallback.
 * @param pattern - name pattern used when the attribute is absent.
 * @param fallback - layers used when neither source yields one.
 */
function layersFromWdM(wd: ReadonlyMap<string, string>, tags: readonly string[], sheets: readonly InferProfileSheet[], pattern: RegExp, fallback: readonly string[]): string[] {
  const names: string[] = []
  for (const tag of tags) {
    const raw = wd.get(tag)
    if (!raw) continue
    for (const part of raw.split(',')) {
      const name = part.trim()
      if (name.length > 0 && !names.includes(name)) names.push(name)
    }
  }
  if (names.length === 0) {
    const measured = new Set<string>()
    for (const sheet of sheets) for (const layer of sheet.model.layers) if (pattern.test(layer.name)) measured.add(layer.name)
    if (measured.size > 0) return [...measured]
    return [...fallback]
  }
  // A layer the drawings never use is still a valid profile layer; keep it.
  return names
}

/**
 * Derive a regex from an ACADE format string such as `%F%N`.
 *
 * @param format - the `TAGFMT` value.
 * @param fallback - pattern used when the format is absent or unusable.
 * @param what - human name, for the evidence row.
 * @param evidence - evidence rows to append to.
 */
function patternFromFormat(format: string | undefined, fallback: string, what: string, evidence: string[]): string {
  if (!format || format.trim().length === 0) {
    evidence.push(`${what} pattern ${fallback} kept (no format string in WD_M)`)
    return fallback
  }
  const parts = format.trim().split(/(%[A-Za-z])/)
  let pattern = ''
  let meaningful = false
  for (const part of parts) {
    if (part.length === 0) continue
    if (part === '%F') {
      pattern += '[A-Z]{1,3}'
      meaningful = true
    } else if (part === '%N') {
      pattern += '[0-9]{1,4}'
      meaningful = true
    } else if (part.startsWith('%')) {
      pattern += '.+'
    } else {
      pattern += escapeRegExp(part)
    }
  }
  if (!meaningful || pattern.length === 0) {
    evidence.push(`${what} pattern kept as ${fallback} (TAGFMT=${JSON.stringify(format)} carries no family/number field)`)
    return fallback
  }
  const derived = `^${pattern}$`
  evidence.push(`${what} pattern ${derived} derived from TAGFMT=${JSON.stringify(format)}`)
  return derived
}

/**
 * Keep a pattern, recording that it was not measured.
 *
 * @param base - base pattern.
 * @param fallback - documented default.
 * @param what - human name.
 * @param evidence - evidence rows to append to.
 */
function defaultPatternUnlessMeasured(base: string, fallback: string, what: string, evidence: string[]): string {
  if (base.length > 0 && base !== fallback) {
    evidence.push(`${what} pattern kept from the base profile: ${base}`)
    return base
  }
  evidence.push(`${what} pattern ${fallback} is the ACADE default; text matching alone cannot prove it`)
  return base.length > 0 ? base : fallback
}

/**
 * Infer the smallest acceptable text height from the measured label heights.
 *
 * @param heights - title-block label heights.
 * @param fallback - height used when nothing was measured.
 * @param evidence - evidence rows to append to.
 */
function inferMinTextHeight(heights: readonly number[], fallback: number, evidence: string[]): number {
  if (heights.length === 0) {
    evidence.push(`minTextHeight left at ${fallback} (no title-block label height measured)`)
    return fallback
  }
  const sorted = [...heights].sort((a, b) => a - b)
  const medianHeight = sorted[Math.floor(sorted.length / 2)]!
  const derived = Math.max(0.01, Math.round(medianHeight * 0.5 * 1000) / 1000)
  evidence.push(`minTextHeight ${derived} derived as half the median title-block label height ${medianHeight}`)
  return derived
}

/**
 * The layer names the measured sheets actually use.
 *
 * @param sheets - sheets to measure.
 * @param base - profile whose list is used when nothing was measured.
 */
function measureStandardLayers(sheets: readonly InferProfileSheet[], base: EcadProfile): string[] {
  const names = new Set<string>(base.standardLayers)
  for (const sheet of sheets) {
    for (const layer of sheet.model.layers) names.add(layer.name)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

/**
 * The declared drawing units, when the whole set agrees.
 *
 * @param sheets - sheets to measure.
 */
function inferUnits(sheets: readonly InferProfileSheet[]): number {
  const units = new Set(sheets.map(sheet => sheet.model.units))
  if (units.size !== 1) return 0
  const value = [...units][0] ?? 0
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * True when every sheet declares the same units.
 *
 * @param sheets - sheets to check.
 */
function unitAgreement(sheets: readonly InferProfileSheet[]): boolean {
  return new Set(sheets.map(sheet => sheet.model.units)).size === 1
}

/**
 * Parse and schema-check a stored profile.
 *
 * @param json - profile text or already-parsed value.
 * @returns the profile with every documented field present.
 */
export function loadProfile(json: string | unknown): EcadProfile {
  let value: unknown = json
  if (typeof json === 'string') {
    try {
      value = JSON.parse(json)
    } catch (error) {
      throw new EcadError('INVALID_INPUT', `the profile is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, 'Re-save the profile with serializeProfile, or infer a new one from the drawings.')
    }
  }
  const validation = validateProfile(value)
  if (!validation.ok) {
    throw new EcadError('INVALID_INPUT', `the profile does not match the ECAD profile schema: ${validation.problems.join('; ')}`, 'Fix the listed fields, or call inferProfile on the drawing set and serialize that result.')
  }
  return mergeWithDefaults(value as Partial<EcadProfile>)
}

/**
 * Schema check for a stored profile.
 *
 * `schema` is required; every other field is checked only when it is present,
 * because {@link loadProfile} fills absent fields from {@link defaultProfile}.
 *
 * @param value - candidate value.
 */
export function validateProfile(value: unknown): ProfileValidation {
  const problems: string[] = []
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, problems: ['the profile must be a JSON object'] }
  }
  const record = value as Record<string, unknown>
  if (record.schema !== 1) problems.push(`schema must be 1, got ${JSON.stringify(record.schema)}`)
  checkStringArray(record, 'titleBlockLayers', problems)
  checkStringArray(record, 'wireLayers', problems)
  checkStringArray(record, 'tagLayers', problems)
  checkStringArray(record, 'xrefLayers', problems)
  checkStringArray(record, 'locLayers', problems)
  checkStringArray(record, 'standardLayers', problems)
  checkString(record, 'deviceTagPattern', problems)
  checkString(record, 'wireLabelPattern', problems)
  checkString(record, 'sheetReferencePattern', problems)
  if (record.minTextHeight !== undefined && (typeof record.minTextHeight !== 'number' || !Number.isFinite(record.minTextHeight) || (record.minTextHeight as number) < 0)) {
    problems.push('minTextHeight must be a finite number >= 0')
  }
  if (record.units !== undefined && (typeof record.units !== 'number' || !Number.isFinite(record.units) || (record.units as number) < 0)) {
    problems.push('units must be a finite number >= 0')
  }
  if (record.titleBlockLabels !== undefined) {
    if (typeof record.titleBlockLabels !== 'object' || record.titleBlockLabels === null || Array.isArray(record.titleBlockLabels)) {
      problems.push('titleBlockLabels must be an object of field → label array')
    } else {
      for (const [field, labels] of Object.entries(record.titleBlockLabels as Record<string, unknown>)) {
        if (!(TITLE_BLOCK_FIELDS as readonly string[]).includes(field)) {
          problems.push(`titleBlockLabels has unknown field ${JSON.stringify(field)}`)
          continue
        }
        if (!Array.isArray(labels) || labels.some(label => typeof label !== 'string')) {
          problems.push(`titleBlockLabels.${field} must be an array of strings`)
        }
      }
    }
  }
  for (const patternField of ['deviceTagPattern', 'wireLabelPattern', 'sheetReferencePattern'] as const) {
    const pattern = record[patternField]
    if (typeof pattern === 'string') {
      try {
        new RegExp(pattern)
      } catch {
        problems.push(`${patternField} is not a valid regular expression`)
      }
    }
  }
  return { ok: problems.length === 0, problems }
}

/**
 * Whether a value is a valid profile.
 *
 * @param value - candidate value.
 */
export function isEcadProfile(value: unknown): value is EcadProfile {
  return validateProfile(value).ok
}

/**
 * Serialise a profile deterministically (two-space JSON with a trailing newline).
 *
 * @param profile - the profile.
 */
export function serializeProfile(profile: EcadProfile): string {
  return `${JSON.stringify(profile, null, 2)}\n`
}

/**
 * Fill absent profile fields from the default profile.
 *
 * @param value - partially validated profile object.
 */
function mergeWithDefaults(value: Partial<EcadProfile>): EcadProfile {
  const base = defaultProfile()
  const labels: Partial<Record<EcadTitleBlockField, readonly string[]>> = {}
  for (const field of TITLE_BLOCK_FIELDS) {
    const supplied = value.titleBlockLabels?.[field]
    const fallback = base.titleBlockLabels[field] ?? []
    const labelsForField = Array.isArray(supplied) ? supplied.filter(label => typeof label === 'string') : fallback
    if (labelsForField.length > 0) labels[field] = [...labelsForField]
  }
  return {
    schema: 1,
    titleBlockLayers: value.titleBlockLayers ?? base.titleBlockLayers,
    titleBlockLabels: labels,
    wireLayers: value.wireLayers ?? base.wireLayers,
    tagLayers: value.tagLayers ?? base.tagLayers,
    xrefLayers: value.xrefLayers ?? base.xrefLayers,
    locLayers: value.locLayers ?? base.locLayers,
    deviceTagPattern: value.deviceTagPattern ?? base.deviceTagPattern,
    wireLabelPattern: value.wireLabelPattern ?? base.wireLabelPattern,
    sheetReferencePattern: value.sheetReferencePattern ?? base.sheetReferencePattern,
    minTextHeight: value.minTextHeight ?? base.minTextHeight,
    standardLayers: value.standardLayers ?? base.standardLayers,
    units: value.units ?? base.units
  }
}

/**
 * Check a required string-array field.
 *
 * @param record - candidate object.
 * @param field - field name.
 * @param problems - problem list to append to.
 */
function checkStringArray(record: Record<string, unknown>, field: string, problems: string[]): void {
  const value = record[field]
  if (value === undefined) return
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    problems.push(`${field} must be an array of strings`)
  }
}

/**
 * Check a required string field.
 *
 * @param record - candidate object.
 * @param field - field name.
 * @param problems - problem list to append to.
 */
function checkString(record: Record<string, unknown>, field: string, problems: string[]): void {
  const value = record[field]
  if (value === undefined) return
  if (typeof value !== 'string') problems.push(`${field} must be a string`)
}

/**
 * De-duplicate strings preserving order.
 *
 * @param values - strings.
 */
function dedupe(values: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const key = value.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

/**
 * Escape a literal for a regular expression source.
 *
 * @param value - literal text.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
