/**
 * Read the display vocabulary out of the vendor schema.
 *
 * Studio ships `Gfx-ME*.xsd` beside the application and validates every display
 * against it, so the schema — not a hand-kept list — is what says which object
 * types exist, which attributes each one takes, and which values are legal. A
 * list kept by hand drifts: the one this component used offered eight element
 * names no ME schema declares and refused sixty-five real ones, so an agent
 * could only discover that at import time, in Studio.
 *
 * Resolving an XSD needs four things a naive walk misses, each proved against
 * the installed Gfx-ME16.xsd and against 74 vendor-authored displays:
 *
 *   - the object elements are declared INLINE in the `gfx` root's anonymous
 *     complexType, not as top-level elements, so a top-level element map finds
 *     only `gfx` itself;
 *   - `use="required"` on an attribute **reference** overrides the global
 *     declaration (`<xs:attribute ref="classId" use="required"/>` on `activeX`);
 *   - `attributeGroup` references and global attribute references carry most of
 *     the attribute set (fonts, borders, gradients, touch margins, references);
 *   - content models nest containers (`groupType` is a `choice` inside a
 *     `sequence`), so children must be read by descending, not one level deep.
 *
 * The result is a plain, JSON-serialisable model: the drafting tools check an
 * attribute name or an enumerated value against it before the draft is written,
 * and `scripts/sync-ftview-schema.ts` writes it beside the payload so a machine
 * without Studio still has a vocabulary to draft against.
 *
 * @module dsh-engineering-ftview/xsd
 */

import { XMLParser } from 'fast-xml-parser'

/** One attribute as the schema declares it for one type. */
export interface SchemaAttribute {
  /** True when the schema requires it (including through an attribute ref). */
  readonly required: boolean
  /** Declared type name, when the schema names one. */
  readonly type?: string
  /** Legal values, when the type is an enumeration or a union that names some. */
  readonly values?: readonly string[]
  /** Regular expressions the type allows a value to match instead of naming it. */
  readonly patterns?: readonly string[]
  /** Lowest value the type allows, when its restriction says so. */
  readonly min?: number
  /** Highest value the type allows, when its restriction says so. */
  readonly max?: number
  /** The schema's own default, when it declares one. */
  readonly default?: string
}

/** One complex type as the schema declares it, with its base chain merged. */
export interface SchemaType {
  /** The type it extends, when it does. */
  readonly base?: string
  /** Attribute name → declaration. */
  readonly attributes: Readonly<Record<string, SchemaAttribute>>
  /** Child element names the schema allows inside it. */
  readonly children: readonly string[]
  /** Child element name → the type that declares it, for the children that have one. */
  readonly childTypes: Readonly<Record<string, string>>
  /**
   * Child elements the schema requires here. XSD defaults `minOccurs` to 1, so a
   * declaration without it is required; the vendor marks the optional ones with
   * `minOccurs="0"`, and a member of a `<choice>` is only written when that
   * branch is taken, so a choice never makes a child required.
   */
  readonly requiredChildren: readonly string[]
}

/** One resolved display schema. */
export interface SchemaModel {
  /** Schema file name, e.g. `Gfx-ME16.xsd`. */
  readonly schema: string
  /** The version number taken from that name. */
  readonly version: number
  /** The object element names a display may contain, as the schema declares them. */
  readonly displayChildren: readonly string[]
  /** Display element name → the complex type that declares it. */
  readonly elements: Readonly<Record<string, string>>
  /** Type name → declaration, for every type the schema names. */
  readonly types: Readonly<Record<string, SchemaType>>
  /** Child element names that are parts of an object, not objects themselves. */
  readonly parts: readonly string[]
}

/** The snapshot written beside the payload for a host with no Studio. */
export interface SchemaSnapshot extends SchemaModel {
  /** Where the schema it was read from came from. */
  readonly source: { readonly file: string; readonly bytes: number; readonly sha256: string }
  /** What the model does not settle. */
  readonly coverage: string
  /** When it was generated. */
  readonly generated: string
}

/** Parser options shared by the resolver and the maintenance script. */
const PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  isArray: name => ['element', 'attribute', 'attributeGroup', 'enumeration', 'complexType', 'simpleType', 'sequence', 'choice', 'all', 'extension', 'complexContent'].includes(name),
})

/** Treat one parsed node as a list without the caller spelling out `Array.isArray`. */
function asList(value: unknown): Record<string, unknown>[] {
  if (value === undefined || value === null) return []
  return (Array.isArray(value) ? value : [value]) as Record<string, unknown>[]
}

/** An attribute or element name, with any namespace prefix removed. */
function nameOf(node: Record<string, unknown>): string | undefined {
  const name = node['@_name'] ?? node['@_ref']
  return typeof name === 'string' ? name.split(':').pop() : undefined
}

