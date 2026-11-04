/**
 * Static review findings for one drawing set.
 *
 * Every rule here is a text/layer measurement, never an electrical claim: a
 * duplicate tag is a "candidate", an unresolved sheet reference is a reference
 * the file set cannot answer, and the scope note that always closes the list
 * says exactly what was not proven. A clean result therefore reads "no finding
 * fired", not "the drawing is correct".
 *
 * @module dsh-engineering-ecad/engine/checks
 */

import type { EcadCrossReferenceRow, EcadFinding, EcadIndexSheet, EcadProfile, EcadSheetModel, EcadTitleBlock } from './types.ts'
import { crossReference } from './crossref.ts'
import type { CrossrefModel } from './crossref.ts'
import { fileStem } from './parse.ts'
import { pairTitleBlockValues } from './titleblock.ts'
import { TITLE_BLOCK_FIELDS } from './titleblock.ts'
import { singleLine } from './text.ts'

/** One sheet handed to {@link runChecks}. */
export interface EcadCheckSheet {
  /** Path of the drawing. */
  readonly path: string
  /** Its built model. */
  readonly model: EcadSheetModel
  /** Its detected title block. */
  readonly titleBlock: EcadTitleBlock
  /** Its detected index sheet, when it is the index. */
  readonly index?: EcadIndexSheet
}

/** Input of {@link runChecks}. */
export interface EcadChecksInput {
  /** Every sheet in the set. */
  readonly sheets: readonly EcadCheckSheet[]
  /** The confirmed or inferred profile. */
  readonly profile: EcadProfile
  /** The set's index sheet, when one was detected. */
  readonly index?: EcadIndexSheet
}

/** Options of {@link runChecks}. */
export interface EcadChecksOptions {
  /** Cap per rule family for the repetitive rules. Defaults to 20. */
  readonly maxPerRule?: number
  /** Cap on the total number of findings. Defaults to 2000. */
  readonly maxFindings?: number
}

/** Rule ids in output order. */
const RULE_ORDER: readonly string[] = [
  'ECAD-TB-MISSING',
  'ECAD-TB-BLANK',
  'ECAD-SHEET-MISMATCH',
  'ECAD-INDEX-MISMATCH',
  'ECAD-DEVICE-DUPLICATE',
  'ECAD-WIRE-DUPLICATE',
  'ECAD-TEXT-TOO-SMALL',
  'ECAD-LAYER-UNKNOWN',
  'ECAD-SHEET-REF-UNRESOLVED',
  'ECAD-SCOPE'
]

/** Titles that mark an index row as intentionally empty. */
const SPARE_TITLE = /spare|blank|reserved|not used|future/i

/**
 * Run every static check over the set.
 *
 * @param input - sheets, profile and the set's index sheet.
 * @param options - per-rule and total caps.
 * @returns findings in stable rule order, ending with the scope note.
 */
