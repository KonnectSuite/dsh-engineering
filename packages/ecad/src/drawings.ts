/**
 * The one place a drawing is read or written.
 *
 * Every tool and the open-sheet cache go through this module, so the format
 * rules live here instead of being repeated as `.dxf` checks across the tools:
 * a path's extension decides the format, the format decides what the engine
 * parses, and a write publishes bytes back in the drawing's own format.
 *
 * **DWG is landing in this batch.** This build recognises `.dwg` paths and
 * refuses them with the typed `ECAD_DWG_UNSUPPORTED` error; when the embedded
 * byte-in/byte-out converter is imported, only the marked branches in
 * {@link readDrawing} and {@link writeDrawing} change, and `SUPPORTED_EXTENSIONS`
 * gains its second entry. Nothing outside this module needs to move for that.
 *
 * @module dsh-engineering-ecad/drawings
 */

import { EngineeringError } from './core.ts'
import type { FsService, FsTarget, FsWriteIntent, SandboxPolicy } from './core.ts'

/** The drawing formats this build can name. */
export type DrawingFormat = 'dxf' | 'dwg'

/**
 * Formats that are read and written end to end.
 *
 * The DWG converter adds `'.dwg'` here when it lands; this is the single list a
 * discovery filter or an output-extension check reads.
 */
export const SUPPORTED_EXTENSIONS: readonly string[] = ['.dxf']

/**
 * Formats the tools recognise by name.
 *
 * A `.dwg` file is recognised so `ecad_scan` reports it as skipped with the
 * reason DWG is not convertible yet, instead of silently ignoring it.
 */
export const RECOGNISED_EXTENSIONS: readonly string[] = ['.dxf', '.dwg']

/** What one conversion did, when a format other than DXF had to be converted. */
export interface ConversionInfo {
  /** Converter identity, for example `acadrust/<version>`. */
  readonly converter: string
  /** Source format version the converter reported, when it reports one. */
  readonly sourceVersion?: string
  /** Non-fatal conversion observations worth quoting. */
  readonly warnings: readonly string[]
}

/** One drawing as read from the filesystem. */
export interface ReadDrawing {
  /** Resolved display path of the source file. */
  readonly displayPath: string
  /** Source bytes exactly as they were read (the identity a draft stages against). */
  readonly bytes: Uint8Array
  /** DXF bytes the engine parses (identical to {@link bytes} for a DXF file). */
  readonly dxfBytes: Uint8Array
  /** Format read from the path extension. */
  readonly format: DrawingFormat
  /** Size of {@link bytes}. */
  readonly sourceBytes: number
  /** Conversion detail for a DWG source, absent for DXF. */
  readonly conversion?: ConversionInfo
}

/** Lower-case extension of one path, including the dot, or `''`. */
export function extensionOf(path: string): string {
  const normalised = path.replace(/\\/gu, '/')
  const base = normalised.slice(normalised.lastIndexOf('/') + 1)
  const index = base.lastIndexOf('.')
  return index < 0 ? '' : base.slice(index).toLowerCase()
}

/**
 * The drawing format a path names, when the extension is one this build knows.
 *
 * @param path - drawing path as the caller supplied it.
 */
export function formatOfPath(path: string): DrawingFormat | undefined {
  const extension = extensionOf(path)
  if (extension === '.dxf') return 'dxf'
  if (extension === '.dwg') return 'dwg'
  return undefined
}

/**
 * True when this path is a drawing the tools can read and write end to end.
 *
 * @param path - drawing path.
 */
export function isSupportedDrawingPath(path: string): boolean {
  return SUPPORTED_EXTENSIONS.includes(extensionOf(path))
}

/**
 * True when this path names a drawing format at all, even one that is refused.
 *
 * @param path - drawing path.
 */
export function isRecognisedDrawingPath(path: string): boolean {
  return RECOGNISED_EXTENSIONS.includes(extensionOf(path))
}

/**
 * The typed refusal for a drawing format this build cannot convert.
 *
 * @param path - the file that was refused.
 * @param format - the format read from its extension.
 */
export function unsupportedDrawingFormat(path: string, format: DrawingFormat): EngineeringError {
  if (format === 'dwg') {
    return new EngineeringError(
      'ECAD_DWG_UNSUPPORTED',
      `${path} is a DWG drawing and the DWG converter is not part of this build yet.`,
      'Export the drawing as DXF from the CAD application and read that, or use a build whose ECAD row includes the DWG converter. Nothing was read or written.'
    )
  }
  return new EngineeringError(
    'ECAD_UNSUPPORTED_FORMAT',
    `${path} is not a drawing format this build reads.`,
    `Supported formats: ${SUPPORTED_EXTENSIONS.join(', ') || 'none yet'}. Export the drawing as DXF and retry.`
  )
}

/** Options of {@link readDrawing}. */
export interface ReadDrawingOptions {
  /** Largest source file to read. */
  readonly maxFileBytes: number
  /** Cancellation for this read and any conversion. */
  readonly signal?: AbortSignal
}

