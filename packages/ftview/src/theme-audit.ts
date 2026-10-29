import type { Application, DisplayFile } from './model.ts'
import { SCAFFOLD_THEME, type ScaffoldTheme } from './edit/scaffold.ts'
import type { Finding } from './checks.ts'

/** One display's conformance to the house theme. */
export interface ThemeRow {
  readonly display: string
  readonly backdrop: string
  readonly backdropMatch: boolean
  readonly header: boolean
  readonly footer: boolean
  readonly paletteShare: number
  readonly conforming: boolean
}

/** Audit result: per-display rows plus the headline counts. */
export interface ThemeAudit {
  readonly rows: readonly ThemeRow[]
  readonly conforming: number
  readonly total: number
  readonly findings: readonly Finding[]
}

/** Attribute values a themed shell may take; compared case-insensitively. */
const PALETTE = new Set(['backdrop', 'header', 'surface', 'footer', 'titleColor', 'footerColor'] as const)

function number(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Display size, from its own displaySettings. */
function sizeOf(display: DisplayFile): { width: number; height: number } {
  const settings = display.objects.find(object => object.type.toLowerCase() === 'displaysettings')
  const width = number(settings?.attributes.width)
  const height = number(settings?.attributes.height)
  return { width: width ?? 640, height: height ?? 480 }
}

/** The palette a display actually uses, lowercased for comparison. */
function paletteOf(theme: ScaffoldTheme): Set<string> {
  const values = new Set<string>()
  for (const key of PALETTE) values.add(theme[key].toLowerCase())
  return values
}

/** True when a panel works as the top or bottom band of the screen. */
function band(display: DisplayFile, theme: ScaffoldTheme, edge: 'top' | 'bottom', width: number, height: number): boolean {
  const palette = paletteOf(theme)
  for (const object of display.objects) {
    const type = object.type.toLowerCase()
    if (type !== 'panel' && type !== 'group') continue
    const left = number(object.attributes.left) ?? 0
    const top = number(object.attributes.top) ?? 0
    const w = number(object.attributes.width) ?? 0
    const h = number(object.attributes.height) ?? 0
    if (w < width * 0.85) continue
    if (edge === 'top' && !(top <= 60 && h >= 40 && h <= 140)) continue
    if (edge === 'bottom' && !(top + h >= height - 12 && h >= 30 && h <= 140)) continue
    if (left > width * 0.05) continue
    if (!palette.has((object.attributes.backColor ?? '').toLowerCase())) continue
    return true
  }
  return false
}

/** Share of coloured shell objects that already use a palette colour. */
function share(display: DisplayFile, theme: ScaffoldTheme): number {
  const palette = paletteOf(theme)
  let coloured = 0
  let matching = 0
  for (const object of display.objects) {
    for (const key of ['backColor', 'color'] as const) {
      const value = object.attributes[key]
      if (value === undefined || value === '') continue
      coloured += 1
      if (palette.has(value.toLowerCase())) matching += 1
    }
  }
  return coloured === 0 ? 1 : matching / coloured
}

/**
 * Audit every display against the house theme.
 *
 * A display conforms when its backdrop is the theme backdrop and it has both a
 * top and a bottom band in palette colours; `paletteShare` is reported for the
 * in-between state, where a screen was partly restyled.
 *
 * @param app - The scanned application.
 * @param theme - Palette to audit against; defaults to the house theme.
 * @returns Rows, counts and one info finding per non-conforming display.
 */
export function themeAudit(app: Application, theme: ScaffoldTheme = SCAFFOLD_THEME): ThemeAudit {
  const rows: ThemeRow[] = []
  for (const display of app.displays) {
    const { width, height } = sizeOf(display)
    const settings = display.objects.find(object => object.type.toLowerCase() === 'displaysettings')
    const backdrop = (settings?.attributes.backColor ?? '').toLowerCase()
    const backdropMatch = backdrop === theme.backdrop.toLowerCase()
    const header = band(display, theme, 'top', width, height)
    const footer = band(display, theme, 'bottom', width, height)
    rows.push({
      display: display.name,
      backdrop,
      backdropMatch,
      header,
      footer,
      paletteShare: Number(share(display, theme).toFixed(2)),
      conforming: backdropMatch && header && footer,
    })
  }
  const findings: Finding[] = rows
    .filter(row => !row.conforming)
    .map(row => ({
      rule: 'VIEW-THEME-01',
      severity: 'info',
      message: `${row.display} does not follow the house theme: backdrop ${row.backdropMatch ? 'matches' : `is ${row.backdrop || 'unset'}`}, header band ${row.header ? 'present' : 'missing'}, footer band ${row.footer ? 'present' : 'missing'}.`,
      evidence: { display: row.display, backdrop: row.backdrop, header: row.header, footer: row.footer, paletteShare: row.paletteShare },
    }))
  return { rows, conforming: rows.filter(row => row.conforming).length, total: rows.length, findings }
}
