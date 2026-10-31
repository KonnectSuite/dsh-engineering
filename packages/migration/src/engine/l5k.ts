/**
 * Read and lint a Logix `.L5K` file: the text form the migration wizard and
 * Studio's import expect.
 *
 * The linter answers one question before anything is imported: will Studio
 * accept this file, and what will it make of it? It is deliberately a text
 * reader, not a parser - the wizard's own output is not always well formed
 * (a trailing comma in one attribute list aborts the whole import), and the
 * repair has to happen on the text before the file is opened.
 */

/** The text encodings Studio writes a `.L5K` in. */
export type L5kEncoding = 'utf8' | 'utf16le' | 'utf16be'

/** A `.L5K` file decoded to text, with the encoding it claimed. */
export interface L5kText {
  readonly text: string
  readonly encoding: L5kEncoding
}

/**
 * Decode a `.L5K` file the way Studio writes it.
 *
 * Studio exports UTF-16LE with a byte-order mark; a hand-edited file is usually
 * UTF-8. Reading either as the wrong one turns every keyword into text with
 * interleaved NULs, so the bytes decide, not the extension.
 *
 * @param bytes - the file contents.
 * @returns the text without its byte-order mark, and the encoding used.
 */
export function decodeL5k(bytes: Uint8Array): L5kText {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: decodeUtf16(bytes.subarray(2), true), encoding: 'utf16le' }
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: decodeUtf16(bytes.subarray(2), false), encoding: 'utf16be' }
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf8' }
  }
  return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf8' }
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  let text = ''
  const length = bytes.length - (bytes.length % 2)
  for (let index = 0; index < length; index += 2) {
    const low = bytes[index] ?? 0
    const high = bytes[index + 1] ?? 0
    text += String.fromCharCode(littleEndian ? low | (high << 8) : (low << 8) | high)
  }
  return text
}

/** One finding about a `.L5K` file. */
export interface L5kFinding {
  /** Stable rule name. */
  readonly rule: string
  readonly severity: 'error' | 'warning' | 'info'
  /** 1-based line in the file where the problem starts. */
  readonly line: number
  readonly message: string
}

/** What the file declares, as far as a text reader can tell. */
export interface L5kFacts {
  readonly controllerName: string | undefined
  readonly processorType: string | undefined
  readonly revision: number | undefined
  /** How the bytes were decoded; Studio writes UTF-16LE. */
  readonly encoding: L5kEncoding
  readonly modules: readonly { readonly name: string; readonly catalog: string | undefined; readonly slot: number | undefined }[]
  readonly tagCount: number
  readonly tags: readonly string[]
  readonly routineCount: number
  readonly rungCount: number
  readonly instructions: Readonly<Record<string, number>>
  /** Rung lines whose operand indexes an array with another tag, which Logix cannot express. */
  readonly indirectReferences: readonly { readonly line: number; readonly text: string }[]
  readonly lineCount: number
}

/** A linted file: the facts plus everything that would block or bite an import. */
export interface L5kReport {
  readonly facts: L5kFacts
  readonly findings: readonly L5kFinding[]
}

