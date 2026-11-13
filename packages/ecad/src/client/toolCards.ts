/**
 * The pure model behind the ECAD conversation surfaces: it turns one tool-result
 * payload into the compact card the transcript draws, and the workspace drawing
 * report into the sheet-set chip the composer dock draws.
 *
 * The tool answers cross the host as one JSON text block (`{ summary, data,
 * next, coverage }`, or `{ error }`), so this module parses that text and reads
 * the shape each ECAD tool documents. Nothing here throws: a payload that is
 * empty, malformed, truncated, of an unexpected shape or from an unknown ECAD
 * tool falls back to a plain card carrying the text it could read. The React
 * components own only presentation; every count, path and severity here is
 * checked structurally.
 *
 * @module dsh-engineering-ecad/client/toolCards
 */

/** Tool names whose cards this face registers, in the row's registration order. */
export const ECAD_TOOL_NAMES: readonly string[] = [
  'ecad_capabilities',
  'ecad_profile',
  'ecad_scan',
  'ecad_open',
  'ecad_overview',
  'ecad_find',
  'ecad_cross_reference',
  'ecad_checks',
  'ecad_render',
  'ecad_compare',
  'ecad_document',
  'ecad_backup',
]

/** The drawing formats tool answers name. */
export type EcadCardFormat = 'dxf' | 'dwg'

/** The failure envelope an ECAD tool returns as its value. */
export interface EcadCardError {
  readonly code: string
  readonly message: string
  readonly fix?: string
  readonly candidates: readonly string[]
}

/** One review finding, bounded for the card. */
export interface EcadFindingRow {
  readonly rule: string
  readonly severity: 'info' | 'warning' | 'critical'
  readonly message: string
  readonly sheet?: string
}

/** One cross-reference candidate, bounded for the card. */
export interface EcadCandidateRow {
  readonly value: string
  readonly kind: string
  readonly status: string
  readonly confidence: number
  readonly occurrences: number
  readonly note?: string
}

/** One already-known detail row a generic card prints. */
export interface EcadCardField {
  readonly name: string
  readonly value: string
}

/** A drawing the `ecad_open` call read. */
export interface EcadOpenCard {
  readonly kind: 'open'
  readonly summary: string
  readonly path?: string
  readonly requestedPath?: string
  readonly format: EcadCardFormat
  readonly converted: boolean
  readonly dwgWarnings: number
  readonly entities?: number
  readonly layouts?: number
  readonly unsupported?: number
  readonly approximate?: number
  readonly truncated: boolean
  readonly titleBlock: boolean
  readonly modelPath?: string
}

/** The workspace index `ecad_scan` wrote. */
export interface EcadScanCard {
  readonly kind: 'scan'
  readonly summary: string
  readonly indexPath?: string
  readonly sheets?: number
  readonly sets?: number
  readonly formats: { readonly dxf: number; readonly dwg: number }
  readonly unsupported?: number
  readonly skipped: number
  readonly truncated: boolean
}

/** The findings `ecad_checks` returned. */
export interface EcadChecksCard {
  readonly kind: 'checks'
  readonly summary: string
  readonly total: number
  readonly critical: number
  readonly warning: number
  readonly info: number
  readonly findings: readonly EcadFindingRow[]
  readonly scope?: string
}

/** The candidates `ecad_cross_reference` returned. */
export interface EcadCrossReferenceCard {
  readonly kind: 'crossReference'
  readonly summary: string
  readonly sheets?: number
  readonly total: number
  readonly rows: readonly EcadCandidateRow[]
  readonly duplicate: number
  readonly unresolved: number
  readonly oneSided: number
}

/** The SVG `ecad_render` wrote. */
export interface EcadRenderCard {
  readonly kind: 'render'
  readonly summary: string
  readonly path?: string
  readonly layout?: string
  readonly svgPath?: string
  readonly characters?: number
  readonly entities?: number
  readonly supported: number
  readonly unsupported?: number
  readonly approximate?: number
  readonly truncated: boolean
}

/** Everything else: a known ECAD tool whose specialised card does not exist, a failure, or unreadable text. */
export interface EcadGenericCard {
  readonly kind: 'generic'
  readonly summary: string
  readonly text: string
  readonly fields: readonly EcadCardField[]
  readonly error?: EcadCardError
}

