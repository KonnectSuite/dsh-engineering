/**
 * The object catalog: what the open export actually contains, per type.
 *
 * The XSD says which attributes are legal; this says which ones this project
 * uses, how often, and with what values. That is the difference between an agent
 * guessing an attribute name and an agent reading the house pattern, and it
 * costs nothing: the objects are already parsed.
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
 * @param app - The scanned application.
 * @returns Types in descending usage, attributes in descending usage.
 */
export function observeObjects(app: CatalogSource): ObjectType[] {
  const types = new Map<string, Accumulator>()
  for (const display of app.displays) {
    for (const object of display.objects) {
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

/** Object types that behave like a control a person presses. */
export const BUTTON_TYPES = new Set(['momentaryButton', 'gotoButton', 'multistateButton', 'latchedButton', 'maintainButton', 'rampButton', 'clearAlarmBannerButton'])

/**
 * Every drawable element type a display can contain.
 *
 * The list is the drafting contract (34 types): `ftview_draft_object_add` refuses a type
 * outside it, and the preview draws a labelled placeholder for any of them it
 * does not render yet, so an agent never silently writes an element Studio will
 * reject or the viewer will drop.
 */
export const ELEMENT_TYPES: ReadonlySet<string> = new Set([
  'panel', 'group', 'text', 'rectangle', 'line', 'ellipse', 'arc', 'polygon', 'polyline', 'image',
  'momentaryButton', 'maintainButton', 'latchedButton', 'multistateButton', 'rampButton', 'gotoButton',
  'numericDisplay', 'numericInput', 'stringDisplay', 'stringInput',
  'barGraph', 'gauge', 'trend', 'listSelector', 'alarmList', 'alarmStatusList', 'alarmBanner',
  'clearAlarmBannerButton', 'recipe', 'activeX', 'symbol', 'referenceObject', 'globalObject', 'multistateIndicator',
])
/** The minimum an object of each family needs to be useful in Studio. */
export const TYPE_GUIDE: Readonly<Record<string, { required: readonly string[]; children?: readonly string[]; note: string }>> = {
  panel: { required: ['left', 'top', 'width', 'height'], note: 'Background surface; set backColor and borderStyle.' },
  group: { required: ['name'], note: 'Children are placed in absolute coordinates; animations/connections go inside.' },
  text: { required: ['left', 'top', 'width', 'height'], children: ['caption'], note: 'String content is the caption attribute or a <caption> child.' },
  rectangle: { required: ['left', 'top', 'width', 'height'], note: 'Shape; backColor/borderColor.' },
  ellipse: { required: ['left', 'top', 'width', 'height'], note: 'Shape; set shape="ellipse" on controls for round lamps.' },
  line: { required: ['left', 'top', 'width', 'height'], note: 'A line from the object box corner to the opposite corner.' },
  polygon: { required: ['left', 'top', 'width', 'height'], note: 'Points are relative to the object box.' },
  polyline: { required: ['left', 'top', 'width', 'height'], note: 'Points are relative to the object box.' },
  arc: { required: ['left', 'top', 'width', 'height'], note: 'Arc within the object box.' },
  image: { required: ['left', 'top', 'width', 'height', 'imageName'], note: 'imageName is the Image file stem, no extension (e.g. "Equilateral triangle").' },
  momentaryButton: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections', 'animations'], note: 'States carry captions and colours; connections carry Value.' },
  maintainButton: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections'], note: 'Same shape as momentaryButton.' },
  latchedButton: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections'], note: 'Same shape as momentaryButton.' },
  multistateButton: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections'], note: 'shape="circle" draws a round lamp; states are indexed by value.' },
  multistateIndicator: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections'], note: 'Read-only lamp/banner; triggerType="value" with per-state value.' },
  rampButton: { required: ['left', 'top', 'width', 'height'], children: ['states', 'connections'], note: 'Ramp control.' },
  gotoButton: { required: ['left', 'top', 'width', 'height', 'display'], children: ['states'], note: 'display is the target display name; navigation uses it.' },
  numericDisplay: { required: ['left', 'top', 'width', 'height'], children: ['connections', 'caption'], note: 'Value comes from the Value connection or the expression attribute.' },
  numericInput: { required: ['left', 'top', 'width', 'height'], children: ['connections'], note: 'Writes are configured in Studio; drafting stages appearance only.' },
  stringDisplay: { required: ['left', 'top', 'width', 'height'], children: ['connections'], note: 'String value.' },
  stringInput: { required: ['left', 'top', 'width', 'height'], children: ['connections'], note: 'String input; behaviour is configured in Studio.' },
  barGraph: { required: ['left', 'top', 'width', 'height', 'minValue', 'maxValue'], children: ['connections'], note: 'Value connection drives the fill; fillColor and fillDirection decide the look.' },
  gauge: { required: ['left', 'top', 'width', 'height', 'minValue', 'maxValue'], children: ['connections'], note: 'Value connection drives the needle.' },
  trend: { required: ['left', 'top', 'width', 'height'], note: 'Pens are configured in Studio; drafting stages the frame.' },
  listSelector: { required: ['left', 'top', 'width', 'height'], note: 'Items are configured in Studio.' },
  alarmList: { required: ['left', 'top', 'width', 'height'], note: 'Alarm display object; the preview draws a placeholder.' },
  alarmStatusList: { required: ['left', 'top', 'width', 'height'], note: 'Status line; the preview draws a placeholder.' },
  alarmBanner: { required: ['left', 'top', 'width', 'height'], note: 'Banner; the preview draws a placeholder.' },
  clearAlarmBannerButton: { required: ['left', 'top', 'width', 'height'], note: 'Clears the banner at runtime.' },
  recipe: { required: ['left', 'top', 'width', 'height'], note: 'Recipe object; configured in Studio.' },
  activeX: { required: ['left', 'top', 'width', 'height'], note: 'Placeholder in the preview.' },
  symbol: { required: ['left', 'top', 'width', 'height'], note: 'Symbol instance; configured in Studio.' },
  referenceObject: { required: ['left', 'top', 'width', 'height', 'linkBaseObject'], note: 'linkBaseObject is "<GlobalFile>.<ObjectName>"; local attributes override the base.' },
  globalObject: { required: ['left', 'top', 'width', 'height'], note: 'Global object placement.' },
}