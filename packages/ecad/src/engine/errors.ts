/**
 * Typed engine failure.
 *
 * Every rejection from the ECAD engine carries a code a caller can branch on and
 * a `fix` sentence a person can act on, so a failed tool call never leaves the
 * caller guessing whether the file was wrong, too big, or unsupported.
 *
 * @module dsh-engineering-ecad/engine/errors
 */

/** Machine-readable failure classes the engine raises. */
export type EcadErrorCode =
  /** The bytes are not a DXF drawing (wrong magic, binary garbage, or a truncated stream). */
  | 'NON_DXF'
  /** The file is larger than the caller's limit; nothing was parsed. */
  | 'TOO_LARGE'
  /** The bytes look like DXF but the parser refused them. */
  | 'PARSE_FAILED'
  /** A caller-supplied argument is missing or malformed. */
  | 'INVALID_INPUT'
  /** A staged draft does not apply to the opened drawing. */
  | 'INVALID_DRAFT'
  /** The DXF writer produced bytes that could not be read back. */
  | 'WRITE_FAILED'
  /** A layout, block or layer the operation needs does not exist. */
  | 'MISSING_TARGET'

/** Error thrown by every engine entry point that can reject. */
export class EcadError extends Error {
  /** Machine-readable failure class. */
  readonly code: EcadErrorCode
  /** One sentence telling the caller what to do about it. */
  readonly fix: string

  /**
   * @param code - failure class.
   * @param message - what went wrong, naming the file and the observation.
   * @param fix - what to do instead.
   */
  constructor(code: EcadErrorCode, message: string, fix: string) {
    super(message)
    this.name = 'EcadError'
    this.code = code
    this.fix = fix
  }

  /** JSON shape for a tool result or a log line. */
  toJSON(): { code: EcadErrorCode; message: string; fix: string } {
    return { code: this.code, message: this.message, fix: this.fix }
  }
}

/**
 * True when a value is an {@link EcadError}.
 *
 * @param value - anything caught.
 */
export function isEcadError(value: unknown): value is EcadError {
  return value instanceof EcadError
}