/** The literal values, patterns and numeric bounds one type node allows, unwrapped from its restriction or union. */
function domainOf(node: unknown): { values: string[]; patterns: string[]; min?: number; max?: number } {
  const values: string[] = []
  const patterns: string[] = []
  let min: number | undefined
  let max: number | undefined
  const eat = (restriction: Record<string, unknown>): void => {
    for (const entry of asList(restriction.enumeration)) {
      const value = entry['@_value']
      if (typeof value === 'string') values.push(value)
    }
    for (const entry of asList(restriction.pattern)) {
      const value = entry['@_value']
      if (typeof value === 'string' && !patterns.includes(value)) patterns.push(value)
    }
    for (const entry of asList(restriction.minInclusive)) {
      const bound = Number(entry['@_value'])
      if (Number.isFinite(bound)) min = min === undefined ? bound : Math.max(min, bound)
    }
    for (const entry of asList(restriction.maxInclusive)) {
      const bound = Number(entry['@_value'])
      if (Number.isFinite(bound)) max = max === undefined ? bound : Math.min(max, bound)
    }
  }
  // A type restricts directly, is a union of inline members, or nests both:
  // `stateId1Type` is a union of an `Error` enumeration and a byte capped at 1,
  // and `colorType` is a union of a `#rrggbb` pattern and 147 named colours —
  // the vendor writes both forms, so a domain that dropped the pattern would
  // refuse every hex colour in a Rockwell-authored display.
  const walk = (current: Record<string, unknown> | undefined, depth: number): void => {
    if (current === undefined || depth > 4) return
    for (const restriction of asList(current.restriction)) eat(restriction as Record<string, unknown>)
    for (const union of asList(current.union)) walk(union as Record<string, unknown>, depth + 1)
    for (const member of asList(current.simpleType)) walk(member as Record<string, unknown>, depth + 1)
  }
  // The parser is told to list every `simpleType`, so an inline type on an
  // attribute arrives as a one-element array rather than the node itself; both
  // shapes have to reach the walk or an inline restriction is silently lost.
  for (const entry of asList(node)) walk(entry, 0)
  return { values, patterns, ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) }
}

/** The content body of a complex type: its extension when it has one, itself otherwise. */
function bodyOf(type: Record<string, unknown>): Record<string, unknown> {
  const complexContent = asList(type.complexContent)[0] as Record<string, unknown> | undefined
  const extension = complexContent === undefined ? undefined : (asList(complexContent.extension)[0] as Record<string, unknown> | undefined)
  return extension ?? type
}

/**
 * Resolve one XSD into the vocabulary the drafting tools check against.
 *
 * @param fileName - Schema file name, used for the version and the report.
 * @param xml - The schema text.
 * @returns The resolved model: display children, per-type attributes and children, parts.
 */
