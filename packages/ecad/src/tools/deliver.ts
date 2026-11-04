/**
 * Deliverable tools: a documentation bundle and a byte-exact backup.
 *
 * `ecad_document` writes a self-contained review bundle (markdown, CSVs, the
 * index snapshot and a coverage page) into a NEW folder; by default it lives
 * under `.ecad/documentation/`, and naming a folder elsewhere needs the row's
 * writes switch. `ecad_backup` copies the source drawings byte for byte into
 * `backups/ecad/<set>/<UTC stamp>/` with a manifest and verifies every copy;
 * it never modifies a source.
 *
 * @module dsh-engineering-ecad/tools/deliver
 */

import { EngineeringError, integer, list, object, optionalString, requiredString, string, success, tool } from '../core.ts'
import type { NextStep, ToolDefinition } from '../core.ts'
import { EcadSession, DOCUMENT_DIR, baseNameOf, engine } from '../session.ts'
import { formatOfPath, isRecognisedDrawingPath } from '../drawings.ts'
import type { DrawingFormat } from '../drawings.ts'
import {
  assertReadable,
  buildSheets,
  coverageOf,
  groupFindings,
  resolveSheets,
  setOfPath,
  summaryOf,
  titleBlockOf,
  unsupportedTotal,
  workspaceRelative
} from './shared.ts'

/**
 * The deliverable tools this module contributes.
 *
 * @param session - the row session.
 */
export function deliverTools(session: EcadSession): ToolDefinition[] {
  return [documentTool(session), backupTool(session)]
}

/**
 * `ecad_document`: write the handover bundle.
 *
 * @param session - the row session.
 */
