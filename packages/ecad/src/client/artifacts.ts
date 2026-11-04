/**
 * The wire results the drawing pane consumes, and the reader for the cached
 * render-model artifact.
 *
 * `ecad/open` returns a short envelope plus a workspace-relative `modelPath`;
 * the full `EcadSheetModel` lives in the artifact the host wrote there, and the
 * pane reads it back through the same chunked, version-checked workspace reader
 * the ladder face uses. Keeping that read here makes it testable with a fake
 * byte source, and keeps the transport out of the React component.
 *
 * @module dsh-engineering-ecad/client/artifacts
 */

import type { EcadSheetModel, EcadTitleBlock } from '../engine/types.ts'

/** Bytes per read request. */
export const PREVIEW_CHUNK = 1024 * 1024
/** Largest artifact this pane will read. */
export const PREVIEW_LIMIT = 64 * 1024 * 1024

/** One layout summary returned by `ecad/open`. */
export interface EcadLayoutSummary {
  readonly id: string
  readonly name: string
  readonly kind: 'model' | 'paper'
  readonly entities: number
}

/** How a drawing was converted before the sheet model was built. */
export interface EcadConversion {
  /**
   * The converter the host used, when it names one (for example `acadrust`).
   * The pane only prints it; it never decides fidelity from it.
   */
  readonly converter?: string
  /** The converter's own version. */
  readonly version?: string
  /** Warnings the converter reported; the pane shows the count and their text. */
  readonly warnings?: readonly string[] | number
  /** Any other field the service adds; the pane ignores what it does not name. */
  readonly [key: string]: unknown
}

/** The successful `ecad/open` envelope. */
export interface EcadOpenEnvelope {
  readonly path: string
  /** Source format; absent means DXF, the format the first service release read. */
  readonly format?: string
  /** Conversion provenance, present when the source was not read directly. */
  readonly converted?: EcadConversion
  readonly sourceBytes?: number
  readonly version: string
  readonly dxfVersion: string
  readonly units: number
  readonly layouts: readonly EcadLayoutSummary[]
  readonly entities: number
  readonly unsupported: number
  readonly approximate: number
  readonly truncated: boolean
  readonly titleBlock?: EcadTitleBlock
  /** Workspace-relative path of the cached render model. */
  readonly modelPath: string
  /** False when the ECAD row has writes switched off. */
  readonly writes: boolean
}

/** A failure envelope the panel can show as code/message/fix. */
export interface EcadFailure {
  readonly code: string
  readonly message: string
  readonly fix: string
}

/** What one drawing open produced. */
export type EcadOpenResult =
  | { readonly ok: true; readonly summary: EcadOpenEnvelope; readonly model: EcadSheetModel }
  | { readonly ok: false; readonly error: EcadFailure }

/** Opens one drawing; implemented by the registration, injected into the body. */
export type EcadOpen = (address: string, signal: AbortSignal) => Promise<EcadOpenResult>

/** One page of a chunked workspace read. */
export interface EcadBytePage {
  readonly data: Uint8Array
  readonly eof: boolean
  readonly version?: string
  readonly bytes?: number
}

/** The workspace reader the pane reads the artifact through. */
export type EcadReadBytes = (
  sessionId: string,
  path: string,
  options: { readonly range: { readonly offset: number; readonly length: number } },
  signal: AbortSignal,
) => Promise<{ readonly ok: true; readonly value: EcadBytePage } | { readonly ok: false; readonly error: { readonly message: string } }>

/** The parsed render-model artifact. */
export interface EcadPreviewArtifact {
  readonly model: EcadSheetModel
  readonly version?: string
  readonly generatedAt?: string
}

/**
 * The source format a sheet was read from.
 *
 * The first service release read DXF only and sent no `format`, so an absent
 * field means DXF; anything the service names is lower-cased for display and
 * compared without a second table in the face.
 * @param summary - the open envelope, when one exists.
 * @returns the format name, `dxf` when the envelope carries none.
 */
export function sourceFormatOf(summary: { readonly format?: string } | undefined): string {
  const format = summary?.format
  return typeof format === 'string' && format !== '' ? format.toLowerCase() : 'dxf'
}

/** The conversion provenance the pane prints, normalised from the wire. */
export interface EcadConversionSummary {
  readonly converter?: string
  readonly version?: string
  /** How many warnings the converter reported. */
  readonly warnings: number
  /** The warning texts, when the service carries them. */
  readonly warningTexts: readonly string[]
}

/**
 * Read the conversion provenance of one open result.
 *
 * A DWG source is converted before the sheet model exists, and the service
 * states which converter did it and what it warned about. The pane shows that
 * provenance instead of claiming the conversion is faithful.
 * @param converted - the envelope's `converted` block, when present.
 * @returns the normalised provenance; `warnings: 0` when nothing was reported.
 */
export function conversionOf(converted: EcadConversion | undefined): EcadConversionSummary {
  const warnings = converted?.warnings
  const warningTexts = Array.isArray(warnings) ? warnings.filter((warning): warning is string => typeof warning === 'string') : []
  const count = typeof warnings === 'number' && Number.isFinite(warnings) ? Math.max(0, Math.trunc(warnings)) : warningTexts.length
  return {
    ...(typeof converted?.converter === 'string' && converted.converter !== '' ? { converter: converted.converter } : {}),
    ...(typeof converted?.version === 'string' && converted.version !== '' ? { version: converted.version } : {}),
    warnings: count,
    warningTexts,
  }
}

/**
 * A failure that carries the wire shape the panel displays.
 */
