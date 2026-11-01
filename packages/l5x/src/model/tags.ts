/**
 * Tag reader — controller-scoped and program-scoped tags, with the scope and
 * data-type filters the tool schema declares.
 *
 * Scope is carried on every entry rather than implied by grouping, because one
 * flat list answers both "what does the controller own" and "what does this
 * program own" without the caller re-nesting it.
 */

import type { L5xDocument, L5xTag } from './types.ts'
import { controllerElementOf } from './parse.ts'
import { descriptionOf, programElements } from './module.ts'
import { elementChildren, firstChild, optionalAttribute, presentAttribute, type XmlElement } from './xml.ts'

/** The scope name the controller's own tags report. */
const CONTROLLER_SCOPE = 'controller'

/**
 * List tags, filtered by scope and data type.
 *
 * A scope of `controller` selects only the controller's tags; any other
 * non-empty scope selects only that program's; an empty scope selects both, with
 * the controller's first. The scope match is exact and case-sensitive except for
 * the literal `controller`, which is matched case-insensitively so `Controller`
 * from a caller still selects the controller's tags.
 *
 * @param document - The parsed project.
 * @param scope - `controller`, a program name, or empty for all.
 * @param dataType - Data type to restrict to; empty keeps every type.
 * @returns Matching tags, in written order.
 */
export function listTags(document: L5xDocument, scope = '', dataType = ''): readonly L5xTag[] {
  const tags = selectScope(buildTags(controllerElementOf(document)), scope)
  if (dataType === '') return tags
  return tags.filter(tag => tag.dataType === dataType)
}

/**
 * The tags one scope selects.
 *
 * A scope of `controller` selects only the controller's tags; any other
 * non-empty scope selects only that program's; an empty scope selects both. The
 * scope match is exact and case-sensitive except for the literal `controller`,
 * which is matched case-insensitively so `Controller` from a caller still
 * selects the controller's tags.
 *
 * @param tags - Every tag of the project.
 * @param scope - `controller`, a program name, or empty for all.
 * @returns The matching tags, in their original order.
 */
function selectScope(tags: readonly L5xTag[], scope: string): readonly L5xTag[] {
  if (scope === '') return tags
  if (scope.toLowerCase() === CONTROLLER_SCOPE) return tags.filter(tag => tag.scope === CONTROLLER_SCOPE)
  return tags.filter(tag => tag.scope === scope)
}

/**
 * Find one tag by name, searching controller scope first and then each program.
 *
 * @param document - The parsed project.
 * @param tagName - Tag name to find.
 * @returns The tag, or undefined when no scope declares it.
 */
export function findTag(document: L5xDocument, tagName: string): L5xTag | undefined {
  return buildTags(controllerElementOf(document)).find(tag => tag.name === tagName)
}

/**
 * Read every tag of a controller's scopes.
 *
 * @param controller - The controller element.
 * @returns The controller's tags first, then each program's, in written order.
 */
export function buildTags(controller: XmlElement): readonly L5xTag[] {
  const results: L5xTag[] = []
  for (const tag of controllerTags(controller)) results.push(parseTag(tag, CONTROLLER_SCOPE))
  for (const program of programElements(controller)) {
    const programName = optionalAttribute(program, 'Name', '')
    for (const tag of programTags(program)) results.push(parseTag(tag, programName))
  }
  return results
}

/** The controller's `<Tag>` elements, in written order. */
function controllerTags(controller: XmlElement): readonly XmlElement[] {
  const tags = firstChild(controller, 'Tags')
  return tags === undefined ? [] : elementChildren(tags, 'Tag')
}

/** One program's `<Tag>` elements, in written order. */
function programTags(program: XmlElement): readonly XmlElement[] {
  const tags = firstChild(program, 'Tags')
  return tags === undefined ? [] : elementChildren(tags, 'Tag')
}

/**
 * One tag entry.
 *
 * Only the fields the export actually declares are emitted, so a caller can
 * tell "declared as false" (`constant` absent) from "declared true".
 *
 * @param tag - The `<Tag>` element.
 * @param scope - The owning scope's name.
 * @returns The tag entry.
 */
export function parseTag(tag: XmlElement, scope: string): L5xTag {
  const entry: {
    name: string
    dataType: string
    scope: string
    description?: string
    radix?: string
    constant?: boolean
    externalAccess?: string
    dimensions?: readonly number[]
  } = {
    name: optionalAttribute(tag, 'Name', ''),
    dataType: optionalAttribute(tag, 'DataType', ''),
    scope,
  }
  const description = descriptionOf(tag)
  if (description !== '') entry.description = description
  const radix = presentAttribute(tag, 'Radix')
  if (radix !== undefined) entry.radix = radix
  if (tag.attrs['Constant'] === 'true') entry.constant = true
  const externalAccess = presentAttribute(tag, 'ExternalAccess')
  if (externalAccess !== undefined) entry.externalAccess = externalAccess
  const dimensions = presentAttribute(tag, 'Dimensions')
  if (dimensions !== undefined) {
    const parsed = dimensions.trim().split(/\s+/u).map(Number).filter(value => Number.isFinite(value) && value > 0)
    if (parsed.length > 0) entry.dimensions = parsed
  }
  return entry
}
