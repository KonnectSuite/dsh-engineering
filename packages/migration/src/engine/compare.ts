/**
 * Compare a legacy RSLogix 500 project with the Logix `.L5X` a migration
 * produced.
 *
 * The comparison is structural on purpose: file to routine, rung to rung,
 * symbol to tag, data file to tag prefix. It does not claim the logic behaves
 * the same — only that the shapes line up, where they do not, and which
 * differences a migration always produces.
 *
 * The `.L5X` side is read with a small text reader rather than the L5X package:
 * this row is assembled on its own, so it cannot import another component's
 * engine at runtime.
 *
 * @module dsh-engineering-migration/engine/compare
 */

/** One program file as the legacy reader saw it. */
export interface LegacyFile {
  readonly name: string
  readonly rungs: number
  /** The text of the last rung, when the reader captured it; an `END` rung is terminal. */
  readonly lastRung?: string
}

/** One address/symbol record the legacy database holds. */
export interface LegacySymbol {
  readonly address: string
  readonly symbol: string
  readonly description: string
}

/** One legacy data file. */
export interface LegacyDataFile {
  readonly number: number
  readonly type: string
  readonly name: string
  readonly elements: number
}

/** The legacy side of a comparison. */
export interface LegacySide {
  readonly project: string
  readonly controller: string
  readonly files: readonly LegacyFile[]
  readonly totalRungs: number
  readonly symbols: readonly LegacySymbol[]
  readonly symbolCount: number
  readonly dataFiles: readonly LegacyDataFile[]
  readonly dataFileCount: number
}

/** One routine in the Logix export. */
export interface LogixRoutine {
  readonly name: string
  readonly type: string
  readonly rungs: number
  readonly texts: readonly string[]
}

/** The Logix side of a comparison. */
export interface LogixSide {
  readonly controller: string
  readonly processor: string
  readonly revision: number | undefined
  readonly routines: readonly LogixRoutine[]
  readonly tags: readonly string[]
  readonly rungCount: number
  readonly moduleCount: number
  readonly aoiCount: number
}

/** One pair of file and routine that name the same logic. */
export interface MatchedRoutine {
  readonly file: string
  readonly routine: string
  readonly legacyRungs: number
  readonly logixRungs: number
  readonly delta: number
}

/** A difference, sorted by how much it matters. */
export interface Difference {
  readonly kind: 'expected' | 'real' | 'cosmetic'
  readonly rule: string
  readonly detail: string
  readonly count: number
}

/** What the comparison found. */
export interface Comparison {
  readonly matched: readonly MatchedRoutine[]
  readonly missingInLogix: readonly string[]
  readonly extraRoutines: readonly string[]
  readonly rungTotals: { readonly legacy: number; readonly matchedLegacy: number; readonly logix: number }
  readonly symbols: { readonly count: number; readonly mapped: number; readonly missing: readonly string[] }
  readonly dataFiles: { readonly count: number; readonly mapped: number; readonly missing: readonly string[] }
  readonly indirectReferencesInLogix: number
  readonly differences: readonly Difference[]
}

/** Normalise a name so `PUSHBUTTONS`, `_45_PUSH_BUTTONS` and `PushButtons` can meet. */
function normalise(name: string): string {
  return name.toUpperCase().replaceAll(/[^A-Z0-9]/gu, '')
}

