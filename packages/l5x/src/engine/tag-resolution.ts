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
  /** Declared array dimensions when the resolved declaration is an array. */
  readonly dimensions?: readonly number[]
  /** Scopes that declare the base name when the requested scope does not. */
  readonly scopes?: readonly string[]
  /**
   * The name resolves to a declaration, but its type could not be read from the export — an
   * alias whose target the export does not carry. The name is still valid to write in a rung;
   * only the type claim is unverified.
   */
  readonly type_unverified?: boolean
}

/** Scopes that declare one base name, ignoring case, in table order. */
function scopesDeclaring(table: ReadonlyMap<string, Declaration>, name: string): readonly string[] {
  const found: string[] = []
  for (const declaration of table.values()) {
    if (declaration.name.toLowerCase() === name.toLowerCase()) found.push(declaration.scope)
  }
  return [...new Set(found)]
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
  // An I/O point tag is declared by the module that owns it, not in the controller's `<Tags>`
  // list, and Studio resolves it as a controller-scope tag. An alias tag (`TagType="Alias"`)
  // then names it in `AliasFor`, so reading only Controller/Tags made every alias to an I/O
  // point unresolvable and refused rungs that Studio accepts. Both shapes are read: the
  // attribute form (`<TagDefinition Tag=".." DataType=".."/>`, what a module emits) and the
  // container form (`<TagDefinition><Tag Name=".."/></TagDefinition>`).
  const modules = firstChild(controller, 'Modules')
  if (modules !== undefined) for (const module of elementChildren(modules, 'Module')) {
    for (const definition of elementChildren(module, 'TagDefinition')) {
      const direct = definition.attrs.Tag ?? definition.attrs.Name
      if (direct !== undefined && direct !== '') {
        table.set(key('controller', direct), { name: direct, scope: 'controller', type: definition.attrs.DataType ?? '', dimensions: dimensionsOf(definition) })
        continue
      }
      for (const element of elementChildren(definition, 'Tag')) {
        const name = element.attrs.Name ?? ''
        if (name === '') continue
        table.set(key('controller', name), { name, scope: 'controller', type: element.attrs.DataType ?? '', dimensions: dimensionsOf(element) })
      }
    }
  }
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

/**
 * The declared type of one member of a structure type, for a stage-2 tag a draft declared but the
 * export does not carry yet. Built-in structures, UDTs and AOI parameters are all consulted.
 *
 * @param document - The parsed project.
 * @param dataType - The structure type name.
 * @param member - The member name as written.
 * @returns The member type, or undefined when the type or member is not declared.
 */
export function memberType(document: L5xDocument, dataType: string, member: string): string | undefined {
  const builtin = builtins[dataType.toUpperCase()]?.[member.toUpperCase()]
  if (builtin !== undefined) return builtin
  const udt = document.udts.find(entry => entry.name.toLowerCase() === dataType.toLowerCase())
  const udtMember = udt?.members.find(entry => entry.name.toLowerCase() === member.toLowerCase())
  if (udtMember !== undefined) return udtMember.dataType
  const aoi = document.aois.find(entry => entry.name.toLowerCase() === dataType.toLowerCase())
  return aoi?.parameters.find(entry => entry.name.toLowerCase() === member.toLowerCase())?.dataType
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
  const failElsewhere = (reason: string, scopes: readonly string[]): TagResolution => ({ symbol, scope, resolved: false, aliases, indices_verified: indicesVerified, reason, scopes })
  let localScope = scope
  let address = symbol
  const qualified = /^Program:([A-Za-z_][A-Za-z0-9_]*)\.(.+)$/iu.exec(address)
  if (qualified !== null) { localScope = qualified[1]!; address = qualified[2]! }
  let segments = segmentsOf(address)
  if (segments === undefined || segments.length === 0) return fail('Malformed address')
  let declaration = table.get(key(localScope, segments[0]!.name))
  if (declaration === undefined && !localScope.startsWith('AOI::') && qualified === null) declaration = table.get(key('controller', segments[0]!.name))
  if (declaration === undefined) {
    // The name may be declared in another scope. Reporting "absent from the export" when it
    // is only absent from the requested scope sends a reader looking for a typo that is not
    // there, so name the scopes that do declare it.
    const elsewhere = scopesDeclaring(table, segments[0]!.name)
    if (elsewhere.length > 0) return failElsewhere('Declaration is not in scope ' + localScope + '; it is declared in ' + elsewhere.join(', '), elsewhere)
    return fail('Declaration is absent from the export')
  }
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
    const aliasOwner = declaration
    const found = table.get(key(targetScope, target[0]!.name)) ?? (targetQualification === null ? table.get(key('controller', target[0]!.name)) : undefined)
    if (found === undefined) {
      // The alias itself is declared; only its target is missing from this export — an I/O point
      // the export does not carry, or a tag owned by equipment that was not exported. Studio
      // accepts the alias name in a rung, so the name resolves and only the type is unverified:
      // refusing here blocked edits that the same file imports and builds without complaint.
      const declared = aliasOwner.type
      return {
        symbol,
        scope,
        resolved: true,
        canonical: `${aliasOwner.scope}::${aliasOwner.name}`,
        ...(declared === '' ? { type_unverified: true } : { data_type: declared }),
        aliases,
        indices_verified: false,
        reason: `Alias target ${aliasOwner.alias} is absent from the export`,
      }
    }
    declaration = found
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
        if (builtin === undefined && member === undefined && parameter === undefined) {
          // Two different refusals hide in here. When the plugin knows the type (a built-in
          // structure, a UDT or an AOI in this export) a member that is not in it is a real typo
          // and must be refused. An I/O image type — the type a module's `TagDefinition` names,
          // which is why an alias such as `DI_Gate_Fault` → `Local:1:I.Pt12.Data` walks into it —
          // is not declared in the export at all, so the member cannot be checked: Studio accepts
          // it, and refusing it blocked edits of a file that imports and builds unchanged.
          if (builtins[previousType] === undefined && udt === undefined && aoi === undefined) {
            return {
              symbol,
              scope,
              resolved: true,
              canonical: `${declaration.scope}::${[...canonical, ...segments.slice(position).map(entry => entry.name)].join('.')}`,
              type_unverified: true,
              aliases,
              indices_verified: false,
              reason: `Member ${segment.name} cannot be checked: type ${dataType} is not declared in this export`,
            }
          }
          return fail(`Member ${segment.name} is absent from ${dataType}`)
        }
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
  return { symbol, scope, resolved: true, canonical: `${declaration.scope}::${canonical.join('.')}`, data_type: dataType, aliases, indices_verified: indicesVerified, ...(dimensions.length === 0 ? {} : { dimensions }) }
}