export function parseSchemaModel(fileName: string, xml: string): SchemaModel {
  // The document's root element is `schema`; the parser nests its content under it.
  const schema = (PARSER.parse(xml) as Record<string, unknown>).schema as Record<string, unknown>

  const namedDomains = new Map<string, { values: string[]; patterns: string[]; min?: number; max?: number }>()
  for (const simpleType of asList(schema.simpleType)) {
    const name = nameOf(simpleType)
    if (name !== undefined) namedDomains.set(name, domainOf(simpleType))
  }
  /** One attribute declaration as written: its own type, its inline restriction, its default. */
  const declarationOf = (attribute: Record<string, unknown>): SchemaAttribute => {
    const typeName = typeof attribute['@_type'] === 'string' ? (attribute['@_type'] as string).split(':').pop() : undefined
    const inline = domainOf(attribute.simpleType)
    const named = typeName === undefined ? undefined : namedDomains.get(typeName)
    const values = inline.values.length > 0 ? inline.values : (named?.values ?? [])
    const patterns = inline.patterns.length > 0 ? inline.patterns : (named?.patterns ?? [])
    const min = inline.min ?? named?.min
    const max = inline.max ?? named?.max
    return {
      required: attribute['@_use'] === 'required',
      ...(typeName === undefined ? {} : { type: typeName }),
      ...(values.length > 0 ? { values } : {}),
      ...(patterns.length > 0 ? { patterns } : {}),
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
      ...(typeof attribute['@_default'] === 'string' ? { default: attribute['@_default'] as string } : {}),
    }
  }
  const globals = new Map<string, SchemaAttribute>()
  for (const attribute of asList(schema.attribute)) {
    const name = nameOf(attribute)
    if (name === undefined || attribute['@_name'] === undefined) continue
    globals.set(name, declarationOf(attribute))
  }
  const groups = new Map<string, readonly string[]>()
  for (const group of asList(schema.attributeGroup)) {
    const name = nameOf(group)
    if (name !== undefined) groups.set(name, asList(group.attribute).map(entry => nameOf(entry) ?? '').filter(entry => entry !== ''))
  }

  /** Attributes of one content body: own declarations, global refs, and group refs. */
  const attributesOf = (body: Record<string, unknown>): Record<string, SchemaAttribute> => {
    const out: Record<string, SchemaAttribute> = {}
    for (const attribute of asList(body.attribute)) {
      if (attribute['@_name'] !== undefined) {
        const name = nameOf(attribute)
        if (name === undefined) continue
        out[name] = declarationOf(attribute)
      } else if (attribute['@_ref'] !== undefined) {
        // A ref carries its own `use`, and that overrides the global declaration:
        // activeX's `ref="classId" use="required"` is what makes classId required.
        const name = nameOf(attribute)
        if (name === undefined) continue
        const declared = globals.get(name) ?? { required: false }
        out[name] = { ...declared, required: declared.required || attribute['@_use'] === 'required' }
      }
    }
    for (const group of asList(body.attributeGroup)) {
      for (const member of groups.get(nameOf(group) ?? '') ?? []) {
        const declared = globals.get(member) ?? { required: false }
        const existing = out[member]
        out[member] = { ...declared, required: declared.required || existing?.required === true }
      }
    }
    return out
  }

  /**
   * Child element declarations under one node, descending nested containers.
   *
   * `optional` carries what the container allows: XSD defaults `minOccurs` to 1,
   * so the vendor's own `minOccurs="0"` is what marks a child optional, and a
   * `<choice>` member is only written when that branch is taken, so nothing
   * inside a choice is required. `polyPolygon` is the case this matters for: its
   * `innerPolygon` carries no `minOccurs`, so an object without it is incomplete
   * content the vendor validator refuses, and the tool had no way to write it.
   */
  const childrenOf = (
    node: Record<string, unknown> | undefined,
    optional = false,
  ): { name: string; type?: string; required: boolean }[] => {
    if (node === undefined) return []
    const found: { name: string; type?: string; required: boolean }[] = []
    for (const element of asList(node.element)) {
      const name = nameOf(element)
      if (name === undefined) continue
      const typeName = (element['@_type'] as string | undefined)?.split(':').pop()
      found.push({
        name,
        ...(typeName === undefined ? {} : { type: typeName }),
        required: !optional && element['@_minOccurs'] !== '0',
      })
    }
    for (const container of ['sequence', 'all'] as const) {
      for (const inner of asList(node[container])) found.push(...childrenOf(inner, optional || inner['@_minOccurs'] === '0'))
    }
    for (const inner of asList(node.choice)) found.push(...childrenOf(inner, true))
    return found
  }

  const complexTypes = new Map<string, Record<string, unknown>>()
  for (const type of asList(schema.complexType)) {
    const name = nameOf(type)
    if (name !== undefined) complexTypes.set(name, type)
  }

  /** Resolve one complex type, merging its base chain and guarding cycles. */
  const resolveType = (typeName: string, seen: Set<string>): SchemaType => {
    const declared = complexTypes.get(typeName)
    if (declared === undefined || seen.has(typeName)) return { attributes: {}, children: [], childTypes: {}, requiredChildren: [] }
    seen.add(typeName)
    const body = bodyOf(declared)
    const own = attributesOf(body)
    const found = childrenOf(body)
    const children = found.map(entry => entry.name)
    // The type behind each child is what makes the chain readable from an object
    // to its parts: momentaryButton → states → state → the stateId domain.
    const childTypes: Record<string, string> = {}
    for (const entry of found) if (entry.type !== undefined) childTypes[entry.name] = entry.type
    const baseValue = (body['@_base'] as string | undefined)?.split(':').pop()
    if (baseValue === undefined) {
      return { attributes: own, children, childTypes, requiredChildren: found.filter(entry => entry.required).map(entry => entry.name) }
    }
    const parent = resolveType(baseValue, seen)
    // A derived type may re-declare a base child as optional, so the requirement
    // is merged per name rather than concatenated.
    const required = new Map<string, boolean>()
    for (const name of parent.children) required.set(name, parent.requiredChildren.includes(name))
    for (const entry of found) required.set(entry.name, entry.required)
    return {
      base: baseValue,
      attributes: { ...parent.attributes, ...own },
      children: [...parent.children, ...children],
      childTypes: { ...parent.childTypes, ...childTypes },
      requiredChildren: [...required].filter(([, value]) => value).map(([name]) => name),
    }
  }

  // The display object elements are declared inline in the root element's own
  // anonymous complexType, so the vocabulary is read there, not from a map of
  // top-level elements (which holds only `gfx`).
  const rootElement = asList(schema.element).find(entry => nameOf(entry) === 'gfx')
  const rootBody = rootElement === undefined ? undefined : bodyOf(asList(rootElement.complexType)[0] as Record<string, unknown>)
  const displayNames: string[] = []
  const elementTypes = new Map<string, string>()
  for (const element of childrenOfDeclarations(rootBody)) {
    const name = nameOf(element)
    const typeName = (element['@_type'] as string | undefined)?.split(':').pop()
    if (name === undefined) continue
    displayNames.push(name)
    if (typeName !== undefined) elementTypes.set(name, typeName)
  }

  const types: Record<string, SchemaType> = {}
  for (const typeName of complexTypes.keys()) types[typeName] = resolveType(typeName, new Set())

  // Parts are the child elements an object carries that are not themselves
  // display objects: caption, states, animations, connections, imageSettings,
  // parameters, threshold, innerPolygon. They are what a hand-counted object
  // list mistakes for types.
  const declaredChildren = new Set<string>()
  for (const type of Object.values(types)) for (const child of type.children) declaredChildren.add(child)
  const parts = [...declaredChildren].filter(name => !displayNames.includes(name)).sort()

  const version = Number.parseInt(fileName.replace(/\D+/gu, ''), 10)
  return {
    schema: fileName,
    version: Number.isFinite(version) ? version : 0,
    displayChildren: displayNames.filter(name => name !== 'displaySettings').sort(),
    elements: Object.fromEntries([...elementTypes].filter(([name]) => name !== 'displaySettings')),
    types,
    parts,
  }
}

