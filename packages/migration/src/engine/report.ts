/**
 * Compose the migration report a person reads before touching the conversion.
 *
 * The report answers four questions in order: what was converted, what the
 * wizard could not translate (the `PCE` markers and the `?` operands), what was
 * corrected afterwards, and what still needs a human decision — a placeholder
 * tag standing in for a module with no Logix equivalent, a legacy I/O image that
 * is only a tag array, an array indexed by a tag, a revision below the one an
 * offline build needs.
 *
 * The report is built once as a small document model, then rendered as Markdown
 * for a diff or as a Word document for a person. It reads text only: the legacy
 * side arrives already read, the Logix side is parsed here, and nothing
 * contacts a controller or a vendor application.
 *
 * @module dsh-engineering-migration/report
 */

import { compareSides, readLogix, type Comparison, type LegacySide, type LogixSide } from './compare.ts'
import { legacyCalls, resolvePces, type LegacyRungRef, type PceReport } from './pce.ts'

/** One module declaration in the Logix export. */
export interface ReportModule {
  readonly name: string
  readonly catalog: string
  readonly parent: string
}

/** One tag declaration in the Logix export. */
export interface ReportTag {
  readonly name: string
  readonly dataType: string
  readonly dimensions: string
  readonly aliasFor: string
  readonly io: boolean
}

/** One array reference whose subscript is a tag rather than a number. */
export interface IndirectSite {
  readonly expression: string
  readonly file: string
  readonly index: string
  /** The element an alias index resolves to, when the index is an alias. */
  readonly indexTarget?: string
  readonly kind: 'alias' | 'tag'
}

/** One rung that differs between the wizard's export and the corrected one. */
export interface Correction {
  readonly routine: string
  readonly rung: number
  readonly change: 'marker removed' | 'operand repaired' | 'rewritten' | 'rung removed'
  readonly before: string
  readonly after: string
}

/** One block of the report, independent of the format it is rendered in. */
export type ReportBlock =
  | { readonly kind: 'para'; readonly text: string }
  | { readonly kind: 'bullets'; readonly items: readonly string[] }
  | {
    readonly kind: 'table'
    readonly headers: readonly string[]
    readonly rows: readonly (readonly string[])[]
    /** A line under the table, for "…and 43 more". */
    readonly note?: string
  }

/** One numbered section of the report. */
export interface ReportSection {
  readonly title: string
  readonly blocks: readonly ReportBlock[]
}

/** The whole report, before a renderer touches it. */
export interface ReportModel {
  readonly title: string
  readonly subtitle: string
  readonly intro: string
  readonly sections: readonly ReportSection[]
}

/** What the report is composed from. */
export interface ReportInput {
  readonly sourceFile: string
  readonly legacy: LegacySide
  readonly legacyRungs: readonly LegacyRungRef[]
  readonly legacyProduct: string
  readonly legacyRevision: number | undefined
  readonly legacyRungsRead: number
  readonly legacyTruncated: boolean
  readonly pre: { readonly file: string; readonly bytes: number; readonly text: string }
  readonly post?: { readonly file: string; readonly bytes: number; readonly text: string }
  readonly generatedAt: string
  /** Rows shown per table before the rest are counted. */
  readonly limit: number
}

/** What the report found, so a caller can log or assert on it. */
export interface ReportFacts {
  readonly markers: number
  readonly markersAfter: number | undefined
  readonly unknownOperands: number
  readonly unknownOperandsAfter: number | undefined
  readonly corrections: number
  readonly placeholders: readonly string[]
  readonly ioImages: readonly string[]
  readonly indirect: number
  readonly indirectMechanical: number
  readonly openItems: number
  readonly characters: number
}

/** The report plus the facts behind it. */
export interface ReportResult {
  readonly model: ReportModel
  readonly markdown: string
  readonly facts: ReportFacts
  readonly comparison: Comparison
  readonly pce: PceReport
  readonly logix: LogixSide
}

