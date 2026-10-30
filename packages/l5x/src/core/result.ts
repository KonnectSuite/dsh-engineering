/**
 * The model-facing success document.
 *
 * Every read answers with a summary first and concrete next calls last. The
 * summary lets a small model decide whether it got what it asked for without
 * reading the whole payload; `next` is the recovery path when its plan is thin.
 *
 * @module dsh-engineering-l5x/core/result
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
  const document: Success<T> = coverage === undefined ? { summary, data, next } : { summary, data, coverage, next }
  return lossless(document)
}

/**
 * Drop the one value the host will not carry.
 *
 * Tool answers cross the host as lossless JSON, which refuses a document that
 * holds `undefined` anywhere — the whole call fails, not just the field. An
 * optional member that has nothing to say must therefore be absent rather than
 * present and empty. Payload builders are written by hand and will keep
 * producing `pattern: undefined` and `data_type: undefined`, so the guarantee
 * is applied once, here, instead of at every return.
 *
 * @param value - The document about to be returned.
 * @returns The same document, with members that hold `undefined` removed and array holes replaced by `null`.
 */
function lossless<T>(value: T): T {
  if (Array.isArray(value)) return value.map(entry => lossless(entry ?? null)) as T
  if (value !== null && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value) as unknown
    if (prototype === Object.prototype || prototype === null) {
      const copy: Record<string, unknown> = {}
      for (const [key, entry] of Object.entries(value)) if (entry !== undefined) copy[key] = lossless(entry)
      return copy as T
    }
  }
  return value
}
