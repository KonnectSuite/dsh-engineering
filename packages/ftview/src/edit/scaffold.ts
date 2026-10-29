/**
 * Layout scaffold for a new ME display.
 *
 * The expensive part of a hand-authored screen is geometry: the model invents
 * coordinates, then a revision round fixes overlaps and drift. This module emits
 * the chrome every screen shares - backdrop, header bar, title, content surface
 * and footer - and reports the free rectangles that remain, so objects are placed
 * into known boxes instead of guessed ones.
 *
 * @module dsh-engineering-ftview/edit/scaffold
 */

/** One rectangle in display pixels. */
export interface Slot {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** Palette for the scaffold chrome. */
export interface ScaffoldTheme {
  readonly backdrop: string
  readonly header: string
  readonly surface: string
  readonly footer: string
  readonly titleColor: string
  readonly footerColor: string
}

/** AryaCode house palette: deep backdrop, one bright accent bar. */
export const SCAFFOLD_THEME: ScaffoldTheme = {
  backdrop: '#0E1A24',
  header: '#0088C8',
  surface: '#13232F',
  footer: '#143243',
  titleColor: '#FFFFFF',
  footerColor: '#CFE0EA',
}

/** What the scaffold needs to lay out one display. */
export interface ScaffoldOptions {
  readonly width: number
  readonly height: number
  readonly title: string
  readonly subtitle?: string
  readonly footer?: string
  readonly theme?: Partial<ScaffoldTheme>
}

/** One object the scaffold draws, in z-order. */
export interface ScaffoldObject {
  readonly type: string
  readonly name: string
  readonly attributes: Readonly<Record<string, string>>
  readonly caption?: string
}

/** Scaffold output: the objects to stage and the slots the user fills. */
export interface ScaffoldLayout {
  readonly objects: readonly ScaffoldObject[]
  readonly slots: {
    readonly header: Slot
    readonly title: Slot
    readonly subtitle: Slot | undefined
    readonly body: Slot
    readonly footer: Slot
    readonly footerText: Slot
  }
  readonly theme: ScaffoldTheme
}

/** Padding between the display edge and content. */
const PAD = 24

/** Header bar height, in pixels. */
const HEADER = 88

/** Footer bar height, in pixels. */
const FOOTER = 56

/** Convert a slot to the attribute map the export writes. */
function box(slot: Slot): Record<string, string> {
  return {
    left: String(Math.round(slot.left)),
    top: String(Math.round(slot.top)),
    width: String(Math.round(slot.width)),
    height: String(Math.round(slot.height)),
  }
}

/**
 * Lay out the chrome for one display.
 *
 * @param options - Display size, title text and optional subtitle and footer.
 * @returns Objects in z-order and the slots left free.
 */
export function scaffoldLayout(options: ScaffoldOptions): ScaffoldLayout {
  const width = Math.round(options.width)
  const height = Math.round(options.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 200 || height < 150) {
    throw new Error(`display size ${width}x${height} is too small for a scaffold`)
  }
  const theme: ScaffoldTheme = { ...SCAFFOLD_THEME, ...options.theme }
  const inner = width - PAD * 2
  const title: Slot = { left: PAD, top: 16, width: inner, height: 34 }
  const subtitle: Slot | undefined = options.subtitle === undefined
    ? undefined
    : { left: PAD, top: 52, width: inner, height: 22 }
  const header: Slot = { left: 0, top: 0, width, height: HEADER }
  const body: Slot = { left: PAD, top: HEADER + PAD, width: inner, height: height - HEADER - FOOTER - PAD * 2 }
  const footer: Slot = { left: 0, top: height - FOOTER, width, height: FOOTER }
  const footerText: Slot = { left: PAD, top: height - FOOTER + 16, width: inner, height: 24 }
  if (body.height < 60) throw new Error(`display ${width}x${height} leaves no room for content below the header and footer`)

  const textChrome = (color: string): Record<string, string> => ({
    visible: 'true',
    wallpaper: 'false',
    isReferenceObject: 'false',
    backStyle: 'transparent',
    foreColor: color,
    wordWrap: 'true',
    sizeToFit: 'false',
    alignment: 'middleLeft',
  })

  const objects: ScaffoldObject[] = [
    { type: 'panel', name: 'Backdrop', attributes: { ...box({ left: 0, top: 0, width, height }), backColor: theme.backdrop, borderStyle: 'none' } },
    { type: 'panel', name: 'HeaderBar', attributes: { ...box(header), backColor: theme.header, borderStyle: 'none' } },
    { type: 'text', name: 'Title', attributes: { ...box(title), ...textChrome(theme.titleColor), fontFamily: 'Arial Unicode MS', fontSize: '22', bold: 'true', caption: options.title } },
  ]
  if (subtitle !== undefined && options.subtitle !== undefined) {
    objects.push({ type: 'text', name: 'Subtitle', attributes: { ...box(subtitle), ...textChrome(theme.footerColor), fontFamily: 'Arial Unicode MS', fontSize: '12', caption: options.subtitle } })
  }
  objects.push({ type: 'panel', name: 'ContentSurface', attributes: { ...box(body), backColor: theme.surface, borderStyle: 'none' } })
  objects.push({ type: 'panel', name: 'FooterBar', attributes: { ...box(footer), backColor: theme.footer, borderStyle: 'none' } })
  objects.push({ type: 'text', name: 'FooterText', attributes: { ...box(footerText), ...textChrome(theme.footerColor), fontFamily: 'Arial Unicode MS', fontSize: '11', caption: options.footer ?? 'AryaCode · FactoryTalk View ME' } })

  return {
    objects,
    slots: {
      header,
      title,
      subtitle,
      body,
      footer,
      footerText,
    },
    theme,
  }
}
