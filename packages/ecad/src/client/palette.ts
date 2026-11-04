/**
 * The AutoCAD Color Index (ACI) palette, as CSS.
 *
 * The table is generated the way AutoCAD lays it out rather than transcribed:
 * entries 1–9 and 250–256 are the documented fixed values, and 10–249 are the 24
 * hues at 15° steps, each with five brightness levels in a saturated and a
 * half-saturated pair. The drawing pane owns this copy because the browser face
 * is built on its own; the host engine has an equivalent used for its SVG output.
 *
 * A colour drawn straight from the table is unreadable in one of the two themes:
 * CAD linework is authored for a white or a black plot, not for a theme-aware
 * pane. {@link tintedInk} therefore mixes the authored colour toward the theme's
 * foreground token, so the hue survives while the contrast follows the theme.
 * Entity-colour data is factual and never redefined: ACI 7 and the by-layer /
 * by-block indexes draw in the theme's ink at full strength.
 *
 * @module dsh-engineering-ecad/client/palette
 */

/** An 8-bit RGB triple. */
export type EcadRgb = readonly [number, number, number]

/** Brightness levels of the 24 hue groups, in ACI order. */
const LEVELS: readonly number[] = [255, 165, 127, 76, 38]

/** Fixed entries: 0 = by-block, 1–9 = the named colours, 250–256 = greys. */
const FIXED: ReadonlyMap<number, EcadRgb> = new Map<number, EcadRgb>([
  [0, [0, 0, 0]],
  [1, [255, 0, 0]],
  [2, [255, 255, 0]],
  [3, [0, 255, 0]],
  [4, [0, 255, 255]],
  [5, [0, 0, 255]],
  [6, [255, 0, 255]],
  [7, [255, 255, 255]],
  [8, [128, 128, 128]],
  [9, [192, 192, 192]],
  [250, [51, 51, 51]],
  [251, [80, 80, 80]],
  [252, [105, 105, 105]],
  [253, [130, 130, 130]],
  [254, [190, 190, 190]],
  [255, [255, 255, 255]],
  [256, [255, 255, 255]],
])

/**
 * Convert a hue/saturation/value triple to 8-bit RGB.
 * @param hue - degrees, 0–360.
 * @param saturation - 0–1.
 * @param value - 0–255.
 * @returns the RGB triple.
 */
function hsv(hue: number, saturation: number, value: number): EcadRgb {
  const h = ((hue % 360) + 360) % 360
  const c = value * saturation
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = value - c
  // AutoCAD's published table truncates rather than rounds (255 × 0.5 is 127).
  return [Math.floor(r + m + 1e-9), Math.floor(g + m + 1e-9), Math.floor(b + m + 1e-9)]
}

/** The full table, indexed 0–256 (0 by-block, 256 by-layer). */
const TABLE: readonly EcadRgb[] = (() => {
  const table: EcadRgb[] = new Array<EcadRgb>(257)
  for (const [index, rgb] of FIXED) table[index] = rgb
  for (let hueGroup = 0; hueGroup < 24; hueGroup += 1) {
    const hue = hueGroup * 15
    for (let levelIndex = 0; levelIndex < LEVELS.length; levelIndex += 1) {
      const value = LEVELS[levelIndex]!
      const base = 10 + hueGroup * 10 + levelIndex * 2
      table[base] = hsv(hue, 1, value)
      table[base + 1] = hsv(hue, 0.5, value)
    }
  }
  for (let index = 0; index < table.length; index += 1) {
    if (!table[index]) table[index] = [0, 0, 0]
  }
  return table
})()

/** @param index - ACI index. @returns the RGB triple, clamped to the legal span. */
export function aciToRgb(index: number): EcadRgb {
  const i = Number.isFinite(index) ? Math.trunc(index) : 256
  if (i <= 0) return TABLE[0]!
  if (i >= 256) return TABLE[256]!
  return TABLE[i]!
}

/**
 * A two-digit upper-case hex pair.
 * @param value - 0–255.
 * @returns the hex pair.
 */
function hex2(value: number): string {
  const v = Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)))
  return v.toString(16).padStart(2, '0').toUpperCase()
}

/** @param rgb - 8-bit components. @returns `#RRGGBB`. */
export function rgbToHex(rgb: EcadRgb): string {
  return `#${hex2(rgb[0])}${hex2(rgb[1])}${hex2(rgb[2])}`
}

/** @param index - ACI index. @returns `#RRGGBB`. */
export function aciHex(index: number): string {
  return rgbToHex(aciToRgb(index))
}

/** True for the indexes that mean "the drawing's own foreground colour". */
export function isAutoColor(index: number): boolean {
  return index === 0 || index === 7 || index === 256
}

/** The theme's foreground paint for undirected CAD linework. */
export const AUTO_INK = 'var(--ecad-ink)'

/**
 * Share of the authored colour kept when it is tinted toward the theme ink.
 *
 * 55% is measured, not guessed: blending that share of every ACI colour with the
 * theme foreground keeps the worst entry at 3.19:1 against the light pane
 * surface and 3.25:1 against the dark one, above the 3:1 non-text threshold.
 * The sheet's own stylesheet may rebind `--ecad-ink-tint`.
 */
export const INK_TINT = 'var(--ecad-ink-tint, 55%)'

/**
 * A paint that keeps an authored colour's hue while following the theme's
 * foreground, so one drawing reads on both a light and a dark pane.
 * @param hex - the authored colour.
 * @returns a CSS `color-mix` expression.
 */
export function tintedInk(hex: string): string {
  return `color-mix(in srgb, ${hex} ${INK_TINT}, var(--ecad-ink))`
}

/**
 * The paint for one primitive.
 *
 * @param color - resolved ACI index carried by the entity.
 * @param rgb - true colour, which wins when present.
 * @param layer - the owning layer, consulted only for the by-layer/by-block indexes.
 * @returns a CSS paint expression.
 */
export function inkFor(
  color: number,
  rgb: readonly [number, number, number] | undefined,
  layer: { readonly color: number; readonly rgb?: readonly [number, number, number] } | undefined,
): string {
  if (rgb !== undefined) return tintedInk(rgbToHex(rgb))
  const index = Number.isFinite(color) ? Math.trunc(color) : 256
  if (index === 7 || index === 0 || index === 256) {
    if (index !== 7 && layer !== undefined) {
      if (layer.rgb !== undefined) return tintedInk(rgbToHex(layer.rgb))
      const layerIndex = Number.isFinite(layer.color) ? Math.trunc(layer.color) : 7
      if (!isAutoColor(layerIndex)) return tintedInk(aciHex(layerIndex))
    }
    return AUTO_INK
  }
  return tintedInk(aciHex(index))
}

/**
 * A wash of one paint, for fills and hover surfaces.
 * @param ink - the paint.
 * @param share - percentage of the paint kept; the rest is transparent.
 * @returns a CSS paint expression.
 */
export function wash(ink: string, share = 22): string {
  return `color-mix(in srgb, ${ink} ${share}%, transparent)`
}