/** How many `PCE` markers a text carries. */
function markerCount(text: string): number {
  return (text.match(/\bPCE\s*\(/gu) ?? []).length
}

/** Whether a rung text still carries an unknown operand. */
function hasUnknown(text: string): boolean {
  return text.replace(/<\?xml[^>]*\?>/gu, '').includes('?')
}

/** How many rungs of a Logix side still carry an unknown operand. */
function unknownRungs(side: LogixSide): number {
  let count = 0
  for (const routine of side.routines) {
    for (const text of routine.texts) {
      if (hasUnknown(text)) count += 1
    }
  }
  return count
}

/** Cut a value down to something a table cell can hold. */
function clip(value: string, max = 78): string {
  const flat = value.replaceAll(/\s+/gu, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}

/** Keep a cell from breaking a markdown table. */
function cell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
}

/** Strip a CDATA wrapper so a cell shows the rung, not the XML around it. */
function bare(text: string): string {
  return text.replace(/^\s*<!\[CDATA\[/u, '').replace(/\]\]>\s*$/u, '')
}

/**
 * The narrowest window of two rung texts that still shows what changed.
 *
 * A corrected rung is often two hundred characters of unchanged contacts around
 * a four-character difference; printing both in full hides the point. This keeps
 * the shared head and tail out and pads the difference on both sides.
 */
export function changeWindow(before: string, after: string, padding = 28): { before: string; after: string } {
  const left = bare(before).replaceAll(/\s+/gu, ' ').trim()
  const right = bare(after).replaceAll(/\s+/gu, ' ').trim()
  if (right === '') return { before: clip(left, 78), after: '(rung removed)' }
  let start = 0
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1
  let endLeft = left.length
  let endRight = right.length
  while (endLeft > start && endRight > start && left[endLeft - 1] === right[endRight - 1]) {
    endLeft -= 1
    endRight -= 1
  }
  const from = Math.max(0, start - padding)
  const lead = from > 0 ? '…' : ''
  const cut = (text: string, end: number): string => `${lead}${text.slice(from, Math.min(text.length, end + padding))}${Math.min(text.length, end + padding) < text.length ? '…' : ''}`
  return { before: cut(left, endLeft), after: cut(right, endRight) }
}

/** Render a markdown table with a header row. */
function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return ''
  const head = `| ${headers.map(cell).join(' | ')} |`
  const rule = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map(row => `| ${row.map(value => cell(value)).join(' | ')} |`)
  return [head, rule, ...body].join('\n')
}

/** Read the module declarations of a Logix export. */
export function readModules(text: string): readonly ReportModule[] {
  const modules: ReportModule[] = []
  for (const match of text.matchAll(/<Module\b([^>]*)>/gu)) {
    const attributes = match[1] ?? ''
    const name = /\bName="([^"]*)"/u.exec(attributes)?.[1] ?? ''
    const catalog = /\bCatalogNumber="([^"]*)"/u.exec(attributes)?.[1] ?? ''
    const parent = /\bParentModule="([^"]*)"/u.exec(attributes)?.[1] ?? ''
    if (name !== '') modules.push({ name, catalog, parent })
  }
  return modules
}

/** Read the tag declarations of a Logix export, module I/O tags included. */
export function readTags(text: string): readonly ReportTag[] {
  const tags: ReportTag[] = []
  for (const match of text.matchAll(/<Tag\b([^>]*?)(?:\/>|>)/gu)) {
    const attributes = match[1] ?? ''
    const name = /\bName="([^"]*)"/u.exec(attributes)?.[1] ?? ''
    if (name === '') continue
    tags.push({
      name,
      dataType: /\bDataType="([^"]*)"/u.exec(attributes)?.[1] ?? '',
      dimensions: /\bDimensions="([^"]*)"/u.exec(attributes)?.[1] ?? '',
      aliasFor: /\bAliasFor="([^"]*)"/u.exec(attributes)?.[1] ?? '',
      io: /\bIO="true"/u.test(attributes),
    })
  }
  return tags
}

/**
 * Find `File[index]` references whose subscript is a tag.
 *
 * A subscript that is an alias to `N48[2]` is a mechanical rewrite — Logix
 * accepts a tag expression there — while a plain tag index is a decision.
 */
