/**
 * The object catalog: what the open export actually contains, per type.
 *
 * The XSD says which attributes are legal; this says which ones this project
 * uses, how often, and with what values. That is the difference between an agent
 * guessing an attribute name and an agent reading the house pattern, and it
 * costs nothing: the objects are already parsed.
 *
 * The type NAMES are not listed here any more. A hand-kept list of 34 names
 * drifted until it offered eight names no Machine Edition schema declares and
 * refused sixty-five real ones, so an agent that trusted it drafted elements
 * Studio would not import and could not draft objects the vendor itself writes.
 * The vocabulary now comes from the schema — the installed `Gfx-ME*.xsd`, or the
 * committed snapshot when Studio is absent — through `vocabulary()` in schema.ts.
 * What stays here is the craft layer: what each family needs to be useful, and
 * what to answer when an agent reaches for a name from another product.
 *
 * @module dsh-engineering-ftview/catalog
 */

import type { DisplayObject } from './model.ts'

/** One attribute usage. */
export interface AttributeUsage {
  /** Attribute name as written in the export. */
  readonly name: string
  /** How many objects of this type carry it. */
  readonly used: number
  /** Up to three distinct values seen, for enumerations and colours. */
  readonly examples: readonly string[]
}

/** One object type in the export. */
export interface ObjectType {
  /** Element name, e.g. `momentaryButton`. */
  readonly type: string
  /** How many objects of this type the export declares. */
  readonly used: number
  /** Attributes in descending usage. */
  readonly attributes: readonly AttributeUsage[]
  /** Example object names, up to three. */
  readonly names: readonly string[]
}

/** What the catalog is built from. */
export interface CatalogSource {
  readonly displays: readonly { readonly name: string; readonly objects: readonly DisplayObject[] }[]
}

/** One type's mutable accumulation while observing. */
interface Accumulator {
  count: number
  readonly attributes: Map<string, { count: number; examples: Set<string> }>
  readonly names: string[]
}

/**
 * Build the catalog from one export.
 *
 * A parsed display carries the parts as well as the objects: `caption`, `state`,
 * `animations`, `connections` and friends are child elements, and the parser
 * walks them all. Passing the schema's display element names keeps those parts
 * out of the type list, so `used_types` answers "what can I place here" and not
 * "what tags appear in the file".
 *
 * @param app - The scanned application.
 * @param only - Element names to count; every other element is a part, not an object.
 * @returns Types in descending usage, attributes in descending usage.
 */