/**
 * Read one drawing and return the bytes the engine parses.
 *
 * A DXF file is returned unchanged. A DWG file is refused with
 * `ECAD_DWG_UNSUPPORTED` in this build; the converter branch is the only place
 * that changes when it lands.
 *
 * @param fs - filesystem provider.
 * @param target - resolved file target.
 * @param displayPath - path used in messages and for the extension rule.
 * @param options - byte cap and cancellation.
 * @returns the source bytes, the DXF bytes to parse, and the format.
 */
export async function readDrawing(fs: FsService, target: FsTarget, displayPath: string, options: ReadDrawingOptions): Promise<ReadDrawing> {
  const format = formatOfPath(displayPath)
  if (format === undefined) throw unsupportedDrawingFormat(displayPath, 'dxf')
  if (!SUPPORTED_EXTENSIONS.includes(extensionOf(displayPath))) throw unsupportedDrawingFormat(displayPath, format)
  const bytes = await fs.readBytes(target, options.signal, options.maxFileBytes + 1)
  if (bytes.byteLength > options.maxFileBytes) {
    throw new EngineeringError(
      'ECAD_TOO_LARGE',
      `${displayPath} is larger than the ${options.maxFileBytes}-byte limit.`,
      'Raise maxFileBytes for the engineering-ecad row, or split the drawing before reading it.'
    )
  }
  if (format === 'dxf') return { displayPath, bytes, dxfBytes: bytes, format: 'dxf', sourceBytes: bytes.byteLength }
  // DWG lands here: `const converted = await dwgToDxf({ bytes, fileName: displayPath, signal })`
  // then return { bytes, dxfBytes: converted.dxfBytes, format: 'dwg', sourceBytes: bytes.byteLength,
  // conversion: { converter, sourceVersion: converted.version, warnings: converted.warnings ?? [] } }.
  throw unsupportedDrawingFormat(displayPath, 'dwg')
}

/** The bytes and format one write publishes. */
export interface DrawingOutput {
  /** Bytes to publish. A DXF output is DXF bytes; a DWG output is DXF bytes to convert. */
  readonly bytes: Uint8Array
  /** Format the destination should have. */
  readonly format: DrawingFormat
  /** Target DXF/DWG version, when the caller knows the source version. */
  readonly targetVersion?: string
}

/** Options of {@link writeDrawing}. */
export interface WriteDrawingOptions {
  readonly signal?: AbortSignal
  /** Per-call sandbox policy for the provider. */
  readonly sandboxPolicy?: SandboxPolicy
}

/** One drawing as published. */
export interface WrittenDrawing {
  /** Resolved display path of the written file. */
  readonly displayPath: string
  /** Bytes actually published in the destination format. */
  readonly bytes: Uint8Array
  /** Published format. */
  readonly format: DrawingFormat
  /** Conversion detail when the destination format is not the input format. */
  readonly conversion?: ConversionInfo
}

/**
 * Publish one drawing to a target, in the format its path names.
 *
 * The destination is guarded with `createIfAbsent`: this function never
 * overwrites a customer drawing. A DWG destination is refused with
 * `ECAD_DWG_UNSUPPORTED` in this build; the converter branch is the only place
 * that changes when it lands.
 *
 * @param fs - filesystem provider.
 * @param target - resolved destination target.
 * @param output - bytes, destination format and target version.
 * @param options - cancellation and sandbox policy.
 * @returns what was actually published.
 */
export async function writeDrawing(fs: FsService, target: FsTarget, output: DrawingOutput, options: WriteDrawingOptions = {}): Promise<WrittenDrawing> {
  if (!SUPPORTED_EXTENSIONS.includes(extensionOf(target.displayPath))) throw unsupportedDrawingFormat(target.displayPath, output.format)
  if (fs.writeBytes === undefined) {
    throw new EngineeringError(
      'ECAD_NO_FS_WRITE',
      'The filesystem provider in this profile cannot write bytes, so a drawing cannot be published.',
      'Update AryaCode to a build whose filesystem provider writes bytes, then retry; nothing was written.'
    )
  }
  if (output.format === 'dxf') {
    const expected: FsWriteIntent = { kind: 'createIfAbsent' }
    await fs.writeBytes(target, output.bytes, expected, options.signal, options.sandboxPolicy).catch((error: unknown) => {
      throw refusedWrite(target.displayPath, error)
    })
    return { displayPath: target.displayPath, bytes: output.bytes, format: 'dxf' }
  }
  // DWG destination lands here: `const converted = await dxfToDwg({ bytes: output.bytes, targetVersion: output.targetVersion })`,
  // then writeBytes(target, converted.dwgBytes, { kind: 'createIfAbsent' }, ...) and return the conversion note.
  throw unsupportedDrawingFormat(target.displayPath, output.format)
}

/**
 * Turn a provider write failure into the typed refusal that says nothing was written.
 *
 * @param displayPath - destination that was refused.
 * @param error - provider failure.
 */
function refusedWrite(displayPath: string, error: unknown): EngineeringError {
  return new EngineeringError(
    'ECAD_WRITE_REFUSED',
    `The filesystem provider refused to write ${displayPath}: ${error instanceof Error ? error.message : String(error)}`,
    'Choose a path inside the writable workspace or widen this session’s file access, then retry. Nothing was written.'
  )
}

/** The format the backup and documentation tools name in their output. */
export function formatLabel(format: DrawingFormat): string {
  return format === 'dwg' ? 'DWG' : 'DXF'
}