/** The element declarations inside one content body, at any nesting depth. */
function childrenOfDeclarations(body: Record<string, unknown> | undefined): Record<string, unknown>[] {
  if (body === undefined) return []
  const found: Record<string, unknown>[] = []
  const walk = (node: Record<string, unknown>): void => {
    found.push(...asList(node.element))
    for (const container of ['sequence', 'choice', 'all'] as const) for (const inner of asList(node[container])) walk(inner)
  }
  walk(body)
  return found
}

/** One problem found in a drafted object before it is written. */
export interface DraftFinding {
  /** What kind of problem this is. */
  readonly kind: 'unknown-attribute' | 'invalid-value' | 'missing-attribute' | 'unknown-child' | 'missing-child' | 'engine-constraint'
  /** The attribute or child element named. */
  readonly name: string
  /** What to do about it, written for the agent that made the call. */
  readonly message: string
}

/** The resolved type of one display element, or undefined when the schema has no such element. */
export function displayType(model: SchemaModel, element: string): SchemaType | undefined {
  const typeName = model.elements[element]
  return typeName === undefined ? undefined : model.types[typeName]
}

/**
 * How one display element carries its words: state faces, a caption child, or a
 * caption attribute.
 *
 * Nothing here is a rule anyone should hand-keep. The earlier hand-kept lists
 * were wrong in both directions — they refused faces the schema allows (a
 * `multistateButton` takes up to 254) and wrote an `Error` face on families the
 * schema forbids one for (`interlockedButton`, the list and control selectors).
 */
export interface ObjectFamily {
  /** The element has a `<states>` child, so its text lives in state faces. */
  readonly states: boolean
  /** The element has a `<caption>` child. */
  readonly captionChild: boolean
  /** The element declares a `caption` attribute. */
  readonly captionAttribute: boolean
  /** The element has a `<connections>` child. */
  readonly connections: boolean
  /** The state-id domain the family declares, when it declares state faces. */
  readonly stateId?: { values?: readonly string[]; min?: number; max?: number }
  /**
   * The type that declares one `<state>` face, when the element has faces. It
   * says what `<state>` itself may carry, which differs per control: a list
   * indicator's face carries only `value` and `stateId`, a symbol's carries
   * `borderColor`, a push button's carries the fill and pattern colours.
   */
  readonly stateType?: SchemaType
  /**
   * The type behind the face's `<caption>` child, when its faces declare one. A
   * list indicator's caption type declares five attributes and an alignment of
   * `left|center|right`; a push button's declares the font set and
   * `middleCenter`. Writing the button shape onto every control is what made the
   * vendor validator reject the selectors.
   */
  readonly faceCaptionType?: SchemaType
  /**
   * The type behind the face's `<imageSettings>` child, when its faces declare
   * one. A symbol's face has no caption at all — its words cannot be text, and
   * its colour lives here, so this is where a symbol face's colour goes.
   */
  readonly faceImageType?: SchemaType
}

/**
 * The caption and state-face shape of one display element.
 *
 * Walks element → its type → `<states>` → `<state>` → `stateId`, so the domain
 * comes from the schema and not from a rule of thumb about buttons.
 *
 * @param model - The resolved schema model.
 * @param element - Display element name, e.g. `momentaryButton`.
 * @returns The family, or undefined when the schema declares no such element.
 */
export function objectFamily(model: SchemaModel, element: string): ObjectFamily | undefined {
  const type = displayType(model, element)
  if (type === undefined) return undefined
  const family: {
    states: boolean
    captionChild: boolean
    captionAttribute: boolean
    connections: boolean
    stateId?: { values?: readonly string[]; min?: number; max?: number }
    stateType?: SchemaType
    faceCaptionType?: SchemaType
    faceImageType?: SchemaType
  } = {
    states: type.children.includes('states'),
    captionChild: type.children.includes('caption'),
    captionAttribute: type.attributes.caption !== undefined,
    connections: type.children.includes('connections'),
  }
  const statesTypeName = type.childTypes.states
  const statesType = statesTypeName === undefined ? undefined : model.types[statesTypeName]
  const stateTypeName = statesType?.childTypes.state
  const stateType = stateTypeName === undefined ? undefined : model.types[stateTypeName]
  if (stateType !== undefined) {
    family.stateType = stateType
    const faceCaptionTypeName = stateType.childTypes.caption
    const faceCaptionType = faceCaptionTypeName === undefined ? undefined : model.types[faceCaptionTypeName]
    if (faceCaptionType !== undefined) family.faceCaptionType = faceCaptionType
    const faceImageTypeName = stateType.childTypes.imageSettings
    const faceImageType = faceImageTypeName === undefined ? undefined : model.types[faceImageTypeName]
    if (faceImageType !== undefined) family.faceImageType = faceImageType
  }
  const declared = stateType?.attributes.stateId
  if (declared !== undefined) family.stateId = { values: declared.values, min: declared.min, max: declared.max }
  return family
}

