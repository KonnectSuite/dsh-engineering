/**
 * The ECAD row's workspace state: open sheets, the profile, drafts and index.
 *
 * A sheet is read and parsed at most once per chat until the caller asks for a
 * reload, so a set-level review does not re-parse the same drawings. The files
 * this class writes are the engine's own workspace artifacts under `.ecad/`
 * (previews, index, profile, drafts); source drawings are only ever read, and a
 * new drawing is written by `draft_apply` beside its source with a create guard.
 *
 * Writes outside `.ecad/` require the row's writes switch, which is off by
 * default. A refused or failed provider write becomes a typed error naming the
 * target and saying plainly that nothing was written.
 *
 * @module dsh-engineering-ecad/session
 */

import { createHash, randomUUID } from 'node:crypto'
import type {
  EcadDiff,
  EcadDraft,
  EcadOp,
  EcadProfile,
  EcadSheetModel,
  EcadTitleBlock,
  EcadVerification,
  EcadWorkspaceIndex
} from './engine/index.ts'
import type { OpenedSheet } from './engine/index.ts'
import { EngineeringError } from './core.ts'
import type { ExecContext, FsService, FsTarget, FsWriteIntent, SandboxPolicyResolver } from './core.ts'
import { readDrawing, writeDrawing } from './drawings.ts'
import type { ConversionInfo, DrawingFormat, DrawingOutput, ReadDrawing, WrittenDrawing } from './drawings.ts'

/** The engine module, imported on first use so a mounted row pays nothing until it reads. */
type EngineModule = typeof import('./engine/index.ts')
let enginePromise: Promise<EngineModule> | undefined

/**
 * Load the engine module once.
 *
 * @returns the engine namespace.
 */
export async function engine(): Promise<EngineModule> {
  enginePromise ??= import('./engine/index.ts')
  return await enginePromise
}

/** Where the row keeps its own workspace artifacts. */
export const ECAD_DIR = '.ecad'
/** The confirmed workspace profile. */
export const PROFILE_FILE = `${ECAD_DIR}/profile.json`
/** The workspace drawing index written by `ecad_scan`. */
export const INDEX_FILE = `${ECAD_DIR}/index.json`
/** Cached render models, one per drawing path. */
export const PREVIEW_DIR = `${ECAD_DIR}/previews`
/** Staged drafts. */
export const DRAFT_DIR = `${ECAD_DIR}/drafts`
/** Rendered SVG previews. */
export const RENDER_DIR = `${ECAD_DIR}/renders`
/** Documentation bundles written by `ecad_document`. */
export const DOCUMENT_DIR = `${ECAD_DIR}/documentation`

/** Most single sheets one chat keeps parsed. */
export const MAX_CACHED_SHEETS = 8

/** A parsed drawing and the facts later calls report. */
export interface SheetView {
  /** Path as the caller supplied it. */
  readonly requestedPath: string
  /** Resolved display path used for output. */
  readonly path: string
  /** SHA-256 of the source bytes this view was built from. */
  readonly sha256: string
  /** Source size in bytes. */
  readonly sourceBytes: number
  /** Format read from the source path. */
  readonly format: DrawingFormat
  /** Conversion detail for a non-DXF conversion, absent for DXF. */
  readonly conversion?: ConversionInfo
  /** The opened database (mutable; a fresh open is used for every edit). */
  readonly opened: OpenedSheet
  /** The render model. */
  readonly model: EcadSheetModel
}

/** One cache entry. */
interface CacheEntry extends SheetView {
  readonly openedAt: string
}

/** The workspace profile and where it came from. */
export interface WorkspaceProfile {
  readonly profile: EcadProfile
  readonly source: 'workspace' | 'default'
  /** Artifact path when the profile was read from the workspace. */
  readonly path?: string
}

/** The cached index and where it came from. */
export interface WorkspaceIndexState {
  readonly index: EcadWorkspaceIndex
  readonly path: string
}

/** A staged draft on disk. */
export interface StagedDraft extends EcadDraft {
  /** Artifact path of the draft file. */
  readonly draftPath: string
}