export function indirectSites(text: string, tags: readonly ReportTag[]): readonly IndirectSite[] {
  const aliasOf = new Map(tags.filter(tag => tag.aliasFor !== '').map(tag => [tag.name, tag.aliasFor]))
  const seen = new Map<string, IndirectSite>()
  for (const match of text.matchAll(/\b([A-Z]{1,2}\d*)\[\s*([A-Za-z_][\w]*)\s*\]/gu)) {
    const expression = match[0]
    if (seen.has(expression)) continue
    const file = match[1] ?? ''
    const index = match[2] ?? ''
    const target = aliasOf.get(index)
    seen.set(expression, {
      expression,
      file,
      index,
      ...(target === undefined ? {} : { indexTarget: target }),
      kind: target === undefined ? 'tag' : 'alias',
    })
  }
  return [...seen.values()]
}

/** Pair two exports routine by routine and report the rungs that differ. */
export function correctionsBetween(pre: string, post: string): readonly Correction[] {
  const before = readLogix(pre)
  const after = readLogix(post)
  const afterByName = new Map(after.routines.map(routine => [routine.name, routine]))
  const corrections: Correction[] = []
  for (const routine of before.routines) {
    const counterpart = afterByName.get(routine.name)
    for (const [rung, text] of routine.texts.entries()) {
      const later = counterpart?.texts[rung]
      if (later === undefined) {
        corrections.push({ routine: routine.name, rung, change: 'rung removed', before: text, after: '' })
        continue
      }
      if (later === text) continue
      const change = markerCount(text) > markerCount(later)
        ? 'marker removed'
        : hasUnknown(text) && !hasUnknown(later)
          ? 'operand repaired'
          : 'rewritten'
      corrections.push({ routine: routine.name, rung, change, before: text, after: later })
    }
  }
  return corrections
}

/** The value, or an em dash when there is nothing to show. */
function orDash(value: string | number | undefined): string {
  return value === undefined || value === '' ? '—' : String(value)
}

/** The singular or plural word for a count. */
function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

/**
 * Compose the report.
 *
 * @param input - The legacy read, the two exports and the clock.
 * @returns The model, its markdown rendering and the facts behind it.
 */