/** Whether one state id is legal for the family, by its declared domain. */
export function stateIdAllowed(family: ObjectFamily, stateId: string): boolean {
  const domain = family.stateId
  if (domain === undefined) return false
  if (domain.values !== undefined && domain.values.includes(stateId)) return true
  if (!/^\d+/u.test(stateId)) return false
  const value = Number(stateId)
  if (domain.min !== undefined && value < domain.min) return false
  if (domain.max !== undefined && value > domain.max) return false
  return true
}

/** One face field a caller may set on a `<state>` face. */
export interface DraftStateFace {
  readonly stateId?: string
  readonly value?: number
  readonly caption?: string
  readonly fontSize?: number
  readonly color?: string
  readonly backColor?: string
  readonly borderColor?: string
  readonly blink?: boolean
}

/** The face fields a draft may set, in the order they are checked. */
export const FACE_FIELDS: readonly (keyof DraftStateFace)[] = ['stateId', 'value', 'caption', 'fontSize', 'color', 'backColor', 'borderColor', 'blink']

/** Where one face field belongs on this control, and how the schema declares it. */
export function faceFieldHome(
  family: ObjectFamily,
  field: string,
): { where: 'state' | 'caption' | 'image'; declared: SchemaAttribute } | undefined {
  const inState = family.stateType?.attributes[field]
  if (inState !== undefined) return { where: 'state', declared: inState }
  const inCaption = family.faceCaptionType?.attributes[field]
  if (inCaption !== undefined) return { where: 'caption', declared: inCaption }
  const inImage = family.faceImageType?.attributes[field]
  if (inImage !== undefined) return { where: 'image', declared: inImage }
  return undefined
}

/** What one control's state face is allowed to carry, for a refusal that says so. */
function faceShapeText(family: ObjectFamily): string {
  const parts: string[] = []
  if (family.stateType !== undefined) parts.push(`<state> declares ${Object.keys(family.stateType.attributes).join(', ')}`)
  if (family.faceCaptionType !== undefined) parts.push(`its <caption> declares ${Object.keys(family.faceCaptionType.attributes).join(', ')}`)
  if (family.faceImageType !== undefined) parts.push(`its <imageSettings> declares ${Object.keys(family.faceImageType.attributes).join(', ')}`)
  return parts.length === 0 ? 'this control declares no state faces' : parts.join('; ')
}

/**
 * Findings for the state faces a draft writes, checked against the face the
 * schema declares for THIS control rather than the push-button shape the tool
 * used to write for every control.
 *
 * The vendor refused this: a list indicator's face declares five attributes and
 * an alignment of `left|center|right`, and the tool wrote the push-button face —
 * font family, size, bold, word wrap and `middleCenter` — onto all four of the
 * list and control selectors, three faces each. That is 132 of the 142 errors the
 * installed editor reported for a draft of the whole object library.
 *
 * @param family - The family for the element being drafted.
 * @param faces - The faces the draft sets, in order.
 * @returns The findings, named `state[n].field` so the caller can find the face.
 */
export function checkStateFaces(family: ObjectFamily, faces: readonly DraftStateFace[]): DraftFinding[] {
  if (family.stateType === undefined) {
    return faces.length === 0
      ? []
      : [{ kind: 'unknown-child', name: 'states', message: `${faceShapeText(family)}, so states cannot be written for it.` }]
  }
  const findings: DraftFinding[] = []
  faces.forEach((face, index) => {
    for (const field of FACE_FIELDS) {
      const value = face[field]
      if (value === undefined) continue
      const home = faceFieldHome(family, field)
      if (home === undefined) {
        findings.push({
          kind: 'unknown-attribute',
          name: `state[${index}].${field}`,
          message: `A ${field === 'caption' ? 'caption' : field} on this control's state face has nowhere to go: ${faceShapeText(family)}.`,
        })
        continue
      }
      const text = String(field === 'value' || field === 'fontSize' ? Math.trunc(Number(value)) : value)
      if (!valueAccepted(home.declared, text)) {
        findings.push({
          kind: 'invalid-value',
          name: `state[${index}].${field}`,
          message: `state[${index}].${field} = ${JSON.stringify(text)} is outside what the schema declares on its <${home.where === 'state' ? 'state' : home.where}>: ${domainText(home.declared)}.`,
        })
      }
    }
  })
  return findings
}

/**
 * Findings for one part child the draft writes, e.g. `innerPolygon` on a
 * `polyPolygon`. The child is not a display object, so it is checked against the
 * type the parent declares for it.
 *
 * @param model - The resolved schema to check against.
 * @param element - The display element being drafted.
 * @param child - The child element name the draft writes.
 * @param attributes - Attribute name and value pairs the draft sets on the child.
 * @returns The findings, named `child.attribute`.
 */
