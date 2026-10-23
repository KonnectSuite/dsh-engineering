/**
 * Open L5X exports for one chat.
 *
 * A handle names a parsed document and the hash it was parsed from. Reads are
 * pure over the document, so a project is parsed once; every later call re-reads
 * the file only to prove the document is still the file's content.
 *
 * Handles are chat-scoped: a second chat starts with none open, which is why an
 * unknown handle names the handles this chat does have.
 *
 * @module dsh-engineering-l5x/session
 */

import { createHash, randomUUID } from 'node:crypto'
import { L5xParseError, loadL5x, type L5xDocument } from './model/index.ts'
import type { FsService } from './core/tool.ts'
import { L5xError } from './core/errors.ts'
import { decodeExport } from './fs.ts'

/** One parsed export, identified by the handle the reader passes back. */
export interface OpenProject {
  /** Handle returned by `open_project`. */
  readonly id: string
  /** Path as the caller supplied it. */
  readonly requestedPath: string
  /** Resolved path the filesystem provider returned. */
  readonly path: string
  /** SHA-256 of the bytes this document was parsed from. */
  readonly sha256: string
  /** The parsed document. */
  readonly document: L5xDocument
  /** ISO timestamp of the open. */
  readonly openedAt: string
}

/** The parsed-document store for one chat. */
export class ProjectSession {
  private readonly projects = new Map<string, OpenProject>()

  /**
   * @param fs - Filesystem provider for the profile.
   * @param maxFileBytes - Largest export one open will read.
   */
  constructor(
    private readonly fs: FsService,
    private readonly maxFileBytes: number,
  ) {}

  /** Handles open in this chat, in open order. */
  ids(): readonly string[] {
    return [...this.projects.keys()]
  }

  /**
   * Read, parse and retain one export.
   *
   * @param requestedPath - Path as the caller supplied it.
   * @param signal - Cancellation from the tool call.
   * @returns The retained project, including its handle.
   */
  async open(requestedPath: string, signal?: AbortSignal): Promise<OpenProject> {
    const bytes = await this.readBytes(requestedPath, signal)
    let document: L5xDocument
    try {
      document = loadL5x(decodeExport(bytes))
    } catch (error) {
      throw new L5xError(
        'INVALID_L5X',
        error instanceof L5xParseError ? error.message : `The file is not a readable L5X export: ${String(error)}`,
        'Open a full L5X export from Studio 5000 (File > Save As > L5X), then retry.',
      )
    }
    const project: OpenProject = {
      id: randomUUID(),
      requestedPath,
      path: await this.fs.resolve(requestedPath, signal === undefined ? {} : { signal }),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      document,
      openedAt: new Date().toISOString(),
    }
    this.projects.set(project.id, project)
    return project
  }

  /**
   * Resolve the project a read applies to and prove it is still current.
   *
   * @param projectId - Explicit handle, or undefined to use the single open project.
   * @param signal - Cancellation from the tool call.
   * @returns The open project.
   */
  async require(projectId: string | undefined, signal?: AbortSignal): Promise<OpenProject> {
    const ids = this.ids()
    const project = projectId === undefined || projectId === ''
      ? this.single(ids)
      : this.projects.get(projectId)
    if (project === undefined) {
      throw new L5xError(
        'UNKNOWN_PROJECT',
        `No project is open with project_id ${JSON.stringify(projectId)}.`,
        ids.length === 0
          ? 'Call open_project with the L5X path, then retry.'
          : `Pass one of the open project ids: ${ids.join(', ')}.`,
        ids,
      )
    }
    const bytes = await this.fs.readBytes(project.path, signal, this.maxFileBytes)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (sha256 !== project.sha256) {
      throw new L5xError(
        'STALE_EXPORT',
        `The export changed since open_project: ${project.requestedPath}`,
        'Call open_project again on the same path, then repeat the read.',
      )
    }
    return project
  }

  /** The single open project, or the failure that explains how to choose one. */
  private single(ids: readonly string[]): OpenProject {
    const only = ids[0]
    if (only === undefined) {
      throw new L5xError(
        'NO_PROJECT',
        'No project is open in this chat.',
        'Call open_project with the L5X path, then retry.',
      )
    }
    if (ids.length > 1) {
      throw new L5xError(
        'AMBIGUOUS_PROJECT',
        `${ids.length} projects are open in this chat, so project_id is required.`,
        `Pass one of the open project ids: ${ids.join(', ')}.`,
        ids,
      )
    }
    return this.projects.get(only) as OpenProject
  }

  /** Resolve, check and read one path through the filesystem provider. */
  private async readBytes(requestedPath: string, signal?: AbortSignal): Promise<Uint8Array> {
    if (requestedPath.trim() === '') {
      throw new L5xError(
        'INVALID_ARGUMENT',
        'path is required.',
        'Pass the L5X file path, for example "C:/Projects/Line/Line.L5X".',
      )
    }
    const target = await this.fs.resolve(requestedPath, signal === undefined ? {} : { signal })
    const info = await this.fs.stat(target, signal)
    if (info === undefined) {
      throw new L5xError(
        'FILE_NOT_FOUND',
        `No file exists at ${requestedPath}.`,
        'Check the path. Use an absolute path or a path inside this workspace, and the .L5X extension.',
      )
    }
    if (info.type !== 'file') {
      throw new L5xError(
        'INVALID_PATH',
        `${requestedPath} is not a file.`,
        'Pass the path of one .L5X export, not a directory.',
      )
    }
    return this.fs.readBytes(target, signal, this.maxFileBytes)
  }
}