/** Decode the five XML entities an L5X text body may carry. */
function decodeXml(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

/** Read one attribute from an XML start tag. */
function attribute(tag: string, name: string): string {
  const match = new RegExp(`\\b${name}="([^"]*)"`, 'u').exec(tag)
  return match?.[1] ?? ''
}

/** Read the Logix side from the text of an `.L5X` export. */
export function readLogix(text: string): LogixSide {
  const controllerTag = /<Controller\b[^>]*>/u.exec(text)?.[0] ?? ''
  const controller = attribute(controllerTag, 'Name')
  const processor = attribute(controllerTag, 'ProcessorType')
  const revisionText = attribute(controllerTag, 'MajorRev')
  const revision = revisionText === '' ? undefined : Number(revisionText)

  const routines: LogixRoutine[] = []
  const routinePattern = /<Routine\b([^>]*)>([\s\S]*?)<\/Routine>/gu
  for (const match of text.matchAll(routinePattern)) {
    const header = match[1] ?? ''
    const body = match[2] ?? ''
    const name = attribute(`<Routine ${header}>`, 'Name')
    const type = attribute(`<Routine ${header}>`, 'Type')
    const rungs = (body.match(/<Rung\b/gu) ?? []).length
    const texts: string[] = []
    for (const textMatch of body.matchAll(/<Text>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/Text>/gu)) {
      if (textMatch[1] !== undefined) texts.push(decodeXml(textMatch[1]).trim())
    }
    routines.push({ name, type, rungs, texts })
  }

  const tags = new Set<string>()
  for (const match of text.matchAll(/<Tag\b[^>]*\bName="([^"]+)"/gu)) {
    if (match[1] !== undefined) tags.add(match[1])
  }

  const moduleCount = (text.match(/<Module\b[^>]*\bName="/gu) ?? []).length
  const aoiCount = (text.match(/<AddOnInstructionDefinition\b[^>]*\bName="/gu) ?? []).length
  const rungCount = (text.match(/<Rung\b/gu) ?? []).length

  return { controller, processor, revision, routines, tags: [...tags], rungCount, moduleCount, aoiCount }
}

/** Whether this data file is expected to become tags in the Logix project. */
function migratableDataFile(file: LegacyDataFile): boolean {
  const type = file.type.toUpperCase()
  if (!/^[A-Z]$/u.test(type)) return false
  return type !== 'I' && type !== 'O' && type !== 'S'
}

/** Whether the last rung of a legacy file is the terminal `END` rung. */
function terminalRung(text: string | undefined): boolean {
  return text !== undefined && /^END\b/iu.test(text)
}

/** Whether a tag looks like the migration's spelling of one data file element. */
function dataFileTagPattern(file: LegacyDataFile): RegExp {
  const number = file.number
  return new RegExp(`^[A-Z_]{0,3}${number}($|[_:.\\[\\d])`, 'iu')
}

/** Match one legacy file name to a routine name: exact, then suffix, then contains. */
export function matchRoutine(file: string, routines: readonly LogixRoutine[]): LogixRoutine | undefined {
  const wanted = normalise(file)
  if (wanted === '') return undefined
  const exact = routines.find(routine => normalise(routine.name) === wanted)
  if (exact !== undefined) return exact
  const suffix = routines.find(routine => normalise(routine.name).endsWith(wanted))
  if (suffix !== undefined) return suffix
  const prefix = routines.find(routine => normalise(routine.name).startsWith(wanted))
  if (prefix !== undefined) return prefix
  return routines.find(routine => wanted.length > 3 && normalise(routine.name).includes(wanted))
}

/**
 * Compare the two sides.
 *
 * @param legacy - facts from `slc_read`.
 * @param logix - facts from `readLogix`.
 * @returns the pairs, the gaps and the classified differences.
 */
export function compareSides(legacy: LegacySide, logix: LogixSide): Comparison {
  const matched: MatchedRoutine[] = []
  const missingInLogix: string[] = []
  const used = new Set<string>()
  for (const file of legacy.files) {
    if (file.name.trim() === '') continue
    const routine = matchRoutine(file.name, logix.routines)
    if (routine === undefined) {
      missingInLogix.push(file.name)
      continue
    }
    const effective = file.rungs - (terminalRung(file.lastRung) ? 1 : 0)
    used.add(routine.name)
    matched.push({
      file: file.name,
      routine: routine.name,
      legacyRungs: effective,
      logixRungs: routine.rungs,
      delta: routine.rungs - effective,
    })
  }
  const extraRoutines = logix.routines.filter(routine => !used.has(routine.name)).map(routine => routine.name)
  const matchedLegacy = matched.reduce((sum, entry) => sum + entry.legacyRungs, 0)
  const matchedLogix = matched.reduce((sum, entry) => sum + entry.logixRungs, 0)

  const tagNames = new Set(logix.tags.map(tag => normalise(tag)))
  const missingSymbols: string[] = []
  let mappedSymbols = 0
  for (const symbol of legacy.symbols) {
    if (symbol.symbol.trim() === '') continue
    if (tagNames.has(normalise(symbol.symbol))) mappedSymbols += 1
    else missingSymbols.push(symbol.symbol)
  }

  const trackedDataFiles = legacy.dataFiles.filter(migratableDataFile)
  const missingDataFiles: string[] = []
  let mappedDataFiles = 0
  for (const file of trackedDataFiles) {
    const pattern = dataFileTagPattern(file)
    if (logix.tags.some(tag => pattern.test(tag))) mappedDataFiles += 1
    else missingDataFiles.push(`${file.type === '' ? '?' : file.type}${file.number}`)
  }

  const indirect = (text: string): number => (text.match(/\b[A-Z]{1,2}\d*\[\s*[A-Za-z_][\w]*\s*\]/gu) ?? []).length
  const indirectReferencesInLogix = logix.routines.reduce(
    (sum, routine) => sum + routine.texts.reduce((inner, text) => inner + indirect(text), 0),
    0,
  )

  const differences: Difference[] = []
  if (missingInLogix.length > 0) {
    differences.push({
      kind: 'real',
      rule: 'ROUTINE_MISSING',
      detail: `The legacy project has ${missingInLogix.length} ladder file(s) with no routine in the Logix export: ${missingInLogix.slice(0, 8).join(', ')}.`,
      count: missingInLogix.length,
    })
  }
  if (missingSymbols.length > 0) {
    differences.push({
      kind: 'real',
      rule: 'SYMBOL_MISSING',
      detail: `${missingSymbols.length} named symbol(s) do not appear as a Logix tag, so their references need checking: ${missingSymbols.slice(0, 8).join(', ')}.`,
      count: missingSymbols.length,
    })
  }
  if (missingDataFiles.length > 0) {
    differences.push({
      kind: 'real',
      rule: 'DATA_FILE_UNMAPPED',
      detail: `${missingDataFiles.length} data file(s) have no tag prefix in the Logix export: ${missingDataFiles.slice(0, 12).join(', ')}.`,
      count: missingDataFiles.length,
    })
  }
  if (extraRoutines.length > 0) {
    differences.push({
      kind: 'expected',
      rule: 'ROUTINE_ADDED',
      detail: `${extraRoutines.length} routine(s) exist only in the Logix export, which is normal: the wizard adds a main and may split a file.`,
      count: extraRoutines.length,
    })
  }
  const extraRungs = matchedLogix - matchedLegacy
  if (extraRungs > 0) {
    differences.push({
      kind: 'expected',
      rule: 'RUNG_SPLIT',
      detail: `The matched routines carry ${extraRungs} more rung(s) than their legacy files, which a wizard normally produces when it splits a rung.`,
      count: extraRungs,
    })
  }
  if (extraRungs < 0) {
    differences.push({
      kind: 'real',
      rule: 'RUNG_LOST',
      detail: `The matched routines carry ${-extraRungs} fewer rung(s) than their legacy files; find where they went before commissioning.`,
      count: -extraRungs,
    })
  }
  if (indirectReferencesInLogix > 0) {
    differences.push({
      kind: 'real',
      rule: 'INDIRECT_LEFT',
      detail: `${indirectReferencesInLogix} indirect expression(s) survive in the Logix rung text; Logix cannot index an array by a tag, so these are engineering work.`,
      count: indirectReferencesInLogix,
    })
  }
  if (matched.length === 0) {
    differences.push({
      kind: 'real',
      rule: 'NO_ROUTINE_MATCHED',
      detail: 'No legacy ladder file matched a routine by name; compare the file names with the routine names by hand before trusting any count.',
      count: legacy.files.length,
    })
  }

  return {
    matched,
    missingInLogix,
    extraRoutines,
    rungTotals: { legacy: legacy.totalRungs, matchedLegacy, logix: logix.rungCount },
    symbols: { count: legacy.symbolCount, mapped: mappedSymbols, missing: missingSymbols },
    dataFiles: { count: trackedDataFiles.length, mapped: mappedDataFiles, missing: missingDataFiles },
    indirectReferencesInLogix,
    differences,
  }
}
