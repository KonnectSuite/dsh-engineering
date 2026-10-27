/**
 * The read row: the saved project model, code, help and review evidence.
 *
 * Reads describe the saved project. Anything that needs the loaded IDE instance
 * belongs to the session or verify rows and says so in its own coverage.
 *
 * @module dsh-engineering-mwi/tools/read
 */

import { choice, integer, object, string } from '../core/params.ts'
import { success } from '../core/result.ts'
import { tool, type ToolDefinition } from '../core/tool.ts'
import { defaultProject, resolveProject, type ProjectRef } from '../session/project.ts'
import { workspaceOf } from '../session/workspace.ts'
import { runtimeFor } from '../session/service.ts'
import { GET_KINDS, LIST_KINDS, type ReadService } from '../read/service.ts'

/** How the tools reach the read service; injectable for tests. */
export type ReadFactory = (workspace: string) => ReadService

/** Limits shared by every saved-project read. */
const READ_COVERAGE = {
  complete: false,
  unverified: [
    'the loaded IDE instance; these reads use the saved project files',
    'graphical LD/FBD bodies, which are listed but not read as text',
    'runtime behavior and controller state',
  ],
} as const

/**
 * The read tools.
 *
 * @param readsOf - Read service factory; defaults to the cached workspace runtime.
 * @returns Tool definitions in registration order.
 */
