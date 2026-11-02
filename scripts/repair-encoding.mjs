/**
 * Repair text that was UTF-8 and got decoded as Latin-1, once or several times.
 *
 * The damage is recognisable — "â€"" for an em dash, "ÃƒÆ’" for a doubly-damaged one — and reversible: decoding the
 * characters back as Latin-1 and re-reading them as UTF-8 undoes one layer. Apply until the markers are gone, but only
 * while each pass strictly reduces them and never produces U+FFFD: a file that was fine must come out byte-identical,
 * and a file that cannot be fixed is left alone rather than mangled further.
 *
 * This is a one-off tool, not part of the build: it exists so the repair can be re-run and reviewed rather than done
 * by hand in a text editor.
 *
 * Usage: node scripts/repair-encoding.mjs <file...> [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs'

/** Sequences that only appear when UTF-8 has been read as a single-byte encoding. */
const MARKERS = /[âÃ][€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]|Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]/gu

/** How many marker sequences a string carries. */
const damage = text => (text.match(MARKERS) ?? []).length

/**
 * The bytes Windows-1252 maps to the characters Latin-1 leaves as controls.
 *
 * A plain `latin1` roundtrip cannot undo this damage: the misread punctuation lives at U+2018–U+2122, above the
 * byte range, so `Buffer.from(text, 'latin1')` truncates it. Windows-1252 is what actually produced the mojibake,
 * so this is the inverse that has to be used.
 */
const CP1252 = new Map(Object.entries({
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89,
  'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F,
}).map(([character, byte]) => [character, byte]))

/** Undo one layer of Windows-1252 mis-decoding: characters back to the bytes they were read from. */
function undo(text) {
  const bytes = []
  for (const character of text) {
    const mapped = CP1252.get(character)
    const code = character.codePointAt(0)
    if (mapped !== undefined) bytes.push(mapped)
    else if (code <= 0xFF) bytes.push(code)
    // A character Windows-1252 never contained is already correct text: keep its UTF-8 bytes.
    else bytes.push(...Buffer.from(character, 'utf8'))
  }
  return Buffer.from(bytes).toString('utf8')
}

const files = process.argv.slice(2).filter(argument => argument !== '--write')
const write = process.argv.includes('--write')

for (const file of files) {
  const original = readFileSync(file, 'utf8')
  let text = original
  let before = damage(text)
  if (before === 0) {
    console.log(`clean  ${file}`)
    continue
  }
  // Undo one layer at a time, accepting a pass only when it strictly helps.
  for (let pass = 0; pass < 3; pass += 1) {
    const next = undo(text)
    const after = damage(next)
    if (after >= damage(text) || next.includes('\uFFFD')) break
    text = next
  }
  const remaining = damage(text)
  if (remaining === before) {
    console.log(`skip   ${file}: ${before} marker(s) left; not a mis-decoding this can undo`)
    continue
  }
  console.log(`repair ${file}: ${before} -> ${remaining} marker(s), ${original.length} -> ${text.length} chars`)
  if (write) writeFileSync(file, text, 'utf8')
}