export function runChecks(input: EcadChecksInput, options: EcadChecksOptions = {}): EcadFinding[] {
  const maxPerRule = Math.max(1, Math.trunc(options.maxPerRule ?? 20))
  const maxFindings = Math.max(1, Math.trunc(options.maxFindings ?? 2000))
  const findings: EcadFinding[] = []
  const sheets = input.sheets
  const profile = input.profile

  // Title block presence and blanks.
  for (const sheet of sheets) {
    const fields = sheet.titleBlock.fields
    const hasNumber = typeof fields.sheetNumber?.value === 'string' && fields.sheetNumber.value.trim().length > 0
    const hasTitle = typeof fields.title?.value === 'string' && fields.title.value.trim().length > 0
    if (!hasNumber && !hasTitle) {
      findings.push({
        rule: 'ECAD-TB-MISSING',
        severity: 'warning',
        message: `no title-block field was recognised on ${sheet.path}`,
        sheet: sheet.path,
        layout: sheet.titleBlock.layout,
        fix: 'Confirm the profile title-block layers/labels, or add the sheet number and title to the drawing title block.'
      })
      continue
    }
    const pairing = pairTitleBlockValues(sheet.model, profile)
    for (const blank of pairing.blanks.slice(0, maxPerRule)) {
      findings.push({
        rule: 'ECAD-TB-BLANK',
        severity: 'info',
        message: `title-block label ${JSON.stringify(blank.label)} has no paired value on ${sheet.path}`,
        sheet: sheet.path,
        layout: blank.layout,
        layer: blank.layer,
        entityId: blank.entityId,
        text: blank.label,
        fix: 'Fill the field on the drawing, or confirm the label is not a field the set requires.'
      })
    }
  }

  // File name versus title block sheet number.
  for (const sheet of sheets) {
    const fromFilename = numericSuffix(fileStem(sheet.path))
    const titleNumber = sheet.titleBlock.fields.sheetNumber?.value
    const fromTitle = numericSuffix(titleNumber ?? '')
    if (fromFilename === undefined || fromTitle === undefined) continue
    if (fromFilename === fromTitle) continue
    findings.push({
      rule: 'ECAD-SHEET-MISMATCH',
      severity: 'warning',
      message: `file name says sheet ${fromFilename} but the title block says ${fromTitle} (${JSON.stringify(titleNumber)})`,
      sheet: sheet.path,
      layout: sheet.titleBlock.layout,
      text: titleNumber,
      fix: 'Rename the drawing to match its title block, or correct the title-block sheet number; do not ship a set where the two disagree.'
    })
  }

  // Index sheet versus the files present.
  const index = input.index ?? sheets.find(sheet => sheet.index !== undefined)?.index
  if (index) {
    const indexSheetPath = sheets.find(sheet => sheet.index === index)?.path
    const fileNumbers = new Set<number>()
    for (const sheet of sheets) {
      const number = numericSuffix(fileStem(sheet.path))
      if (number !== undefined) fileNumbers.add(number)
    }
    const indexed = new Set<number>()
    let reportedMissing = 0
    for (const entry of index.entries) {
      const number = numericSuffix(entry.sheetNumber ?? '')
      if (number === undefined) continue
      indexed.add(number)
      if (fileNumbers.has(number)) continue
      if (entry.title !== undefined && SPARE_TITLE.test(entry.title)) continue
      if (entry.title === undefined && !entry.raw.includes('-')) continue
      if (reportedMissing >= maxPerRule) continue
      reportedMissing += 1
      findings.push({
        rule: 'ECAD-INDEX-MISMATCH',
        severity: 'warning',
        message: `the sheet index lists ${JSON.stringify(entry.sheetNumber ?? entry.raw)}${entry.title ? ` (${entry.title})` : ''} but no file in the set carries sheet ${number}`,
        sheet: indexSheetPath,
        layout: index.layout,
        text: entry.raw,
        fix: 'Add the missing drawing, or mark the index row as a spare; a partial set is reported rather than assumed complete.'
      })
    }
    let reportedUnindexed = 0
    for (const sheet of sheets) {
      const number = numericSuffix(fileStem(sheet.path))
      if (number === undefined || indexed.has(number)) continue
      if (reportedUnindexed >= maxPerRule) continue
      reportedUnindexed += 1
      findings.push({
        rule: 'ECAD-INDEX-MISMATCH',
        severity: 'warning',
        message: `file ${sheet.path} is not listed in the sheet index`,
        sheet: sheet.path,
        text: fileStem(sheet.path),
        fix: 'Add the sheet to the index, or confirm the file does not belong to this set.'
      })
    }
  }

  // Cross-reference candidate duplicates and unresolved sheet references.
  const models: CrossrefModel[] = sheets.map(sheet => ({ path: sheet.path, model: sheet.model }))
  let crossRows: EcadCrossReferenceRow[] = []
  try {
    crossRows = crossReference(models, profile)
  } catch {
    crossRows = []
  }
  let deviceFindings = 0
  let wireFindings = 0
  let referenceFindings = 0
  for (const row of crossRows) {
    if (row.kind === 'device-tag' && row.status === 'duplicate' && deviceFindings < maxPerRule) {
      deviceFindings += 1
      findings.push({
        rule: 'ECAD-DEVICE-DUPLICATE',
        severity: 'warning',
        message: `device tag ${row.value} appears ${row.sheets.length} times (${row.note ?? 'duplicate candidate'})`,
        sheet: row.sheets[0]?.path,
        layout: row.sheets[0]?.layout,
        layer: row.sheets[0]?.layer,
        entityId: row.sheets[0]?.entityId,
        text: row.value,
        fix: 'Inspect the occurrences; a repeated tag is a candidate duplicate, so confirm whether the device is drawn twice or the tag is copy-pasted.'
      })
    } else if (row.kind === 'wire-label' && row.status === 'duplicate' && wireFindings < maxPerRule) {
      wireFindings += 1
      findings.push({
        rule: 'ECAD-WIRE-DUPLICATE',
        severity: 'info',
        message: `wire label ${row.value} appears ${row.sheets.length} times (${row.note ?? 'duplicate candidate'})`,
        sheet: row.sheets[0]?.path,
        layout: row.sheets[0]?.layout,
        layer: row.sheets[0]?.layer,
        entityId: row.sheets[0]?.entityId,
        text: row.value,
        fix: 'Check the wire numbering on the drawing; this is a text pattern candidate, not a connectivity result.'
      })
    } else if (row.kind === 'sheet-reference' && row.status === 'unresolved' && referenceFindings < maxPerRule) {
      referenceFindings += 1
      findings.push({
        rule: 'ECAD-SHEET-REF-UNRESOLVED',
        severity: 'warning',
        message: `${JSON.stringify(row.value)} has no matching sheet in this set`,
        sheet: row.sheets[0]?.path,
        layout: row.sheets[0]?.layout,
        layer: row.sheets[0]?.layer,
        entityId: row.sheets[0]?.entityId,
        text: row.sheets[0]?.text,
        fix: 'Confirm the target sheet number, or add the target drawing to the set; the reference may be correct for the full set.'
      })
    }
  }

  // Text smaller than the profile minimum, aggregated per sheet/layer/height.
  if (profile.minTextHeight > 0) {
    for (const sheet of sheets) {
      const groups = new Map<string, { layer: string; height: number; count: number; entityId: string; layout: string }>()
      for (const layout of sheet.model.layouts) {
        for (const entity of layout.entities) {
          if (entity.k !== 'text' && entity.k !== 'mtext') continue
          if (entity.g) continue
          if (entity.layer.toUpperCase() === 'DEFPOINTS') continue
          const height = entity.h
          if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) continue
          if (height >= profile.minTextHeight) continue
          const key = `${layout.id}|${entity.layer}|${height}`
          const group = groups.get(key)
          if (group) group.count += 1
          else groups.set(key, { layer: entity.layer, height, count: 1, entityId: entity.id, layout: layout.id })
        }
      }
      let reported = 0
      for (const group of [...groups.values()].sort((a, b) => b.count - a.count)) {
        if (reported >= maxPerRule) break
        reported += 1
        findings.push({
          rule: 'ECAD-TEXT-TOO-SMALL',
          severity: 'info',
          message: `${group.count} text entit${group.count === 1 ? 'y' : 'ies'} on layer ${group.layer} has height ${group.height}, below the profile minimum ${profile.minTextHeight}`,
          sheet: sheet.path,
          layout: group.layout,
          layer: group.layer,
          entityId: group.entityId,
          fix: 'Raise the text height, or lower the profile minTextHeight if this layer is intentionally small.'
        })
      }
    }
  }

  // Layers outside the profile standard.
  if (profile.standardLayers.length > 0) {
    const standard = new Set(profile.standardLayers.map(name => name.toUpperCase()))
    for (const sheet of sheets) {
      const used = new Set<string>()
      for (const layout of sheet.model.layouts) {
        for (const entity of layout.entities) used.add(entity.layer)
      }
      let reported = 0
      for (const layer of [...used].sort((a, b) => a.localeCompare(b))) {
        if (standard.has(layer.toUpperCase())) continue
        if (reported >= maxPerRule) break
        reported += 1
        findings.push({
          rule: 'ECAD-LAYER-UNKNOWN',
          severity: 'info',
          message: `layer ${layer} is used on ${sheet.path} but is not in the profile's standard layers`,
          sheet: sheet.path,
          layer,
          fix: 'Add the layer to the profile standardLayers if it belongs to the set standard, or move the entities to a standard layer.'
        })
      }
    }
  }

  // Always close with what the checks did not prove.
  findings.push({
    rule: 'ECAD-SCOPE',
    severity: 'info',
    message:
      'static text and layer checks only: they do not prove electrical correctness, wire connectivity, terminal assignments, ratings, or that the drawing matches the machine. Duplicate and cross-reference rows are candidates for review.',
    fix: 'Have a person review any finding against the drawing and the machine before acting on it.'
  })

  const limit = Math.max(1, maxFindings)
  let capped = findings
  if (findings.length > limit) {
    capped = findings.slice(0, limit - 1)
    capped.push(findings[findings.length - 1]!)
  }
  return capped.sort(compareFindings)
}