/** The record `draft_apply` leaves so `ecad_verify` can prove the same write again. */
export interface AppliedRecord {
  readonly draftId: string
  readonly sourcePath: string
  readonly sourceVersion: string
  /** Format of the source drawing; absent for DXF records written before DWG support. */
  readonly sourceFormat?: DrawingFormat
  readonly outputPath: string
  readonly outputVersion: string
  /** Format of the written drawing; absent for DXF records. */
  readonly outputFormat?: DrawingFormat
  /** Conversion detail when the written drawing's format differs from the source. */
  readonly conversion?: ConversionInfo
  readonly changes: Readonly<Record<string, number>>
  readonly verification: EcadVerification
  readonly appliedAt: string
}

/** Limits and switches the row was configured with. */
export interface EcadSessionOptions {
  /** Whether tools may write outside `.ecad/`. */
  readonly writes: boolean
  /** Largest drawing one open will read. */
  readonly maxFileBytes: number
  /** Most files one scan or backup may touch. */
  readonly maxFiles: number
  /** Entity cap per layout when a model is built. */
  readonly maxEntities: number
  /** Per-session sandbox policy, resolved for every mutation this session writes. */
  readonly policy?: SandboxPolicyResolver
}

/** One id that is safe as a file name. */
const DRAFT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

/**
 * Join a workspace root and a relative artifact path.
 *
 * @param root - workspace root, possibly empty.
 * @param relative - forward-slash relative path.
 * @returns a path the filesystem provider resolves.
 */
export function joinPath(root: string, relative: string): string {
  const cleanRoot = root.replace(/[\\/]+$/u, '')
  const cleanRelative = relative.replace(/\\/gu, '/').replace(/^\/+/u, '')
  if (cleanRoot === '' || cleanRoot === '.') return cleanRelative
  return `${cleanRoot}/${cleanRelative}`
}

/**
 * The parent directory of a display path, or `.` when it has none.
 *
 * @param path - display path.
 */
export function parentOf(path: string): string {
  const normalised = path.replace(/\\/gu, '/')
  const index = normalised.lastIndexOf('/')
  return index <= 0 ? (index === 0 ? '/' : '.') : normalised.slice(0, index)
}

/**
 * The file name of a display path.
 *
 * @param path - display path.
 */
export function baseNameOf(path: string): string {
  const normalised = path.replace(/\\/gu, '/')
  return normalised.slice(normalised.lastIndexOf('/') + 1)
}

/**
 * The file name without its extension.
 *
 * @param path - display path.
 */
export function stemOf(path: string): string {
  return baseNameOf(path).replace(/\.[^.]+$/u, '')
}

/**
 * The workspace ECAD state for one mounted row.
 */
export class EcadSession {
  /** Whether tools may write outside `.ecad/`. */
  readonly writes: boolean
  /** Largest drawing one open will read. */
  readonly maxFileBytes: number
  /** Most files one scan or backup may touch. */
  readonly maxFiles: number
  /** Entity cap per layout when a model is built. */
  readonly maxEntities: number
  /** Sheets per chat, keyed by resolved display path. */
  private readonly chats = new WeakMap<object, Map<string, CacheEntry>>()
  /** Sheets for a call without a chat identity, which happens only in tests. */
  private readonly detached = new Map<string, CacheEntry>()
  /** Draft ids discarded in this chat when the provider cannot delete files. */
  private readonly discarded = new WeakMap<object, Set<string>>()
  /** Discarded ids for the detached case. */
  private readonly detachedDiscarded = new Set<string>()

  /**
   * @param fs - filesystem provider, addressed by resolved targets.
   * @param options - row switches and limits.
   * @param policy - per-session sandbox policy for writes.
   */
  constructor(
    readonly fs: FsService,
    options: EcadSessionOptions
  ) {
    this.writes = options.writes === true
    this.maxFileBytes = options.maxFileBytes
    this.maxFiles = options.maxFiles
    this.maxEntities = options.maxEntities
    this.policy = options.policy
  }

  /** Per-session sandbox policy, when the composition offers one. */
  private readonly policy?: SandboxPolicyResolver

  /**
   * The workspace root of one call.
   *
   * @param exec - calling context.
   */
  workspace(exec?: ExecContext): string {
    return exec?.cwd !== undefined && exec.cwd !== '' ? exec.cwd : '.'
  }