export function readTools(readsOf: ReadFactory = workspace => runtimeFor(workspace).reads): readonly ToolDefinition[] {
  const projectOf = (args: Readonly<Record<string, unknown>>, workspace: string): ProjectRef =>
    typeof args.project === 'string' ? resolveProject(workspace, args.project) : defaultProject(workspace)

  return [
    tool({
      name: 'mw_project_overview',
      description: 'Summarize one project from its saved files: languages, POU, variable, type and task counts, readiness and validation findings. Use it before listing components.',
      parameters: object({
        project: string('Project directory or .mwt inside the workspace. Omit to use the single staged project.'),
      }),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const project = projectOf(args, workspace)
        const reads = readsOf(workspace)
        const workflow = await reads.workflow(project)
        const counts: Record<string, number> = {}
        for (const kind of ['pou', 'global', 'type', 'task'] as const) {
          counts[kind] = (await reads.list(project, kind, { limit: 1 })).total
        }
        return success(
          `${project.name}: ${counts.pou} POU(s), ${counts.global} global declaration(s), ${counts.type} type(s), ${counts.task} task row(s).`,
          { project: project.directory, staged: project.staged, counts, workflow },
          [{ tool: 'mw_list', why: 'List the components you need.' }],
          READ_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_list',
      description: 'List POUs, variables, globals, types, tasks or library blocks from the saved project, with a filter and paging.',
      parameters: object({
        kind: choice('What to list.', LIST_KINDS),
        project: string('Project directory or .mwt inside the workspace. Omit to use the single staged project.'),
        pou: string('POU whose declarations to list; required for kind variable.'),
        filter: string('Case-insensitive substring over the returned fields.'),
        offset: integer('Rows to skip. Defaults to 0.', { minimum: 0 }),
        limit: integer('Most rows. Defaults to 50, maximum 200.', { minimum: 1, maximum: 200 }),
      }, ['kind']),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const project = projectOf(args, workspace)
        const kind = String(args.kind)
        const listed = await readsOf(workspace).list(project, kind, {
          filter: typeof args.filter === 'string' ? args.filter : undefined,
          offset: typeof args.offset === 'number' ? args.offset : 0,
          limit: typeof args.limit === 'number' ? args.limit : 50,
          pou: typeof args.pou === 'string' ? args.pou : undefined,
        })
        return success(
          `${listed.total} ${kind}(s) in ${project.name}; showing ${listed.rows.length}.`,
          { project: project.directory, kind, total: listed.total, rows: listed.rows },
          [{ tool: 'mw_get', why: 'Read one row in full.' }],
          READ_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_get',
      description: 'Read one POU with its declarations and the text_body_sha256 that the edit preconditions take, one type, one task row, one block interface or the EtherNet/IP assembly map.',
      parameters: object({
        kind: choice('What to read.', GET_KINDS),
        name: string('Exact component name; omit only for kind eip.'),
        project: string('Project directory or .mwt inside the workspace. Omit to use the single staged project.'),
        library: string('Library name for a block interface.'),
      }, ['kind']),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const project = projectOf(args, workspace)
        const kind = String(args.kind)
        const name = typeof args.name === 'string' ? args.name : ''
        const document = await readsOf(workspace).get(project, kind, name, typeof args.library === 'string' ? args.library : undefined)
        return success(
          kind === 'eip' ? `Read the EtherNet/IP assembly map of ${project.name}.` : `Read ${kind} ${name} from ${project.name}.`,
          { project: project.directory, kind, document },
          [{ tool: 'mw_list', why: 'Continue with the components around this one.' }],
          READ_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_search',
      description: 'Find literal text across the saved POU bodies, case-insensitively, with the POU and line of each match.',
      parameters: object({
        query: string('Literal text to find.'),
        project: string('Project directory or .mwt inside the workspace. Omit to use the single staged project.'),
        limit: integer('Most matches. Defaults to 50, maximum 200.', { minimum: 1, maximum: 200 }),
      }, ['query']),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const project = projectOf(args, workspace)
        const result = await readsOf(workspace).search(project, String(args.query), typeof args.limit === 'number' ? args.limit : 50)
        return success(
          `${result.matches.length} match(es) across ${result.scanned} text POU(s).`,
          { project: project.directory, ...result },
          [{ tool: 'mw_get', why: 'Read the POU that contains the match.', args: { kind: 'pou', name: result.matches[0]?.pou } }],
          READ_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_references',
      description: 'Find where one symbol appears across the saved POU bodies, with the POU and line. Static evidence only.',
      parameters: object({
        symbol: string('Declared or written symbol name.'),
        project: string('Project directory or .mwt inside the workspace. Omit to use the single staged project.'),
        limit: integer('Most matches. Defaults to 50, maximum 200.', { minimum: 1, maximum: 200 }),
      }, ['symbol']),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const project = projectOf(args, workspace)
        const result = await readsOf(workspace).references(project, String(args.symbol), typeof args.limit === 'number' ? args.limit : 50)
        return success(
          `${result.matches.length} reference(s) across ${result.scanned} text POU(s).`,
          { project: project.directory, symbol: args.symbol, ...result },
          [{ tool: 'mw_get', why: 'Read the enclosing POU.', args: { kind: 'pou', name: result.matches[0]?.pou } }],
          READ_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_review',
      description: 'Run the static review: workflow readiness, native validation, unsupported constructs, and optionally a program review for one POU or proposed body.',
      parameters: object({
        project: string('Project directory or .mwt inside the workspace. Omit to use the single staged project.'),
        pou: string('POU to review.'),
        body: string('Proposed replacement body to review without writing it.'),
      }),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const project = projectOf(args, workspace)
        const review = await readsOf(workspace).review(project, {
          ...(typeof args.pou === 'string' ? { pou: args.pou } : {}),
          ...(typeof args.body === 'string' ? { body: args.body } : {}),
        })
        const workflow = review.workflow as { blockers?: readonly unknown[] } | undefined
        return success(
          `Reviewed ${project.name}${typeof args.pou === 'string' ? ` (${args.pou})` : ''}; ${workflow?.blockers?.length ?? 0} blocker(s).`,
          { project: project.directory, ...review },
          [{ tool: 'mw_list', why: 'Inspect the components named by a finding.' }],
          { complete: false, unverified: ['review is static; it does not prove runtime behavior', 'vendor XSD or compiler equivalence'] },
        )
      },
    }),
    tool({
      name: 'mw_help',
      description: 'Search installed MotionWorks help, the installed manuals, reviewed Yaskawa references or the versioned ST patterns.',
      parameters: object({
        source: choice('Where to search.', ['help', 'manual', 'reference', 'pattern']),
        query: string('Search term or pattern name; omit to list what is available.'),
        limit: integer('Most rows. Defaults to 10, maximum 50.', { minimum: 1, maximum: 50 }),
        project: string('Project directory or .mwt inside the workspace. Omit to use the single staged project.'),
      }, ['source']),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const project = projectOf(args, workspace)
        const source = String(args.source)
        const document = await readsOf(workspace).help(project, source, typeof args.query === 'string' ? args.query : undefined, typeof args.limit === 'number' ? args.limit : 10)
        return success(`Searched ${source} for ${typeof args.query === 'string' ? args.query : 'available topics'}.`, { project: project.directory, source, document }, [], READ_COVERAGE)
      },
    }),
  ]
}
