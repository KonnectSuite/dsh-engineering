/**
 * Opening a DXF file into the `@mlightcad/data-model` drawing database.
 *
 * This is the only module allowed to read bytes into a database: every other
 * engine entry point takes an {@link OpenedSheet}, so a caller cannot half-open a
 * drawing and no parser error is ever reported as a review finding.
 *
 * @module dsh-engineering-ecad/engine/parse
 */

import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import { AcDbDatabase } from '@mlightcad/data-model'
import type { AcDbDwgVersion } from '@mlightcad/data-model'
import { EcadError } from './errors.ts'

/** Default ceiling for one drawing: the owner's largest print is 6.4 MB. */
export const DEFAULT_MAX_FILE_BYTES = 64 * 1024 * 1024

/** A parsed drawing plus the facts a caller needs before building a model. */
export interface OpenedSheet {
  /** Path as the caller supplied it (workspace-relative or absolute). */
  readonly path: string
  /** SHA-256 of the exact bytes that produced {@link db}. */
  readonly sha256: string
  /** DXF version name, for example `AC1032`. */
  readonly dxfVersion: string
  /** Drawing units from `$INSUNITS`; `0` means the file does not declare them. */
  readonly units: number
  /** The writable drawing database the model and the edit operations read. */
  readonly db: AcDbDatabase
}

/** Arguments of {@link openSheet}. */
export interface OpenSheetInput {
  /** Path as the caller names it; used for messages and for filename fallbacks. */
  readonly path: string
  /** Raw file bytes. */
  readonly bytes: Uint8Array
  /** Reject larger files before parsing. Defaults to {@link DEFAULT_MAX_FILE_BYTES}. */
  readonly maxFileBytes?: number
}

/** Binary DXF marker written by AutoCAD. */
const BINARY_DXF_MAGIC = 'AutoCAD Binary DXF'

/** The DXF section marker every ASCII drawing begins with. */
const SECTION_MARKER = /(?:^|\r?\n)\s*0\s*\r?\n\s*SECTION\b/

/**
 * SHA-256 of a byte sequence as lower-case hex.
 *
 * @param bytes - file bytes.
 */
export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * True when the bytes look like a DXF drawing (ASCII or binary).
 *
 * This is a cheap magic check, not validation: it refuses an image, a ZIP or a
 * PDF before the parser spends a second on it, and it refuses a text file whose
 * first kilobyte carries no section marker.
 *
 * @param bytes - candidate file bytes.
 */
export function isDxfBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength === 0) return false
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.byteLength, 4096)))
  const probe = head.replace(/^\uFEFF/, '').replace(/^\0+/, '')
  if (probe.startsWith(BINARY_DXF_MAGIC)) return true
  if (SECTION_MARKER.test(probe)) return true
  // A commented or whitespace-prefixed header still carries a HEADER/ENTITIES
  // marker; accept only when a section marker exists somewhere in the head.
  return /(?:^|\r?\n)\s*0\s*\r?\n\s*(?:SECTION|EOF)\b/.test(probe) && /HEADER|ENTITIES|TABLES/.test(probe)
}

/**
 * A file name without its directory or extension, for filename-based fallbacks.
 *
 * @param path - caller-supplied path.
 */
export function fileStem(path: string): string {
  const name = basename(path.replace(/\\/g, '/'))
  return name.replace(/\.[^.]+$/, '')
}

/**
 * True when an ASCII DXF file ends with the `0 / EOF` terminator.
 *
 * A truncated copy still parses into a database — the parser stops where the
 * data stops — so this is the one cheap check that a drawing arrived whole. All
 * 34 sheets of the owner's set carry the terminator.
 *
 * @param bytes - candidate file bytes.
 */
export function hasDxfEof(bytes: Uint8Array): boolean {
  const tailLength = Math.min(bytes.byteLength, 4096)
  const tail = new TextDecoder('latin1').decode(bytes.subarray(bytes.byteLength - tailLength))
  return /(?:^|\r?\n)\s*0\s*\r?\n\s*EOF\s*$/.test(tail)
}

