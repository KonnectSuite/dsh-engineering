/**
 * Open L5X exports for one chat.
 *
 * A snapshot names the parsed document, the XML it came from, and the hash of
 * the bytes. Reads are pure over the document, so a project is parsed once;
 * every later call re-reads the file only to prove the document is still the
 * file's content.
 *
 * Handles belong to the calling chat. A second chat starts with none open,
 * which is why an unknown handle names the handles that chat does have.
 *
 * @module dsh-engineering-l5x/session
 */

import { createHash, randomUUID } from 'node:crypto'
import { L5xParseError, loadL5x, type L5xDocument } from './model/index.ts'
import type { ExecContext } from './core/tool.ts'
import { L5xError } from './core/errors.ts'
import { decodeExport } from './fs.ts'
import type { FsService } from './core/tool.ts'

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

/** The parsed-document store, keyed by chat. */
export class ProjectSession {
  /** Projects per chat; the key is the calling session object. */
  private readonly chats = new WeakMap<object, Map<string, ProjectSnapshot>>()
  /** Projects for a call without a chat identity, which happens only in tests. */
  private readonly detached = new Map<string, ProjectSnapshot>()

  /**
   * @param fs - Filesystem provider for the profile.
   * @param maxFileBytes - Largest export one open will read.
   */
  constructor(
    private readonly fs: FsService,
    private readonly maxFileBytes: number,
  ) {}

  /**
   * Handles open in the calling chat, in open order.
   *
   * @param exec - Calling context; its chat selects the handle set.
   * @returns The handles that chat can pass to a read.
   */
  ids(exec?: ExecContext): readonly string[] {
    return [...this.projectsOf(exec).keys()]
  }

  /**
   * Read, parse and retain one export for the calling chat.
   *
   * @param requestedPath - Path as the caller supplied it, absolute or relative to the session workspace.
   * @param exec - Calling context: cancellation, workspace root, and chat identity.
   * @returns The retained project, including its handle.
   */
  async open(requestedPath: string, exec?: ExecContext): Promise<ProjectSnapshot> {
    const { bytes, target } = await this.readBytes(requestedPath, exec)
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
    const projects = this.projectsOf(exec)
    projects.set(project.id, project)
    while (projects.size > MAX_PROJECTS) {
      const oldest = projects.keys().next().value
      if (oldest !== undefined) projects.delete(oldest)
    }
    return project
  }

  /**
   * Resolve the project a read applies to and prove it is still current.
   *
   * @param projectId - Explicit handle, or undefined to use the single open project in this chat.
   * @param exec - Calling context: cancellation and chat identity.
   * @returns The open project.
   */
  async require(projectId: string | undefined, exec?: ExecContext): Promise<ProjectSnapshot> {
    const projects = this.projectsOf(exec)
    const ids = [...projects.keys()]
    const project = projectId === undefined || projectId === ''
      ? this.single(ids, projects)
      : projects.get(projectId)
    if (project === undefined) {
      throw new L5xError(
        'UNKNOWN_PROJECT',
        `No project is open with project_id ${JSON.stringify(projectId)} in this chat.`,
        ids.length === 0
          ? 'Call open_project with the L5X path, then retry.'
          : `Pass one of this chat's open project ids: ${ids.join(', ')}.`,
        ids,
      )
    }
    const bytes = await this.fs.readBytes(project.path, exec?.signal, this.maxFileBytes)
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

  /**
   * Write one prepared draft to a new path, never overwriting.
   *
   * @param outputPath - Destination as the caller supplied it.
   * @param text - The prepared L5X document.
   * @param exec - Calling context: cancellation and workspace root.
   * @returns The resolved destination.
   */
  async writeNew(outputPath: string, text: string, exec?: ExecContext): Promise<string> {
    if (!/\.l5x$/iu.test(outputPath)) {
      throw new L5xError('OUTPUT_EXTENSION', 'The draft must be written to an .L5X file.', 'Pass output_path ending in .L5X.')
    }
    const target = await this.fs.resolve(outputPath, {
      ...(exec?.cwd === undefined ? {} : { cwd: exec.cwd }),
      ...(exec?.signal === undefined ? {} : { signal: exec.signal }),
    })
    const info = await this.fs.stat(target, exec?.signal)
    if (info !== undefined) {
      throw new L5xError(
        'OUTPUT_EXISTS',
        `A file already exists at ${outputPath}.`,
        'Pass a new output_path; this tool never overwrites an existing file.',
      )
    }
    if (this.fs.writeText === undefined) {
      throw new L5xError(
        'OUTPUT_UNAVAILABLE',
        'The filesystem provider in this profile cannot write files.',
        'Use a profile whose filesystem provider allows writes, or copy the draft text into Studio manually.',
      )
    }
    await this.fs.writeText(target, text, { kind: 'createIfAbsent' }, exec?.signal)
    return target
  }

  /** The handle set for one calling chat. */
  private projectsOf(exec?: ExecContext): Map<string, ProjectSnapshot> {
    const chat = exec?.chat
    if (chat === undefined) return this.detached
    const existing = this.chats.get(chat)
    if (existing !== undefined) return existing
    const created = new Map<string, ProjectSnapshot>()
    this.chats.set(chat, created)
    return created
  }

  /** The single open project in one chat, or the failure that explains how to choose one. */
  private single(ids: readonly string[], projects: Map<string, ProjectSnapshot>): ProjectSnapshot {
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
        `Pass one of this chat's open project ids: ${ids.join(', ')}.`,
        ids,
      )
    }
    return projects.get(only) as ProjectSnapshot
  }

  /** Resolve, check and read one path through the filesystem provider. */
  private async readBytes(requestedPath: string, exec?: ExecContext): Promise<{ bytes: Uint8Array; target: string }> {
    if (requestedPath.trim() === '') {
      throw new L5xError(
        'INVALID_ARGUMENT',
        'path is required.',
        'Pass the L5X file path, for example "C:/Projects/Line/Line.L5X".',
      )
    }
    const target = await this.fs.resolve(requestedPath, {
      ...(exec?.cwd === undefined ? {} : { cwd: exec.cwd }),
      ...(exec?.signal === undefined ? {} : { signal: exec.signal }),
    })
    const info = await this.fs.stat(target, exec?.signal)
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
    return { bytes: await this.fs.readBytes(target, exec?.signal, this.maxFileBytes), target }
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
