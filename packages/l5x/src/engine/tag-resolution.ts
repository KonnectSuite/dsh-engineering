/** Resolve Logix addresses against exported declarations, retaining array and alias evidence. */
import type { L5xDocument } from '../model/types.ts'
import { controllerElementOf } from '../model/parse.ts'
import { elementChildren, firstChild, type XmlElement } from '../model/xml.ts'

interface Declaration { readonly name: string; readonly scope: string; readonly type: string; readonly dimensions: readonly number[]; readonly alias?: string }

/** Resolution never certifies a dynamic subscript or a declaration absent from the export. */
export interface TagResolution {
  readonly symbol: string
  readonly scope: string
  readonly resolved: boolean
  readonly canonical?: string
  readonly data_type?: string
  readonly aliases: readonly string[]
  readonly indices_verified: boolean
  readonly reason?: string
}

const integerWidths: Readonly<Record<string, number>> = { SINT: 8, INT: 16, DINT: 32, LINT: 64 }
const builtins: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  TIMER: { EN: 'BOOL', TT: 'BOOL', DN: 'BOOL', PRE: 'DINT', ACC: 'DINT' },
  TIMER_T: { EN: 'BOOL', TT: 'BOOL', DN: 'BOOL', PRE: 'TIME', ACC: 'TIME' },
  COUNTER: { CU: 'BOOL', CD: 'BOOL', DN: 'BOOL', OV: 'BOOL', UN: 'BOOL', PRE: 'DINT', ACC: 'DINT' },
  STRING: { LEN: 'DINT', DATA: 'SINT' },
}
const declarations = new WeakMap<L5xDocument, ReadonlyMap<string, Declaration>>()
const key = (scope: string, name: string): string => `${scope.toLowerCase()}::${name.toLowerCase()}`
const dimensionsOf = (element: XmlElement): readonly number[] => {
  const value = element.attrs.Dimensions ?? element.attrs.Dimension ?? ''
  return value === '' || value === '0' ? [] : value.split(/[,\s]+/u).map(Number)
}

function tableOf(document: L5xDocument): ReadonlyMap<string, Declaration> {
  const cached = declarations.get(document)
  if (cached !== undefined) return cached
  const table = new Map<string, Declaration>()
  const add = (container: XmlElement | undefined, scope: string, family: string, child: string): void => {
    const entries = container === undefined ? undefined : firstChild(container, family)
    if (entries === undefined) return
    for (const element of elementChildren(entries, child)) {
      const name = element.attrs.Name ?? ''
      table.set(key(scope, name), { name, scope, type: element.attrs.DataType ?? '', dimensions: dimensionsOf(element), ...(element.attrs.AliasFor === undefined ? {} : { alias: element.attrs.AliasFor }) })
    }
  }
  const controller = controllerElementOf(document)
  add(controller, 'controller', 'Tags', 'Tag')
  const programs = firstChild(controller, 'Programs')
  if (programs !== undefined) for (const program of elementChildren(programs, 'Program')) add(program, program.attrs.Name ?? '', 'Tags', 'Tag')
  const aois = firstChild(controller, 'AddOnInstructionDefinitions')
  if (aois !== undefined) for (const aoi of elementChildren(aois, 'AddOnInstructionDefinition')) {
    const scope = `AOI::${aoi.attrs.Name ?? ''}`
    add(aoi, scope, 'Parameters', 'Parameter')
    add(aoi, scope, 'LocalTags', 'LocalTag')
  }
  declarations.set(document, table)
  return table
}

interface Segment { readonly name: string; readonly indices?: readonly string[] }
function segmentsOf(symbol: string): readonly Segment[] | undefined {
  const parts: string[] = []
  let start = 0
  let depth = 0
  for (let cursor = 0; cursor < symbol.length; cursor++) {
    if (symbol[cursor] === '[') depth++
    if (symbol[cursor] === ']') depth--
    if (depth < 0) return undefined
    if (symbol[cursor] === '.' && depth === 0) { parts.push(symbol.slice(start, cursor)); start = cursor + 1 }
  }
  if (depth !== 0) return undefined
  parts.push(symbol.slice(start))
  const result: Segment[] = []
  for (const part of parts) {
    const matched = /^([A-Za-z_][A-Za-z0-9_:]*|\d+)(?:\[([^\[\]]+)\])?$/u.exec(part)
    if (matched === null) return undefined
    result.push({ name: matched[1]!, ...(matched[2] === undefined ? {} : { indices: matched[2].split(',').map(value => value.trim()) }) })
  }
  return result
}