function documentTool(session: EcadSession): ToolDefinition {
  return tool({
    name: 'ecad_document',
    description:
      'Write a documentation bundle for a drawing set into a NEW folder: README.md (what the set is, coverage and limitations), sheets.csv, title-blocks.csv (one row per field with its source and confidence), cross-reference.csv (candidate rows with status), findings.csv (review rules with evidence), coverage.md (what each sheet is missing or approximates) and index.json (machine-readable snapshot). Defaults to .ecad/documentation/<UTC stamp>-ecad-docs; a folder outside .ecad/ requires the row writes switch. Bounded to the configured sheet limit.',
    parameters: object({
      path: string('One drawing to document.'),
      paths: list('Drawings to document; takes precedence over `path`.', string('drawing path')),
      output: string('New folder for the bundle. Defaults to .ecad/documentation/<UTC stamp>-ecad-docs.'),
      title: string('Title printed at the top of README.md.'),
      limit: integer('Most drawings to document.', { minimum: 1, maximum: 2000 })
    }),
    async run(args, exec) {
      const limit = session.cap(integerOf(args.limit), 50)
      const customOutput = optionalString(args, 'output')
      if (customOutput !== undefined) session.requireWrites('the documentation bundle')
      const profileState = await session.profile(exec)
      const resolved = await resolveSheets(session, args, exec, { limit })
      const built = await buildSheets(session, resolved.paths, exec)
      assertReadable(built, resolved.paths.length)
      const engineModule = await engine()
      const titleBlocks = new Map<string, Awaited<ReturnType<typeof titleBlockOf>>>()
      const summaries = []
      let index
      let indexSheet: string | undefined
      const sheetRows = []
      for (const view of built.views) {
        const path = workspaceRelative(session, exec, view.path)
        const titleBlock = await titleBlockOf(view, profileState.profile)
        titleBlocks.set(path, titleBlock)
        const summary = summaryOf(session, exec, view, titleBlock)
        summaries.push(summary)
        const detected = engineModule.detectIndexSheet(view.model, profileState.profile)
        if (detected !== undefined && index === undefined) {
          index = detected
          indexSheet = path
        }
        sheetRows.push({ path, view, titleBlock, summary, index: detected })
      }
      const sheetsForChecks = sheetRows.map(row => ({ path: row.path, model: row.view.model, titleBlock: row.titleBlock, ...(row.index === undefined ? {} : { index: row.index }) }))
      const findings = engineModule.runChecks({ sheets: sheetsForChecks, profile: profileState.profile, ...(index === undefined ? {} : { index }) }, { maxFindings: 500 })
      const crossRows = engineModule.crossReference(
        sheetRows.map(row => ({ path: row.path, model: row.view.model })),
        profileState.profile,
        { maxRows: 500 }
      )
      const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\..+$/u, '')
      const outputRoot = customOutput !== undefined && customOutput.trim() !== '' ? customOutput : `${DOCUMENT_DIR}/${stamp}-ecad-docs`
      if (await session.exists(outputRoot, exec)) {
        throw new EngineeringError('ECAD_OUTPUT_EXISTS', `A folder already exists at ${outputRoot}.`, 'Pass a new output folder; the bundle never overwrites another folder.')
      }
      const written: Array<{ name: string; bytes: number }> = []
      const writeFile = async (name: string, text: string): Promise<void> => {
        await session.writeNewText(`${outputRoot}/${name}`, text, exec)
        written.push({ name, bytes: new TextEncoder().encode(text).byteLength })
      }
      const counts = groupFindings(findings)
      const unsupportedByType: Record<string, number> = {}
      let unsupported = 0
      let approximate = 0
      for (const row of sheetRows) {
        for (const [type, count] of Object.entries(row.view.model.stats.unsupported)) unsupportedByType[type] = (unsupportedByType[type] ?? 0) + count
        unsupported += unsupportedTotal(row.view.model.stats.unsupported)
        approximate += row.view.model.stats.approximate
      }
      const title = optionalString(args, 'title') ?? 'ECAD drawing review'
      const coverageLines = [
        '# Coverage',
        '',
        `Generated ${new Date().toISOString()} by ecad_document from ${built.views.length} drawing(s).`,
        '',
        '## What this bundle does not prove',
        '',
        '- The checks are static text and layer measurements; they do not prove electrical correctness, connectivity, ratings or that the drawing matches the machine.',
        '- Cross-reference rows are text-pattern candidates, not device or wire records.',
        '- Unsupported and approximated geometry is counted per sheet below, not described.',
        '',
        '## Per sheet',
        ''
      ]
      for (const row of sheetRows) {
        coverageLines.push(`### ${row.path}`)
        coverageLines.push('')
        coverageLines.push(`- entities: ${row.view.model.stats.entities}; approximate primitives: ${row.view.model.stats.approximate}; unsupported: ${unsupportedTotal(row.view.model.stats.unsupported)}`)
        coverageLines.push(`- title-block fields: ${Object.keys(row.titleBlock.fields).join(', ') || 'none recognised'}`)
        if (Object.keys(row.view.model.stats.unsupported).length > 0) coverageLines.push(`- not drawn: ${Object.entries(row.view.model.stats.unsupported).map(([type, count]) => `${type} ×${count}`).join(', ')}`)
        if (row.view.model.stats.truncated) coverageLines.push('- the entity cap was reached, so the model is incomplete')
        coverageLines.push('')
      }
      await writeFile('README.md', renderReadme({ title, profileSource: profileState.source, built: built.views.length, unsupported, approximate, findings: findings.length, crossRows: crossRows.length, indexSheet, skipped: built.skipped.length }))
      await writeFile('coverage.md', `${coverageLines.join('\n')}\n`)
      await writeFile('sheets.csv', renderCsv(['path', 'set', 'sheetNumber', 'title', 'revision', 'format', 'entities', 'approximate', 'unsupported', 'blocks', 'layers'], sheetRows.map(row => [
        row.path,
        row.summary.set ?? '',
        row.summary.sheetNumber ?? '',
        row.summary.title ?? '',
        row.summary.revision ?? '',
        row.view.format,
        String(row.view.model.stats.entities),
        String(row.view.model.stats.approximate),
        String(unsupportedTotal(row.view.model.stats.unsupported)),
        String(row.view.model.blocks.length),
        String(row.view.model.layers.length)
      ])))
      const titleBlockRows: string[][] = []
      for (const row of sheetRows) {
        for (const [field, value] of Object.entries(row.titleBlock.fields)) {
          if (value === undefined) continue
          titleBlockRows.push([row.path, field, value.value, value.source, value.label ?? '', String(value.confidence)])
        }
      }
      await writeFile('title-blocks.csv', renderCsv(['path', 'field', 'value', 'source', 'label', 'confidence'], titleBlockRows))
      await writeFile('cross-reference.csv', renderCsv(['kind', 'value', 'status', 'confidence', 'occurrences', 'note'], crossRows.map(row => [row.kind, row.value, row.status, String(row.confidence), String(row.sheets.length), row.note ?? ''])))
      await writeFile('findings.csv', renderCsv(['rule', 'severity', 'sheet', 'layout', 'message', 'fix'], findings.map(finding => [finding.rule, finding.severity, finding.sheet ?? '', finding.layout ?? '', finding.message, finding.fix ?? ''])))
      await writeFile('index.json', `${JSON.stringify({ schema: 1, generatedAt: new Date().toISOString(), tool: 'ecad_document', title, profileSource: profileState.source, sheets: summaries, crossReference: { rows: crossRows.length }, findings: { total: findings.length, byRule: counts.byRule }, coverage: { unsupported, approximate, unsupportedByType }, indexSheet: indexSheet ?? null }, undefined, 2)}\n`)
      const relativeRoot = workspaceRelative(session, exec, await (async () => (await session.resolve(outputRoot, exec)).displayPath)())
      return success(
        `Wrote a documentation bundle for ${built.views.length} drawing(s) to ${relativeRoot}: ${written.length} file(s), ${findings.length} finding(s), ${crossRows.length} cross-reference candidate(s).`,
        {
          outputRoot: relativeRoot,
          files: written,
          sheets: built.views.length,
          indexSheet,
          findings: findings.length,
          crossReference: crossRows.length,
          unsupported,
          approximate,
          skipped: built.skipped
        },
        [
          { tool: 'ecad_render', args: args.path === undefined ? {} : { path: args.path }, why: 'Add a rendered image when a person must judge the geometry, not only the text.' },
          { tool: 'ecad_backup', why: 'Copy the source drawings into the shared backup tree when the set must be preserved.' }
        ],
        coverageOf(built.skipped, resolved.truncated, ['the bundle reports static text measurements, unsupported and approximated geometry as counts'])
      )
    }
  })
}