  /**
   * Refuse a write outside `.ecad/` when the row's writes switch is off.
   *
   * @param what - the output being written, for the message.
   */
  requireWrites(what: string): void {
    if (this.writes) return
    throw new EngineeringError(
      'ECAD_WRITES_DISABLED',
      `ECAD writes are switched off, so ${what} cannot be written.`,
      'Enable writes for the engineering-ecad row (Plugins → Engineering → ECAD), then retry. Nothing was written.'
    )
  }

  /**
   * Clamp a caller limit against the configured ceiling.
   *
   * @param requested - the caller's `limit`, when given.
   * @param fallback - default when the caller gave none.
   * @param ceiling - configured maximum.
   * @returns the effective limit.
   */
  cap(requested: number | undefined, fallback: number, ceiling = this.maxFiles): number {
    const value = typeof requested === 'number' && Number.isFinite(requested) && requested > 0 ? Math.trunc(requested) : fallback
    return Math.max(1, Math.min(value, ceiling))
  }

  /**
   * Resolve one path through the filesystem provider.
   *
   * @param path - caller-supplied path.
   * @param exec - calling context.
   * @returns the resolved target.
   */
  async resolve(path: string, exec?: ExecContext): Promise<FsTarget> {
    if (typeof path !== 'string' || path.trim() === '') {
      throw new EngineeringError('INVALID_ARGUMENT', 'path is required.', 'Pass the drawing path, for example "Prints/DXF/A-101.dxf".')
    }
    return await this.fs.resolve(path, {
      ...(exec?.cwd === undefined ? {} : { cwd: exec.cwd }),
      ...(exec?.signal === undefined ? {} : { signal: exec.signal })
    })
  }

  /**
   * Whether one path exists.
   *
   * @param path - caller-supplied path.
   * @param exec - calling context.
   */
  async exists(path: string, exec?: ExecContext): Promise<boolean> {
    const target = await this.resolve(path, exec)
    return (await this.fs.stat(target, exec?.signal)) !== undefined
  }

  /**
   * Read one file as bytes, bounded.
   *
   * @param path - caller-supplied path.
   * @param exec - calling context.
   * @param maxBytes - byte cap.
   * @returns the bytes and the resolved target.
   */
  async readFile(path: string, exec?: ExecContext, maxBytes = this.maxFileBytes): Promise<{ bytes: Uint8Array; target: FsTarget; displayPath: string }> {
    const target = await this.resolve(path, exec)
    const info = await this.fs.stat(target, exec?.signal)
    if (info === undefined) {
      throw new EngineeringError('FILE_NOT_FOUND', `No file exists at ${JSON.stringify(path)}.`, 'Check the path; use an absolute path or one inside this workspace, and the .dxf extension.')
    }
    if (info.type !== 'file') {
      throw new EngineeringError('INVALID_PATH', `${JSON.stringify(path)} is not a regular file.`, 'Pass the path of one .dxf drawing, not a directory.')
    }
    const bytes = await this.fs.readBytes(target, exec?.signal, maxBytes + 1)
    if (bytes.byteLength > maxBytes) {
      throw new EngineeringError('ECAD_TOO_LARGE', `${JSON.stringify(path)} is larger than the ${maxBytes}-byte limit.`, 'Raise maxFileBytes for this row, or split the drawing before reading it.')
    }
    return { bytes, target, displayPath: target.displayPath }
  }

  /**
   * Read one text file, returning undefined when it is absent.
   *
   * @param path - caller-supplied path.
   * @param exec - calling context.
   * @param maxBytes - byte cap.
   */
  async readText(path: string, exec?: ExecContext, maxBytes = 8 * 1024 * 1024): Promise<string | undefined> {
    const target = await this.resolve(path, exec)
    const info = await this.fs.stat(target, exec?.signal)
    if (info === undefined) return undefined
    const bytes = await this.fs.readBytes(target, exec?.signal, maxBytes + 1)
    if (bytes.byteLength > maxBytes) return undefined
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  }