/**
 * Numeric sheet number of a value: its trailing 1–4 digit run, or `undefined`.
 *
 * @param value - file stem or title-block sheet number.
 */
export function numericSuffix(value: string): number | undefined {
  const match = /(\d{1,4})(?!.*\d)/.exec(value)
  if (!match) return undefined
  const number = Number.parseInt(match[1]!, 10)
  return Number.isFinite(number) ? number : undefined
}

/**
 * Stable finding order: rule order, then sheet, then layer, then text.
 *
 * @param a - first finding.
 * @param b - second finding.
 */
function compareFindings(a: EcadFinding, b: EcadFinding): number {
  const ruleA = RULE_ORDER.indexOf(a.rule)
  const ruleB = RULE_ORDER.indexOf(b.rule)
  if (ruleA !== ruleB) return (ruleA < 0 ? Number.MAX_SAFE_INTEGER : ruleA) - (ruleB < 0 ? Number.MAX_SAFE_INTEGER : ruleB)
  const sheet = String(a.sheet ?? '').localeCompare(String(b.sheet ?? ''))
  if (sheet !== 0) return sheet
  const layer = String(a.layer ?? '').localeCompare(String(b.layer ?? ''))
  if (layer !== 0) return layer
  return String(a.text ?? a.message).localeCompare(String(b.text ?? b.message))
}

/**
 * Field labels the profile declares, for callers that render a title-block
 * table without importing the profile constants.
 *
 * @param profile - the ECAD profile.
 */
export function profileFields(profile: EcadProfile): string[] {
  return TITLE_BLOCK_FIELDS.filter(field => (profile.titleBlockLabels[field] ?? []).length > 0)
}

/**
 * Single-line display form of a possibly multi-line title-block value.
 *
 * @param value - stored value.
 */
export function displayValue(value: string): string {
  return singleLine(value)
}