export class EcadArtifactError extends Error {
  /** Machine-readable failure class. */
  readonly code: string
  /** What the reader should do. */
  readonly fix: string

  /**
   * @param code - machine-readable failure class.
   * @param message - what went wrong.
   * @param fix - what the reader should do instead.
   */
  constructor(code: string, message: string, fix: string) {
    super(message)
    this.name = 'EcadArtifactError'
    this.code = code
    this.fix = fix
  }
}

/**
 * Read one text file through the chunked workspace API.
 *
 * The read is refused rather than truncated when the source changes mid-read or
 * grows past {@link PREVIEW_LIMIT}, matching how the ladder face reads an L5X.
 *
 * @param read - the workspace file reader.
 * @param sessionId - session that owns the workspace.
 * @param path - workspace-relative path.
 * @param signal - cancellation.
 * @param chunk - bytes per request.
 * @returns the decoded text and the version the read settled on.
 */
export async function readWorkspaceText(
  read: EcadReadBytes,
  sessionId: string,
  path: string,
  signal: AbortSignal,
  chunk = PREVIEW_CHUNK,
): Promise<{ readonly text: string; readonly version?: string }> {
  const chunks: Uint8Array[] = []
  let offset = 0
  let version: string | undefined
  let total = 0
  while (true) {
    signal.throwIfAborted()
    const result = await read(sessionId, path, { range: { offset, length: chunk } }, signal)
    if (!result.ok) throw new EcadArtifactError('ECAD_PREVIEW_READ', result.error.message, 'Reload the drawing; the preview artifact could not be read.')
    const page = result.value
    if (version !== undefined && page.version !== undefined && version !== page.version) {
      throw new EcadArtifactError('ECAD_PREVIEW_CHANGED', `"${path}" changed while the preview was being read`, 'Reload the drawing so the preview is rebuilt from the current source.')
    }
    version = page.version
    total += page.data.length
    if (total > PREVIEW_LIMIT || (page.bytes !== undefined && page.bytes > PREVIEW_LIMIT)) {
      throw new EcadArtifactError('ECAD_PREVIEW_TOO_LARGE', `"${path}" is larger than ${PREVIEW_LIMIT} bytes`, 'Open the drawing in the drawing tools instead; the pane will not read a preview this large.')
    }
    chunks.push(page.data)
    offset += page.data.length
    if (page.eof) break
    if (page.data.length === 0) {
      throw new EcadArtifactError('ECAD_PREVIEW_READ', `"${path}" returned an empty page before its end`, 'Reload the drawing; the preview artifact is incomplete.')
    }
  }
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = ''
  for (const part of chunks) text += decoder.decode(part, { stream: true })
  text += decoder.decode()
  return { text, version }
}

/**
 * Unwrap the Remote carrier's successful-result wrapper.
 *
 * A `ctx.remote.ecad.*` call resolves to `{ ok: true, value }` on success, where
 * `value` is the service's own envelope; a failed call resolves to
 * `{ ok: false, error }`. The pane works with the service envelope, so it must
 * unwrap the success wrapper — reading `modelPath` off the wrapper instead made
 * every live preview report an unreadable artifact. Failures and plain values
 * pass through unchanged, so a test double that returns the envelope directly
 * keeps working.
 * @param result - what the Remote method resolved to.
 * @returns the service envelope, or the input when it is not a success wrapper.
 */
export function unwrapRemoteValue(result: unknown): unknown {
  if (result !== null && typeof result === 'object') {
    const wrapper = result as { readonly ok?: unknown; readonly value?: unknown }
    if (wrapper.ok === true && 'value' in wrapper) return wrapper.value
  }
  return result
}

/**
 * Parse the cached render-model artifact.
 * @param text - the artifact's JSON text.
 * @returns the model and its provenance.
 */
export function parsePreviewArtifact(text: string): EcadPreviewArtifact {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new EcadArtifactError('ECAD_PREVIEW_INVALID', 'the cached preview is not valid JSON', 'Reload the drawing so the host writes the preview again.')
  }
  const payload = parsed !== null && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined
  const model = payload?.model
  if (payload?.schema !== 1 || model === null || typeof model !== 'object') {
    throw new EcadArtifactError('ECAD_PREVIEW_INVALID', 'the cached preview is not a schema-1 sheet model', 'Reload the drawing so the host writes the preview again.')
  }
  const sheet = model as EcadSheetModel
  if (typeof sheet.path !== 'string' || !Array.isArray(sheet.layouts) || sheet.layouts.length === 0 || sheet.stats === undefined || !Array.isArray(sheet.layers)) {
    throw new EcadArtifactError('ECAD_PREVIEW_INVALID', 'the cached preview is missing the model fields the pane draws', 'Reload the drawing so the host writes the preview again.')
  }
  return {
    model: sheet,
    ...(typeof payload.version === 'string' ? { version: payload.version } : {}),
    ...(typeof payload.generatedAt === 'string' ? { generatedAt: payload.generatedAt } : {}),
  }
}

/**
 * Read and parse the cached render model.
 * @param read - the workspace file reader.
 * @param sessionId - session that owns the workspace.
 * @param path - workspace-relative artifact path.
 * @param signal - cancellation.
 * @returns the parsed artifact.
 */
export async function readPreviewArtifact(
  read: EcadReadBytes,
  sessionId: string,
  path: string,
  signal: AbortSignal,
): Promise<EcadPreviewArtifact> {
  const { text } = await readWorkspaceText(read, sessionId, path, signal)
  return parsePreviewArtifact(text)
}
