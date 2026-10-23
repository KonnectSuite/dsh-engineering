/**
 * The error a reader raises when the text it was given is not an L5X export.
 *
 * A caller distinguishes "this is not a project" from "this is a project whose
 * answer is empty": the reference parser raises for the former and returns an
 * empty result for the latter. The message names the offending fact — the root
 * element it found, or the element it could not — so a caller can report it
 * without re-reading the file.
 */
export class L5xParseError extends Error {
  /**
   * @param message - What was wrong with the text, in the terms the export itself uses.
   */
  constructor(message: string) {
    super(message)
    this.name = 'L5xParseError'
  }
}
