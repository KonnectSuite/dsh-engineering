/**
 * Failures the model can repair from.
 *
 * Every expected failure carries the next call, because a refused tool call is
 * a turn the reader has to spend. An unexpected failure is a plugin defect and
 * says so instead of pretending to be a project problem.
 *
 * @module dsh-engineering-l5x/core/errors
 */

/** One expected failure, with everything the reader needs to recover. */
export class L5xError extends Error {
  /**
   * @param code - Stable identifier for tests and logs.
   * @param message - What failed, in the reader's terms.
   * @param fix - The exact next call or check.
   * @param candidates - Valid names when the request named something absent or ambiguous.
   */
  constructor(
    readonly code: string,
    message: string,
    readonly fix: string,
    readonly candidates: readonly string[] = [],
  ) {
    super(message)
    this.name = 'L5xError'
  }
}

/** The model-facing failure document. */
export interface ErrorEnvelope {
  readonly error: {
    readonly code: string
    readonly message: string
    readonly fix: string
    readonly candidates: readonly string[]
  }
}

/**
 * Convert a thrown value into the failure document.
 *
 * @param error - Whatever the tool body threw.
 * @returns The failure document; never throws.
 */
export function errorEnvelope(error: unknown): ErrorEnvelope {
  if (error instanceof L5xError) {
    return { error: { code: error.code, message: error.message, fix: error.fix, candidates: error.candidates } }
  }
  const message = error instanceof Error ? error.message : String(error)
  return {
    error: {
      code: 'INTERNAL',
      message,
      fix: 'This is a plugin defect, not a project condition. Report it with the arguments used, then reopen the project.',
      candidates: [],
    },
  }
}