const MODULE = /^[\t ]*MODULE[ \t]+([A-Za-z_][\w]*)[ \t]*\(/u
const ROUTINE = /^[\t ]*ROUTINE[ \t]+([A-Za-z_][\w]*)/u
const END_ROUTINE = /^[\t ]*END_ROUTINE\b/u
const RUNG = /^[\t ]*N:[ \t]*(.+?)[ \t]*$/u
/** A tag declaration is `Name : TYPE`; an attribute assignment is `Name := …`. */
const TAG_DECL = /^[\t ]*([A-Za-z_][\w]*)[ \t]*:[ \t]*(?!=)/u
const ALIAS_DECL = /^[\t ]*([A-Za-z_][\w]*)[ \t]+OF[ \t]+/u
const INSTRUCTION = /\b([A-Z][A-Z0-9]{1,8})[ \t]*\(/gu
/** `N[N7_130]`: an array indexed by another tag, not by a number. */
const INDIRECT = /\b[A-Z][A-Z0-9_]{0,2}[ \t]*\[[ \t]*[A-Z][A-Z0-9_]*[ \t]*\]/u
const TRAILING_COMMA = /,[ \t]*$/u

/**
 * Read a `.L5K` file's declarations and rung text.
 *
 * @param text - file contents.
 * @returns the facts a reviewer can check without Studio.
 */
export function readL5k(text: string, encoding: L5kEncoding = 'utf8'): L5kFacts {
  const lines = text.split(/\r?\n/u)
  let controllerName: string | undefined
  let processorType: string | undefined
  let revision: number | undefined

  const modules: { name: string; catalog: string | undefined; slot: number | undefined }[] = []
  const tags: string[] = []
  let routineCount = 0
  let rungCount = 0
  const instructions: Record<string, number> = {}
  const indirectReferences: { line: number; text: string }[] = []

  let inTagBlock = false
  let currentModule: { name: string; catalog: string | undefined; slot: number | undefined } | undefined
  let inModule = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()

    if (trimmed.startsWith('CONTROLLER')) {
      controllerName = /^CONTROLLER[ \t]+([A-Za-z_][\w]*)/u.exec(trimmed)?.[1]
    }
    if (processorType === undefined) {
      const match = /ProcessorType[ \t]*:=[ \t]*([^,\s)]+)/u.exec(trimmed)
      if (match?.[1] !== undefined) processorType = match[1]
    }
    if (revision === undefined) {
      const match = /^Major[ \t]*:=[ \t]*(\d+)/u.exec(trimmed)
      if (match?.[1] !== undefined) revision = Number(match[1])
    }

    if (trimmed === 'TAG' || trimmed.startsWith('TAG ')) inTagBlock = true
    else if (trimmed === 'END_TAG' || /^(?:PROGRAM|AOI|ROUTINE|DATATYPE|MODULE)\b/u.test(trimmed)) inTagBlock = false

    if (!inModule) {
      const module = MODULE.exec(line)
      if (module !== null) {
        currentModule = { name: module[1] ?? '', catalog: undefined, slot: undefined }
        inModule = true
        modules.push(currentModule)
        continue
      }
    }
    if (inModule) {
      if (trimmed.startsWith('END_MODULE')) {
        inModule = false
        currentModule = undefined
        continue
      }
      if (currentModule !== undefined && currentModule.catalog === undefined) {
        const match = /CatalogNumber[ \t]*:=[ \t]*"([^"]+)"/u.exec(trimmed)
        if (match?.[1] !== undefined) currentModule.catalog = match[1]
      }
      if (currentModule !== undefined && currentModule.slot === undefined) {
        const match = /(?:^|[^A-Za-z_])Slot[ \t]*:=[ \t]*(\d+)/u.exec(trimmed)
        if (match?.[1] !== undefined) currentModule.slot = Number(match[1])
      }
      continue
    }

    if (ROUTINE.test(line)) routineCount += 1
    void END_ROUTINE

    if (inTagBlock) {
      const tag = TAG_DECL.exec(line)
      if (tag?.[1] !== undefined) tags.push(tag[1])
      else {
        const alias = ALIAS_DECL.exec(line)
        if (alias?.[1] !== undefined) tags.push(alias[1])
      }
    }

    const rung = RUNG.exec(line)
    if (rung?.[1] !== undefined) {
      rungCount += 1
      const body = rung[1]
      for (const match of body.matchAll(INSTRUCTION)) {
        const name = match[1]
        if (name === undefined) continue
        instructions[name] = (instructions[name] ?? 0) + 1
      }
      if (INDIRECT.test(body)) indirectReferences.push({ line: index + 1, text: body.trim() })
    }
  }

  return {
    controllerName,
    processorType,
    revision,
    encoding,
    modules,
    tags,
    tagCount: tags.length,
    routineCount,
    rungCount,
    instructions,
    indirectReferences,
    lineCount: lines.length,
  }
}

/**
 * Lint a `.L5K` file for what will stop Studio's import, and for what will
 * make the migrated logic behave differently even when the import succeeds.
 *
 * @param text - file contents.
 * @returns facts and findings, ordered by line.
 */
