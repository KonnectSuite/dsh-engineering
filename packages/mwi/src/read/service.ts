/**
 * Read the saved project through the code engine.
 *
 * These reads describe the saved project, not the loaded IDE instance. Anything
 * that needs the live object model says so in its coverage.
 *
 * @module dsh-engineering-mwi/read/service
 */

import { MwiError } from '../core/errors.ts'
import type { CodeEngine, EngineResult } from '../core/code-engine.ts'
import type { ProjectRef } from '../session/project.ts'

/** The engine surface the reads use; injectable for tests. */
export interface ReadEngine {
  run(verb: string, request: Readonly<Record<string, unknown>>, timeoutMs?: number, signal?: AbortSignal): Promise<EngineResult>
}

/** One row in a listing. */
export interface ListRow {
  readonly name: string
  readonly [field: string]: unknown
}

/** One literal match in a POU body. */
export interface CodeMatch {
  readonly pou: string
  readonly line: number
  readonly text: string
}

/** Kinds `mw_list` can enumerate. */
export const LIST_KINDS = ['pou', 'variable', 'global', 'type', 'task', 'library'] as const
/** Kinds `mw_get` can read. */
export const GET_KINDS = ['pou', 'type', 'task', 'block', 'eip'] as const

/** The saved-project read service. */
export class ReadService {
  /**
   * @param engine - Code engine over the project files.
   */
  constructor(private readonly engine: ReadEngine) {}

  /** Confirm the engine can read one project. */
  async workflow(project: ProjectRef): Promise<EngineResult> {
    return await this.engine.run('workflow_check', { project: project.directory }, 120_000)
  }

  /**
   * List one kind.
   *
   * @param project - Project to read.
   * @param kind - Listing kind.
   * @param options - Filter, paging and the POU for variable reads.
   * @returns Rows and the total before paging.
   */
  async list(project: ProjectRef, kind: string, options: { filter?: string; offset?: number; limit?: number; pou?: string } = {}): Promise<{ rows: ListRow[]; total: number }> {
    const rows = await this.rows(project, kind, options.pou)
    const filter = options.filter?.toLowerCase()
    const filtered = filter === undefined ? rows : rows.filter(row => JSON.stringify(row).toLowerCase().includes(filter))
    const offset = options.offset ?? 0
    const limit = options.limit ?? 50
    return { rows: filtered.slice(offset, offset + limit), total: filtered.length }
  }

  /**
   * Read one component by name.
   *
   * @param project - Project to read.
   * @param kind - Component kind.
   * @param name - Exact name.
   * @param library - Library name for a block interface.
   * @returns The component document.
   */
  async get(project: ProjectRef, kind: string, name: string, library?: string): Promise<EngineResult> {
    if (kind === 'pou') {
      const text = await this.engine.run('read_text', { project: project.directory, pou: name }, 60_000)
      return { ...text, project: project.directory }
    }
    if (kind === 'block') {
      return await this.engine.run('block_interface', {
        project: project.directory,
        name,
        ...(library === undefined ? {} : { library }),
      }, 60_000)
    }
    if (kind === 'eip') return await this.engine.run('eip_map', { project: project.directory }, 60_000)
    const rows = await this.rows(project, kind === 'type' ? 'type' : 'task')
    const found = rows.find(row => String(row.name).toLowerCase() === name.toLowerCase())
    if (found === undefined) {
      throw new MwiError('COMPONENT_NOT_FOUND', `No ${kind} named ${name} exists in ${project.name}.`, 'Call mw_list for the exact names.', rows.slice(0, 20).map(row => String(row.name)))
    }
    return { found }
  }

  /**
   * Search POU bodies for literal text.
   *
   * @param project - Project to read.
   * @param query - Case-insensitive literal text.
   * @param limit - Most matches.
   * @returns Matches in project order.
   */
  async search(project: ProjectRef, query: string, limit = 50): Promise<{ matches: CodeMatch[]; truncated: boolean; scanned: number }> {
    const bodies = await this.bodies(project, 100)
    const matches: CodeMatch[] = []
    let truncated = false
    for (const body of bodies) {
      for (const [index, line] of body.lines.entries()) {
        if (!line.toLowerCase().includes(query.toLowerCase())) continue
        if (matches.length >= limit) {
          truncated = true
          break
        }
        matches.push({ pou: body.pou, line: index + 1, text: line.trim() })
      }
      if (truncated) break
    }
    return { matches, truncated, scanned: bodies.length }
  }

  /**
   * Find a symbol in POU bodies.
   *
   * @param project - Project to read.
   * @param symbol - Declared or written symbol name.
   * @param limit - Most matches.
   * @returns Matches with the line that contains them.
   */
  async references(project: ProjectRef, symbol: string, limit = 50): Promise<{ matches: CodeMatch[]; truncated: boolean; scanned: number }> {
    const pattern = new RegExp(`(?<![\\w.])${symbol.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?![\\w])`, 'iu')
    const bodies = await this.bodies(project, 100)
    const matches: CodeMatch[] = []
    let truncated = false
    for (const body of bodies) {
      for (const [index, line] of body.lines.entries()) {
        if (!pattern.test(line)) continue
        if (matches.length >= limit) {
          truncated = true
          break
        }
        matches.push({ pou: body.pou, line: index + 1, text: line.trim() })
      }
      if (truncated) break
    }
    return { matches, truncated, scanned: bodies.length }
  }

