/**
 * Add-on-instruction reader.
 *
 * An AOI carries both its interface — parameters and local tags — and its
 * internal logic, and both are reported together because an instruction is only
 * usable when its pins and its behavior are known.
 */

import type { L5xAoiDefinition, L5xAoiInfo, L5xAoiLocalTag, L5xAoiParameter, L5xDocument, L5xRoutine } from './types.ts'
import { descriptionOf } from './module.ts'
import { elementChildren, firstChild, optionalAttribute, type XmlElement } from './xml.ts'
import { routineBody } from './routines.ts'

/**
 * List the add-on instructions the controller defines.
 *
 * @param document - The parsed project.
 * @returns One entry per instruction, in written order.
 */
export function listAois(document: L5xDocument): readonly L5xAoiInfo[] {
  return document.aois.map(aoi => ({ name: aoi.name, description: aoi.description, revision: aoi.revision, ...(aoi.safety === true ? { safety: true } : {}) }))
}

/**
 * Read every add-on instruction, with its interface and internal logic.
 *
 * @param document - The parsed project.
 * @returns One definition per instruction, in written order.
 */
export function getAois(document: L5xDocument): readonly L5xAoiDefinition[] {
  return document.aois
}

/**
 * Read one add-on instruction, with its interface and internal logic.
 *
 * @param document - The parsed project.
 * @param name - Instruction name.
 * @returns The definition, or undefined when the controller does not define
 * that instruction.
 */
export function getAoi(document: L5xDocument, name: string): L5xAoiDefinition | undefined {
  return document.aois.find(aoi => aoi.name === name)
}

/**
 * Read every add-on instruction definition of a controller.
 *
 * @param controller - The controller element.
 * @returns The definitions, in written order.
 */
export function buildAois(controller: XmlElement): readonly L5xAoiDefinition[] {
  return aoiElements(controller).map(aoi => ({
    name: optionalAttribute(aoi, 'Name', ''),
    description: descriptionOf(aoi),
    revision: optionalAttribute(aoi, 'Revision', ''),
    ...(optionalAttribute(aoi, 'Class', '') === 'Safety' ? { safety: true } : {}),
    ...(aoi.name === 'EncodedData' ? { protected: true } : {}),
    vendor: optionalAttribute(aoi, 'Vendor', ''),
    parameters: aoiParameters(aoi),
    localTags: aoiLocalTags(aoi),
    routines: aoiRoutines(aoi),
  }))
}

/** The `<AddOnInstructionDefinition>` elements, in written order. */
function aoiElements(controller: XmlElement): readonly XmlElement[] {
  const definitions = firstChild(controller, 'AddOnInstructionDefinitions')
  if (definitions === undefined) return []
  // A vendor or source-protected AOI is written as EncodedData with the type in an attribute. Missing
  // those made a production project report a declared ProSoft AOI as an uncatalogued instruction.
  const plain = elementChildren(definitions, 'AddOnInstructionDefinition')
  const encoded = elementChildren(definitions, 'EncodedData')
    .filter(element => optionalAttribute(element, 'EncodedType', '') === 'AddOnInstructionDefinition')
  return [...plain, ...encoded]
}

/** One instruction's parameters, in written order. */
function aoiParameters(aoi: XmlElement): readonly L5xAoiParameter[] {
  const parameters = firstChild(aoi, 'Parameters')
  if (parameters === undefined) return []
  const results: L5xAoiParameter[] = []
  for (const parameter of elementChildren(parameters, 'Parameter')) {
    const entry: {
      name: string
      dataType: string
      usage: string
      description?: string
      required?: boolean
      visible?: boolean
      tagType?: string
      aliasFor?: string
    } = {
      name: optionalAttribute(parameter, 'Name', ''),
      dataType: optionalAttribute(parameter, 'DataType', ''),
      usage: optionalAttribute(parameter, 'Usage', ''),
    }
    const description = descriptionOf(parameter)
    if (description !== '') entry.description = description
    if (parameter.attrs['Required'] === 'true') entry.required = true
    if (parameter.attrs['Visible'] === 'false') entry.visible = false
    const tagType = parameter.attrs['TagType']
    if (tagType !== undefined) entry.tagType = tagType
    // An alias parameter points into a tag array; without it the parameter looks self-contained.
    const aliasFor = parameter.attrs['AliasFor']
    if (aliasFor !== undefined) entry.aliasFor = aliasFor
    results.push(entry)
  }
  return results
}

/** One instruction's local tags, in written order. */
function aoiLocalTags(aoi: XmlElement): readonly L5xAoiLocalTag[] {
  const localTags = firstChild(aoi, 'LocalTags')
  if (localTags === undefined) return []
  const results: L5xAoiLocalTag[] = []
  for (const localTag of elementChildren(localTags, 'LocalTag')) {
    const entry: { name: string; dataType: string; description?: string } = {
      name: optionalAttribute(localTag, 'Name', ''),
      dataType: optionalAttribute(localTag, 'DataType', ''),
    }
    const description = descriptionOf(localTag)
    if (description !== '') entry.description = description
    results.push(entry)
  }
  return results
}

/** One instruction's internal routines with their bodies decoded. */
function aoiRoutines(aoi: XmlElement): readonly L5xRoutine[] {
  const name = optionalAttribute(aoi, 'Name', '')
  return rawAoiRoutines(aoi).map(routine => routineBody(name, routine))
}

/** One instruction's `<Routine>` elements, in written order. */
function rawAoiRoutines(aoi: XmlElement): readonly XmlElement[] {
  const routines = firstChild(aoi, 'Routines')
  return routines === undefined ? [] : elementChildren(routines, 'Routine')
}
