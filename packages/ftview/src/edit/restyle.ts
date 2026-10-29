import type { DisplayFile, DisplayObject } from '../model.ts'
import { SCAFFOLD_THEME, type ScaffoldTheme } from './scaffold.ts'

/** Restyling palette; defaults to the AryaCode house theme. */
export type RestyleTheme = ScaffoldTheme

/** One attribute change the restyle would make. */
export interface RestyleChange {
  readonly object: string
  readonly type: string
  readonly attributes: Readonly<Record<string, string>>
}

/** Restyle output: changes to stage, and what was left alone. */
export interface RestyleResult {
  /** Display-level settings to stage with ftview_draft_display_set. */
  readonly settings: Readonly<Record<string, string>>
  readonly changes: readonly RestyleChange[]
  readonly skipped: readonly { readonly object: string; readonly type: string; readonly reason: string }[]
}

/**
 * Attributes each object shell takes from the theme, keyed by lowercase type.
 * Objects not listed keep their own look: references inherit, and drawings or
 * indicators carry meaning in their colours, so repainting them would erase it.
 */
const SHELLS: Readonly<Record<string, (theme: RestyleTheme) => Record<string, string>>> = {
  panel: theme => ({ backColor: theme.surface, borderColor: theme.header }),
  text: theme => ({ color: theme.titleColor }),
  momentarybutton: theme => ({ backColor: theme.header, borderColor: theme.header }),
  maintainedbutton: theme => ({ backColor: theme.header, borderColor: theme.header }),
  latchedbutton: theme => ({ backColor: theme.header, borderColor: theme.header }),
  multistatebutton: theme => ({ backColor: theme.header, borderColor: theme.header }),
  gotobutton: theme => ({ backColor: theme.header, borderColor: theme.header }),
  numericdisplay: theme => ({ backColor: theme.surface, borderColor: theme.header, color: theme.titleColor }),
  stringdisplay: theme => ({ backColor: theme.surface, borderColor: theme.header, color: theme.titleColor }),
  numericinput: theme => ({ backColor: theme.surface, borderColor: theme.header, color: theme.titleColor }),
  stringinput: theme => ({ backColor: theme.surface, borderColor: theme.header, color: theme.titleColor }),
  inputfield: theme => ({ backColor: theme.surface, borderColor: theme.header, color: theme.titleColor }),
}

/** True when the object is a reference to a global object, which inherits its look. */
function isReference(object: DisplayObject): boolean {
  return object.attributes.isReferenceObject === 'true' || object.attributes.linkBaseObject !== undefined
}

/** Collect the attribute changes that repaint one display in the theme. */
export function restyleDisplay(display: DisplayFile, theme: RestyleTheme = SCAFFOLD_THEME): RestyleResult {
  const changes: RestyleChange[] = []
  const settings: Record<string, string> = {}
  const skipped: { object: string; type: string; reason: string }[] = []

  for (const object of display.objects) {
    const type = String(object.attributes.type ?? object.type).toLowerCase()
    if (type === 'connections' || type === 'connection' || type === 'caption' || type === 'states' || type === 'state') continue
    if (type === 'animations' || type === 'imagesettings' || type === 'parameterfile') continue
    if (type === 'displaysettings' || type === 'panelsettings') {
      if (object.attributes.backColor !== theme.backdrop) settings.backColor = theme.backdrop
      continue
    }
    const shell = SHELLS[type]
    if (shell === undefined) {
      if (object.name !== undefined && object.name !== '') skipped.push({ object: object.name, type: object.type, reason: 'not a shell: its colours carry meaning' })
      continue
    }
    if (isReference(object)) {
      skipped.push({ object: object.name ?? type, type: object.type, reason: 'reference: the global object owns the look' })
      continue
    }
    const wanted = shell(theme)
    const attributes: Record<string, string> = {}
    for (const [key, value] of Object.entries(wanted)) {
      if (object.attributes[key] !== value) attributes[key] = value
    }
    if (Object.keys(attributes).length === 0) continue
    changes.push({ object: object.name ?? type, type: object.type, attributes })
  }

  return { settings, changes, skipped }
}