export function checkDraftChild(
  model: SchemaModel,
  element: string,
  child: string,
  attributes: Iterable<readonly [string, string]>,
): DraftFinding[] {
  const type = displayType(model, element)
  const typeName = type?.childTypes[child]
  const childType = typeName === undefined ? undefined : model.types[typeName]
  if (type === undefined || childType === undefined) return []
  const findings: DraftFinding[] = []
  for (const [name, value] of attributes) {
    const declared = childType.attributes[name]
    if (declared === undefined) {
      const near = nearNames(name, Object.keys(childType.attributes))
      findings.push({
        kind: 'unknown-attribute',
        name: `${child}.${name}`,
        message: `<${child}> inside ${element} declares no attribute ${JSON.stringify(name)}. ${near.length > 0 ? `It offers ${near.join(', ')}.` : `It declares ${Object.keys(childType.attributes).length === 0 ? 'no attributes' : Object.keys(childType.attributes).join(', ')}.`}`,
      })
      continue
    }
    if (!valueAccepted(declared, value)) {
      findings.push({
        kind: 'invalid-value',
        name: `${child}.${name}`,
        message: `<${child}> inside ${element} attribute ${name} = ${JSON.stringify(value)} is outside what the schema declares: ${domainText(declared)}.`,
      })
    }
  }
  return findings
}

/** Names close to `wanted`, so a refusal can name what was probably meant. */
export function nearNames(wanted: string, candidates: readonly string[], limit = 4): string[] {
  const lower = wanted.toLowerCase()
  const scored = candidates
    .map(name => ({ name, score: similarity(lower, name.toLowerCase()) }))
    .filter(entry => entry.score > 0.55)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return scored.slice(0, limit).map(entry => entry.name)
}

/** Dice similarity of two lower-cased strings by bigram overlap. */
function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const bigrams = new Map<string, number>()
  for (let i = 0; i < a.length - 1; i += 1) bigrams.set(a.slice(i, i + 2), (bigrams.get(a.slice(i, i + 2)) ?? 0) + 1)
  let hits = 0
  for (let i = 0; i < b.length - 1; i += 1) {
    const key = b.slice(i, i + 2)
    const left = bigrams.get(key) ?? 0
    if (left > 0) {
      hits += 1
      bigrams.set(key, left - 1)
    }
  }
  return (2 * hits) / (a.length - 1 + b.length - 1)
}

/** One legal-value list, shortened for a message when the schema offers many. */
export function valueList(values: readonly string[], limit = 12): string {
  if (values.length <= limit) return values.join(', ')
  return `${values.slice(0, limit).join(', ')}, … (${values.length} values)`
}

/** One XSD pattern as an anchored JavaScript regex; null when the two dialects disagree. */
function patternOf(pattern: string): RegExp | null {
  const cached = patternCache.get(pattern)
  if (cached !== undefined) return cached
  let compiled: RegExp | null
  try {
    // An XSD pattern must match the whole value, so it is anchored implicitly.
    compiled = new RegExp(`^(?:${pattern})$`)
  } catch {
    // The XML Schema regex dialect is close to JavaScript's but not identical.
    // A pattern this engine cannot read constrains nothing here; the vendor
    // schema validation at `ftview_apply` still has the final say.
    compiled = null
  }
  patternCache.set(pattern, compiled)
  return compiled
}

/** True when a value matches one of the patterns the type declares. */
function matchesPattern(value: string, patterns: readonly string[] | undefined): boolean {
  if (patterns === undefined) return false
  for (const pattern of patterns) {
    const regex = patternOf(pattern)
    if (regex !== null && regex.test(value)) return true
  }
  return false
}

/**
 * Whether one value satisfies one declared domain.
 *
 * A union such as `stateId1Type` names some members (`Error`) and bounds the
 * rest (a byte capped at 1), and `colorType` patterns one half (`#rrggbb`) and
 * names the other (147 colours), so any half satisfies.
 */
function valueAccepted(declared: SchemaAttribute, value: string): boolean {
  const hasValues = declared.values !== undefined && declared.values.length > 0
  const bounded = declared.min !== undefined || declared.max !== undefined
  const patterned = declared.patterns !== undefined && declared.patterns.length > 0
  if (!hasValues && !bounded && !patterned) return true
  if (declared.values?.includes(value) === true) return true
  const numeric = Number(value)
  if (
    bounded &&
    value.trim() !== '' &&
    Number.isFinite(numeric) &&
    (declared.min === undefined || numeric >= (declared.min as number)) &&
    (declared.max === undefined || numeric <= (declared.max as number))
  ) return true
  return matchesPattern(value, declared.patterns)
}

