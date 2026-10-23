/**
 * The model-facing success document.
 *
 * Every tool answers with a summary first and concrete next calls last, as in
 * the other engineering products.
 *
 * @module dsh-engineering-mwi/core/result
 */

/** One call the reader can make next, with the reason it is useful. */
export interface NextStep {
  /** Tool name registered by this plugin. */
  readonly tool: string
  /** Why this call answers the current question. */
  readonly why: string
  /** Arguments worth passing; omitted when the tool needs none. */
  readonly args?: Readonly<Record<string, unknown>>
}

/** How much of the requested question the answer actually covers. */
export interface Coverage {
  /** Whether the requested scope was answered in full. */
  readonly complete: boolean
  /** What this answer cannot establish, named rather than implied. */
  readonly unverified: readonly string[]
}

/** A successful tool answer. */
export interface Success<T> {
  /** One sentence the reader can act on. */
  readonly summary: string
  /** Tool-specific payload. */
  readonly data: T
  /** Present when the answer has limits worth stating. */
  readonly coverage?: Coverage
  /** Concrete next calls, most useful first. */
  readonly next: readonly NextStep[]
}

/**
 * Build a success document.
 *
 * @param summary - One sentence naming what was read.
 * @param data - Tool-specific payload.
 * @param next - Concrete next calls; may be empty when the answer is terminal.
 * @param coverage - Limits of the answer, when it has any.
 * @returns The document the tool returns.
 */
export function success<T>(
  summary: string,
  data: T,
  next: readonly NextStep[] = [],
  coverage?: Coverage,
): Success<T> {
  return coverage === undefined ? { summary, data, next } : { summary, data, coverage, next }
}