/** One parsed tool result. */
export type EcadToolCard =
  | EcadOpenCard
  | EcadScanCard
  | EcadChecksCard
  | EcadCrossReferenceCard
  | EcadRenderCard
  | EcadGenericCard

/** One content block as the transcript carries it. */
export interface EcadCardContentBlock {
  readonly type?: string
  readonly text?: string
}

/** The most findings, candidates, problems or detail rows a card prints. */
const LIMIT = 8
/** Longest summary or free text a card carries; the rest stays in the row's text. */
const TEXT_LIMIT = 400

/** @returns the value as a plain object, or undefined. */
function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** @returns a non-empty string, or undefined. */
function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** @returns a finite number, or undefined. */
function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** @returns the array, or undefined. */
function arrayOf(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

/** @returns the strings of an array, dropping everything else. */
function stringsOf(value: unknown): readonly string[] {
  return (arrayOf(value) ?? []).filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
}

/** @returns a bounded, single-line version of the text. */
function bounded(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > TEXT_LIMIT ? `${trimmed.slice(0, TEXT_LIMIT - 1)}…` : trimmed
}

/** @returns the text of the content blocks joined by newlines. */
export function textOfContent(content: readonly EcadCardContentBlock[] | undefined): string {
  return (content ?? [])
    .flatMap(block => (block.type === undefined || block.type === 'text') && typeof block.text === 'string' ? [block.text] : [])
    .join('\n')
    .trim()
}

/** @returns the drawing format a tool answer names, defaulting to the path's extension. */
function formatOf(data: Record<string, unknown>, path: string | undefined): EcadCardFormat {
  const named = textOf(data.format) ?? textOf(data.outputFormat) ?? textOf(data.sourceFormat)
  if (named === 'dwg') return 'dwg'
  if (named === 'dxf') return 'dxf'
  return path !== undefined && path.toLowerCase().endsWith('.dwg') ? 'dwg' : 'dxf'
}

/** @returns the failure envelope, when the payload is one. */
function errorOf(record: Record<string, unknown>): EcadCardError | undefined {
  const error = recordOf(record.error)
  if (error === undefined) return undefined
  const code = textOf(error.code)
  const message = textOf(error.message)
  if (code === undefined && message === undefined) return undefined
  const fix = textOf(error.fix)
  return {
    code: code ?? 'ECAD_TOOL_ERROR',
    message: message ?? '',
    ...(fix === undefined ? {} : { fix }),
    candidates: stringsOf(error.candidates),
  }
}

/** @returns the fallback card for text this module cannot read as a tool envelope. */
function plainCard(summary: string, text: string, error?: EcadCardError): EcadGenericCard {
  return {
    kind: 'generic',
    summary: bounded(summary),
    text: bounded(text),
    fields: [],
    ...(error === undefined ? {} : { error }),
  }
}

/** @returns the generic card fields for the scalar entries of one data object. */
function scalarFields(data: Record<string, unknown>, names: readonly string[]): readonly EcadCardField[] {
  const fields: EcadCardField[] = []
  for (const name of names) {
    const value = data[name]
    const text = typeof value === 'string'
      ? textOf(value)
      : typeof value === 'number' && Number.isFinite(value)
        ? String(value)
        : typeof value === 'boolean'
          ? String(value)
          : undefined
    if (text === undefined) continue
    fields.push({ name, value: bounded(text) })
    if (fields.length >= LIMIT) break
  }
  return fields
}

/** @returns the open card, or undefined when the payload is not an open answer. */
function openCardOf(data: Record<string, unknown>, summary: string): EcadOpenCard | undefined {
  if (textOf(data.path) === undefined && textOf(data.modelPath) === undefined && numberOf(data.entities) === undefined) return undefined
  const path = textOf(data.path) ?? textOf(data.requestedPath)
  const converted = recordOf(data.converted)
  const titleBlock = recordOf(data.titleBlock)
  const titleFields = titleBlock === undefined ? undefined : recordOf(titleBlock.fields)
  return {
    kind: 'open',
    summary,
    ...(path === undefined ? {} : { path }),
    ...(textOf(data.requestedPath) === undefined ? {} : { requestedPath: textOf(data.requestedPath) }),
    format: formatOf(data, path),
    converted: converted !== undefined,
    dwgWarnings: converted === undefined ? 0 : stringsOf(converted.warnings).length,
    ...(numberOf(data.entities) === undefined ? {} : { entities: numberOf(data.entities) }),
    ...(arrayOf(data.layouts) === undefined ? {} : { layouts: (arrayOf(data.layouts) as readonly unknown[]).length }),
    ...(numberOf(data.unsupportedTotal) === undefined ? {} : { unsupported: numberOf(data.unsupportedTotal) }),
    ...(numberOf(data.approximate) === undefined ? {} : { approximate: numberOf(data.approximate) }),
    truncated: data.truncated === true,
    titleBlock: titleFields !== undefined && Object.keys(titleFields).length > 0,
    ...(textOf(data.modelPath) === undefined ? {} : { modelPath: textOf(data.modelPath) }),
  }
}

/** @returns the scan card, or undefined when the payload is not a scan answer. */
function scanCardOf(data: Record<string, unknown>, summary: string): EcadScanCard | undefined {
  if (textOf(data.indexPath) === undefined && numberOf(data.sheets) === undefined) return undefined
  const formats = recordOf(data.formats)
  const sets = recordOf(data.sets)
  const skipped = arrayOf(data.skipped)
  return {
    kind: 'scan',
    summary,
    ...(textOf(data.indexPath) === undefined ? {} : { indexPath: textOf(data.indexPath) }),
    ...(numberOf(data.sheets) === undefined ? {} : { sheets: numberOf(data.sheets) }),
    ...(sets === undefined ? {} : { sets: Object.keys(sets).length }),
    formats: {
      dxf: formats === undefined ? 0 : numberOf(formats.dxf) ?? 0,
      dwg: formats === undefined ? 0 : numberOf(formats.dwg) ?? 0,
    },
    ...(numberOf(data.unsupported) === undefined ? {} : { unsupported: numberOf(data.unsupported) }),
    skipped: skipped === undefined ? 0 : skipped.length,
    truncated: data.truncated === true,
  }
}

/** @returns the checks card, or undefined when the payload is not a checks answer. */
function checksCardOf(data: Record<string, unknown>, summary: string): EcadChecksCard | undefined {
  const findings = arrayOf(data.findings)
  if (findings === undefined) return undefined
  const rows: EcadFindingRow[] = []
  let critical = 0
  let warning = 0
  let info = 0
  for (const entry of findings) {
    const finding = recordOf(entry)
    if (finding === undefined) continue
    const severity = textOf(finding.severity) === 'critical' ? 'critical' : textOf(finding.severity) === 'warning' ? 'warning' : 'info'
    if (severity === 'critical') critical += 1
    else if (severity === 'warning') warning += 1
    else info += 1
    if (rows.length < LIMIT) {
      rows.push({
        rule: textOf(finding.rule) ?? 'ECAD',
        severity,
        message: textOf(finding.message) ?? '',
        ...(textOf(finding.sheet) === undefined ? {} : { sheet: textOf(finding.sheet) }),
      })
    }
  }
  return {
    kind: 'checks',
    summary,
    total: findings.length,
    critical,
    warning,
    info,
    findings: rows,
    ...(textOf(data.scope) === undefined ? {} : { scope: textOf(data.scope) }),
  }
}

/** @returns the cross-reference card, or undefined when the payload is not a candidate answer. */
function crossReferenceCardOf(data: Record<string, unknown>, summary: string): EcadCrossReferenceCard | undefined {
  const rows = arrayOf(data.rows)
  if (rows === undefined) return undefined
  const totals = recordOf(data.totals)
  const byStatus = totals === undefined ? undefined : recordOf(totals.byStatus)
  const countStatus = (status: string): number => {
    if (byStatus === undefined) return 0
    let total = 0
    for (const [key, value] of Object.entries(byStatus)) {
      if (!key.endsWith(`:${status}`)) continue
      const count = numberOf(value)
      if (count !== undefined) total += count
    }
    return total
  }
  const candidates: EcadCandidateRow[] = []
  for (const entry of rows) {
    const row = recordOf(entry)
    if (row === undefined) continue
    const value = textOf(row.value)
    if (value === undefined) continue
    if (candidates.length >= LIMIT) break
    candidates.push({
      value,
      kind: textOf(row.kind) ?? 'candidate',
      status: textOf(row.status) ?? 'ok',
      confidence: numberOf(row.confidence) ?? 0,
      occurrences: numberOf(row.occurrences) ?? 1,
      ...(textOf(row.note) === undefined ? {} : { note: textOf(row.note) }),
    })
  }
  return {
    kind: 'crossReference',
    summary,
    ...(numberOf(data.sheets) === undefined ? {} : { sheets: numberOf(data.sheets) }),
    total: rows.length,
    rows: candidates,
    duplicate: countStatus('duplicate'),
    unresolved: countStatus('unresolved'),
    oneSided: countStatus('one-sided'),
  }
}

/** @returns the render card, or undefined when the payload is not a render answer. */
function renderCardOf(data: Record<string, unknown>, summary: string): EcadRenderCard | undefined {
  if (textOf(data.svgPath) === undefined) return undefined
  return {
    kind: 'render',
    summary,
    ...(textOf(data.path) === undefined ? {} : { path: textOf(data.path) }),
    ...(textOf(data.layout) === undefined ? {} : { layout: textOf(data.layout) }),
    ...(textOf(data.svgPath) === undefined ? {} : { svgPath: textOf(data.svgPath) }),
    ...(numberOf(data.characters) === undefined ? {} : { characters: numberOf(data.characters) }),
    ...(numberOf(data.entities) === undefined ? {} : { entities: numberOf(data.entities) }),
    supported: numberOf(data.drawn) ?? 0,
    ...(numberOf(data.unsupported) === undefined ? {} : { unsupported: numberOf(data.unsupported) }),
    ...(numberOf(data.approximate) === undefined ? {} : { approximate: numberOf(data.approximate) }),
    truncated: data.truncated === true,
  }
}

/** @returns the detail fields a known non-specialised tool's answer states. */
function fieldsOf(toolName: string, data: Record<string, unknown>): readonly EcadCardField[] {
  switch (toolName) {
    case 'ecad_compare': {
      const paths: EcadCardField[] = []
      for (const side of ['a', 'b'] as const) {
        const path = textOf(recordOf(data[side])?.path)
        if (path !== undefined) paths.push({ name: side, value: path })
      }
      return [...paths, ...scalarFields(data, ['added', 'removed', 'changed', 'truncated'])].slice(0, LIMIT)
    }
    case 'ecad_capabilities': {
      const cad = recordOf(data.cad)
      const fields: EcadCardField[] = []
      if (cad !== undefined) {
        const entry = textOf(cad.entryTool) ?? 'the CAD bridge'
        fields.push({ name: 'cad', value: cad.mounted === true ? `mounted: ${entry}` : `not mounted: ${entry}` })
      }
      fields.push(...scalarFields(data, ['writes', 'profileSource', 'maxFileBytes']))
      return fields.slice(0, LIMIT)
    }
    case 'ecad_profile':
      return scalarFields(data, ['path', 'source', 'sheets'])
    case 'ecad_overview':
      return scalarFields(data, ['sheets', 'source', 'truncated'])
    case 'ecad_find':
      return scalarFields(data, ['rows', 'sheets', 'truncated'])
    case 'ecad_document':
      return scalarFields(data, ['outputPath', 'files', 'format'])
    case 'ecad_backup':
      return scalarFields(data, ['outputPath', 'files', 'format'])
    default:
      return scalarFields(data, ['path', 'outputPath', 'sheets', 'rows', 'drafts', 'format', 'writes'])
  }
}

/**
 * Read one tool result as a card.
 *
 * @param toolName - the wire tool name the keyed dispatch named.
 * @param value - the parsed JSON the tool returned, or undefined when it did not parse.
 * @param text - the raw result text, used as the fallback body.
 * @param isError - whether the transcript marked the result as a failure.
 * @returns a specialised card, a generic card, or the plain fallback.
 */
export function cardOfValue(toolName: string, value: unknown, text: string, isError = false): EcadToolCard {
  const record = recordOf(value)
  if (record === undefined) {
    return plainCard(text, text, isError ? { code: 'ECAD_TOOL_ERROR', message: '', candidates: [] } : undefined)
  }
  const error = errorOf(record)
  if (error !== undefined) return plainCard(error.message === '' ? error.code : error.message, text, error)
  if (isError) return plainCard(text, text, { code: 'ECAD_TOOL_ERROR', message: textOf(record.summary) ?? '', candidates: [] })
  const summary = textOf(record.summary) ?? bounded(text)
  const data = recordOf(record.data)
  if (data === undefined) return plainCard(summary, text)
  switch (toolName) {
    case 'ecad_open': {
      const card = openCardOf(data, summary)
      if (card !== undefined) return card
      break
    }
    case 'ecad_scan': {
      const card = scanCardOf(data, summary)
      if (card !== undefined) return card
      break
    }
    case 'ecad_checks': {
      const card = checksCardOf(data, summary)
      if (card !== undefined) return card
      break
    }
    case 'ecad_cross_reference': {
      const card = crossReferenceCardOf(data, summary)
      if (card !== undefined) return card
      break
    }
    case 'ecad_render': {
      const card = renderCardOf(data, summary)
      if (card !== undefined) return card
      break
    }
    default:
      return {
        kind: 'generic',
        summary,
        text: bounded(text),
        fields: fieldsOf(toolName, data),
      }
  }
  // A known tool whose answer did not carry the fields its card needs: print what it said.
  return plainCard(summary, text)
}

/**
 * Read one tool result as a card from the transcript's content blocks.
 *
 * @param toolName - the wire tool name.
 * @param content - the result content blocks.
 * @param isError - whether the transcript marked the result as a failure.
 * @returns the card; never throws.
 */
export function cardOfContent(toolName: string, content: readonly EcadCardContentBlock[] | undefined, isError = false): EcadToolCard {
  const text = textOfContent(content)
  if (text === '') {
    return plainCard('', '', isError ? { code: 'ECAD_TOOL_ERROR', message: '', candidates: [] } : undefined)
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return plainCard(firstLine(text), text, isError ? { code: 'ECAD_TOOL_ERROR', message: '', candidates: [] } : undefined)
  }
  return cardOfValue(toolName, value, text, isError)
}

/** @returns the first non-empty line of the text. */
function firstLine(text: string): string {
  const line = text.split('\n').find(entry => entry.trim() !== '')
  return line === undefined ? '' : bounded(line)
}

/** The workspace drawing report the dock chip prints. */
export interface EcadSheetSet {
  readonly drawings: number
  readonly dwg: number
  readonly truncated: boolean
  /** Undefined when the capability report was unavailable. */
  readonly writes?: boolean
  /** True only when the workspace profile file was read. Undefined when unavailable. */
  readonly profileConfirmed?: boolean
}

/**
 * Read the two Remote answers the dock needs into one chip model.
 *
 * `sheets` is the `ecad.sheets` report; `capabilities` is the `ecad.capabilities`
 * report, when the second call answered. A missing or malformed sheet report is
 * not a chip: the dock stays absent rather than claiming a count it cannot know.
 * @param sheetsValue - the `ecad.sheets` result value.
 * @param capabilitiesValue - the `ecad.capabilities` result value, when available.
 * @returns the chip model, or undefined when the drawing list could not be read.
 */
export function sheetSetOf(sheetsValue: unknown, capabilitiesValue?: unknown): EcadSheetSet | undefined {
  const sheets = recordOf(sheetsValue)
  const rows = sheets === undefined ? undefined : arrayOf(sheets.sheets)
  if (rows === undefined) return undefined
  let dwg = 0
  for (const entry of rows) {
    const row = recordOf(entry)
    if (row === undefined) continue
    const path = textOf(row.path)
    if (textOf(row.format) === 'dwg' || (path !== undefined && path.toLowerCase().endsWith('.dwg'))) dwg += 1
  }
  const capabilities = recordOf(capabilitiesValue)
  const profileSource = capabilities === undefined ? undefined : textOf(capabilities.profileSource)
  return {
    drawings: rows.length,
    dwg,
    truncated: sheets?.truncated === true,
    ...(capabilities === undefined ? {} : { writes: capabilities.writes === true }),
    ...(profileSource === undefined ? {} : { profileConfirmed: profileSource === 'workspace' }),
  }
}

/**
 * Whether the sheet-set chip belongs in the composer dock for this report.
 * A session with no `.dxf`/`.dwg` in its workspace keeps the composer unchanged.
 * @param set - the report {@link sheetSetOf} read.
 * @returns true when the chip should render.
 */
export function sheetSetVisible(set: EcadSheetSet | undefined): set is EcadSheetSet {
  return set !== undefined && set.drawings > 0
}