  /**
   * Run the static review surface.
   *
   * @param project - Project to read.
   * @param options - Optional POU and proposed body.
   * @returns Workflow, validation, unsupported-construct and program-review results.
   */
  async review(project: ProjectRef, options: { pou?: string; body?: string } = {}): Promise<Record<string, unknown>> {
    const workflow = await this.engine.run('workflow_check', { project: project.directory }, 120_000)
    const validate = await this.engine.run('validate', { project: project.directory }, 120_000)
    const unsupported = await this.engine.run('unsupported', { project: project.directory }, 60_000)
    const review = options.pou === undefined && options.body === undefined
      ? undefined
      : await this.engine.run('check_program', {
        project: project.directory,
        ...(options.pou === undefined ? {} : { pou: options.pou }),
        ...(options.body === undefined ? {} : { body: options.body }),
      }, 180_000)
    return { workflow, validate, unsupported, ...(review === undefined ? {} : { review }) }
  }

  /**
   * Search help and reviewed references.
   *
   * @param project - Project used for the workspace cache.
   * @param source - Help source: help, manual, reference or pattern.
   * @param query - Search term; omitted lists what is available.
   * @param limit - Most rows.
   * @returns The engine document with its source named.
   */
  async help(project: ProjectRef, source: string, query: string | undefined, limit = 10): Promise<EngineResult> {
    if (source === 'help') {
      return await this.engine.run('installed_help', {
        ...(query === undefined ? {} : { query }),
        limit,
      }, 120_000)
    }
    if (source === 'manual') {
      return await this.engine.run('manual', { ...(query === undefined ? {} : { term: query }) }, 120_000)
    }
    if (source === 'reference') {
      return await this.engine.run('reference', { ...(query === undefined ? {} : { query }) }, 120_000)
    }
    return await this.engine.run('pattern', { ...(query === undefined ? {} : { name: query }) }, 60_000)
  }

  /** Read every POU body, capped. */
  private async bodies(project: ProjectRef, cap: number): Promise<readonly { pou: string; lines: string[] }[]> {
    const listed = await this.engine.run('pous', { project: project.directory }, 120_000)
    const pous = (listed.pous as readonly { name: string; has_st_body?: boolean; stream_language?: string }[] | undefined) ?? []
    const readable = pous.filter(pou => pou.has_st_body !== false && (pou.stream_language ?? 'ST') !== 'LD' && (pou.stream_language ?? 'ST') !== 'FBD').slice(0, cap)
    const bodies: { pou: string; lines: string[] }[] = []
    for (const pou of readable) {
      try {
        const text = await this.engine.run('read_text', { project: project.directory, pou: pou.name }, 60_000)
        const body = typeof text.text === 'string' ? text.text : typeof text.body === 'string' ? text.body : ''
        bodies.push({ pou: pou.name, lines: body.split(/\r?\n/u) })
      } catch {
        // A graphical or protected POU has no text body; it is skipped and the
        // coverage names the gap.
      }
    }
    return bodies
  }

  /** Map one kind to rows. */
  private async rows(project: ProjectRef, kind: string, pou?: string): Promise<ListRow[]> {
    if (kind === 'pou') {
      const listed = await this.engine.run('pous', { project: project.directory }, 120_000)
      return ((listed.pous as readonly Record<string, unknown>[] | undefined) ?? []).map(row => ({
        name: String(row.name), language: row.language, has_st_body: row.has_st_body,
      }))
    }
    if (kind === 'global') {
      const globals = await this.engine.run('globals', { project: project.directory }, 120_000)
      return ((globals.variables as readonly Record<string, unknown>[] | undefined) ?? []).map(row => ({ ...row, name: String(row.name) }))
    }
    if (kind === 'variable') {
      if (pou === undefined) throw new MwiError('POU_REQUIRED', 'Listing variables needs a POU.', 'Pass pou, or use kind global for resource globals.')
      const text = await this.engine.run('read_text', { project: project.directory, pou }, 60_000)
      return ((text.variables as readonly Record<string, unknown>[] | undefined) ?? []).map(row => ({ ...row, name: String(row.name) }))
    }
    if (kind === 'type') {
      const types = await this.engine.run('types', { project: project.directory }, 120_000)
      return ((types.types as readonly Record<string, unknown>[] | undefined) ?? []).map(row => ({ ...row, name: String(row.name) }))
    }
    if (kind === 'task') {
      const tasks = await this.engine.run('tasks', { project: project.directory }, 120_000)
      const bindings = (tasks.bindings as readonly Record<string, unknown>[] | undefined) ?? []
      const unassigned = (tasks.unassigned as readonly string[] | undefined) ?? []
      return [
        ...bindings.map(row => ({ ...row, name: String(row.name) })),
        ...unassigned.map(name => ({ name, kind: 'UNASSIGNED' })),
      ]
    }
    if (kind === 'library') {
      const library = await this.engine.run('library', { project: project.directory }, 120_000)
      const blocks = (library.blocks as readonly Record<string, unknown>[] | undefined) ?? (library.libraries as readonly Record<string, unknown>[] | undefined) ?? []
      return blocks.map(row => ({ ...row, name: String(row.name ?? row.library ?? '') }))
    }
    throw new MwiError('UNKNOWN_KIND', `Unknown listing kind ${kind}.`, `Use one of: ${LIST_KINDS.join(', ')}.`)
  }
}
