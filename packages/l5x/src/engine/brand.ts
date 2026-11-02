/**
 * The AryaCode brand, as a generated document uses it.
 *
 * The tokens come from the production brand kit (`tools/brand.mjs` there is the
 * single source of truth): ink `#0F141B`, the blue `#2B6CFF`, the cyan `#00E0D2`
 * and the violet `#8A5CFF` the logo's frame gradients run through, plus Sora for
 * text and JetBrains Mono for code and ladder labels.
 *
 * The kit's assets travel with this package under `assets/brand`, so a document
 * generated on a machine that has never seen the brand kit still carries the
 * mark and the typefaces. When an asset is missing — an older install, a pruned
 * package — every value falls back to the system stack and the mark is omitted;
 * a report never fails because branding is unavailable.
 *
 * @module dsh-engineering-l5x/engine/brand
 */

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Brand copy and colours, mirroring the kit. */
export const BRAND = {
  name: 'AryaCode',
  wordmarkLead: 'Arya',
  wordmarkTrail: 'Code',
  tagline: 'Your AI coding companion',
  ink: '#0F141B',
  inkSoft: '#171D26',
  blue: '#2B6CFF',
  cyan: '#00E0D2',
  violet: '#8A5CFF',
  light: '#E6E8EB',
  rule: '#D8DDE4',
  muted: '#5A6472',
} as const

/** Where the account's brand assets live beside the compiled module. */
function assetPath(name: string): string {
  // `lib/engine/brand.js` sits two levels under the package root.
  return fileURLToPath(new URL(`../../assets/brand/${name}`, import.meta.url))
}

/** Read one asset, or undefined when this install does not carry it. */
function readAsset(name: string): Buffer | undefined {
  const path = assetPath(name)
  if (!existsSync(path)) return undefined
  try {
    return readFileSync(path)
  } catch {
    return undefined
  }
}

/** The mark as a data URI, or undefined when it is not installed. */
export function brandMarkDataUri(): string | undefined {
  const bytes = readAsset('mark.svg')
  return bytes === undefined ? undefined : `data:image/svg+xml;base64,${bytes.toString('base64')}`
}

/**
 * `@font-face` rules for the brand typefaces, or an empty string.
 *
 * Embedded rather than linked: a report is one file that has to print the same
 * on a machine that has none of our fonts installed.
 */
export function brandFontCss(): string {
  const faces: string[] = []
  const sora = readAsset('Sora-Variable.ttf')
  if (sora !== undefined) {
    faces.push(`@font-face{font-family:'Arya Sora';src:url(data:font/ttf;base64,${sora.toString('base64')}) format('truetype');font-weight:100 900;font-style:normal;font-display:block;}`)
  }
  const mono = readAsset('JetBrainsMono-Variable.ttf')
  if (mono !== undefined) {
    faces.push(`@font-face{font-family:'Arya Mono';src:url(data:font/ttf;base64,${mono.toString('base64')}) format('truetype');font-weight:100 900;font-style:normal;font-display:block;}`)
  }
  return faces.join('')
}

/** The version this package is, printed in a document's footer. */
export function brandPackageVersion(): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')) as { version?: unknown }
    return typeof manifest.version === 'string' ? manifest.version : undefined
  } catch {
    return undefined
  }
}

/** The lockup a document prints: mark, wordmark and tagline. */
export function brandLockupHtml(): string {
  const mark = brandMarkDataUri()
  const image = mark === undefined ? '' : `<img class="brand-mark" src="${mark}" alt="">`
  return `<div class="lockup">${image}<div class="lockup-text"><div class="wordmark">${BRAND.wordmarkLead}<span class="trail">${BRAND.wordmarkTrail}</span></div><div class="tagline">${BRAND.tagline}</div></div></div>`
}
