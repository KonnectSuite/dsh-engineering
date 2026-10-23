/**
 * Detail readers that the engineering tools need and the legacy byte-compatible
 * readers must not gain.
 *
 * The `l5x_*` tools mirror another server's JSON exactly, so a field added to
 * `L5xTag` would break that contract. These readers answer from the same parsed
 * document but are only used by the engineering tools: array dimensions, stored
 * initial values, alias targets, BIT backing members and the full data-type
 * table (which includes module-defined `AB:` types that `document.udts` omits).
 */

import type { L5xDocument, L5xTag, L5xUdt, L5xUdtMember } from '../model/types.ts'
import { controllerElementOf } from '../model/parse.ts'
import { descriptionOf, programElements } from '../model/module.ts'
import { elementChildren, firstChild, nodeText, presentAttribute, type XmlElement } from '../model/xml.ts'

/** One member as the export declares it, including BIT placement. */
export interface TypeMember {
  readonly name: string
  readonly dataType: string
  readonly dimension: number
  readonly target?: string
  readonly bitNumber?: number
}

/** Tag fields the legacy reader does not report. */
export interface TagDetail {
  readonly dimensions?: string
  readonly value?: string
  readonly aliasFor?: string
  readonly words?: number
}

/** Scalar types whose L5K data is a single readable literal. */
const SCALARS = new Set(['BOOL', 'SINT', 'INT', 'DINT', 'LINT', 'USINT', 'UINT', 'UDINT', 'ULINT', 'REAL', 'LREAL'])

const typeIndexes = new WeakMap<L5xDocument, ReadonlyMap<string, ReadonlyMap<string, TypeMember>>>()

/** Every data type the export declares, including module-defined families. */
export function typeIndex(document: L5xDocument): ReadonlyMap<string, ReadonlyMap<string, TypeMember>> {
  const cached = typeIndexes.get(document)
  if (cached !== undefined) return cached
  const index = new Map<string, Map<string, TypeMember>>()
  const dataTypes = firstChild(controllerElementOf(document), 'DataTypes')
  if (dataTypes !== undefined) {
    for (const type of elementChildren(dataTypes, 'DataType')) {
      const name = type.attrs['Name']?.toLowerCase()
      if (name === undefined || name === '') continue
      const members = new Map<string, TypeMember>()
      const declared = firstChild(type, 'Members')
      if (declared !== undefined) {
        for (const member of elementChildren(declared, 'Member')) {
          const memberName = member.attrs['Name']
          if (memberName === undefined || memberName === '') continue
          const bitNumber = member.attrs['BitNumber'] === undefined ? undefined : Number.parseInt(member.attrs['BitNumber'], 10)
          const target = presentAttribute(member, 'Target')
          members.set(memberName.toLowerCase(), {
            name: memberName,
            dataType: member.attrs['DataType'] ?? '',
            dimension: Number.parseInt(member.attrs['Dimension'] ?? '0', 10) || 0,
            ...(bitNumber === undefined || !Number.isFinite(bitNumber) ? {} : { bitNumber }),
            ...(target === undefined ? {} : { target }),
          })
        }
      }
      index.set(name, members)
    }
  }
  typeIndexes.set(document, index)
  return index
}

/** One declared type's member table, by case-insensitive name. */
export function membersOf(document: L5xDocument, typeName: string): ReadonlyMap<string, TypeMember> | undefined {
  return typeIndex(document).get(typeName.toLowerCase())
}

/** One member of a declared type. */
export function memberOf(document: L5xDocument, typeName: string, memberName: string): TypeMember | undefined {
  return membersOf(document, typeName)?.get(memberName.toLowerCase())
}

/** Every tag element of the controller or one program, in written order. */
function tagElements(container: XmlElement): readonly XmlElement[] {
  const tags = firstChild(container, 'Tags')
  return tags === undefined ? [] : elementChildren(tags, 'Tag')
}

/** The exact `<Tag>` element for a scope and name. */
export function tagElement(document: L5xDocument, scope: string, name: string): XmlElement | undefined {
  const controller = controllerElementOf(document)
  const match = (element: XmlElement): boolean => element.attrs['Name']?.toLowerCase() === name.toLowerCase()
  if (scope.toLowerCase() === 'controller') return tagElements(controller).find(match)
  const program = programElements(controller).find(entry => (entry.attrs['Name'] ?? '').toLowerCase() === scope.toLowerCase())
  return program === undefined ? undefined : tagElements(program).find(match)
}

