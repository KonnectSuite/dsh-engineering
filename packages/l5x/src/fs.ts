/**
 * Byte-to-text decoding for one Studio 5000 export.
 *
 * An export's encoding is a property of the machine that wrote it: Studio
 * writes UTF-16 with a byte-order mark for some generated files and UTF-8 for
 * others. The byte-order mark wins; the XML declaration is consulted only when
 * there is none.
 *
 * @module dsh-engineering-l5x/fs
 */

import { L5xError } from './core/errors.ts'

/**
 * Decode one export's bytes.
 *
 * @param bytes - The file contents.
 * @returns The decoded XML text.
 */
export function decodeExport(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes)
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return new TextDecoder('utf-8').decode(bytes)
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 256))
  const declared = /^<\?xml[^>]*?encoding\s*=\s*["']([^"']+)["']/u.exec(head)?.[1]
  if (declared !== undefined && declared.toLowerCase() !== 'utf-8') {
    try {
      return new TextDecoder(declared).decode(bytes)
    } catch {
      throw new L5xError(
        'UNSUPPORTED_ENCODING',
        `The export declares encoding ${JSON.stringify(declared)}, which this host cannot decode.`,
        'Re-export the project as UTF-8 from Studio 5000 and reopen it.',
      )
    }
  }
  return new TextDecoder('utf-8').decode(bytes)
}