/** What a declared value domain accepts, spelled out for a refusal message. */
export function domainText(declared: { values?: readonly string[]; patterns?: readonly string[]; min?: number; max?: number }): string {
  const parts: string[] = []
  if (declared.values !== undefined && declared.values.length > 0) parts.push(valueList(declared.values))
  if (declared.patterns !== undefined && declared.patterns.length > 0) parts.push(`a value matching ${declared.patterns.map(pattern => JSON.stringify(pattern)).join(' or ')}`)
  if (declared.min !== undefined && declared.max !== undefined) parts.push(`a number from ${declared.min} to ${declared.max}`)
  else if (declared.max !== undefined) parts.push(`a number up to ${declared.max}`)
  else if (declared.min !== undefined) parts.push(`a number from ${declared.min} up`)
  return parts.join(' or ')
}

/** Compiled form of each XSD pattern this resolver has met, keyed by the pattern text. */
const patternCache = new Map<string, RegExp | null>()

/**
 * Check one drafted object against the schema before it is written.
 *
 * The vendor schema is strict and Studio refuses a display it cannot validate,
 * so a name the schema does not declare is not a style choice: the import either
 * drops the object or the whole display. Checking here says which attribute is
 * wrong and what the schema offers instead, at the call that made the mistake,
 * rather than at `ftview_apply` after the whole draft has been built.
 *
 * Proved safe against 125 vendor-authored display files — the Displays folder of
 * every ME demo application installed on this host — so this refuses nothing a
 * vendor tool wrote. That replay is what caught `colorType` being a union of a
 * `#rrggbb` pattern and 147 named colours: reading only the enumeration refused
 * every hex colour Rockwell's own displays carry.
 *
 * @param model - The resolved schema to check against.
 * @param element - The display element name being drafted, e.g. `momentaryButton`.
 * @param attributes - Attribute name and value pairs the draft sets.
 * @param childNames - Child element names the draft writes (caption, states, …).
 * @param options - Set `requireAll` false when only the changed attributes are known.
 * @returns The findings, empty when the object matches the schema. A child the
 *   schema declares required and the draft does not write is reported as
 *   `missing-child`: `polyPolygon` needs an `<innerPolygon>`, and until the tool
 *   could write parts the object could not be drafted at all.
 */
export function checkDraftObject(
  model: SchemaModel,
  element: string,
  attributes: Iterable<readonly [string, string]>,
  childNames: readonly string[] = [],
  options: { requireAll?: boolean } = {},
): DraftFinding[] {
  const type = displayType(model, element)
  if (type === undefined) return []
  const findings: DraftFinding[] = []
  const written = new Set<string>()
  for (const [name, value] of attributes) {
    written.add(name)
    const declared = type.attributes[name]
    if (declared === undefined) {
      const near = nearNames(name, Object.keys(type.attributes))
      findings.push({
        kind: 'unknown-attribute',
        name,
        message: `${element} declares no attribute ${JSON.stringify(name)}. ${near.length > 0 ? `The schema offers ${near.join(', ')} for this type.` : `This type declares ${Object.keys(type.attributes).length} attributes; ftview_object_types with type="${element}" lists them.`}`,
      })
      continue
    }
    if (!valueAccepted(declared, value)) {
      findings.push({
        kind: 'invalid-value',
        name,
        message: `${element} attribute ${name} = ${JSON.stringify(value)} is outside what the schema declares: ${domainText(declared)}.`,
      })
    }
  }
  if (options.requireAll !== false) {
    for (const [name, declared] of Object.entries(type.attributes)) {
      if (declared.required && !written.has(name)) {
        findings.push({ kind: 'missing-attribute', name, message: `${element} requires ${name}, which the schema declares as required.` })
      }
    }
  }
  for (const child of childNames) {
    if (!type.children.includes(child)) {
      const near = nearNames(child, type.children)
      findings.push({
        kind: 'unknown-child',
        name: child,
        message: `${element} allows no <${child}> child. ${near.length > 0 ? `It allows ${near.join(', ')}.` : `It allows ${type.children.length === 0 ? 'no children' : type.children.join(', ')}.`}`,
      })
    }
  }
  for (const child of type.requiredChildren) {
    if (WRITER_MANAGED.has(child) || childNames.includes(child)) continue
    findings.push({
      kind: 'missing-child',
      name: child,
      message: `${element} declares <${child}> as required content and the draft writes none, so the vendor validator refuses the display. Write it with children_json, or leave the object to be completed in Studio.`,
    })
  }
  return findings
}

/**
 * Children the tool writes itself or the vendor omits without complaint.
 *
 * `caption`, `states`, `connections` and `animations` are managed by the writer,
 * so their presence is not the caller's to report. `parameters` is declared with
 * a required `parameter` inside it, yet Rockwell's own display exports omit the
 * container, so its absence is not a defect this tool can answer.
 */
const WRITER_MANAGED = new Set(['caption', 'states', 'connections', 'animations', 'parameters'])

