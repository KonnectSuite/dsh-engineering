import type { L5xDocument, L5xTag } from '../model/types.ts'
import { controllerElementOf } from '../model/parse.ts'
import { elementChildren, firstChild, type XmlElement } from '../model/xml.ts'

function tagEntries(container: XmlElement | undefined, scope: string): Array<{ tag: string; scope: string; aliasFor: string }> {
  const tags = container === undefined ? undefined : firstChild(container, 'Tags')
  if (tags === undefined) return []
  return elementChildren(tags, 'Tag').flatMap(tag => tag.attrs['AliasFor'] === undefined ? [] : [{ tag: tag.attrs['Name'] ?? '', scope, aliasFor: tag.attrs['AliasFor'] }])
}

export function aliasesOf(document: L5xDocument): ReadonlyMap<string, string> {
  const controller = controllerElementOf(document)
  const rows = tagEntries(controller, 'controller')
  const programs = firstChild(controller, 'Programs')
  if (programs !== undefined) for (const program of elementChildren(programs, 'Program')) rows.push(...tagEntries(program, program.attrs['Name'] ?? ''))
  return new Map(rows.map(row => [`${row.scope}::${row.tag}`, row.aliasFor]))
}

export function engineeringTags(document: L5xDocument): readonly (L5xTag & { readonly aliasFor?: string })[] {
  const aliases = aliasesOf(document)
  return document.tags.map(tag => {
    const aliasFor = aliases.get(`${tag.scope}::${tag.name}`)
    // Studio writes the defaults it applied on import (radix, Read/Write) while a hand-written
    // export omits them. Compare effective values, or every round trip reports the defaults.
    const radix = tag.radix ?? defaultRadix(tag.dataType)
    const externalAccess = tag.externalAccess ?? 'Read/Write'
    return aliasFor === undefined ? { ...tag, radix, externalAccess } : { ...tag, radix, externalAccess, aliasFor }
  })
}

/** The radix Studio exports for a type when the tag does not state one. */
function defaultRadix(dataType: string): string {
  const type = dataType.toUpperCase()
  if (type === 'REAL' || type === 'LREAL') return 'Float'
  if (['SINT', 'INT', 'DINT', 'LINT', 'USINT', 'UINT', 'UDINT', 'ULINT', 'BOOL'].includes(type)) return 'Decimal'
  return 'NullType'
}

/** Module attributes and every port, excluding runtime data values and export formatting. */
export function moduleConfigurations(document: L5xDocument) {
  const controller = controllerElementOf(document)
  const modules = firstChild(controller, 'Modules')
  if (modules === undefined) return []
  return elementChildren(modules, 'Module').map(module => {
    const ports = firstChild(module, 'Ports')
    return {
      name: module.attrs['Name'] ?? '', catalogNumber: module.attrs['CatalogNumber'] ?? '',
      parentModule: module.attrs['ParentModule'] ?? '', parentPortId: module.attrs['ParentModPortId'] ?? '',
      major: module.attrs['Major'] ?? '', minor: module.attrs['Minor'] ?? '', inhibited: module.attrs['Inhibited'] ?? '',
      ports: ports === undefined ? [] : elementChildren(ports, 'Port').map(port => ({
        id: port.attrs['Id'] ?? '', address: port.attrs['Address'] ?? '', type: port.attrs['Type'] ?? '', upstream: port.attrs['Upstream'] ?? '',
      })),
    }
  })
}