/** Dimensions, stored initial value and alias target of one tag. */
export function tagDetail(document: L5xDocument, tag: L5xTag): TagDetail {
  const element = tagElement(document, tag.scope, tag.name)
  if (element === undefined) return {}
  const dimensions = presentAttribute(element, 'Dimensions')
  const aliasFor = presentAttribute(element, 'AliasFor')
  const detail: { dimensions?: string; aliasFor?: string; value?: string; words?: number } = {}
  if (dimensions !== undefined) {
    detail.dimensions = dimensions
    const words = dimensions.split(/\s+/u).reduce((product, part) => product * (Number.parseInt(part, 10) || 1), 1)
    if (Number.isFinite(words)) detail.words = words
  }
  if (aliasFor !== undefined) detail.aliasFor = aliasFor
  if (aliasFor === undefined && dimensions === undefined && SCALARS.has(tag.dataType.toUpperCase())) {
    const data = elementChildren(element, 'Data').find(entry => (entry.attrs['Format'] ?? '').toUpperCase() === 'L5K')
      ?? elementChildren(element, 'Data')[0]
    const text = data === undefined ? undefined : nodeText(data)
    if (text !== undefined) detail.value = text.trim()
  }
  return detail
}

/** One UDT's visible members with BIT placement and array length. */
export function udtDetail(document: L5xDocument, name: string): L5xUdt | undefined {
  const dataTypes = firstChild(controllerElementOf(document), 'DataTypes')
  if (dataTypes === undefined) return undefined
  const type = elementChildren(dataTypes, 'DataType').find(entry => entry.attrs['Name'] === name)
  if (type === undefined) return undefined
  const declared = firstChild(type, 'Members')
  const members: L5xUdtMember[] = []
  if (declared !== undefined) {
    for (const member of elementChildren(declared, 'Member')) {
      if (member.attrs['Hidden'] === 'true') continue
      const dimension = Number.parseInt(member.attrs['Dimension'] ?? '0', 10)
      const description = descriptionOf(member)
      const radix = presentAttribute(member, 'Radix')
      const target = presentAttribute(member, 'Target')
      const bitNumber = member.attrs['BitNumber'] === undefined ? undefined : Number.parseInt(member.attrs['BitNumber'], 10)
      members.push({
        name: member.attrs['Name'] ?? '',
        dataType: member.attrs['DataType'] ?? '',
        ...(dimension > 0 ? { dimension } : {}),
        ...(description === '' ? {} : { description }),
        ...(radix === undefined ? {} : { radix }),
        ...(target === undefined ? {} : { target }),
        ...(bitNumber === undefined || !Number.isFinite(bitNumber) ? {} : { bitNumber }),
      })
    }
  }
  return { name: type.attrs['Name'] ?? name, description: descriptionOf(type), members }
}

/** Whether one declared type reaches another through nested members. */
function reaches(document: L5xDocument, from: string, target: string, seen: Set<string>): boolean {
  const key = from.toLowerCase()
  if (key === target.toLowerCase()) return true
  if (seen.has(key)) return false
  seen.add(key)
  const members = membersOf(document, from)
  if (members === undefined) return false
  for (const member of members.values()) {
    if (reaches(document, member.dataType, target, seen)) return true
  }
  return false
}

/**
 * Every tag, AOI parameter and AOI local tag whose type tree contains the type.
 *
 * A UDT change rewrites the serialized data of every instance, including
 * instances of types that nest it, so the whole-project change set only accepts
 * a member change when this list is empty.
 */
export function typeInstances(document: L5xDocument, typeName: string): readonly string[] {
  const instances: string[] = []
  for (const tag of document.tags) {
    if (reaches(document, tag.dataType, typeName, new Set())) instances.push(`${tag.scope}::${tag.name}`)
  }
  for (const aoi of document.aois) {
    for (const parameter of aoi.parameters) {
      if (reaches(document, parameter.dataType, typeName, new Set())) instances.push(`AOI::${aoi.name}.${parameter.name}`)
    }
    for (const tag of aoi.localTags) {
      if (reaches(document, tag.dataType, typeName, new Set())) instances.push(`AOI::${aoi.name}.${tag.name}`)
    }
  }
  return instances
}