/**
 * Check a drafted object for property combinations the schema allows and the
 * installed editor refuses.
 *
 * The schema is necessary and not sufficient. A draft of all 91 object types
 * validated clean against Gfx-ME16.xsd, and SEAddComponent still refused these
 * properties while importing them — and dropped the polyPolygon object outright.
 * Each rule below is measured, not read: it quotes the editor's own line from
 * the import log, and the boundary is what the import showed, not what the
 * message implies. The owner's complaint — an XML edit that does not land —
 * is exactly this gap, so the refusal moves to the call that stages it.
 *
 * What the editor only clamps or drops silently is NOT refused here: a clamp
 * (fontSize below 2 lands as 2) still lands, and inventing a rule for a silent
 * drop (auditTrailDetail loses linesPerAudit and the selection colours with no
 * message) would be a guess. Both are recorded in the knowledge pages instead.
 *
 * @param model - The resolved schema to check against.
 * @param element - The display element name being drafted.
 * @param attributes - Attribute name and value pairs the draft sets.
 * @param childNames - Child element names the draft writes, repeats included.
 * @param faces - The state faces the draft writes, when the control has any.
 * @returns The findings, empty when no refused combination is present.
 */
export function checkDraftCombos(
  model: SchemaModel,
  element: string,
  attributes: Iterable<readonly [string, string]>,
  childNames: readonly string[] = [],
  faces: readonly DraftStateFace[] = [],
): DraftFinding[] {
  const type = displayType(model, element)
  if (type === undefined) return []
  const drafted = new Map<string, string>(attributes)
  const findings: DraftFinding[] = []

  // Measured on momentaryButton, maintainedButton and latchedButton: the editor
  // calls the XML `shape` attribute `style`, and with shape="rectangle" it
  // refuses cornerRadius and drops it. The fourth loss (a panel, which declares
  // no shape) carried no message, so it is not claimed here.
  if (type.attributes.cornerRadius !== undefined && type.attributes.shape !== undefined
    && drafted.get('shape') === 'rectangle' && drafted.get('cornerRadius') !== undefined) {
    findings.push({
      kind: 'engine-constraint',
      name: 'cornerRadius',
      message: `The 'cornerRadius' property cannot be set while 'shape' is set to 'rectangle' — the installed editor refuses it and drops the property. Draft shape "rounded rectangle" with a non-zero radius, or leave cornerRadius off.`,
    })
  }

  // Measured on momentaryButton: a face's value attribute was refused twice, at
  // the <state> lines, while the object carried buttonAction="normallyOpen".
  // The schema defaults buttonAction to normallyOpen, so an omitted attribute
  // is the same state the editor saw, and the fix names both ways out.
  const action = drafted.get('buttonAction')
  if (type.attributes.buttonAction !== undefined && faces.some(face => face.value !== undefined)
    && (action === 'normallyOpen' || action === undefined)) {
    findings.push({
      kind: 'engine-constraint',
      name: 'value',
      message: `The 'value' property cannot be set while 'buttonAction' is set to 'normallyOpen'${action === undefined ? ' — buttonAction defaults to normallyOpen, so the editor sees that state even though the draft omits it' : ''}. Set buttonAction to normallyClosed or value, or drop the face value.`,
    })
  }

  // Measured on numericInputEnable: both properties were refused in one import
  // while decimalPoint was drafted 'implicit'. The alternative spellings are
  // left to ftview_object_types rather than guessed at.
  if (type.attributes.decimalPoint !== undefined && drafted.get('decimalPoint') === 'implicit') {
    for (const name of ['digitsAfterDecimalPoint', 'fixedPosition']) {
      if (drafted.get(name) !== undefined) {
        findings.push({
          kind: 'engine-constraint',
          name,
          message: `The '${name}' property cannot be set while 'decimalPoint' is set to 'implicit' — the installed editor refuses it and drops the property. Choose another decimalPoint value (ftview_object_types with type="${element}" lists them), or leave ${name} off.`,
        })
      }
    }
  }

  // Measured on five objects (the two selectors and symbol included): the editor
  // reported the refusal at the <state> line whose stateId equalled
  // setLastStateId, and accepted setLastStateId drafted above the highest face.
  // The message says "less than"; the measured boundary is "not above".
  const last = drafted.get('setLastStateId')
  const faceIds = faces.map(face => Number(face.stateId)).filter(id => Number.isFinite(id))
  if (last !== undefined && faceIds.length > 0 && Number.isFinite(Number(last)) && Number(last) <= Math.max(...faceIds)) {
    findings.push({
      kind: 'engine-constraint',
      name: 'setLastStateId',
      message: `The 'setLastStateId' property cannot be set to a value less than the 'stateId' property: the installed editor refused setLastStateId=${last} against faces reaching stateId=${Math.max(...faceIds)} (measured: equal refused, above accepted). Set it above the highest face state id, or leave it off.`,
    })
  }

  // Measured on polyPolygon: the schema declares one <innerPolygon> as required,
  // the editor wanted two and dropped the whole object with only one. With none,
  // checkDraftObject already reports the missing child.
  if (element === 'polyPolygon' && childNames.filter(name => name === 'innerPolygon').length === 1) {
    findings.push({
      kind: 'engine-constraint',
      name: 'innerPolygon',
      message: 'A polyPolygon must contain at least 2 innerPolygons: the schema requires one, the editor dropped the object that carried only one. Write a second <innerPolygon> in children_json.',
    })
  }

  return findings
}
