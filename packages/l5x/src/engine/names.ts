/**
 * The Logix identifier rules, checked before a name reaches a draft.
 *
 * An L5X export never states the rules for a name it already contains, so a
 * draft could accept a tag, routine or member that Studio 5000 refuses at build
 * time. Three rules catch nearly all of it:
 *
 * - a name begins with a letter or underscore, never a digit,
 * - the rest is letters, digits and underscore — no space, dash, dot or other
 *   punctuation — and at most 40 characters in total,
 * - names compare case-insensitively, so two names that differ only in case are
 *   the same name and collide.
 *
 * The first two live here; the third is the `NAME_COLLISION` check the change set
 * already runs against the file it is editing.
 *
 * @module dsh-engineering-l5x/engine/names
 */

/** Longest identifier Logix Designer accepts. */
export const MAX_IDENTIFIER_LENGTH = 40

/** What is wrong with one name. */
export type IdentifierProblem = 'empty' | 'too_long' | 'starts_with_digit' | 'invalid_characters'

/** One refused name, stated so the reader can fix it without a build round trip. */
export interface IdentifierIssue {
  /** The rule that failed. */
  readonly problem: IdentifierProblem
  /** Stable identifier for a failure document. */
  readonly code: string
  /** What failed, in the reader's terms. */
  readonly message: string
  /** The exact change to make. */
  readonly fix: string
  /** A legal name to use instead. */
  readonly suggestion: string
}

/** First character: a letter or an underscore. */
const FIRST_CHARACTER = /^[A-Za-z_]/u
/** Every character: letters, digits and underscore. */
const NAME_CHARACTERS = /^[A-Za-z0-9_]*$/u
/** A digit, which Studio refuses as a first character. */
const DIGIT = /^[0-9]/u

/** Name one offending character the way a reader would say it. */
function describeCharacter(character: string): string {
  if (character === ' ') return 'a space'
  if (character === '\t') return 'a tab'
  if (character === '\n') return 'a newline'
  return `"${character}"`
}

/** List the distinct offending characters in a name, in first-seen order. */
function describeCharacters(name: string): readonly string[] {
  const seen = new Set<string>()
  for (const character of name) {
    if (!/[A-Za-z0-9_]/u.test(character)) seen.add(character)
  }
  return [...seen].map(describeCharacter)
}

/**
 * A legal name close to the one the caller asked for.
 *
 * Characters a name cannot carry become underscores, a leading digit gets an
 * underscore in front, and the result is cut to the length limit. The suggestion
 * is only a repair for the message: it is never used silently.
 *
 * @param name - The refused name.
 * @returns A legal identifier, or `Tag_1` when nothing usable survived.
 */
export function suggestIdentifier(name: string): string {
  const replaced = name.replace(/[^A-Za-z0-9_]/gu, '_')
  const started = DIGIT.test(replaced) || replaced === '' ? `_${replaced}` : replaced
  const cut = started.slice(0, MAX_IDENTIFIER_LENGTH)
  return cut === '' ? 'Tag_1' : cut
}

/**
 * Check one identifier against the Logix rules.
 *
 * @param name - The name as the caller wrote it.
 * @returns The first rule it breaks, or undefined when it is legal.
 */
export function checkIdentifier(name: string): IdentifierIssue | undefined {
  if (name.trim() === '') {
    return {
      problem: 'empty',
      code: 'NAME_EMPTY',
      message: 'An identifier cannot be empty.',
      fix: 'Name the object, for example "Start_PB".',
      suggestion: 'Start_PB',
    }
  }
  if (name.length > MAX_IDENTIFIER_LENGTH) {
    const suggestion = suggestIdentifier(name)
    return {
      problem: 'too_long',
      code: 'NAME_TOO_LONG',
      message: `"${name}" is ${name.length} characters; Studio 5000 allows at most ${MAX_IDENTIFIER_LENGTH}.`,
      fix: `Shorten it to ${MAX_IDENTIFIER_LENGTH} characters or fewer, for example "${suggestion}".`,
      suggestion,
    }
  }
  if (DIGIT.test(name)) {
    const suggestion = suggestIdentifier(name)
    return {
      problem: 'starts_with_digit',
      code: 'NAME_STARTS_WITH_DIGIT',
      message: `"${name}" starts with a digit. Studio 5000 names must begin with a letter or an underscore.`,
      fix: `Begin the name with a letter or an underscore, for example "${suggestion}".`,
      suggestion,
    }
  }
  if (!FIRST_CHARACTER.test(name)) {
    const suggestion = suggestIdentifier(name)
    const offending = describeCharacters(name)
    return {
      problem: 'invalid_characters',
      code: 'NAME_INVALID_CHARACTERS',
      message: `"${name}" begins with ${offending[0] ?? 'an unsupported character'}. Studio 5000 names must begin with a letter or an underscore.`,
      fix: `Begin the name with a letter or an underscore, for example "${suggestion}".`,
      suggestion,
    }
  }
  if (!NAME_CHARACTERS.test(name)) {
    const suggestion = suggestIdentifier(name)
    const offending = describeCharacters(name)
    const listed = offending.length === 0 ? 'an unsupported character' : offending.length === 1 ? offending[0] ?? '' : `${offending.slice(0, -1).join(', ')} and ${offending[offending.length - 1] ?? ''}`
    return {
      problem: 'invalid_characters',
      code: 'NAME_INVALID_CHARACTERS',
      message: `"${name}" contains ${listed}. Studio 5000 names accept only letters, digits and underscores.`,
      fix: `Rename it, for example "${suggestion}".`,
      suggestion,
    }
  }
  return undefined
}