/**
 * Open one DXF drawing.
 *
 * Rejects with an {@link EcadError} when the bytes are not DXF (`NON_DXF`), are
 * over the limit (`TOO_LARGE`) or the parser refuses them (`PARSE_FAILED`).
 *
 * @param input - path, bytes and optional size limit.
 * @returns the opened sheet, its hash, version and units.
 */
export async function openSheet(input: OpenSheetInput): Promise<OpenedSheet> {
  const path = input.path
  if (typeof path !== 'string' || path.length === 0) {
    throw new EcadError('INVALID_INPUT', 'openSheet needs a non-empty path', 'Pass the drawing path you were given, for example "Prints/DXF/A-101.dxf".')
  }
  const bytes = input.bytes
  if (!(bytes instanceof Uint8Array)) {
    throw new EcadError('INVALID_INPUT', 'openSheet needs the file bytes as a Uint8Array', 'Read the file with the workspace file service and pass the bytes unchanged.')
  }
  const limit = input.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new EcadError('INVALID_INPUT', `maxFileBytes must be a positive number, got ${String(input.maxFileBytes)}`, 'Omit maxFileBytes to use the default ceiling.')
  }
  if (bytes.byteLength === 0) {
    throw new EcadError('NON_DXF', `${path} is empty`, 'Check that the export finished and that you opened the .dxf file, not a placeholder.')
  }
  if (bytes.byteLength > limit) {
    throw new EcadError(
      'TOO_LARGE',
      `${path} is ${bytes.byteLength} bytes, over the ${limit}-byte limit`,
      'Raise maxFileBytes deliberately for this drawing, or split the set and review the sheets you need.'
    )
  }
  if (!isDxfBytes(bytes)) {
    throw new EcadError(
      'NON_DXF',
      `${path} does not look like a DXF drawing (no DXF section marker in the first 4 KB)`,
      'Export the drawing as ASCII DXF (R2018 or later) from the CAD tool; DWG, PDF and image files are not accepted by this engine.'
    )
  }
  const binary = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.byteLength, 32))).startsWith(BINARY_DXF_MAGIC)
  if (!binary && !hasDxfEof(bytes)) {
    throw new EcadError(
      'PARSE_FAILED',
      `${path} has no DXF EOF terminator, so the file is truncated or still being written`,
      'Copy or export the drawing again and re-open it; a partial DXF parses into a partial drawing, which is worse than a refusal.'
    )
  }

  const db = new AcDbDatabase()
  try {
    await db.read(bytes, { minimumChunkSize: 1000, fileName: basename(path.replace(/\\/g, '/')) }, 'dxf')
  } catch (error) {
    throw new EcadError(
      'PARSE_FAILED',
      `${path} could not be parsed as DXF: ${messageOf(error)}`,
      'Re-export the drawing as ASCII DXF and retry; if it still fails, report the sheet so the parser gap can be measured.'
    )
  }

  const version = db.version as AcDbDwgVersion | undefined
  const dxfVersion = version && typeof version.name === 'string' ? version.name : ''
  if (dxfVersion.length === 0) {
    throw new EcadError(
      'PARSE_FAILED',
      `${path} parsed without a DXF version`,
      'Re-export the drawing as ASCII DXF; a truncated header usually means an interrupted copy.'
    )
  }
  const modelSpace = db.tables?.blockTable?.modelSpace
  if (!modelSpace) {
    throw new EcadError(
      'PARSE_FAILED',
      `${path} parsed without a model space`,
      'Re-export the drawing as ASCII DXF; this file has no BLOCK_RECORD table entry for model space.'
    )
  }

  return {
    path,
    sha256: sha256(bytes),
    dxfVersion,
    units: numberOr(db.insunits, 0),
    db
  }
}

/**
 * Message text of an unknown thrown value.
 *
 * @param error - anything caught.
 */
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * A finite number or a fallback.
 *
 * @param value - candidate number.
 * @param fallback - value to use when the candidate is not finite.
 */
export function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
