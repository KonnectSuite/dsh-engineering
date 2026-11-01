/**
 * The documentation and generation-reference tools.
 *
 * `list_instructions` is the catalog the composer validates against, exposed so a
 * caller can read operand order instead of guessing it. `document_project` builds
 * the handover bundle into a new folder: it writes documents, never the project.
 *
 * @module dsh-engineering-l5x/tools/document
 */

import { DOCUMENT_PARTS, buildDocumentation, type DocumentPart } from '../engine/documentation.ts'
import { INSTRUCTIONS, type InstructionInfo } from '../engine/instructions.ts'
import { alternateMnemonic } from '../engine/mnemonics.ts'
import { L5xError } from '../core/errors.ts'
import { success, type Coverage } from '../core/result.ts'
import { choice, integer, list, object, string } from '../core/params.ts'
import type { ToolDefinition } from '../core/tool.ts'
import type { ProjectSession } from '../session.ts'
import { PROJECT_ID, optionalString, requiredString, tool } from './common.ts'

/** What a catalog listing cannot establish. */
const CATALOG_COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'vendor instructions outside this catalog',
    'operand coercion the controller applies at compile time',
    'runtime behavior',
  ],
}

/** What a generated document bundle cannot establish. */
const DOCUMENT_COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'narrative prose: the bundle carries structure, citations and existing descriptions only',
    'cause-and-effect and FAT/SAT documents are not generated',
    'runtime behavior and anything outside the export (HMI, produced/consumed tags, drivers)',
  ],
}

/** One catalog row as the tool returns it. */
function catalogRow(instruction: InstructionInfo): Record<string, unknown> {
  const alternate = alternateMnemonic(instruction.name)
  return {
    name: instruction.name,
    category: instruction.category,
    summary: instruction.summary,
    operands: instruction.operands.map(slot => ({ name: slot.name, kind: slot.kind, required: slot.optional !== true, ...(slot.rest === true ? { rest: true } : {}) })),
    // Logix Designer 36 renamed sixteen instructions (EQU/EQ, SQR/SQRT, …). The row
    // carries the other published spelling so a caller does not have to know which
    // one this export happens to read; compose_rung accepts either.
    ...(alternate === undefined ? {} : { also_published_as: alternate }),
    // A row whose operand list this catalogue cannot model says so, instead of listing zero
    // operands and letting a reader believe the instruction takes none.
    ...(instruction.notModelled === true ? { operands_modelled: false, note: 'operands not modelled: compose this rung with draft_rung text instead' } : {}),
  }
}

/**
 * The documentation tools.
 *
 * @param session - Project handles for the calling chat.
 * @returns Tool definitions in registration order.
 */
