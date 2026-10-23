/**
 * Open L5X exports for one chat.
 *
 * A snapshot names the parsed document, the XML it came from, and the hash of
 * the bytes. Reads are pure over the document, so a project is parsed once;
 * every later call re-reads the file only to prove the document is still the
 * file's content.
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

/** How completely one export feature can be analyzed. */
export type FeatureLevel = 'analyzed' | 'partial' | 'unsupported' | 'not_present'

/** One parsed export, identified by the handle the reader passes back. */
export interface ProjectSnapshot {
  /** Handle returned by `open_project`. */
  readonly id: string
  /** Path as the caller supplied it. */
  readonly requestedPath: string
  /** Resolved path the filesystem provider returned. */
  readonly path: string
  /** SHA-256 of the bytes this document was parsed from. */
  readonly sha256: string
  /** Size of the export in bytes. */
  readonly bytes: number
  /** Decoded XML text. */
  readonly xml: string
  /** The parsed document. */
  readonly document: L5xDocument
  /** Studio software revision the export declares. */
  readonly softwareRevision: string
  /** Whether this revision is in the parser's observed test matrix. */
  readonly verification: 'observed_parse' | 'untested_revision'
  /** Export target type, `Controller` for a full project. */
  readonly targetType: string
  /** Whether the export is a whole controller or one component. */
  readonly exportKind: 'controller' | 'component'
  /** Feature analysis level for this export. */
  readonly features: Readonly<Record<string, FeatureLevel>>
  /** ISO timestamp of the open. */
  readonly openedAt: string
}

/** A failure raised by an analysis engine. */
export class EngineeringError extends L5xError {
  /**
   * @param code - Stable identifier for tests and logs.
   * @param message - What failed, in the reader's terms.
   * @param fix - The next call or check; defaults to re-reading the project state.
   */
  constructor(code: string, message: string, fix = 'Call project_overview to confirm the project state, then retry.') {
    super(code, message, fix)
  }
}

/** Most projects one chat retains before the oldest is dropped. */
const MAX_PROJECTS = 4

/** The parsed-document store for one chat. */
export class ProjectSession {
  private readonly projects = new Map<string, ProjectSnapshot>()

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
   * @param requestedPath - Path as the caller supplied it, absolute or relative to the session workspace.
   * @param signal - Cancellation from the tool call.
   * @param cwd - Session workspace root, so a relative path resolves where the reader expects.
   * @returns The retained project, including its handle.
   */
  async open(requestedPath: string, signal?: AbortSignal, cwd?: string): Promise<ProjectSnapshot> {
    const { bytes, target } = await this.readBytes(requestedPath, signal, cwd)
    const xml = decodeExport(bytes)
    if (/<!DOCTYPE\b|<!ENTITY\b/iu.test(xml)) {
      throw new L5xError(
        'UNSUPPORTED_XML',
        'The export declares a DTD or an entity, which this plugin does not accept.',
        'Re-export the project from Studio 5000 without a custom DTD, then reopen it.',
      )
    }
    let document: L5xDocument
    try {
      document = loadL5x(xml)
    } catch (error) {
      throw new L5xError(
        'INVALID_L5X',
        error instanceof L5xParseError ? error.message : `The file is not a readable L5X export: ${String(error)}`,
        'Open a full L5X export from Studio 5000 (File > Save As > L5X), then retry.',
      )
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const targetType = attribute(xml, 'TargetType')
    const softwareRevision = attribute(xml, 'SoftwareRevision')
    const major = Number.parseInt(softwareRevision, 10)
    if (Number.isFinite(major) && major < 19) {
      throw new L5xError(
        'UNSUPPORTED_REVISION',
        `Software revision ${softwareRevision} predates the revision-19 target this parser supports.`,
        'Re-export the project from Studio 5000 revision 19 or later, then open that L5X.',
      )
    }
    const project: ProjectSnapshot = {
      id: randomUUID(),
      requestedPath,
      path: target,
      sha256,
      bytes: bytes.length,
      xml,
      document,
      softwareRevision,
      verification: verificationOf(major),
      targetType,
      exportKind: targetType === 'Controller' ? 'controller' : 'component',
      features: featureLevels(xml),
      openedAt: new Date().toISOString(),
    }
    this.projects.set(project.id, project)
    while (this.projects.size > MAX_PROJECTS) {
      const oldest = this.projects.keys().next().value
      if (oldest !== undefined) this.projects.delete(oldest)
    }
    return project
  }

  /**
   * Resolve the project a read applies to and prove it is still current.
   *
   * @param projectId - Explicit handle, or undefined to use the single open project.
   * @param signal - Cancellation from the tool call.
   * @returns The open project.
   */
  async require(projectId: string | undefined, signal?: AbortSignal): Promise<ProjectSnapshot> {
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
  private single(ids: readonly string[]): ProjectSnapshot {
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
    return this.projects.get(only) as ProjectSnapshot
  }

  /** Resolve, check and read one path through the filesystem provider. */
  private async readBytes(requestedPath: string, signal?: AbortSignal, cwd?: string): Promise<{ bytes: Uint8Array; target: string }> {
    if (requestedPath.trim() === '') {
      throw new L5xError(
        'INVALID_ARGUMENT',
        'path is required.',
        'Pass the L5X file path, for example "C:/Projects/Line/Line.L5X".',
      )
    }
    const target = await this.fs.resolve(requestedPath, {
      ...(cwd === undefined ? {} : { cwd }),
      ...(signal === undefined ? {} : { signal }),
    })
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
    return { bytes: await this.fs.readBytes(target, signal, this.maxFileBytes), target }
  }
}

/** Read one attribute from the export root element. */
function attribute(xml: string, name: string): string {
  const root = /<RSLogix5000Content\b([^>]*)>/u.exec(xml)?.[1] ?? ''
  return new RegExp(`\\b${name}=["']([^"']*)["']`, 'u').exec(root)?.[1] ?? ''
}

/** Revisions the parser has been exercised against; anything else is still read, but flagged. */
const OBSERVED_REVISIONS = new Set([19, 33, 34, 36, 37])

/** Whether a revision is in the observed test matrix. */
function verificationOf(major: number): 'observed_parse' | 'untested_revision' {
  return OBSERVED_REVISIONS.has(major) ? 'observed_parse' : 'untested_revision'
}

/** Feature analysis level for one export. */
function featureLevels(xml: string): Readonly<Record<string, FeatureLevel>> {
  return {
    ladder: 'analyzed',
    structuredText: 'analyzed',
    functionBlock: xml.includes('<FBDContent') ? 'partial' : 'not_present',
    sequentialFunctionChart: xml.includes('<SFCContent') ? 'partial' : 'not_present',
    alarms: /<Alarm\b|<TagBasedAlarm\b/u.test(xml) ? 'partial' : 'not_present',
    protectedContent: /<EncodedData\b|Encrypted="true"|SourceProtected="true"/u.test(xml) ? 'unsupported' : 'not_present',
  }
}
