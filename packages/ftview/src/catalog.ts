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
 * The list is the drafting contract (33 types): `ftview_draft_object_add` refuses a type
 * outside it, and the preview draws a labelled placeholder for any of them it
 * does not render yet, so an agent never silently writes an element Studio will
 * reject or the viewer will drop.
 */
export const ELEMENT_TYPES: ReadonlySet<string> = new Set([
  'panel', 'group', 'text', 'rectangle', 'line', 'ellipse', 'arc', 'polygon', 'polyline', 'image',
  'momentaryButton', 'maintainButton', 'latchedButton', 'multistateButton', 'rampButton', 'gotoButton',
  'numericDisplay', 'numericInput', 'stringDisplay', 'stringInput',
  'barGraph', 'gauge', 'trend', 'listSelector', 'alarmList', 'alarmStatusList', 'alarmBanner',
  'clearAlarmBannerButton', 'recipe', 'activeX', 'symbol', 'referenceObject', 'globalObject',
])