export function lintL5k(text: string, encoding: L5kEncoding = 'utf8'): L5kReport {
  const facts = readL5k(text, encoding)
  const findings: L5kFinding[] = []
  const lines = text.split(/\r?\n/u)

  const push = (rule: string, severity: L5kFinding['severity'], line: number, message: string): void => {
    findings.push({ rule, severity, line, message })
  }

  if (text.charCodeAt(0) === 0xfeff) push('BOM', 'warning', 1, 'The file starts with a byte-order mark; Studio may treat the first keyword as text.')

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const lineNo = index + 1

    if (/,\)/u.test(line)) {
      push('TRAILING_COMMA', 'error', lineNo, 'An attribute list ends with a comma before ")", which Studio rejects as invalid attribute syntax.')
    } else if (TRAILING_COMMA.test(line)) {
      let next = index + 1
      while (next < lines.length && (lines[next] ?? '').trim() === '') next += 1
      if (next < lines.length && (lines[next] ?? '').trimStart().startsWith(')')) {
        push('TRAILING_COMMA', 'error', lineNo, 'The attribute list continues on the next line with ")", so this trailing comma leaves an empty attribute; Studio rejects the file.')
      }
    }

    if (/^[\t ]*ROUTINE[ \t]+[A-Za-z_][\w]*[ \t]*\)/u.test(line)) {
      push('ROUTINE_PAREN', 'warning', lineNo, 'A routine header ends with a stray ")"; the migrated text kept half of a block header.')
    }
  }

  const tagSeen = new Map<string, number>()
  let inTagBlock = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()
    if (trimmed === 'TAG' || trimmed.startsWith('TAG ')) {
      inTagBlock = true
      continue
    }
    if (trimmed === 'END_TAG') {
      inTagBlock = false
      continue
    }
    // The migrated text has no END_TAG; the section ends where the next block starts.
    if (trimmed === 'END_TAG' || /^(?:PROGRAM|AOI|ROUTINE|DATATYPE|MODULE)\b/u.test(trimmed)) {
      inTagBlock = false
      continue
    }
    if (!inTagBlock || trimmed.startsWith('N:')) continue
    const name = TAG_DECL.exec(line)?.[1] ?? ALIAS_DECL.exec(line)?.[1]
    if (name === undefined) continue
    const key = name.toLowerCase()
    const first = tagSeen.get(key)
    if (first !== undefined) {
      push('DUPLICATE_TAG', 'error', index + 1, `Tag ${name} is declared again; the first declaration is at line ${first}.`)
    } else tagSeen.set(key, index + 1)
    if (name.length > 40) {
      push('TAG_NAME_TOO_LONG', 'error', index + 1, `Tag ${name} is ${name.length} characters; Logix names are limited to 40.`)
    }
    if (/_Placeholder\b/iu.test(name)) {
      push('PLACEHOLDER_TAG', 'warning', index + 1, `Tag ${name} stands in for a module the wizard could not map (here: the 1746-HSCE). Choose its replacement before commissioning.`)
    }
  }

  for (const reference of facts.indirectReferences) {
    push('INDIRECT_ADDRESS', 'warning', reference.line, `Rung indexes an array with another tag, which Logix cannot express: ${reference.text.slice(0, 160)}`)
  }

  if (facts.revision !== undefined && facts.revision < 37) {
    push('REVISION_BELOW_TARGET', 'info', 1, `The controller revision is ${facts.revision}; our build gate needs 37 or newer, so this file can only be verified as imported.`)
  }

  const routineOpen = lines.filter(line => ROUTINE.test(line)).length
  const routineClose = lines.filter(line => END_ROUTINE.test(line)).length
  if (routineOpen !== routineClose) {
    push('ROUTINE_UNBALANCED', 'error', 1, `${routineOpen} ROUTINE block(s) open against ${routineClose} END_ROUTINE; the file is truncated or malformed.`)
  }

  findings.sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule))
  return { facts, findings }
}