/** Resolve an address without discarding indices or assuming an absent member exists.
 * @param document - Export containing tag, AOI and UDT declarations.
 * @param scope - Program name, controller, or AOI::name.
 * @param symbol - Address, optionally qualified as Program:name.Tag.
 * @returns Resolution with canonical declaration spelling, final type, alias chain and unresolved reason.
 */
export function resolveTag(document: L5xDocument, scope: string, symbol: string): TagResolution {
  const table = tableOf(document)
  const aliases: string[] = []
  let indicesVerified = true
  const fail = (reason: string): TagResolution => ({ symbol, scope, resolved: false, aliases, indices_verified: indicesVerified, reason })
  let localScope = scope
  let address = symbol
  const qualified = /^Program:([A-Za-z_][A-Za-z0-9_]*)\.(.+)$/iu.exec(address)
  if (qualified !== null) { localScope = qualified[1]!; address = qualified[2]! }
  let segments = segmentsOf(address)
  if (segments === undefined || segments.length === 0) return fail('Malformed address')
  let declaration = table.get(key(localScope, segments[0]!.name))
  if (declaration === undefined && !localScope.startsWith('AOI::') && qualified === null) declaration = table.get(key('controller', segments[0]!.name))
  if (declaration === undefined) return fail('Declaration is absent from the export')
  const seen = new Set<string>()
  while (declaration.alias !== undefined) {
    const identity = key(declaration.scope, declaration.name)
    if (seen.has(identity)) return fail('Cyclic alias')
    seen.add(identity)
    aliases.push(`${declaration.scope}::${declaration.name}`)
    const targetQualification = /^Program:([A-Za-z_][A-Za-z0-9_]*)\.(.+)$/iu.exec(declaration.alias)
    const targetScope: string = targetQualification?.[1] ?? declaration.scope
    const target = segmentsOf(targetQualification?.[2] ?? declaration.alias)
    if (target === undefined) return fail('Malformed alias target')
    if (segments[0]!.indices !== undefined) return fail('Subscript on an alias requires explicit target verification')
    segments = [...target, ...segments.slice(1)]
    declaration = table.get(key(targetScope, target[0]!.name)) ?? (targetQualification === null ? table.get(key('controller', target[0]!.name)) : undefined)
    if (declaration === undefined) return fail('Alias target is absent from the export')
  }
  let dataType = declaration.type
  let dimensions = declaration.dimensions
  const canonical: string[] = []
  for (const [position, segment] of segments.entries()) {
    let name = declaration.name
    if (position > 0) {
      const previousType = dataType.toUpperCase()
      if (/^\d+$/u.test(segment.name)) {
        if (position !== segments.length - 1 || segment.indices !== undefined || Number(segment.name) >= (integerWidths[previousType] ?? 0)) return fail('Invalid integer bit address')
        name = segment.name; dataType = 'BOOL'; dimensions = []
      } else {
        const builtin = builtins[previousType]?.[segment.name.toUpperCase()]
        const udt = document.udts.find(entry => entry.name.toLowerCase() === dataType.toLowerCase())
        const member = udt?.members.find(entry => entry.name.toLowerCase() === segment.name.toLowerCase())
        const aoi = document.aois.find(entry => entry.name.toLowerCase() === dataType.toLowerCase())
        const parameter = aoi?.parameters.find(entry => entry.name.toLowerCase() === segment.name.toLowerCase())
        if (builtin === undefined && member === undefined && parameter === undefined) return fail(`Member ${segment.name} is absent from ${dataType}`)
        name = member?.name ?? parameter?.name ?? segment.name.toUpperCase()
        dataType = builtin ?? member?.dataType ?? parameter!.dataType
        dimensions = member?.dimension === undefined ? [] : [member.dimension]
        if (previousType === 'STRING' && name === 'DATA') dimensions = [82]
      }
    }
    if (segment.indices !== undefined) {
      if (segment.indices.length !== dimensions.length) return fail('Array rank does not match its declaration')
      for (const [index, value] of segment.indices.entries()) {
        if (/^\d+$/u.test(value)) {
          if (Number(value) >= dimensions[index]!) return fail('Array subscript is outside its declared bounds')
        } else {
          if (/^-\d+$/u.test(value)) return fail('Array subscript is negative')
          indicesVerified = false
        }
      }
      name += `[${segment.indices.join(',')}]`
    } else if (dimensions.length > 0 && position !== segments.length - 1) return fail('Array member requires a subscript')
    canonical.push(name)
  }
  return { symbol, scope, resolved: true, canonical: `${declaration.scope}::${canonical.join('.')}`, data_type: dataType, aliases, indices_verified: indicesVerified }
}