export function documentTools(session: ProjectSession): readonly ToolDefinition[] {
  return [
    tool({
      name: 'list_instructions',
      description: 'List the ladder instructions the composer validates: mnemonic, category, summary and operand slots with their kinds, plus the other published spelling when Logix Designer 36 renamed the instruction (also_published_as). Read it before composing a rung instead of guessing operand order.',
      parameters: object({
        filter: string('Case-insensitive substring matched against the instruction name, category or summary.'),
        category: string('Only instructions in this category, for example "Comparison".'),
        limit: integer('Maximum rows to return.', { minimum: 1, maximum: 200, default: 100 }),
      }, []),
      async run(args) {
        const filter = (optionalString(args, 'filter') ?? '').toLowerCase()
        const category = (optionalString(args, 'category') ?? '').toLowerCase()
        const limit = typeof args.limit === 'number' ? Math.min(Math.max(Math.trunc(args.limit), 1), 200) : 100
        const rows = INSTRUCTIONS
          .filter(instruction => category === '' || instruction.category.toLowerCase() === category)
          .filter(instruction => filter === '' || instruction.name.toLowerCase().includes(filter)
            || instruction.category.toLowerCase().includes(filter)
            || instruction.summary.toLowerCase().includes(filter))
        return success(
          `${rows.length} instruction(s)${category === '' ? '' : ` in ${category}`}${filter === '' ? '' : ` matching ${JSON.stringify(filter)}`}; showing ${Math.min(rows.length, limit)}.`,
          {
            total: rows.length,
            categories: [...new Set(INSTRUCTIONS.map(instruction => instruction.category))],
            rows: rows.slice(0, limit).map(catalogRow),
          },
          [{ tool: 'compose_rung', why: 'Compose a rung from the instruction and its operand order.' }],
          CATALOG_COVERAGE,
        )
      },
    }),
    tool({
      name: 'document_project',
      description: 'Write a documentation bundle for the open project into a NEW folder: project summary, I/O list, tag CSVs (including the Studio Tags and Comments shape) and per-program logic documentation — rungs with their comments and referenced tags, and the decoded elements of function block and sequential function chart routines. Never writes to the export.',
      parameters: object({
        output_root: string('New folder for the bundle. It must not exist. Example: "C:/Projects/Line/documentation".'),
        include: list('Optional parts to produce; default all. One of project, io, tags, rungs.', choice('One part.', DOCUMENT_PARTS)),
        programs: list('Optional program names to restrict the bundle to.', string('Program name.')),
        routines: list('Optional routine names to restrict the rung documentation to.', string('Routine name.')),
        rungs_per_file: integer('Most rungs per rung-documentation file before a continuation file is written. Defaults to 200.', { minimum: 1, maximum: 2000 }),
        project_id: PROJECT_ID,
      }, ['output_root']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const outputRoot = requiredString(args, 'output_root')
        const include = Array.isArray(args.include) && args.include.length > 0
          ? (args.include.map(String) as DocumentPart[])
          : undefined
        const unknown = include?.filter(part => !(DOCUMENT_PARTS as readonly string[]).includes(part))
        if (unknown !== undefined && unknown.length > 0) {
          throw new L5xError('INVALID_ARGUMENT', `Unknown part(s): ${unknown.join(', ')}.`, `Pass any of: ${DOCUMENT_PARTS.join(', ')}.`)
        }
        if (await session.exists(outputRoot, exec)) {
          throw new L5xError('OUTPUT_EXISTS', `A file or folder already exists at ${outputRoot}.`, 'Pass a new output_root; the generator never merges into an existing folder.')
        }
        const bundle = buildDocumentation(project, {
          ...(include === undefined ? {} : { include }),
          ...(Array.isArray(args.programs) ? { programs: args.programs.map(String) } : {}),
          ...(Array.isArray(args.routines) ? { routines: args.routines.map(String) } : {}),
          ...(typeof args.rungs_per_file === 'number' ? { rungsPerFile: args.rungs_per_file } : {}),
        })
        const written: { path: string; bytes: number }[] = []
        for (const [path, text] of bundle.files) {
          const destination = await session.writeTextAt(`${outputRoot.replace(/[\\/]+$/u, '')}/${path}`, text, exec)
          written.push({ path: destination, bytes: new TextEncoder().encode(text).length })
        }
        return success(
          `Wrote ${written.length} file(s) for ${bundle.counts.programs} program(s), ${bundle.counts.routines} routine(s)${(project.protectedRoutines ?? 0) === 0 ? '' : ` plus ${project.protectedRoutines} source-protected`}${bundle.counts.aoiRoutines === 0 ? '' : ` and ${bundle.counts.aoiRoutines} AOI routine(s)`}, ${bundle.counts.rungs} rung(s) (${bundle.counts.comments} commented) to ${outputRoot}.`,
          {
            output_root: outputRoot,
            files: written,
            counts: bundle.counts,
            excluded: bundle.excluded,
          },
          [{ tool: 'draft_rung_comment', why: 'Write the approved narrative back as rung comments, then apply the draft.' }],
          DOCUMENT_COVERAGE,
        )
      },
    }),
  ]
}