  /**
   * Read and model one drawing, with no cache.
   *
   * Set-level tools use this so a review of many sheets does not pin them all in
   * memory; single-sheet tools use {@link open} instead. The read goes through
   * {@link readDrawing}, which owns the format rule, so a DWG source becomes a
   * DXF conversion here without any tool changing.
   *
   * @param path - caller-supplied path.
   * @param exec - calling context.
   * @param options - optional entity cap override.
   * @returns the parsed view.
   */
  async load(path: string, exec?: ExecContext, options: { maxEntities?: number } = {}): Promise<SheetView> {
    const engineModule = await engine()
    const target = await this.resolve(path, exec)
    const info = await this.fs.stat(target, exec?.signal)
    if (info === undefined) {
      throw new EngineeringError('FILE_NOT_FOUND', `No file exists at ${JSON.stringify(path)}.`, 'Check the path; use an absolute path or one inside this workspace.')
    }
    if (info.type !== 'file') {
      throw new EngineeringError('INVALID_PATH', `${JSON.stringify(path)} is not a regular file.`, 'Pass the path of one drawing, not a directory.')
    }
    const read = await readDrawing(this.fs, target, target.displayPath, { maxFileBytes: this.maxFileBytes, ...(exec?.signal === undefined ? {} : { signal: exec.signal }) })
    const opened = await engineModule.openSheet({ path: read.displayPath, bytes: read.dxfBytes, maxFileBytes: this.maxFileBytes })
    const model = engineModule.buildSheetModel(opened, { maxEntitiesPerLayout: Math.max(1, options.maxEntities ?? this.maxEntities) })
    return {
      requestedPath: path,
      path: read.displayPath,
      sha256: sha256(read.bytes),
      sourceBytes: read.sourceBytes,
      format: read.format,
      ...(read.conversion === undefined ? {} : { conversion: read.conversion }),
      opened,
      model
    }
  }

  /**
   * Read one drawing without building its model, for a backup or a readback.
   *
   * @param path - caller-supplied path.
   * @param exec - calling context.
   * @returns the source bytes, the DXF bytes and the format.
   */
  async readDrawingAt(path: string, exec?: ExecContext): Promise<ReadDrawing> {
    const target = await this.resolve(path, exec)
    return await readDrawing(this.fs, target, target.displayPath, { maxFileBytes: this.maxFileBytes, ...(exec?.signal === undefined ? {} : { signal: exec.signal }) })
  }

  /**
   * Publish one drawing to a new path and read it back, so the answer comes from
   * the written file rather than from the bytes that were planned.
   *
   * This is the write half of `ecad_draft_apply`, kept here so the DWG output
   * conversion lands in {@link writeDrawing} alone. The destination is guarded
   * create-only: a customer drawing is never overwritten.
   *
   * @param path - destination path.
   * @param output - bytes, destination format and target version.
   * @param exec - calling context.
   * @returns the published file, its re-read model and its preview artifact.
   */
  async publishDrawing(
    path: string,
    output: DrawingOutput,
    exec?: ExecContext
  ): Promise<{ written: WrittenDrawing; readBack: ReadDrawing; opened: OpenedSheet; model: EcadSheetModel; version: string; modelPath: string }> {
    const engineModule = await engine()
    const target = await this.resolve(path, exec)
    const written = await writeDrawing(this.fs, target, output, {
      ...(exec?.signal === undefined ? {} : { signal: exec.signal }),
      ...(this.policyFor(exec) === undefined ? {} : { sandboxPolicy: this.policyFor(exec) })
    })
    const readBack = await readDrawing(this.fs, target, written.displayPath, { maxFileBytes: this.maxFileBytes, ...(exec?.signal === undefined ? {} : { signal: exec.signal }) })
    const opened = await engineModule.openSheet({ path: readBack.displayPath, bytes: readBack.dxfBytes, maxFileBytes: this.maxFileBytes })
    const model = engineModule.buildSheetModel(opened, { maxEntitiesPerLayout: this.maxEntities })
    const version = sha256(readBack.bytes)
    const modelPath = await this.savePreview(this.relativePath(exec, readBack.displayPath), version, model, exec)
    return { written, readBack, opened, model, version, modelPath }
  }

