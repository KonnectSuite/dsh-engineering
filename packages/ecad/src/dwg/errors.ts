/**
 * Typed failures for the DWG converter.
 *
 * The converter sits below the ECAD engine, so it does not reuse
 * `EcadErrorCode`: a caller that mixes DWG and DXF work can tell the two apart
 * by `name` and by the code prefix.
 *
 * @module dsh-engineering-ecad/dwg/errors
 */

/** Machine-readable failure classes the converter raises. */
export type DwgErrorCode =
  /** The bytes are not a DWG drawing (wrong magic) or the version is not `AC10xx`. */
  | 'DWG_UNSUPPORTED'
  /** The file or the converted output is larger than the caller's limit. */
  | 'DWG_TOO_LARGE'
  /** The bytes look like a drawing but the reader refused them. */
  | 'DWG_READ_FAILED'
  /** The document was read but the writer could not produce bytes. */
  | 'DWG_WRITE_FAILED'
  /** No converter backend is installed (no wasm asset and no sidecar binary). */
  | 'DWG_CONVERTER_MISSING'

/** Error thrown by every converter entry point that can reject. */
export class DwgError extends Error {
  /** Machine-readable failure class. */
  readonly code: DwgErrorCode
  /** One sentence telling the caller what to do about it. */
  readonly fix: string

  /**
   * @param code - failure class.
   * @param message - what went wrong, naming the observation.
   * @param fix - what to do instead.
   */
  constructor(code: DwgErrorCode, message: string, fix: string) {
    super(message)
    this.name = 'DwgError'
    this.code = code
    this.fix = fix
  }

  /** JSON shape for a tool result or a log line. */
  toJSON(): { code: DwgErrorCode; message: string; fix: string } {
    return { code: this.code, message: this.message, fix: this.fix }
  }
}

/**
 * True when a value is a {@link DwgError}.
 *
 * @param value - anything caught.
 */
export function isDwgError(value: unknown): value is DwgError {
  return value instanceof DwgError
}

/** How a converter status code is reported to a caller. */
const STATUS_CODES: Record<number, { code: DwgErrorCode; fix: string }> = {
  1: {
    code: 'DWG_UNSUPPORTED',
    fix: 'Pass the drawing bytes unchanged and a target version the converter lists.'
  },
  2: {
    code: 'DWG_READ_FAILED',
    fix: 'Open the drawing in a CAD application and re-export it; report the file if it opens there.'
  },
  3: {
    code: 'DWG_WRITE_FAILED',
    fix: 'Convert the drawing again with the source version, or fix the entity the writer names.'
  },
  4: {
    code: 'DWG_TOO_LARGE',
    fix: 'Raise the maxBytes option for this call or split the drawing before converting it.'
  },
  5: {
    code: 'DWG_UNSUPPORTED',
    fix: 'Convert to or from a version the converter lists (AC1009 through AC1032).'
  }
}

/**
 * Turn a converter status code into a {@link DwgError}.
 *
 * @param status - non-zero status returned by the backend.
 * @param detail - backend message, or empty.
 * @param fallbackFix - fix sentence when the status has no mapping.
 */
export function converterStatusError(status: number, detail: string, fallbackFix: string): DwgError {
  const mapped = STATUS_CODES[status]
  const code: DwgErrorCode = mapped?.code ?? 'DWG_READ_FAILED'
  const reason = detail.trim().length > 0 ? detail.trim() : `converter status ${status}`
  return new DwgError(code, reason, mapped?.fix ?? fallbackFix)
}
