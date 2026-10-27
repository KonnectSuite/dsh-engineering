/**
 * Infer the visual style of one FactoryTalk View ME export.
 *
 * Counts only what the export states: colours, fonts, button geometry,
 * navigation and popup usage. Group screens inherited from another project and
 * a two-display export are reported as low confidence rather than dressed up as
 * a standard.
 *
 * @module dsh-engineering-ftview/style
 */

import type { Application } from './model.ts'

/** One counted value. */
interface Counted { readonly value: string; readonly count: number }

/** Evidence for one claim. */
interface Evidence { readonly file?: string; readonly count?: number; readonly note: string }

/** The profile, structurally compatible with the resources schema. */
export interface FtviewStyleProfile {
  readonly schema: 1
  readonly source: { readonly kind: 'ftview'; readonly path: string; readonly sha256: string }
  readonly naming: { readonly displays: { readonly case: string; readonly examples: readonly string[] } }
  readonly hmi: {
    readonly palette: readonly Counted[]
    readonly fonts: readonly Counted[]
    readonly button: readonly Counted[]
    readonly navigation: { readonly displaysWithNav: number; readonly displays: number }
    readonly popups: { readonly onTop: number; readonly replace: number }
  }
  readonly evidence: readonly Evidence[]
  readonly confidence: 'low' | 'medium' | 'high'
}

/** The most common value in a counter, with its count. */
function top(counts: ReadonlyMap<string, number>): Counted | undefined {
  let best: Counted | undefined
  for (const [value, count] of counts) {
    if (best === undefined || count > best.count) best = { value, count }
  }
  return best
}

/** Normalise a hex colour to lower case with a leading hash. */
function colour(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim().toLowerCase()
  return /^#[0-9a-f]{3,8}$/u.test(trimmed) ? trimmed : undefined
}

/** Classify one display name's case convention. */
function nameCase(name: string): 'Title Case' | 'PascalCase' | 'snake_case' | 'other' {
  if (/^[A-Z][a-z]+(?: [A-Z][a-z]+)+$/u.test(name)) return 'Title Case'
  if (/^[A-Z][A-Za-z0-9]*$/u.test(name)) return 'PascalCase'
  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/u.test(name)) return 'snake_case'
  return 'other'
}

/**
 * Read the style of one export.
 *
 * @param app - The scanned export.
 * @returns The profile.
 */
export function styleProfileOf(app: Application): FtviewStyleProfile {
  const palette = new Map<string, number>()
  const fonts = new Map<string, number>()
  const buttons = new Map<string, number>()
  const displayCases = new Map<string, number>()
  let displaysWithNav = 0
  let onTop = 0
  let replace = 0
  const evidence: Evidence[] = []

  for (const display of app.displays) {
    displayCases.set(nameCase(display.name), (displayCases.get(nameCase(display.name)) ?? 0) + 1)
    let gotoButtons = 0
    for (const object of display.objects) {
      const back = colour(object.attributes.backColor)
      if (back !== undefined) palette.set(back, (palette.get(back) ?? 0) + 1)
      const family = object.attributes.fontFamily
      if (family !== undefined && family.trim() !== '') fonts.set(family, (fonts.get(family) ?? 0) + 1)
      if (/button$/iu.test(object.type)) {
        const width = object.attributes.width
        const height = object.attributes.height
        if (width !== undefined && height !== undefined) {
          const key = `${width}x${height}`
          buttons.set(key, (buttons.get(key) ?? 0) + 1)
        }
      }
      if (object.type === 'gotoButton') gotoButtons += 1
      if (object.type === 'displaySettings') {
        const type = object.attributes.displayType
        if (type === 'onTop') onTop += 1
        if (type === 'replace') replace += 1
      }
    }
    if (gotoButtons >= 3) displaysWithNav += 1
  }

  const back = top(palette)
  const family = top(fonts)
  const button = top(buttons)
  const displayCase = top(displayCases)
  if (back !== undefined) evidence.push({ count: back.count, note: `background "${back.value}" used ${back.count} time(s)` })
  if (family !== undefined) evidence.push({ count: family.count, note: `font "${family.value}" used ${family.count} time(s)` })
  if (button !== undefined) evidence.push({ count: button.count, note: `button geometry ${button.value} used ${button.count} time(s)` })
  evidence.push({ count: app.displays.length, note: `${app.displays.length} display(s) read` })

  const confidence: FtviewStyleProfile['confidence'] = app.displays.length >= 8 && (back?.count ?? 0) >= 5 ? 'high' : app.displays.length >= 3 ? 'medium' : 'low'
  return {
    schema: 1,
    source: { kind: 'ftview', path: app.root, sha256: '' },
    naming: { displays: { case: displayCase?.value ?? 'Title Case', examples: app.displays.slice(0, 5).map(display => display.name) } },
    hmi: {
      palette: [...palette].sort((left, right) => right[1] - left[1]).slice(0, 6).map(([value, count]) => ({ value, count })),
      fonts: [...fonts].sort((left, right) => right[1] - left[1]).slice(0, 4).map(([value, count]) => ({ value, count })),
      button: [...buttons].sort((left, right) => right[1] - left[1]).slice(0, 4).map(([value, count]) => ({ value, count })),
      navigation: { displaysWithNav, displays: app.displays.length },
      popups: { onTop, replace },
    },
    evidence,
    confidence,
  }
}