/**
 * `ecad_backup`: copy the source drawings byte for byte with a manifest.
 *
 * @param session - the row session.
 */
function backupTool(session: EcadSession): ToolDefinition {
  return tool({
    name: 'ecad_backup',
    description:
      'Copy source drawings byte for byte into a NEW folder under backups/ecad/<set>/<UTC stamp>/ with a manifest (relative path, format and SHA-256 per file) and verify every copy by re-reading it and comparing the hash. Requires the row writes switch. Sources are read-only: nothing in the source folder is changed or deleted.',
    parameters: object({
      path: string('One drawing to back up.'),
      paths: list('Drawings to back up; takes precedence over `path`.', string('drawing path')),
      set: string('Set name for the backup folder; defaults to the set inferred from the drawing file names.'),
      output: string('New folder for the copies. Defaults to backups/ecad/<set>/<UTC stamp>.'),
      limit: integer('Most drawings to copy.', { minimum: 1, maximum: 2000 })
    }),
    async run(args, exec) {
      session.requireWrites('the backup copies')
      const limit = session.cap(integerOf(args.limit), 100)
      const resolved = await resolveSheets(session, args, exec, { limit })
      const paths = resolved.paths.filter(path => isRecognisedDrawingPath(path))
      if (paths.length === 0) {
        throw new EngineeringError('ECAD_NO_SHEETS', 'None of the selected paths names a drawing file this build recognises.', 'Recognised formats: .dxf and .dwg.')
      }
      const set = sanitizeSegment(optionalString(args, 'set') ?? setOfPath(paths[0]!))
      const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d+Z$/u, 'Z')
      const outputArg = optionalString(args, 'output')
      const outputRoot = outputArg !== undefined && outputArg.trim() !== '' ? outputArg : `backups/ecad/${set}/${stamp}`
      if (await session.exists(outputRoot, exec)) {
        throw new EngineeringError('ECAD_OUTPUT_EXISTS', `A backup folder already exists at ${outputRoot}.`, 'Pass a new output folder, or wait a second and retry so the timestamp differs.')
      }
      const engineModule = await engine()
      const files: Array<Record<string, unknown>> = []
      const skipped: Array<{ path: string; reason: string }> = []
      let bytesTotal = 0
      let verifiedAll = true
      for (const path of paths) {
        if (exec?.signal?.aborted === true) {
          skipped.push({ path, reason: 'cancelled before this drawing was copied' })
          continue
        }
        try {
          const { bytes } = await session.readFile(path, exec)
          const format = formatOfPath(path)
          if (format === undefined) {
            skipped.push({ path, reason: 'not a recognised drawing format' })
            continue
          }
          const relative = workspaceRelative(session, exec, path)
          const inside = !relative.startsWith('../') && !relative.startsWith('/')
          const copyRelative = `${outputRoot}/${inside ? relative : baseNameOf(relative)}`
          const writtenPath = await session.writeNewBytes(copyRelative, bytes, exec)
          const readBack = await session.readFile(writtenPath, exec)
          const digest = engineModule.sha256(bytes)
          const copyDigest = engineModule.sha256(readBack.bytes)
          const verified = digest === copyDigest
          if (!verified) verifiedAll = false
          bytesTotal += bytes.byteLength
          files.push({ path: relative, format, bytes: bytes.byteLength, sha256: digest, copyPath: workspaceRelative(session, exec, writtenPath), verified })
        } catch (error) {
          skipped.push({ path, reason: error instanceof Error ? error.message : String(error) })
        }
      }
      const createdAt = new Date().toISOString()
      const manifest = { schema: 1, tool: 'ecad_backup', createdAt, set, stamp, sourceFormat: [...new Set(files.map(file => file.format as DrawingFormat))], files: files.map(({ path, format, bytes, sha256, copyPath, verified }) => ({ path, format, bytes, sha256, copyPath, verified })), skipped }
      const manifestPath = `${outputRoot}/manifest.json`
      await session.writeNewText(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`, exec)
      const relativeRoot = workspaceRelative(session, exec, (await session.resolve(outputRoot, exec)).displayPath)
      if (!verifiedAll) {
        throw new EngineeringError(
          'ECAD_BACKUP_UNVERIFIED',
          `${files.filter(file => file.verified !== true).length} copied file(s) in ${relativeRoot} do not match their source hash.`,
          'Do not rely on this backup: delete the folder and copy again, or check the destination disk.'
        )
      }
      const next: NextStep[] = []
      if (skipped.length > 0) next.push({ tool: 'ecad_capabilities', why: 'Some drawings were skipped; check the format and limits before promising the set is preserved.' })
      return success(
        `Backed up ${files.length} drawing(s) (${bytesTotal} bytes) to ${relativeRoot}; every copy re-read and hash-verified.`,
        { outputRoot: relativeRoot, set, stamp, files: files.length, bytes: bytesTotal, verified: true, manifestPath: workspaceRelative(session, exec, (await session.resolve(manifestPath, exec)).displayPath), formats: [...new Set(files.map(file => file.format))], skipped },
        next,
        coverageOf(skipped, resolved.truncated, ['source drawings were read only; the backup proves byte equality, not that the drawings are correct'])
      )
    }
  })
}

/**
 * One markdown README for the bundle.
 *
 * @param input - counts the bundle needs.
 */
function renderReadme(input: {
  readonly title: string
  readonly profileSource: string
  readonly built: number
  readonly unsupported: number
  readonly approximate: number
  readonly findings: number
  readonly crossRows: number
  readonly indexSheet: string | undefined
  readonly skipped: number
}): string {
  return [
    `# ${input.title}`,
    '',
    `Generated ${new Date().toISOString()} by \`ecad_document\` from ${input.built} drawing(s).`,
    '',
    '## Files',
    '',
    '- `sheets.csv` — one row per drawing with its title-block identity and coverage counts.',
    '- `title-blocks.csv` — one row per recognised field, with its source and confidence.',
    '- `cross-reference.csv` — device-tag, wire-label and sheet-reference candidates with status and confidence.',
    '- `findings.csv` — static review findings with rule id, severity, evidence and fix.',
    '- `coverage.md` — what each sheet is missing, approximates or could not draw.',
    '- `index.json` — the same data in machine-readable form.',
    '',
    '## Summary',
    '',
    `- profile source: ${input.profileSource}`,
    `- findings: ${input.findings}`,
    `- cross-reference candidates: ${input.crossRows}`,
    `- unsupported entities (not drawn): ${input.unsupported}`,
    `- approximated primitives: ${input.approximate}`,
    `- skipped drawings: ${input.skipped}`,
    `- sheet index: ${input.indexSheet ?? 'none detected'}`,
    '',
    '## What this bundle does not prove',
    '',
    'The checks are static text and layer measurements; they do not prove electrical correctness,',
    'connectivity, ratings or that the drawing matches the machine. Cross-reference rows are',
    'text-pattern candidates, not device records. Review every finding and candidate against the',
    'drawing and the machine before acting on it.',
    ''
  ].join('\n')
}

/**
 * Render one CSV document with RFC 4180 quoting.
 *
 * @param header - column names.
 * @param rows - cell values.
 */
function renderCsv(header: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
  const quote = (value: string): string => (/[",\n\r]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value)
  const lines = [header.map(quote).join(',')]
  for (const row of rows) lines.push(row.map(quote).join(','))
  return `${lines.join('\n')}\n`
}

/**
 * Make one path segment safe as a folder name.
 *
 * @param value - proposed segment.
 */
function sanitizeSegment(value: string): string {
  const cleaned = value.replace(/[\\/:*?"<>|]/gu, '-').replace(/^\.+/u, '').trim()
  return cleaned === '' ? 'set' : cleaned.slice(0, 80)
}

/**
 * Read an optional integer argument.
 *
 * @param value - raw argument.
 */
function integerOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}
