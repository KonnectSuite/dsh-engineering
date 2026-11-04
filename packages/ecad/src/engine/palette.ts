/**
 * The AutoCAD Color Index (ACI) palette.
 *
 * The palette is generated rather than transcribed: ACI 10–249 are the 24 hues at
 * 15° steps, each with five brightness levels in a saturated and a half-saturated
 * pair, which is exactly how AutoCAD lays the table out. Generating it keeps the
 * 240 middle entries honest; entries 1–9 and 250–255 are the documented fixed
 * values and are written out.
 *
 * @module dsh-engineering-ecad/engine/palette
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
  [256, [255, 255, 255]]
])

/**
 * Convert a hue/saturation/value triple to 8-bit RGB.
 *
 * @param hue - degrees, 0–360.
 * @param saturation - 0–1.
 * @param value - 0–255.
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
  // AutoCAD's table truncates the computed components rather than rounding them
  // (255 × 0.5 is 127, not 128), so the palette matches the published values.
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
  // Anything the generator left unset falls back to black rather than undefined.
  for (let index = 0; index < table.length; index += 1) {
    if (!table[index]) table[index] = [0, 0, 0]
  }
  return table
})()

/**
 * RGB value of an ACI index.
 *
 * Out-of-range input is clamped to the legal 0–256 span so a malformed drawing
 * cannot make the renderer throw.
 *
 * @param index - ACI index, normally 1–255.
 * @returns the 8-bit RGB triple.
 */
export function aciToRgb(index: number): EcadRgb {
  const i = Number.isFinite(index) ? Math.trunc(index) : 256
  if (i < 0) return TABLE[0]!
  if (i > 256) return TABLE[256]!
  return TABLE[i]!
}

/** Fixed black used when a value cannot be resolved. */
const BLACK: EcadRgb = [0, 0, 0]

/**
 * CSS colour for an ACI index, adapting index 7 (AutoCAD's "white") to the
 * background so a print reads on screen.
 *
 * @param index - ACI index.
 * @param options - `lightBackground` flips index 7 to black.
 */
export function aciToCss(index: number, options?: { lightBackground?: boolean; rgb?: EcadRgb }): string {
  const rgb = options?.rgb ?? aciToRgb(index)
  let [r, g, b] = rgb
  if (options?.lightBackground && !options?.rgb && (r === 255 && g === 255 && b === 255)) {
    ;[r, g, b] = BLACK
  }
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`
}

/**
 * CSS colour for a true-colour RGB triple.
 *
 * @param rgb - 0–255 components.
 */
export function rgbToCss(rgb: EcadRgb): string {
  return `#${hex2(rgb[0])}${hex2(rgb[1])}${hex2(rgb[2])}`
}

/**
 * Two-digit upper-case hex.
 *
 * @param value - 0–255.
 */
function hex2(value: number): string {
  const v = Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)))
  return v.toString(16).padStart(2, '0').toUpperCase()
}

/**
 * The palette as CSS strings, for the renderer and for tests.
 *
 * @param options - `lightBackground` flips index 7 to black.
 */
export function aciPaletteCss(options?: { lightBackground?: boolean }): readonly string[] {
  const out: string[] = []
  for (let index = 0; index <= 256; index += 1) {
    out.push(aciToCss(index, options))
  }
  return out
}