export function buildMigrationReport(input: ReportInput): ReportResult {
  const logix = readLogix(input.pre.text)
  const comparison = compareSides(input.legacy, logix)
  const pce = resolvePces(input.legacyRungs, logix.routines)
  const modules = readModules(input.pre.text)
  const tags = readTags(input.pre.text)
  const indirect = indirectSites(input.pre.text, tags)
  const placeholderTags = tags.filter(tag => /placeholder/iu.test(tag.name))
  const ioImages = tags.filter(tag => !tag.io && /^(?:[IO]|[A-Z]+:[0-9]+:[IO])$/u.test(tag.name))
  const postLogix = input.post === undefined ? undefined : readLogix(input.post.text)
  const corrections = input.post === undefined ? [] : correctionsBetween(input.pre.text, input.post.text)
  const markersAfter = input.post === undefined ? undefined : markerCount(input.post.text)
  const unknownAfter = postLogix === undefined ? undefined : unknownRungs(postLogix)

  // A rung that still carries a marker, or a `?`, in the newest export is work.
  const leftovers: { routine: string; rung: number; markers: number; unknown: number; text: string }[] = []
  for (const routine of (postLogix ?? logix).routines) {
    for (const [rung, text] of routine.texts.entries()) {
      const markers = markerCount(text)
      const unknown = hasUnknown(text) ? 1 : 0
      if (markers > 0 || unknown > 0) leftovers.push({ routine: routine.name, rung, markers, unknown, text })
    }
  }

  const placeholderRows = placeholderTags.map(tag => {
    const uses = (input.pre.text.match(new RegExp(`\\b${tag.name}\\b`, 'gu')) ?? []).length - 1
    return [tag.name, tag.dataType, String(Math.max(0, uses))]
  })
  const ioRows = ioImages.map(tag => [tag.name, tag.dataType, tag.dimensions === '' ? '—' : tag.dimensions])
  const aliasIndirect = indirect.filter(site => site.kind === 'alias')
  const tagIndirect = indirect.filter(site => site.kind === 'tag')
  const missingFiles = comparison.missingInLogix
  const openItems =
    (placeholderTags.length > 0 ? 1 : 0) +
    (ioImages.length > 0 ? 1 : 0) +
    (indirect.length > 0 ? 1 : 0) +
    (leftovers.length > 0 ? 1 : 0) +
    (missingFiles.length > 0 || comparison.dataFiles.missing.length > 0 ? 1 : 0) +
    ((logix.revision ?? 0) < 37 ? 1 : 0)

  const sections: ReportSection[] = []

  const glance: string[] = [
    `**Legacy:** ${orDash(input.legacyProduct)} project \`${input.legacy.project}\`, ${input.legacy.files.length} program ${plural(input.legacy.files.length, 'file', 'files')}, ${input.legacy.totalRungs} rung(s), ${input.legacy.symbolCount} symbol(s).`,
    `**Converted:** ${orDash(logix.processor)} at revision ${orDash(logix.revision)}, ${logix.routines.length} routine(s), ${logix.rungCount} rung(s), ${modules.length} module(s).`,
    `**The wizard left:** ${pce.counts.markers} conversion marker(s) and ${pce.counts.operands} rung(s) with an unknown operand — ${pce.counts.mechanical} answerable from the rung texts, ${pce.counts.review} for a person.`,
    input.post === undefined
      ? '**Corrected:** no corrected export was supplied, so nothing after the conversion is reported.'
      : `**Corrected:** ${corrections.length} rung(s) rewritten; markers ${pce.counts.markers} → ${markersAfter ?? 0}, unknown operands ${pce.counts.operands} → ${unknownAfter ?? 0} rung(s).`,
    `**Needs a decision:** ${openItems} ${plural(openItems, 'item', 'items')} — see §4.`,
  ]
  sections.push({ title: 'At a glance', blocks: [{ kind: 'bullets', items: glance }] })

  const programs: ReportBlock[] = [{
    kind: 'table',
    headers: ['', 'Legacy', 'Logix'],
    rows: [
      ['File', input.sourceFile, input.pre.file],
      ['Product', input.legacyProduct === '' ? '—' : input.legacyProduct, 'Studio 5000 Logix Designer'],
      ['Name', orDash(input.legacy.project), orDash(logix.controller)],
      ['Controller type', '— (the headless read reports no processor type)', orDash(logix.processor)],
      ['Processor version', orDash(input.legacyRevision), '—'],
      ['Project revision', '—', orDash(logix.revision)],
      ['Program files / routines', String(input.legacy.files.length), String(logix.routines.length)],
      ['Rungs', String(input.legacy.totalRungs), String(logix.rungCount)],
      ['Symbols / tags', String(input.legacy.symbolCount), String(logix.tags.length)],
      ['Data files', String(input.legacy.dataFileCount), '—'],
      ['Modules', '—', String(modules.length)],
      ...(input.post === undefined ? [] : [['Corrected export', '—', input.post.file]]),
    ],
  }]
  if (input.legacyTruncated) {
    programs.push({ kind: 'para', text: `The legacy read stopped after ${input.legacyRungsRead} rungs; the counts above are what the reader saw.` })
  }
  if (modules.length > 1) {
    programs.push({
      kind: 'table',
      headers: ['Module', 'Catalog', 'Parent'],
      rows: modules.slice(0, input.limit).map(module => [module.name, module.catalog, module.parent === '' ? '—' : module.parent]),
      ...(modules.length > input.limit ? { note: `…and ${modules.length - input.limit} more module(s).` } : {}),
    })
  }
  sections.push({ title: 'The two programs', blocks: programs })

  const translated: ReportBlock[] = []
  if (pce.counts.markers === 0 && pce.counts.operands === 0) {
    translated.push({ kind: 'para', text: 'The wizard left no conversion marker and no unknown operand in this export.' })
  } else {
    translated.push({
      kind: 'para',
      text: `The wizard left **${pce.counts.markers}** conversion marker(s) — \`PCE(code,label)\`, Studio's record that an instruction was not translated — and **${pce.counts.operands}** rung(s) with an unknown operand (\`?\`). Of the ${pce.counts.markers + pce.counts.operands} site(s), ${pce.counts.mechanical} are answerable from the rung texts themselves and ${pce.counts.review} need an engineering decision.`,
    })
    translated.push({
      kind: 'table',
      headers: ['Code', 'Sites', 'Legacy instruction(s) at those sites', 'Answer'],
      rows: pce.counts.byCode.map(entry => {
        const sites = pce.markers.filter(site => site.code === entry.code)
        const instructions = [...new Set(sites.flatMap(site => legacyCalls(site.legacy).map(call => call.name)))].join(', ')
        const mechanical = sites.filter(site => site.resolution.work === 'mechanical').length
        const review = sites.length - mechanical
        return [
          `PCE ${entry.code}`,
          String(entry.count),
          instructions === '' ? '—' : instructions,
          review === 0 ? `${mechanical} mechanical` : `${mechanical} mechanical, ${review} review`,
        ]
      }),
    })
    const groups = new Map<string, { routine: string; rung: number; instructions: Set<string>; legacy: string; work: Set<string> }>()
    for (const site of pce.operands) {
      const key = `${site.routine}#${site.rung}`
      const group = groups.get(key) ?? { routine: site.routine, rung: site.rung, instructions: new Set<string>(), legacy: site.legacy, work: new Set<string>() }
      group.instructions.add(site.instruction)
      group.work.add(site.resolution.work)
      groups.set(key, group)
    }
    if (groups.size > 0) {
      const rows = [...groups.values()].slice(0, input.limit).map(group => [
        `${group.routine}#${group.rung}`,
        [...group.instructions].join(', '),
        `\`${clip(bare(group.legacy), 66)}\``,
        [...group.work].join(', '),
      ])
      translated.push({ kind: 'para', text: 'Rungs the wizard left with an unknown operand:' })
      translated.push({
        kind: 'table',
        headers: ['Rung', 'Instruction(s)', 'Legacy rung', 'Answer'],
        rows,
        ...(groups.size > rows.length ? { note: `…and ${groups.size - rows.length} more rung(s).` } : {}),
      })
    }
  }
  sections.push({ title: 'What the conversion could not translate', blocks: translated })

  const correctedBlocks: ReportBlock[] = []
  if (input.post === undefined) {
    correctedBlocks.push({ kind: 'para', text: 'No corrected export was supplied, so this section is empty. Pass the corrected `.L5X` and the report shows what changed, rung by rung.' })
  } else {
    const byChange = new Map<string, number>()
    for (const correction of corrections) byChange.set(correction.change, (byChange.get(correction.change) ?? 0) + 1)
    const parts = [...byChange.entries()].map(([change, count]) => `${count} ${change}`)
    correctedBlocks.push({
      kind: 'para',
      text: `Against the wizard's export, the corrected file rewrites **${corrections.length}** rung(s)${parts.length === 0 ? '' : ` (${parts.join(', ')})`}: markers ${pce.counts.markers} → ${markersAfter ?? 0}, unknown operands ${pce.counts.operands} → ${unknownAfter ?? 0} rung(s).`,
    })
    if (corrections.length > 0) {
      const rows = corrections.slice(0, input.limit).map(correction => {
        const window = changeWindow(correction.before, correction.after)
        return [
          `${correction.routine}#${correction.rung}`,
          correction.change,
          `\`${window.before}\``,
          `\`${window.after}\``,
        ]
      })
      correctedBlocks.push({
        kind: 'table',
        headers: ['Rung', 'Change', 'Before', 'After'],
        rows,
        note: corrections.length > rows.length
          ? `…and ${corrections.length - rows.length} more rung(s). Only the text around each change is shown; the full rung stays in the export.`
          : 'Only the text around each change is shown; the full rung stays in the export.',
      })
    }
  }
  sections.push({ title: 'What was corrected afterwards', blocks: correctedBlocks })

  const open: ReportBlock[] = []
  if (openItems === 0) {
    open.push({ kind: 'para', text: 'Nothing in these files needs a person. That is not the same as proven — see the last section.' })
  } else {
    if (placeholderTags.length > 0) {
      open.push({ kind: 'para', text: '**A placeholder tag stands in for a module.** The wizard found a module it has no Logix equivalent for and wrote a tag instead, so the logic still resolves. The tag is not hardware.' })
      open.push({
        kind: 'table',
        headers: ['Tag', 'Data type', 'Logic references'],
        rows: placeholderRows,
      })
      open.push({ kind: 'para', text: '**Answer this:** which Logix module replaces it (a 1756-DNB on the Ethernet bridge for a 1747-SDN, say), which tags then carry its I/O, and whether any of the logic above is DeviceNet-specific.' })
    }
    if (ioImages.length > 0) {
      open.push({
        kind: 'para',
        text: `**The legacy I/O image is a plain tag array.** No module in the export is bound to ${ioImages.map(tag => `\`${tag.name}\``).join(', ')}, which is what the wizard's "Keep Existing I/O" choice means: the old chassis still owns the field wiring.`,
      })
      open.push({ kind: 'table', headers: ['Tag', 'Data type', 'Elements'], rows: ioRows })
      open.push({ kind: 'para', text: '**Answer this:** does the wiring stay in the legacy chassis behind a communication adapter — then the tags need a mapping route — or is the I/O replaced with Logix modules, so the tags become module I/O and the addresses must be reconciled?' })
    }
    if (indirect.length > 0) {
      open.push({
        kind: 'para',
        text: `**${indirect.length} array ${plural(indirect.length, 'reference uses', 'references use')} a tag as the subscript.** Logix does not accept a tag there, so each needs an expression. Alias-indexed: ${aliasIndirect.length} — a mechanical substitution of the alias target. Tag-indexed: ${tagIndirect.length} — a decision, because the tag has no element to point at.`,
      })
      open.push({
        kind: 'table',
        headers: ['Expression', 'Index', 'Mechanical rewrite'],
        rows: indirect.slice(0, input.limit).map(site => [
          site.expression,
          site.kind === 'alias' ? `alias → ${site.indexTarget ?? '?'}` : 'tag index',
          site.kind === 'alias' ? site.expression.replace(site.index, site.indexTarget ?? site.index) : 'needs a decision',
        ]),
        ...(indirect.length > input.limit ? { note: `…and ${indirect.length - input.limit} more.` } : {}),
      })
    }
    if (leftovers.length > 0) {
      open.push({
        kind: 'para',
        text: `**${leftovers.length} rung(s) still carry a marker or an unknown operand** in ${input.post === undefined ? "the wizard's export" : 'the corrected export'}. Each needs the legacy rung read and a Logix instruction chosen.`,
      })
      open.push({
        kind: 'table',
        headers: ['Rung', 'Markers', 'Unknown operand', 'Migrated rung'],
        rows: leftovers.slice(0, input.limit).map(site => [
          `${site.routine}#${site.rung}`,
          String(site.markers),
          site.unknown === 0 ? '—' : 'yes',
          clip(bare(site.text)),
        ]),
      })
    }
    if (missingFiles.length > 0 || comparison.dataFiles.missing.length > 0) {
      const items: string[] = []
      if (missingFiles.length > 0) {
        items.push(`${missingFiles.length} legacy file(s) matched no routine: ${missingFiles.slice(0, input.limit).map(name => `\`${name}\``).join(', ')}${missingFiles.length > input.limit ? ', …' : ''}.`)
      }
      if (comparison.dataFiles.missing.length > 0) {
        items.push(`${comparison.dataFiles.missing.length} data file(s) have no declared tag: ${comparison.dataFiles.missing.slice(0, input.limit).map(name => `\`${name}\``).join(', ')}${comparison.dataFiles.missing.length > input.limit ? ', …' : ''}.`)
      }
      open.push({ kind: 'para', text: '**Legacy files with no counterpart.**' })
      open.push({ kind: 'bullets', items })
      open.push({ kind: 'para', text: '**Answer this:** is the missing logic dead code, a file name the pairing did not recognise, or a real loss?' })
    }
    if ((logix.revision ?? 0) < 37) {
      open.push({
        kind: 'para',
        text: `**The project is at revision ${orDash(logix.revision)}, below the 37 an offline build needs.** The wizard can only emit the revisions it ships with, so the project is retargeted in Studio 5000 (Controller Properties → Change Controller) before any build verdict is quoted. That retarget is a step, not a finding about the conversion.`,
      })
    }
  }
  sections.push({ title: 'Open items that need a decision', blocks: open })

  const comparisonBlocks: ReportBlock[] = [{
    kind: 'para',
    text: `${comparison.matched.length} legacy file(s) matched a routine, ${comparison.rungTotals.matchedLegacy} of ${comparison.rungTotals.legacy} legacy rung(s) accounted for, ${comparison.extraRoutines.length} routine(s) added by the conversion.`,
  }]
  if (comparison.differences.length > 0) {
    comparisonBlocks.push({
      kind: 'table',
      headers: ['Kind', 'Rule', 'Detail', 'Count'],
      rows: comparison.differences.map(difference => [difference.kind, difference.rule, clip(difference.detail, 140), String(difference.count)]),
    })
  }
  sections.push({ title: 'The comparison in full', blocks: comparisonBlocks })

  sections.push({
    title: 'Evidence',
    blocks: [{
      kind: 'table',
      headers: ['Artifact', 'Path', 'Bytes'],
      rows: [
        ['Legacy project', input.sourceFile, '—'],
        ['Wizard export', input.pre.file, String(input.pre.bytes)],
        ...(input.post === undefined ? [] : [['Corrected export', input.post.file, String(input.post.bytes)]]),
      ],
    }],
  })

  sections.push({
    title: 'What this report does not prove',
    blocks: [{
      kind: 'bullets',
      items: [
        'Runtime behaviour: no scan was run, no value was compared against the legacy program in motion.',
        'I/O wiring: a tag, a placeholder and a module are described, not energised.',
        'HMI: panel and alarm configuration are outside this row.',
        "A build verdict: `verify_offline_l5x` gives the vendor's word, and only for a revision it supports.",
      ],
    }],
  })

  const model: ReportModel = {
    title: `Migration report — ${orDash(input.legacy.project)}`,
    subtitle: `Generated ${input.generatedAt} from ${input.sourceFile}`,
    intro: 'What the conversion did, what it could not do, what was corrected afterwards, and what still needs a decision. Composed from the files named in the Evidence section: no controller was contacted, no vendor application was run, and no runtime behaviour is claimed.',
    sections,
  }
  const markdown = renderMarkdown(model)
  const facts: ReportFacts = {
    markers: pce.counts.markers,
    markersAfter,
    unknownOperands: pce.counts.operands,
    unknownOperandsAfter: unknownAfter,
    corrections: corrections.length,
    placeholders: placeholderTags.map(tag => tag.name),
    ioImages: ioImages.map(tag => tag.name),
    indirect: indirect.length,
    indirectMechanical: aliasIndirect.length,
    openItems,
    characters: markdown.length,
  }
  return { model, markdown, facts, comparison, pce, logix }
}

/** Render the model as Markdown. */
export function renderMarkdown(model: ReportModel): string {
  const lines: string[] = [`# ${model.title}`, '', model.subtitle, '', model.intro, '']
  for (const [index, section] of model.sections.entries()) {
    lines.push(`## ${index === 0 ? '' : `${index}. `}${section.title}`.trim())
    lines.push('')
    for (const block of section.blocks) {
      if (block.kind === 'para') {
        lines.push(block.text)
        lines.push('')
      } else if (block.kind === 'bullets') {
        for (const item of block.items) lines.push(`- ${item}`)
        lines.push('')
      } else {
        const rendered = table(block.headers, block.rows)
        if (rendered !== '') {
          lines.push(rendered)
          lines.push('')
        }
        if (block.note !== undefined) {
          lines.push(block.note)
          lines.push('')
        }
      }
    }
  }
  return `${lines.join('\n').replace(/\n{3,}/gu, '\n\n').trimEnd()}\n`
}
