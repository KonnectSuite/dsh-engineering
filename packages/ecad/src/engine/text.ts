/**
 * DXF text decoding: the `%%` control codes carried by TEXT and the inline
 * formatting codes carried by MTEXT.
 *
 * A title block label stored as `SHEET %%c NUMBER` has to compare equal to the
 * profile's `SHEET NUMBER` label, and a dimension text of `%%p0.05` has to read
 * as `±0.05`, so every consumer of a text value goes through this module. The
 * decoder is lossy on purpose: it returns the plain string a person reads, not a
 * styled run list.
 *
 * @module dsh-engineering-ecad/engine/text
 */

/** The subset of DXF percent escapes this engine renders. */
const PERCENT_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['d', '°'],
  ['D', '°'],
  ['p', '±'],
  ['P', '±'],
  ['c', 'Ø'],
  ['C', 'Ø'],
  ['%', '%'],
  ['u', ''], // underline on
  ['U', ''], // underline off
  ['o', ''], // overline on
  ['O', ''], // overline off
  ['k', ''], // strike-through toggle
  ['K', '']
])

/**
 * Decode the DXF TEXT percent control codes.
 *
 * `%%d` → `°`, `%%p` → `±`, `%%c` → `Ø`, `%%%` → `%`, and the `%%u`/`%%o`
 * formatting toggles are removed. An unknown `%%x` is kept verbatim, because
 * dropping it would silently change a drawing's text.
 *
 * @param raw - the stored text, possibly with `%%` codes.
 * @returns the plain string a person reads.
 */
export function decodeDxfText(raw: string): string {
  if (!raw || raw.indexOf('%%') < 0) return raw
  let out = ''
  let i = 0
  while (i < raw.length) {
    if (raw[i] === '%' && raw[i + 1] === '%') {
      const code = raw[i + 2]
      if (code === undefined) {
        out += '%%'
        i += 2
        continue
      }
      const decoded = PERCENT_ESCAPES.get(code)
      if (decoded !== undefined) {
        out += decoded
        i += 3
        continue
      }
      // `%%123` selects a character by code point in AutoCAD; keep it literal so
      // the information survives rather than guessing at a code page.
      out += '%%'
      i += 2
      continue
    }
    out += raw[i]
    i += 1
  }
  return out
}

/** Characters that terminate one MTEXT format code. */
const MTEXT_CODE_END = new Set([';'])

/**
 * Decode MTEXT contents into plain text.
 *
 * Handles the inline formatting the corpus and AutoCAD electrical templates
 * emit: `\P` paragraph break, `\~` non-breaking space, `\\` literal backslash,
 * `\{`/`\}` literal braces, `\A…;` alignment, `\C…;` colour, `\c…;` ACI colour,
 * `\f…;` font, `\H…;` height, `\W…;` width factor, `\Q…;` obliquing, `\T…;`
 * tracking, `\S…^…;` stacked fractions (rendered `a/b`), `\p…;` paragraph
 * settings, `\L`/`\l`/`\O`/`\o`/`\K`/`\k` toggles, and stray braces from
 * grouping. Paragraph breaks become `\n`.
 *
 * @param raw - the stored MTEXT contents.
 * @returns plain text with `\n` between paragraphs.
 */
export function decodeMText(raw: string): string {
  if (!raw) return ''
  let out = ''
  let i = 0
  while (i < raw.length) {
    const ch = raw[i]!
    if (ch === '\\') {
      const code = raw[i + 1]
      if (code === undefined) {
        i += 1
        continue
      }
      if (code === 'P' || code === 'p') {
        if (code === 'P') {
          out += '\n'
          i += 2
          continue
        }
        // \p…; paragraph settings: skip to the semicolon.
        i = skipToSemicolon(raw, i + 2)
        continue
      }
      if (code === '\\' || code === '{' || code === '}') {
        out += code
        i += 2
        continue
      }
      if (code === '~') {
        out += ' '
        i += 2
        continue
      }
      if (code === 'S') {
        const end = raw.indexOf(';', i + 2)
        const body = end < 0 ? raw.slice(i + 2) : raw.slice(i + 2, end)
        out += decodeMText(stackedFraction(body))
        i = end < 0 ? raw.length : end + 1
        continue
      }
      if (code === 'A' || code === 'C' || code === 'c' || code === 'f' || code === 'F' || code === 'H' || code === 'W' || code === 'Q' || code === 'T') {
        i = skipToSemicolon(raw, i + 2)
        continue
      }
      if (code === 'L' || code === 'l' || code === 'O' || code === 'o' || code === 'K' || code === 'k') {
        i += 2
        continue
      }
      // Unknown escape: drop the backslash but keep the character.
      out += code
      i += 2
      continue
    }
    if (ch === '{' || ch === '}') {
      i += 1
      continue
    }
    out += ch
    i += 1
  }
  return decodeDxfText(out)
}

/**
 * Index just past the next semicolon, or the end of the string.
 *
 * @param raw - source string.
 * @param start - index to scan from.
 */
function skipToSemicolon(raw: string, start: number): number {
  const end = raw.indexOf(';', start)
  return end < 0 ? raw.length : end + 1
}

/**
 * Render an MTEXT stacked fraction body (`1/2`, `1^2`, `1#2`) as plain text.
 *
 * @param body - the text between `\S` and `;`.
 */
function stackedFraction(body: string): string {
  const separator = body.indexOf('^')
  if (separator >= 0) {
    const top = body.slice(0, separator)
    const bottom = body.slice(separator + 1)
    if (top && bottom) return `${top}/${bottom}`
  }
  return body
}

/**
 * Plain text of any text-bearing entity.
 *
 * `TEXT`, `ATTDEF` and `ATTRIB` carry `textString`, `MTEXT` carries `contents`.
 * This is the one place that decision lives, so a caller never has to know which
 * entity it is looking at.
 *
 * @param value - `textString` or `contents` as the data model stores it.
 * @param kind - which family the value came from.
 */
export function decodeEntityText(value: string, kind: 'text' | 'mtext'): string {
  return kind === 'mtext' ? decodeMText(value) : decodeDxfText(value)
}

/**
 * Normalise a label for comparison: decoded, upper-cased, and stripped of the
 * punctuation templates vary on (`:`, `.`, trailing spaces).
 *
 * @param value - label or heading text.
 */
export function normalizeLabel(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s:._-]+$/g, '')
    .trim()
    .toUpperCase()
}

/**
 * Collapse decoded text to one comparison line: newlines and runs of whitespace
 * become single spaces.
 *
 * @param value - plain or raw text.
 */
export function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Visible width of a text run, in ems: the estimate every renderer and extents
 * calculation uses when the drawing carries no measured extents.
 *
 * @param text - plain text.
 */
export function textWidthEm(text: string): number {
  let em = 0
  for (const ch of text) {
    if (ch === '\n') continue
    // Wide glyphs (CJK, full-width forms) take a full em; the rest average 0.6.
    em += ch.charCodeAt(0) > 0x2e7f ? 1 : 0.6
  }
  return em
}