  /**
   * A display path made workspace-relative when it lives inside the workspace.
   *
   * @param exec - calling context.
   * @param displayPath - resolved display path.
   */
  relativePath(exec: ExecContext | undefined, displayPath: string): string {
    const normalPath = displayPath.replace(/\\/gu, '/')
    const root = this.workspace(exec).replace(/\\/gu, '/').replace(/\/+$/u, '')
    if (root !== '' && root !== '.' && normalPath.startsWith(`${root}/`)) return normalPath.slice(root.length + 1)
    return normalPath
  }

  /**
   * Read, model and cache one drawing for this chat.
   *
   * @param path - caller-supplied path.
   * @param exec - calling context.
   * @param options - `reload` forces a re-read.
   * @returns the parsed view.
   */
  async open(path: string, exec?: ExecContext, options: { reload?: boolean } = {}): Promise<SheetView> {
    const cache = this.cacheOf(exec)
    const target = await this.resolve(path, exec)
    const key = target.displayPath
    if (options.reload !== true) {
      const cached = cache.get(key)
      if (cached !== undefined) return cached
    }
    const view = await this.load(path, exec)
    const entry: CacheEntry = { ...view, openedAt: new Date().toISOString() }
    cache.delete(key)
    cache.set(key, entry)
    while (cache.size > MAX_CACHED_SHEETS) {
      const oldest = cache.keys().next().value
      if (oldest === undefined) break
      cache.delete(oldest)
    }
    return entry
  }

  /**
   * The cached view of one path, when this chat has it.
   *
   * @param path - caller-supplied path.
   * @param exec - calling context.
   */
  async cached(path: string, exec?: ExecContext): Promise<SheetView | undefined> {
    const target = await this.resolve(path, exec)
    return this.cacheOf(exec).get(target.displayPath)
  }

  /**
   * Drop every cached sheet and draft marker for this chat.
   *
   * @param exec - calling context.
   */
  clearCache(exec?: ExecContext): void {
    this.cacheOf(exec).clear()
    this.discardedOf(exec).clear()
  }

  /**
   * The workspace profile: `.ecad/profile.json` when confirmed, else the defaults.
   *
   * @param exec - calling context.
   * @returns the profile and where it came from.
   */
  async profile(exec?: ExecContext): Promise<WorkspaceProfile> {
    const engineModule = await engine()
    const path = joinPath(this.workspace(exec), PROFILE_FILE)
    const text = await this.readText(path, exec)
    if (text === undefined) return { profile: engineModule.defaultProfile(), source: 'default' }
    try {
      return { profile: engineModule.loadProfile(text), source: 'workspace', path: this.relativePath(exec, path) }
    } catch (error) {
      throw new EngineeringError(
        'ECAD_PROFILE_INVALID',
        `The workspace profile could not be read: ${error instanceof Error ? error.message : String(error)}`,
        'Run ecad_profile with action "infer" and confirm:true to write .ecad/profile.json again, or delete that file to fall back to the defaults.'
      )
    }
  }

  /**
   * Write the confirmed workspace profile.
   *
   * @param profile - the profile to store.
   * @param exec - calling context.
   * @returns the artifact path.
   */
  async saveProfile(profile: EcadProfile, exec?: ExecContext): Promise<string> {
    const engineModule = await engine()
    const path = joinPath(this.workspace(exec), PROFILE_FILE)
    await this.writeText(path, engineModule.serializeProfile(profile), exec, { replace: true })
    return this.relativePath(exec, path)
  }

  /**
   * Cache the render model the panel reads, in the same artifact shape the Remote service writes.
   *
   * @param drawingPath - workspace path of the drawing.
   * @param version - source hash.
   * @param model - render model.
   * @param exec - calling context.
   * @returns the artifact path.
   */
  async savePreview(drawingPath: string, version: string, model: EcadSheetModel, exec?: ExecContext): Promise<string> {
    const engineModule = await engine()
    const key = engineModule.sha256(new TextEncoder().encode(drawingPath))
    const relative = `${PREVIEW_DIR}/${key}.json`
    const payload = { schema: 1, contractVersion: 1, path: drawingPath, version, generatedAt: new Date().toISOString(), model }
    await this.writeText(joinPath(this.workspace(exec), relative), `${JSON.stringify(payload)}\n`, exec, { replace: true })
    return relative
  }

