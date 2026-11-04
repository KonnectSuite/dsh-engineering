/**
 * The one place a drawing is read or written.
 *
 * Every tool and the open-sheet cache go through this module, so the format
 * rules live here instead of being repeated as `.dxf` checks across the tools:
 * a path's extension decides the format, the format decides what the engine
 * parses, and a write publishes bytes back in the drawing's own format.
 *
 * **DWG is converted here, not parsed.** A DWG read is converted to DXF bytes by
 * the embedded converter (`./dwg`, acadrust 0.6.8 as WASM) and then parsed by the
 * same MIT engine; a DWG write converts the engine's DXF bytes back to DWG and
 * only then publishes them, still create-only. The conversion detail (converter,
 * source version, warnings) travels with the read/write so a result can quote it.
 *
 * @module dsh-engineering-ecad/drawings
 */

import { EngineeringError } from './core.ts'
import type { FsService, FsTarget, FsWriteIntent, SandboxPolicy } from './core.ts'
import { converterInfo, dwgToDxf, dxfToDwg, isDwg, isDwgError } from './dwg/index.ts'

/** The drawing formats this build can name. */
export type DrawingFormat = 'dxf' | 'dwg'

/**
 * Formats that are read and written end to end.
 *
 * This is the single list a discovery filter or an output-extension check reads.
 */
export const SUPPORTED_EXTENSIONS: readonly string[] = ['.dxf', '.dwg']

/**
 * Formats the tools recognise by name.
 *
 * Kept separate from {@link SUPPORTED_EXTENSIONS} so a build can report a format
 * it recognises but cannot convert instead of silently ignoring the file.
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
      'ECAD_DWG_UNAVAILABLE',
      `${path} is a DWG drawing and the embedded converter is not available in this build.`,
      'Reinstall the engineering bundle so the ECAD converter asset ships with it, or export the drawing as DXF and read that. Nothing was read or written.'
    )
  }
  return new EngineeringError(
    'ECAD_UNSUPPORTED_FORMAT',
    `${path} is not a drawing format this build reads.`,
    `Supported formats: ${SUPPORTED_EXTENSIONS.join(', ')}. Export the drawing as DXF or DWG and retry.`
  )
}

/**
 * Turn a converter failure into the tool envelope's typed error.
 * @param path - drawing the conversion was for.
 * @param error - anything the converter threw.
 */
function conversionFailure(path: string, error: unknown): EngineeringError {
  if (isDwgError(error)) {
    const code = `ECAD_${error.code}`
    return new EngineeringError(code, error.message, error.fix)
  }
  return new EngineeringError(
    'ECAD_DWG_CONVERT_FAILED',
    `${path} could not be converted: ${error instanceof Error ? error.message : String(error)}`,
    'Open the drawing in a CAD application to check it, then retry; report the file if it opens there. Nothing was written.'
  )
}

/** @returns the converter identity a result should quote. */
async function converterLabel(): Promise<string> {
  try {
    const info = await converterInfo()
    return info.kind === 'unavailable' ? 'acadrust' : `acadrust/${info.version}`
  } catch {
    return 'acadrust'
  }
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
 * A DXF file is returned unchanged. A DWG file is converted to DXF bytes by the
 * embedded converter first; {@link ReadDrawing.conversion} carries the converter
 * identity, the source version and any reader warnings.
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
  if (!isDwg(bytes)) {
    throw new EngineeringError(
      'ECAD_DWG_INVALID',
      `${displayPath} is named .dwg but does not start with a DWG version marker.`,
      'Pass the DWG file itself, or export the drawing from the CAD application again. Nothing was read or written.'
    )
  }
  try {
    const converted = await dwgToDxf(bytes, { maxBytes: options.maxFileBytes })
    return {
      displayPath,
      bytes,
      dxfBytes: converted.dxf,
      format: 'dwg',
      sourceBytes: bytes.byteLength,
      conversion: {
        converter: await converterLabel(),
        sourceVersion: converted.version,
        warnings: converted.warnings
      }
    }
  } catch (error) {
    throw conversionFailure(displayPath, error)
  }
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
 * overwrites a customer drawing. A DWG destination converts the engine's DXF
 * bytes to DWG first and publishes those bytes through the same create-only
 * guard; the conversion note quotes the version and warnings.
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
  let converted
  try {
    converted = await dxfToDwg(output.bytes, output.targetVersion === undefined ? {} : { targetVersion: output.targetVersion })
  } catch (error) {
    throw conversionFailure(target.displayPath, error)
  }
  const expected: FsWriteIntent = { kind: 'createIfAbsent' }
  await fs.writeBytes(target, converted.dwg, expected, options.signal, options.sandboxPolicy).catch((error: unknown) => {
    throw refusedWrite(target.displayPath, error)
  })
  return {
    displayPath: target.displayPath,
    bytes: converted.dwg,
    format: 'dwg',
    conversion: {
      converter: await converterLabel(),
      sourceVersion: converted.version,
      warnings: converted.warnings
    }
  }
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
