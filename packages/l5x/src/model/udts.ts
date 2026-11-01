/**
 * User-defined-type reader.
 *
 * Only types the export keeps in the `NoFamily` family are user-defined; the
 * remaining entries in `DataTypes` are the built-in types Studio 5000 writes
 * out alongside them, and reporting those as UDTs would bury the real ones.
 * Hidden members are omitted because the export marks them as preprocessor
 * bookkeeping rather than part of the interface.
 */

import type { L5xDocument, L5xUdt, L5xUdtMember } from './types.ts'
import { descriptionOf } from './module.ts'
import { elementChildren, firstChild, optionalAttribute, presentAttribute, type XmlElement } from './xml.ts'

/** The family value that marks a data type as user-defined. */
const NO_FAMILY = 'NoFamily'

/**
 * List every user-defined type's name.
 *
 * @param document - The parsed project.
 * @returns Type names, in written order.
 */
export function listUdtNames(document: L5xDocument): readonly string[] {
  return document.udts.map(udt => udt.name)
}

/**
 * Read user-defined types with their visible members.
 *
 * @param document - The parsed project.
 * @param name - Type name to restrict to; empty or omitted returns every type.
 * @returns Matching types, in written order. An unknown name yields an empty
 * list rather than an error, matching the reference reader.
 */
export function getUdt(document: L5xDocument, name = ''): readonly L5xUdt[] {
  if (name === '') return document.udts
  return document.udts.filter(udt => udt.name === name)
}

/**
 * Read every user-defined type of a controller.
 *
 * @param controller - The controller element.
 * @returns The types, in written order, each with its visible members.
 */
/** Names of the data types the vendor owns: every family other than the user one. */
export function vendorTypeNames(controller: XmlElement): readonly string[] {
  const dataTypes = firstChild(controller, 'DataTypes')
  if (dataTypes === undefined) return []
  return elementChildren(dataTypes, 'DataType')
    .filter(type => type.attrs['Family'] !== undefined && type.attrs['Family'] !== NO_FAMILY)
    .map(type => optionalAttribute(type, 'Name', ''))
}

export function buildUdts(controller: XmlElement): readonly L5xUdt[] {
  return udtElements(controller).map(udt => ({
    name: optionalAttribute(udt, 'Name', ''),
    description: descriptionOf(udt),
    members: udtMembers(udt),
  }))
}

/** The `<DataType>` elements the export keeps in the user-defined family. */
function udtElements(controller: XmlElement): readonly XmlElement[] {
  const dataTypes = firstChild(controller, 'DataTypes')
  if (dataTypes === undefined) return []
  return elementChildren(dataTypes, 'DataType').filter(udt => udt.attrs['Family'] === NO_FAMILY)
}

/** One type's visible members, in written order. */
function udtMembers(udt: XmlElement): readonly L5xUdtMember[] {
  const members = firstChild(udt, 'Members')
  if (members === undefined) return []
  const results: L5xUdtMember[] = []
  for (const member of elementChildren(members, 'Member')) {
    if (member.attrs['Hidden'] === 'true') continue
    const entry: {
      name: string
      dataType: string
      dimension?: number
      description?: string
      radix?: string
    } = {
      name: optionalAttribute(member, 'Name', ''),
      dataType: optionalAttribute(member, 'DataType', ''),
    }
    const dimension = optionalAttribute(member, 'Dimension', '0')
    if (dimension !== '0') entry.dimension = Number.parseInt(dimension, 10)
    const description = descriptionOf(member)
    if (description !== '') entry.description = description
    const radix = presentAttribute(member, 'Radix')
    if (radix !== undefined) entry.radix = radix
    results.push(entry)
  }
  return results
}