  /**
   * Read the cached workspace index, when `ecad_scan` has written one.
   *
   * @param exec - calling context.
   * @returns the index and its path, or undefined.
   */
  async readIndex(exec?: ExecContext): Promise<WorkspaceIndexState | undefined> {
    const path = joinPath(this.workspace(exec), INDEX_FILE)
    const text = await this.readText(path, exec)
    if (text === undefined) return undefined
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return undefined
    }
    const record = parsed as { schema?: unknown; sheets?: unknown }
    if (record.schema !== 1 || !Array.isArray(record.sheets)) return undefined
    return { index: parsed as EcadWorkspaceIndex, path }
  }

  /**
   * Write the workspace index.
   *
   * @param index - the index document.
   * @param exec - calling context.
   * @returns the artifact path.
   */
  async saveIndex(index: EcadWorkspaceIndex, exec?: ExecContext): Promise<string> {
    const path = joinPath(this.workspace(exec), INDEX_FILE)
    await this.writeText(path, `${JSON.stringify(index, undefined, 2)}\n`, exec, { replace: true })
    return path
  }

  /**
   * Stage one draft as a new file; an existing id is never overwritten.
   *
   * @param draft - the draft document.
   * @param exec - calling context.
   * @returns the staged draft with its artifact path.
   */
  async stageDraft(draft: EcadDraft, exec?: ExecContext): Promise<StagedDraft> {
    if (!DRAFT_ID.test(draft.id)) {
      throw new EngineeringError('INVALID_DRAFT_ID', `draft id ${JSON.stringify(draft.id)} is not a safe file name`, 'Use letters, digits, "-" and "_", starting with a letter or digit.')
    }
    const relative = `${DRAFT_DIR}/${draft.id}.json`
    const path = joinPath(this.workspace(exec), relative)
    if (await this.exists(path, exec)) {
      throw new EngineeringError('DRAFT_EXISTS', `A draft ${JSON.stringify(draft.id)} is already staged.`, 'Discard it first or stage with a different draft_id.')
    }
    await this.writeText(path, `${JSON.stringify(draft, undefined, 2)}\n`, exec)
    return { ...draft, draftPath: relative }
  }

  /**
   * Read one staged draft.
   *
   * @param draftId - the draft id.
   * @param exec - calling context.
   * @returns the draft document and its artifact path.
   */
  async readDraft(draftId: string, exec?: ExecContext): Promise<StagedDraft> {
    const id = this.checkDraftId(draftId)
    if (this.discardedOf(exec).has(id)) throw this.draftMissing(id)
    const relative = `${DRAFT_DIR}/${id}.json`
    const text = await this.readText(joinPath(this.workspace(exec), relative), exec)
    if (text === undefined) throw this.draftMissing(id)
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new EngineeringError('DRAFT_INVALID', `Draft ${JSON.stringify(id)} is not valid JSON.`, 'Discard it and stage the operations again.')
    }
    const record = parsed as Partial<EcadDraft>
    if (record.schema !== 1 || typeof record.path !== 'string' || typeof record.baseVersion !== 'string' || !Array.isArray(record.ops)) {
      throw new EngineeringError('DRAFT_INVALID', `Draft ${JSON.stringify(id)} does not match the draft schema.`, 'Discard it and stage the operations again.')
    }
    return { ...(record as EcadDraft), draftPath: relative }
  }

  /**
   * Record the result of one applied draft so `ecad_verify` can re-prove it.
   *
   * @param record - what was written.
   * @param exec - calling context.
   * @returns the artifact path.
   */
  async saveApplied(record: AppliedRecord, exec?: ExecContext): Promise<string> {
    const relative = `${DRAFT_DIR}/${record.draftId}.applied.json`
    await this.writeText(joinPath(this.workspace(exec), relative), `${JSON.stringify(record, undefined, 2)}\n`, exec, { replace: true })
    return relative
  }

  /**
   * Read the applied record of one draft.
   *
   * @param draftId - the draft id.
   * @param exec - calling context.
   * @returns the record, or undefined when the draft was never applied.
   */
  async readApplied(draftId: string, exec?: ExecContext): Promise<AppliedRecord | undefined> {
    const id = this.checkDraftId(draftId)
    const text = await this.readText(joinPath(this.workspace(exec), `${DRAFT_DIR}/${id}.applied.json`), exec)
    if (text === undefined) return undefined
    try {
      const parsed = JSON.parse(text) as Partial<AppliedRecord>
      if (parsed.draftId === id && typeof parsed.outputPath === 'string' && typeof parsed.sourcePath === 'string' && typeof parsed.outputVersion === 'string') {
        return parsed as AppliedRecord
      }
    } catch {
      // A corrupt record is reported as absent; the tool then asks for a fresh apply.
    }
    return undefined
  }

  /**
   * Discard one staged draft.
   *
   * @param draftId - the draft id.
   * @param exec - calling context.
   * @returns whether the file was deleted (false when the provider cannot delete).
   */
  async discardDraft(draftId: string, exec?: ExecContext): Promise<{ deleted: boolean; path: string }> {
    const id = this.checkDraftId(draftId)
    const relative = `${DRAFT_DIR}/${id}.json`
    const path = joinPath(this.workspace(exec), relative)
    if (!(await this.exists(path, exec))) throw this.draftMissing(id)
    if (this.fs.deleteFile !== undefined) {
      const target = await this.resolve(path, exec)
      await this.fs.deleteFile(target, undefined, exec?.signal, this.policyFor(exec)).catch((error: unknown) => {
        throw new EngineeringError(
          'WRITE_REFUSED',
          `The filesystem provider refused to delete ${target.displayPath}: ${error instanceof Error ? error.message : String(error)}`,
          'Nothing was deleted. Discard the draft again from a session whose sandbox allows it, or leave the file in .ecad/drafts/.'
        )
      })
      this.discardedOf(exec).add(id)
      return { deleted: true, path }
    }
    // Older providers have no delete primitive: refuse it in memory so an
    // apply cannot use the draft again, and say the file stays on disk.
    this.discardedOf(exec).add(id)
    return { deleted: false, path }
  }

  /**
   * Stage one SVG render under `.ecad/renders/`.
   *
   * @param name - file name, without directories.
   * @param svg - SVG text.
   * @param exec - calling context.
   * @returns the artifact path.
   */
  async saveRender(name: string, svg: string, exec?: ExecContext): Promise<string> {
    const safe = name.replace(/[^A-Za-z0-9._-]/gu, '-').replace(/^-+/u, '') || 'render.svg'
    const relative = `${RENDER_DIR}/${safe}`
    await this.writeText(joinPath(this.workspace(exec), relative), svg, exec, { replace: true })
    return relative
  }

  /**
   * Write one text artifact, creating missing parents.
   *
   * @param path - resolved destination path.
   * @param text - contents.
   * @param exec - calling context.
   * @param options - `replace` for this row's own cache, create-only otherwise.
   */
  async writeText(path: string, text: string, exec?: ExecContext, options: { replace?: boolean } = {}): Promise<void> {
    const write = this.fs.writeText
    if (write === undefined) {
      throw new EngineeringError('OUTPUT_UNAVAILABLE', 'The filesystem provider in this profile cannot write text files.', 'Use a profile whose filesystem provider allows writes.')
    }
    const target = await this.resolve(path, exec)
    const expected: FsWriteIntent | undefined = options.replace === true ? undefined : { kind: 'createIfAbsent' }
    await write.call(this.fs, target, text, expected, exec?.signal, this.policyFor(exec)).catch((error: unknown) => {
      throw this.refusedWrite(target.displayPath, error)
    })
  }

  /**
   * Write one byte artifact, creating missing parents. Never overwrites.
   *
   * @param path - resolved destination path.
   * @param bytes - contents.
   * @param exec - calling context.
   */
  async writeNewBytes(path: string, bytes: Uint8Array, exec?: ExecContext): Promise<string> {
    const target = await this.resolve(path, exec)
    const info = await this.fs.stat(target, exec?.signal)
    if (info !== undefined) {
      throw new EngineeringError('OUTPUT_EXISTS', `A file already exists at ${target.displayPath}.`, 'Pass a new output path; this tool never overwrites an existing file.')
    }
    const write = this.fs.writeBytes
    if (write === undefined) {
      throw new EngineeringError('OUTPUT_UNAVAILABLE', 'The filesystem provider in this profile cannot write bytes.', 'Update AryaCode to a build whose filesystem provider writes bytes, then retry; nothing was written.')
    }
    await write.call(this.fs, target, bytes, { kind: 'createIfAbsent' }, exec?.signal, this.policyFor(exec)).catch((error: unknown) => {
      throw this.refusedWrite(target.displayPath, error)
    })
    return target.displayPath
  }

  /**
   * Write one new text file, never overwriting an existing file.
   *
   * @param path - destination path.
   * @param text - contents.
   * @param exec - calling context.
   * @returns the resolved destination display path.
   */
  async writeNewText(path: string, text: string, exec?: ExecContext): Promise<string> {
    const target = await this.resolve(path, exec)
    const info = await this.fs.stat(target, exec?.signal)
    if (info !== undefined) {
      throw new EngineeringError('OUTPUT_EXISTS', `A file already exists at ${target.displayPath}.`, 'Pass a new output path; this tool never overwrites an existing file.')
    }
    await this.writeText(path, text, exec)
    return target.displayPath
  }

  /**
   * The sandbox policy to stamp on one mutation.
   *
   * The provider falls back to the deployment default when this is absent, so an
   * omitted policy is not "no policy": it is workspace-write, even in a session
   * whose mode is wider. Resolve what the host service says about this session.
   *
   * @param exec - the calling tool context.
   */
  policyFor(exec?: ExecContext): unknown {
    if (this.policy === undefined) return undefined
    const owner = (exec?.agent as { readonly session?: unknown } | undefined)?.session
    return this.policy.resolve(owner === undefined ? {} : { session: owner })
  }

  /**
   * Turn a provider write failure into a typed refusal that states nothing was written.
   *
   * @param displayPath - the destination that was refused.
   * @param error - the provider failure.
   */
  private refusedWrite(displayPath: string, error: unknown): EngineeringError {
    return new EngineeringError(
      'WRITE_REFUSED',
      `The filesystem provider refused to write ${displayPath}: ${error instanceof Error ? error.message : String(error)}`,
      'Choose a path inside the writable workspace or widen this session’s file access, then retry. Nothing was written.'
    )
  }

  /** Validate one draft id before it is used as a file name. */
  private checkDraftId(draftId: string): string {
    if (!DRAFT_ID.test(draftId)) {
      throw new EngineeringError('INVALID_DRAFT_ID', `draft_id ${JSON.stringify(draftId)} is not a valid draft id.`, 'Pass the id ecad_draft_ops returned.')
    }
    return draftId
  }

  /** The failure for a draft that is not staged. */
  private draftMissing(id: string): EngineeringError {
    return new EngineeringError('DRAFT_NOT_FOUND', `No staged draft ${JSON.stringify(id)} exists in this workspace.`, 'Run ecad_draft_ops to stage one, or pass the draft_id it returned.')
  }

  /** The cache for one chat. */
  private cacheOf(exec?: ExecContext): Map<string, CacheEntry> {
    const chat = exec?.chat
    if (chat === undefined) return this.detached
    const existing = this.chats.get(chat)
    if (existing !== undefined) return existing
    const created = new Map<string, CacheEntry>()
    this.chats.set(chat, created)
    return created
  }

  /** The discarded-id set for one chat. */
  private discardedOf(exec?: ExecContext): Set<string> {
    const chat = exec?.chat
    if (chat === undefined) return this.detachedDiscarded
    const existing = this.discarded.get(chat)
    if (existing !== undefined) return existing
    const created = new Set<string>()
    this.discarded.set(chat, created)
    return created
  }
}

/**
 * A new draft id that is safe as a file name.
 *
 * @returns a stable, sortable id.
 */
export function newDraftId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\..+$/u, '')
  return `${stamp}-${randomUUID().slice(0, 8)}`
}

/**
 * SHA-256 of one byte sequence.
 *
 * @param bytes - file bytes.
 */
export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** The shape one title block read returns, narrowed for tool output. */
export interface SheetTitleBlock {
  readonly layout?: string
  readonly fields: EcadTitleBlock['fields']
}

/** The operations a draft may carry. */
export type DraftOps = readonly EcadOp[]

/** A diff document as tools report it. */
export type DiffDocument = EcadDiff