export function observeObjects(app: CatalogSource, only?: ReadonlySet<string>): ObjectType[] {
  const types = new Map<string, Accumulator>()
  for (const display of app.displays) {
    for (const object of display.objects) {
      if (only !== undefined && !only.has(object.type)) continue
      let entry = types.get(object.type)
      if (entry === undefined) {
        entry = { count: 0, attributes: new Map(), names: [] }
        types.set(object.type, entry)
      }
      entry.count += 1
      if (object.name !== undefined && entry.names.length < 3 && !entry.names.includes(object.name)) entry.names.push(object.name)
      for (const [name, value] of Object.entries(object.attributes)) {
        let usage = entry.attributes.get(name)
        if (usage === undefined) {
          usage = { count: 0, examples: new Set() }
          entry.attributes.set(name, usage)
        }
        usage.count += 1
        if (usage.examples.size < 3 && value !== '') usage.examples.add(value)
      }
    }
  }
  return [...types.entries()]
    .map(([type, entry]) => ({
      type,
      used: entry.count,
      names: entry.names,
      attributes: [...entry.attributes.entries()]
        .map(([name, usage]) => ({ name, used: usage.count, examples: [...usage.examples] }))
        .sort((left, right) => right.used - left.used || left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => right.used - left.used || left.type.localeCompare(right.type))
}

/**
 * Whether one element name is a control a person presses with a finger.
 *
 * The rule is the vendor's own naming: every press target in the Machine
 * Edition schema ends in `Button`, and the keypad objects end in `Key`. A
 * hand-picked list of seven missed the alarm, user, audit-trail and keypad
 * controls, and carried one name (`maintainButton`) no schema declares.
 *
 * @param type - The display element name.
 * @returns True when the touch-target rule applies to it.
 */
export function isPressTarget(type: string): boolean {
  return /(?:Button|Key)$/u.test(type)
}

/**
 * Names agents reach for that the Machine Edition schema does not declare.
 *
 * Each is a real concept in FactoryTalk View — most come from Studio
 * Professional Edition vocabulary or from the runtime's feature names — so the
 * refusal says what the Machine Edition equivalent is instead of only saying no.
 * An agent that reads `trend` or `recipe` off a Screen Builder tutorial gets
 * this answer rather than a list of 91 names.
 */
export const PHANTOM_HINTS: Readonly<Record<string, string>> = {
  maintainButton: 'The Machine Edition element is maintainedButton.',
  numericInput: 'The Machine Edition elements are numericInputEnable (the input) and numericInputCursorPoint (the keypad cursor).',
  stringInput: 'The Machine Edition element is stringInputEnable.',
  listSelector: 'The Machine Edition elements are displayListSelector, controlListSelector and pilotedControlListSelector.',
  recipe: 'The Machine Edition elements are recipePlusTable, recipePlusButton and recipePlusSelector.',
  trend: 'Machine Edition has no trend object element: the runtime trend is configured on the display, and the only trend elements are trendPauseButton and trendNextPenButton.',
  referenceObject: 'A reference object is not an element: place a normal object and set the isReferenceObject and linkBaseObject attributes (linkBaseObject is "<GlobalFile>.<ObjectName>").',
  globalObject: 'A global object is not an element: it is the same attribute mechanism — isReferenceObject with linkBaseObject pointing into the global file.',
}

/**
 * What each family needs to be useful in Studio, for the families an agent is
 * most likely to draft.
 *
 * This is the craft layer, not the contract: the schema decides which names and
 * attributes exist, and `ftview_object_types` merges these notes over it. The
 * `required` list is what a draft should set to be useful — geometry and the
 * driving attribute — which is wider than what the schema declares mandatory
 * (across the 91 display types the schema declares exactly one mandatory
 * attribute: activeX `classId`). The `children` list is what the schema allows
 * as child elements, taken from the resolved type including its base chain:
 * `text` carries its words in the `caption` ATTRIBUTE and allows no `<caption>`
 * child, and the button family splits — `momentaryButton`, `maintainedButton`,
 * `latchedButton`, `multistateButton` and `interlockedButton` carry `<states>`,
 * while `gotoButton`, `rampButton`, `closeButton` and `macroButton` carry
 * `<caption>` and `<imageSettings>` and no `<states>`.
 */
export const TYPE_GUIDE: Readonly<Record<string, { required: readonly string[]; children?: readonly string[]; note: string }>> = {
  panel: { required: ['left', 'top', 'width', 'height'], children: ['animations', 'parameters'], note: 'Background surface; set backColor and borderStyle.' },
  group: { required: ['name'], children: ['animations', 'parameters'], note: 'Children are placed in absolute coordinates; the group element nests any other object.' },
  text: { required: ['left', 'top', 'width', 'height', 'caption'], children: ['animations', 'parameters'], note: 'The words are the caption attribute; text allows no <caption> child.' },
  rectangle: { required: ['left', 'top', 'width', 'height'], note: 'Shape; backColor/borderColor.' },
  ellipse: { required: ['left', 'top', 'width', 'height'], note: 'Shape; set shape="ellipse" on controls for round lamps.' },
  line: { required: ['left', 'top', 'width', 'height'], note: 'A line from the object box corner to the opposite corner.' },
  polygon: { required: ['left', 'top', 'width', 'height'], note: 'Points are relative to the object box.' },
  polyline: { required: ['left', 'top', 'width', 'height'], note: 'Points are relative to the object box.' },
  polyPolygon: { required: ['left', 'top', 'width', 'height'], children: ['innerPolygon'], note: 'A ring: the outer points are the object, the hole is the <innerPolygon> child.' },
  arc: { required: ['left', 'top', 'width', 'height'], note: 'Arc within the object box.' },
  image: { required: ['left', 'top', 'width', 'height', 'imageName'], note: 'imageName is the Image file stem, no extension (e.g. "Equilateral triangle").' },
  momentaryButton: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections', 'animations'], note: 'States carry captions and colours; connections carry Value.' },
  maintainedButton: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections', 'animations'], note: 'Latching press; same shape as momentaryButton.' },
  latchedButton: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections', 'animations'], note: 'Same shape as momentaryButton.' },
  interlockedButton: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections', 'animations'], note: 'Two-state press with an interlock; states carry the per-state caption and colour.' },
  multistateButton: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections'], note: 'shape="circle" draws a round lamp; states are indexed by value.' },
  multistateIndicator: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections'], note: 'Read-only lamp/banner; triggerType="value" with per-state value.' },
  gotoButton: { required: ['left', 'top', 'width', 'height', 'display'], children: ['caption', 'imageSettings', 'connections'], note: 'display is the target display name. It carries <caption>, not <states>.' },
  rampButton: { required: ['left', 'top', 'width', 'height'], children: ['caption', 'imageSettings', 'connections'], note: 'Ramp control; <caption> and <imageSettings>, no <states>.' },
  closeButton: { required: ['left', 'top', 'width', 'height'], children: ['caption', 'imageSettings', 'connections'], note: 'Closes the display; <caption> and <imageSettings>, no <states>.' },
  macroButton: { required: ['left', 'top', 'width', 'height'], children: ['caption', 'imageSettings', 'connections'], note: 'Runs a macro; the macro is named by an attribute, the label is <caption>.' },
  numericDisplay: { required: ['left', 'top', 'width', 'height'], children: ['connections', 'animations'], note: 'Value comes from the Value connection or the expression attribute; no <caption> child.' },
  numericInputEnable: { required: ['left', 'top', 'width', 'height'], children: ['caption', 'imageSettings', 'connections'], note: 'The enabled-numeric input; writes are configured in Studio.' },
  stringDisplay: { required: ['left', 'top', 'width', 'height'], children: ['connections'], note: 'String value.' },
  stringInputEnable: { required: ['left', 'top', 'width', 'height'], children: ['caption', 'imageSettings', 'connections'], note: 'The string input; behaviour is configured in Studio.' },
  barGraph: { required: ['left', 'top', 'width', 'height', 'minValue', 'maxValue'], children: ['connections'], note: 'Value connection drives the fill; fillColor and fillDirection decide the look.' },
  gauge: { required: ['left', 'top', 'width', 'height', 'minValue', 'maxValue'], children: ['threshold', 'connections'], note: 'Value connection drives the needle; each <threshold> child marks one band.' },
  scale: { required: ['left', 'top', 'width', 'height'], note: 'Tick scale for a gauge or bar graph.' },
  listIndicator: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections'], note: 'Read-only list of states driven by a value.' },
  displayListSelector: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections'], note: 'Pick a display from a list; each <state> names one display.' },
  controlListSelector: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections'], note: 'Pick one of several controls to show; each <state> carries a caption.' },
  pilotedControlListSelector: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections'], note: 'Control list with a pilot column.' },
  recipePlusTable: { required: ['left', 'top', 'width', 'height'], note: 'RecipePlus table; the recipe name is an attribute, configured in Studio.' },
  recipePlusButton: { required: ['left', 'top', 'width', 'height'], children: ['caption', 'imageSettings'], note: 'Loads a RecipePlus recipe; the label is <caption>.' },
  recipePlusSelector: { required: ['left', 'top', 'width', 'height'], children: ['caption', 'imageSettings'], note: 'Choose a RecipePlus recipe.' },
  alarmList: { required: ['left', 'top', 'width', 'height'], children: ['connections', 'animations'], note: 'Alarm list object; the preview draws a placeholder.' },
  alarmStatusList: { required: ['left', 'top', 'width', 'height'], children: ['connections', 'animations'], note: 'Status line; the preview draws a placeholder.' },
  alarmBanner: { required: ['left', 'top', 'width', 'height'], children: ['connections', 'animations'], note: 'Banner; the preview draws a placeholder.' },
  clearAlarmBannerButton: { required: ['left', 'top', 'width', 'height'], note: 'Clears the banner at runtime.' },
  timeAndDateDisplay: { required: ['left', 'top', 'width', 'height'], note: 'Reads the controller or terminal clock; format attributes.' },
  activeX: { required: ['left', 'top', 'width', 'height', 'classId'], note: 'classId is the only attribute the schema declares mandatory. Placeholder in the preview.' },
  symbol: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections', 'animations'], note: 'Symbol instance; the symbol file is named by an attribute.' },
}
