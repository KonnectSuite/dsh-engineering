/**
 * Text-level edits over an ME export.
 *
 * Every transform changes only the targeted bytes: an attribute on one tag, a
 * display's name attribute, or one tag CSV row. Nothing is re-serialized, so
 * unknown elements, comments and formatting survive.
 *
 * @module dsh-engineering-ftview/edit/operations
 */

import { EngineeringError } from '../core.ts'
import { splitCsv } from '../model.ts'
import { decodeEntities, findNamed, firstChildOfType, insertChild, parseDisplayTree, removeNode, renderElement, setAttribute as setNodeAttribute, type DisplayNode, type DisplayTree } from '../display-tree.ts'
import { defaultSchemaVersion } from '../schema.ts'
import { displayType, domainText, FACE_FIELDS, faceFieldHome, objectFamily, stateIdAllowed, type ObjectFamily, type SchemaAttribute, type SchemaModel, type SchemaType } from '../xsd.ts'

/** Set one attribute on a display or one of its named objects. */
export interface DisplaySetOperation {
  readonly kind: 'display_set'
  readonly file: string
  readonly object?: string
  readonly attribute: string
  readonly value: string
}

/** Add a display by copying an existing display file under a new name. */
export interface DisplayAddOperation {
  readonly kind: 'display_add'
  readonly copyFrom: string
  readonly name: string
}

/** Insert or update one HMI tag row. */
export interface TagUpsertOperation {
  readonly kind: 'tag_upsert'
  readonly name: string
  readonly description?: string
  readonly type?: string
}

/** Add one alarm trigger, with its first message row, to an Alarms.xml. */
export interface AlarmAddOperation {
  readonly kind: 'alarm_add'
  readonly file: string
  readonly type: 'bit' | 'value'
  readonly exp: string
  readonly label?: string
  readonly text: string
  readonly triggerValue?: string
  readonly ackAll?: boolean
  readonly audio?: boolean
  readonly display?: boolean
  readonly print?: boolean
}

/** Change one attribute on an alarm trigger or message row. */
export interface AlarmSetOperation {
  readonly kind: 'alarm_set'
  readonly file: string
  readonly target: 'trigger' | 'message'
  readonly id: string
  readonly attribute: string
  readonly value: string
}

/** Remove one alarm trigger and every message that points at it. */
export interface AlarmDeleteOperation {
  readonly kind: 'alarm_delete'
  readonly file: string
  readonly trigger: string
}

/** One staged edit. */
export type EditOperation = DisplaySetOperation | DisplayAddOperation | TagUpsertOperation | DisplayCreateOperation | ObjectAddOperation | ObjectSetOperation | ObjectDeleteOperation | ObjectOrderOperation | AlarmAddOperation | AlarmSetOperation | AlarmDeleteOperation

/** Create a new display file from a schema-valid skeleton. */
export interface DisplayCreateOperation {
  readonly kind: 'display_create'
  readonly file: string
  readonly name: string
  readonly width: number
  readonly height: number
  readonly displayType?: string
  readonly backColor?: string
  readonly displayNumber?: number
}

/** Add one object to a display, optionally inside a named group. */
export interface ObjectAddOperation {
  readonly kind: 'object_add'
  readonly file: string
  readonly type: string
  readonly name: string
  readonly attributes: Readonly<Record<string, string>>
  readonly parent?: string
  readonly index?: number
  readonly connections?: Readonly<Record<string, string>>
  readonly caption?: string
  readonly states?: readonly ObjectState[]
  readonly animations?: ObjectAnimations
  /** Part children the schema declares inside this object, e.g. an `innerPolygon`. */
  readonly children?: readonly ObjectPart[]
}

/**
 * One part child written inside an object, before the children the tool manages.
 *
 * A `polyPolygon` is not complete without an `<innerPolygon>`, and a `gauge`
 * carries its `<threshold>` rows, so an object cannot be authored without a way
 * to write a part. The element must be one the schema declares on this type.
 */
export interface ObjectPart {
  /** The child element name, as the schema declares it on the parent type. */
  readonly element: string
  /** Attributes to write on it, in insertion order. */
  readonly attributes?: Readonly<Record<string, string>>
}

/**
 * One face of a button or indicator, written as `<states><state>`.
 *
 * Each field is written where THIS control's schema declares it: on `<state>`, on
 * its `<caption>` child, or on its `<imageSettings>` child. A symbol's face has no
 * caption at all and a list indicator's caption declares no font, so a field with
 * nowhere to go is left out rather than written where the vendor rejects it. The
 * tool used to write the push-button face — the font set, `backStyle`,
 * `wordWrap` and `alignment="middleCenter"` — onto every control's faces, which
 * is what made the installed editor refuse the list and control selectors.
 */
export interface ObjectState {
  /** State id as the export writes it: "0", "1" or "Error" for buttons. */
  readonly stateId?: string
  /** Value that selects this state on a value-triggered indicator. */
  readonly value?: number
  /** Caption drawn on the face, where this control's face declares one. */
  readonly caption?: string
  /** Caption font size, where its caption declares one. */
  readonly fontSize?: number
  /** Face colour, on the caption or image child the face declares. */
  readonly color?: string
  /** Face background colour, where the face or its child declares one. */
  readonly backColor?: string
  /** Face border colour, where the face declares one. */
  readonly borderColor?: string
  /** Blink the face, where the face or its child declares it. */
  readonly blink?: boolean
}

/** Animations attached to an object. */
export interface ObjectAnimations {
  /** Show or hide the object while an expression is true. */
  readonly visibility?: {
    readonly expression: string
    readonly expressionTrueState?: 'visible' | 'invisible'
  }
}

/** Change attributes, caption or connections on an existing object. */
export interface ObjectSetOperation {
  readonly kind: 'object_set'
  readonly file: string
  readonly object: string
  readonly attributes: Readonly<Record<string, string>>
  readonly caption?: string
  readonly connections?: Readonly<Record<string, string>>
}

/** Remove one object from a display. */
export interface ObjectDeleteOperation {
  readonly kind: 'object_delete'
  readonly file: string
  readonly object: string
}

/** Move one object within its siblings, changing z-order. */
export interface ObjectOrderOperation {
  readonly kind: 'object_order'
  readonly file: string
  readonly object: string
  readonly index: number
}

/** Escape one XML attribute value. */
export function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\n', '&#xA;')
}

/** Escape one CSV cell when it needs quoting. */
export function encodeCell(value: string): string {
  return /[";\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/** One tag span found in the document. */
interface TagSpan {
  readonly start: number
  readonly end: number
  readonly attributes: string
  readonly selfClosing: boolean
}

/** Read one attribute from an attribute string. */
function attributeValue(attributes: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'u').exec(attributes)
  return match?.[2] ?? match?.[3]
}

/** Find the root tag or the tag whose name attribute equals `object`. */
function findTag(xml: string, object: string | undefined): TagSpan {
  if (object === undefined) {
    const root = /<([A-Za-z_][\w.:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)(\/?)>/u.exec(xml)
    if (root === null) throw new EngineeringError('INVALID_DISPLAY', 'The display has no root element.', 'Open the display with ftview_get first; only display XML can be edited.')
    return { start: root.index, end: root.index + root[0].length, attributes: root[2] ?? '', selfClosing: root[3] === '/' }
  }
  const pattern = /<([A-Za-z_][\w.:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)(\/?)>/gu
  let match: RegExpExecArray | null
  while ((match = pattern.exec(xml)) !== null) {
    if (attributeValue(match[2] ?? '', 'name') === object) {
      return { start: match.index, end: match.index + match[0].length, attributes: match[2] ?? '', selfClosing: match[3] === '/' }
    }
  }
  throw new EngineeringError(
    'COMPONENT_NOT_FOUND',
    `No object in this display is named ${JSON.stringify(object)}.`,
    'Call ftview_get with kind "display" to see the object names, then set the attribute on one of them.',
  )
}

/**
 * Set one attribute on a display root or object, preserving the rest byte for byte.
 *
 * @param xml - Display XML.
 * @param object - Object name, or undefined for the display root.
 * @param attribute - Attribute to set; a plain XML name.
 * @param value - New value.
 * @returns The modified XML.
 */
export function setAttribute(xml: string, object: string | undefined, attribute: string, value: string): string {
  if (!/^[A-Za-z_][\w.:-]*$/u.test(attribute)) {
    throw new EngineeringError('INVALID_ATTRIBUTE', `${JSON.stringify(attribute)} is not an XML attribute name.`, 'Pass a plain attribute name such as "visible" or "caption".')
  }
  const span = findTag(xml, object)
  const existing = new RegExp(`\\b${attribute}\\s*=\\s*("[^"]*"|'[^']*')`, 'u')
  let attributes: string
  if (existing.test(span.attributes)) {
    attributes = span.attributes.replace(existing, `${attribute}="${escapeAttribute(value)}"`)
  } else {
    attributes = `${span.attributes} ${attribute}="${escapeAttribute(value)}"`
  }
  const tagName = /^<([A-Za-z_][\w.:-]*)/u.exec(xml.slice(span.start, span.end))?.[1] ?? ''
  const rebuilt = `<${tagName}${attributes}${span.selfClosing ? '/' : ''}>`
  return xml.slice(0, span.start) + rebuilt + xml.slice(span.end)
}

/**
 * Rename a display root.
 *
 * A Studio ME export names a display by its file, and its root is `<gfx>` with no
 * `name` attribute — `Gfx-ME17.xsd` rejects one. Only the older `<display
 * name="…">` shape carries the name in the document, so only that shape is
 * rewritten here; the file rename is what names a `<gfx>` display.
 *
 * @param xml - Display XML.
 * @param name - New display name.
 * @returns The modified XML.
 */
export function renameDisplay(xml: string, name: string): string {
  const root = /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<([A-Za-z][\w.:-]*)/u.exec(xml)?.[1]?.toLowerCase()
  if (root === 'display') return setAttribute(xml, undefined, 'name', name)
  return xml
}

/**
 * Insert or update one tag row in the CSV.
 *
 * @param csv - Whole tag CSV.
 * @param tag - Tag name and the columns to set.
 * @returns The modified CSV.
 */
export function upsertTag(csv: string, tag: TagUpsertOperation): string {
  const eol = csv.includes('\r\n') ? '\r\n' : '\n'
  const lines = csv.split(/\r?\n/)
  const versionIndex = lines.findIndex(line => line.includes('###002'))
  if (versionIndex < 0) {
    throw new EngineeringError('TAG_CSV_MISSING', 'The tag CSV has no `###002` version line.', 'Pass an export whose tag file is the documented CSV export.')
  }
  const headerIndex = lines.findIndex((line, index) => index > versionIndex && line.trim() !== '')
  if (headerIndex < 0) throw new EngineeringError('TAG_CSV_MISSING', 'The tag CSV has no header row.', 'Re-export the HMI tag database as a CSV.')
  const header = splitCsv(lines[headerIndex] as string).map(cell => cell.trim())
  const nameIndex = header.indexOf('Tag Name')
  if (nameIndex < 0) throw new EngineeringError('TAG_CSV_MISSING', 'The tag CSV header has no `Tag Name` column.', 'Re-export the HMI tag database as a CSV.')
  const descriptionIndex = header.indexOf('Tag Description')
  const typeIndex = header.indexOf('Tag Type')
  if (tag.description !== undefined && descriptionIndex < 0) throw new EngineeringError('TAG_CSV_UNSUPPORTED', 'This tag CSV has no `Tag Description` column.', 'Set only the type, or re-export with descriptions enabled.')
  if (tag.type !== undefined && typeIndex < 0) throw new EngineeringError('TAG_CSV_UNSUPPORTED', 'This tag CSV has no `Tag Type` column.', 'Set only the description, or re-export with tag types.')
  const rowIndex = lines.findIndex((line, index) => index > headerIndex && line.trim() !== '' && (splitCsv(line)[nameIndex] ?? '').trim() === tag.name)
  if (rowIndex >= 0) {
    const cells = splitCsv(lines[rowIndex] as string)
    if (tag.description !== undefined) cells[descriptionIndex] = tag.description
    if (tag.type !== undefined) cells[typeIndex] = tag.type
    lines[rowIndex] = cells.map(encodeCell).join(';')
    return lines.join(eol)
  }
  const cells = new Array<string>(header.length).fill('')
  cells[nameIndex] = tag.name
  if (tag.description !== undefined) cells[descriptionIndex] = tag.description
  if (tag.type !== undefined) cells[typeIndex] = tag.type
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.splice(lines.length - 1, 0, cells.map(encodeCell).join(';'))
  else lines.push(cells.map(encodeCell).join(';'))
  return lines.join(eol)
}

/**
 * Elements that are parts of an object, never objects themselves.
 *
 * `group` is deliberately NOT here. It is a display child the schema declares
 * (groupType, twelve attributes) and the element Rockwell's own displays use
 * most — 465 of them across the shipped ME demos — and the `parent` parameter
 * of this very tool presupposes groups exist by letting a caller add inside
 * one. Refusing to create it while offering to add into it meant a draft could
 * stage a group cleanly and only fail at `ftview_apply`. An empty group is
 * written self-closing and `insertChild` expands it when the first child
 * arrives, so nesting works without a second pass.
 */
const RESERVED = new Set([
  'gfx', 'display', 'displaySettings', 'connections', 'connection', 'states', 'state', 'caption',
  'imageSettings', 'animations', 'parameters', 'parameter', 'font', 'color',
  'animateVisibility', 'animateColor', 'confirm', 'vbaProject', 'vbaItem', 'vbaCode',
])

/** Depth of one node below the root. */
function depthOf(root: DisplayNode, target: DisplayNode): number {
  let found = -1
  const walkNode = (node: DisplayNode, depth: number): void => {
    if (found >= 0) return
    if (node === target) { found = depth; return }
    for (const child of node.children) walkNode(child, depth + 1)
  }
  walkNode(root, 0)
  return found
}

/** Parent of one node, or undefined for the root. */
function parentOf(root: DisplayNode, target: DisplayNode): DisplayNode | undefined {
  let found: DisplayNode | undefined
  const walkNode = (node: DisplayNode): void => {
    if (found !== undefined) return
    for (const child of node.children) {
      if (child === target) { found = node; return }
      walkNode(child)
    }
  }
  walkNode(root)
  return found
}

/** Validate an object name and element type before writing anything. */
function assertObjectStyle(type: string, name: string): void {
  if (!/^[A-Za-z_][\w.:-]*$/u.test(type)) throw new EngineeringError('INVALID_OBJECT_TYPE', `${JSON.stringify(type)} is not an XML element name.`, 'Pass the object element name as the export writes it, for example "momentaryButton".')
  if (RESERVED.has(type)) throw new EngineeringError('INVALID_OBJECT_TYPE', `${type} is part of a display, not an object type.`, 'Pass an object element such as "text", "panel", "momentaryButton" or "numericDisplay".')
  if (!/^[A-Za-z_][\w .-]{0,79}$/u.test(name)) throw new EngineeringError('INVALID_OBJECT_NAME', `${JSON.stringify(name)} is not an object name.`, 'Use letters, digits, spaces, dots, underscores or dashes, at most 80 characters.')
}

/** A `<connections>` block at one depth. */
function connectionsXml(connections: Readonly<Record<string, string>>, depth: number): string {
  const lines = Object.entries(connections).map(([name, expression]) => {
    if (!/^[A-Za-z_][\w.:-]*$/u.test(name)) throw new EngineeringError('INVALID_CONNECTION', `${JSON.stringify(name)} is not a connection name.`, 'Pass the connection as the export writes it, for example "Value" or "Visibility".')
    return `${'    '.repeat(depth + 1)}<connection name="${escapeAttribute(name)}" expression="${escapeAttribute(expression)}"/>\n`
  })
  return `${'    '.repeat(depth)}<connections>\n${lines.join('')}${'    '.repeat(depth)}</connections>\n`
}

/**
 * Build a new display document from a schema-valid skeleton.
 *
 * The schema version must follow the export, not the newest schema this
 * project knows about: Studio's Add Component Tool resolves the
 * `xsi:noNamespaceSchemaLocation` name against the schemas its own release
 * installed. A display written as `Gfx-ME17.xsd` on a Studio release whose
 * newest schema is `Gfx-ME16.xsd` imports with "schema could not be found" and
 * drops every object, leaving an empty display. The caller therefore passes
 * the version found in the opened export's existing display files; when none
 * declares one the default is the newest schema this host can see, never a
 * release number written into the source.
 *
 * @param op - Display identity and size.
 * @param schemaVersion - ME major version for `xsi:noNamespaceSchemaLocation`, e.g. "16".
 * @returns Whole XML text.
 */
export function createDisplay(op: DisplayCreateOperation, schemaVersion = defaultSchemaVersion()): string {
  const settings: Record<string, string> = {}
  if (op.displayType !== undefined) settings.displayType = op.displayType
  settings.width = String(op.width)
  settings.height = String(op.height)
  if (op.backColor !== undefined) settings.backColor = op.backColor
  if (op.displayNumber !== undefined) settings.displayNumber = String(op.displayNumber)
  const attributes = Object.entries(settings).map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME${schemaVersion}.xsd">\n    <displaySettings${attributes}/>\n</gfx>\n`
}

/**
 * Add one object to a display.
 *
 * The schema model decides the shape: whether the element carries its words in
 * `<states>` faces, in a `<caption>` child, or in a `caption` attribute, and
 * what state ids the family declares. A caption requested on an element the
 * schema gives no caption mechanism is refused here rather than written as an
 * attribute Studio will reject.
 *
 * @param xml - Display XML.
 * @param op - Object type, name, geometry and connections.
 * @param model - The schema model for the export's schema version.
 * @returns The modified XML.
 */
export function addObject(xml: string, op: ObjectAddOperation, model: SchemaModel): string {
  assertObjectStyle(op.type, op.name)
  const family = objectFamily(model, op.type)
  if (family === undefined) throw new EngineeringError('UNKNOWN_OBJECT_TYPE', `${op.type} is not an element the schema declares for a display.`, 'ftview_object_types lists the element names the schema declares.')
  const tree = parseDisplayTree(xml)
  const declared = displayType(model, op.type)
  const build = (depth: number): string => {
    const attributes: Record<string, string> = { name: escapeAttribute(op.name), ...op.attributes }
    const stateful = family.states
    const captionChild = family.captionChild
    if (op.caption !== undefined && !stateful && !captionChild) {
      if (!family.captionAttribute) throw new EngineeringError('INVALID_CAPTION', `${op.type} has no caption: the schema declares neither a caption attribute nor a <caption> child for it.`, 'Write the words on a text object, or drop the caption.')
      if (attributes.caption === undefined) attributes.caption = escapeAttribute(op.caption)
    }
    // Each child is written where this control's schema declares it, and in the
    // order the schema declares them, because an `xs:sequence` is ordered: a
    // `gauge` wants `<threshold>` before its animations, and a push button wants
    // `<states>` before them. Everything is collected by element name first so
    // the order comes from the schema and not from the branch that wrote it.
    //
    // A name maps to a LIST of lines, not one line. The schema repeats some
    // parts — `polyPolygon` carries an unbounded number of `<innerPolygon>` rows
    // — and keying by name alone kept only the last repeat. The draft's own
    // checks could not see it: the plan carried two rings, validation passed,
    // and the render dropped one, so the editor refused the whole object with
    // "A polyPolygon must contain at least 2 innerPolygons." Order inside a
    // repeat is the caller's, not the schema's.
    const written = new Map<string, string[]>()
    const write = (element: string, text: string): void => {
      const existing = written.get(element)
      if (existing === undefined) written.set(element, [text])
      else existing.push(text)
    }
    for (const part of op.children ?? []) {
      if (declared === undefined || !declared.children.includes(part.element)) throw new EngineeringError('INVALID_CHILD', `${op.type} declares no <${part.element}> child.`, declared === undefined ? 'ftview_object_types lists the element names the schema declares.' : `ftview_object_types with type=${op.type} lists the children this control declares.`)
      write(part.element, partXml(part, depth))
    }
    if (captionChild) {
      if (op.caption !== undefined) write('caption', captionXml(op.caption, op.attributes, depth))
    } else if (stateful) {
      if (op.caption !== undefined && family.faceCaptionType === undefined && op.states === undefined) throw new EngineeringError('INVALID_CAPTION', `${op.type} carries its words on state faces, and this control's faces declare no <caption> child to hold them.`, 'Write the words on a text object, or choose a control whose faces take captions.')
      const states = op.states ?? defaultStates(op.caption, op.attributes)
      if (states !== undefined && states.length > 0) write('states', statesXml(states, depth, family))
    }
    if (op.connections !== undefined) write('connections', connectionsXml(connectionNamesFor(op.type, op.connections), depth))
    if (op.animations?.visibility !== undefined) write('animations', animationsXml(op.animations.visibility, depth))
    const order = new Map((declared?.children ?? []).map((name, index) => [name, index]))
    const children = [...written.entries()]
      .sort((left, right) => (order.get(left[0]) ?? Number.MAX_SAFE_INTEGER) - (order.get(right[0]) ?? Number.MAX_SAFE_INTEGER))
      .flatMap(([, texts]) => texts)
    const inner = children.join('')
    return renderElement(op.type, attributes, inner === '' ? undefined : inner, depth)
  }
  if (op.parent !== undefined) {
    const parent = findNamed(tree.root, op.parent)
    if (parent === undefined) throw new EngineeringError('COMPONENT_NOT_FOUND', `No object is named ${JSON.stringify(op.parent)} in this display.`, 'Call ftview_get to see the object names, then add inside an existing group.')
    return insertChild(tree, parent, build(depthOf(tree.root, parent) + 1), op.index)
  }
  return insertChild(tree, tree.root, build(1), op.index)
}

/**
 * Two faces for a caption-only stateful control, so a button still shows text and
 * a pressed colour without the caller describing states.
 *
 * @param caption - Caption the caller passed, when any.
 * @param attributes - Object attributes, for the resting colour.
 * @returns Two states, or undefined when no caption was given.
 */
function defaultStates(caption: string | undefined, attributes: Readonly<Record<string, string>>): readonly ObjectState[] | undefined {
  if (caption === undefined) return undefined
  const backColor = attributes.backColor ?? '#24384A'
  const borderColor = attributes.borderColor ?? '#0E1620'
  return [
    { stateId: '0', caption, backColor, borderColor, fontSize: 18 },
    { stateId: '1', caption, backColor: '#2FA8E0', borderColor: '#2FA8E0', fontSize: 18 },
  ]
}

/**
 * Render `<states>` with one `<state>` per face, carrying only what THIS control
 * declares for a face.
 *
 * The legal ids come from the family's declared domain, which the schema states
 * differently per control: a push button allows `0`, `1` or `Error`; an
 * interlocked button allows `0` and `1` with no `Error` face; a multistate
 * button runs to 254; a symbol or indicator to 1999; the list and control
 * selectors to 255, again with no `Error` face. The old blanket rule — three
 * faces, `0|1|Error` for everything except multistateIndicator — refused legal
 * faces and wrote an `Error` face where the schema forbids one.
 *
 * The face content was blanket too: one hard-coded push-button caption — font
 * family, size, bold, italic, underline, strikethrough, `backStyle`, `wordWrap`
 * and `alignment="middleCenter"` — on every control. A list indicator's face
 * declares five attributes and an alignment of `left|center|right`, and a
 * symbol's face has no caption child at all, only `<imageSettings>`; the
 * installed editor refused all four selectors and the symbol, 141 of the 142
 * errors it reported for a draft of the whole object library. Each field now
 * goes where the schema declares it, and a field the control does not declare
 * is left out for Studio to default.
 *
 * @param states - Faces to write.
 * @param depth - Indentation depth of the control element.
 * @param family - The schema family, which carries the state-id domain and the face types.
 * @returns XML for the states child.
 */
function statesXml(states: readonly ObjectState[], depth: number, family: ObjectFamily): string {
  const pad = '    '.repeat(depth)
  const statePad = '    '.repeat(depth + 1)
  const facePad = '    '.repeat(depth + 2)
  const domain = family.stateId
  if (domain === undefined) throw new EngineeringError('INVALID_STATES', 'This element declares no state faces, so states cannot be written for it.', 'Choose a control whose schema family has a <states> child; ftview_object_types lists the children.')
  const stateType = family.stateType
  if (stateType === undefined) throw new EngineeringError('INVALID_STATES', 'This element declares a state id but no <state> type, so the schema cannot say what its faces hold.', 'Check the installed schema version; ftview_object_types with all="true" lists what it declares.')
  const rendered = states.map((state, index) => {
    const stateId = state.stateId ?? String(index)
    if (!stateIdAllowed(family, stateId)) throw new EngineeringError('INVALID_STATES', `${JSON.stringify(stateId)} is not a state id this control declares. The schema allows ${domainText(domain)}.`, domain.values?.includes('Error') === true ? 'Use a number inside the declared range, or "Error".' : 'Use a number inside the declared range; this family declares no "Error" face.')
    const given: Record<FaceChild, Map<string, string>> = { state: new Map([['stateId', escapeAttribute(stateId)]]), caption: new Map(), image: new Map() }
    for (const field of FACE_FIELDS) {
      if (field === 'stateId') continue
      const value = state[field]
      if (value === undefined) continue
      const home = faceFieldHome(family, field)
      if (home === undefined) continue
      given[home.where].set(field, faceValue(value))
    }
    // Attributes are written in the order this control's schema declares them, so
    // two drafts of the same request produce the same file.
    const stateAttrs = faceAttributes(stateType, given.state)
    const imageAttrs = given.image.size === 0 || family.faceImageType === undefined ? [] : faceAttributes(family.faceImageType, given.image)
    if (family.faceCaptionType === undefined && imageAttrs.length === 0) return `${statePad}<state ${stateAttrs.join(' ')}/>\n`
    const lines: string[] = []
    if (family.faceCaptionType !== undefined) lines.push(`${facePad}<caption ${faceAttributes(family.faceCaptionType, given.caption).join(' ')}/>\n`)
    if (imageAttrs.length > 0) lines.push(`${facePad}<imageSettings ${imageAttrs.join(' ')}/>\n`)
    return `${statePad}<state ${stateAttrs.join(' ')}>\n${lines.join('')}${statePad}</state>\n`
  })
  return `${pad}<states>\n${rendered.join('')}${pad}</states>\n`
}

/** Which element of a state face carries an attribute. */
type FaceChild = 'state' | 'caption' | 'image'

/**
 * One declared part of an object, written as a self-closing child.
 *
 * The tool validates the part's element against the control's declared children
 * before it gets here, and `ftview_draft_object_add` validates its attributes
 * against the part's own declared type, so this only formats.
 *
 * @param part - The element name and the attributes to write on it.
 * @param depth - Nesting depth for indentation.
 * @returns The element line.
 */
function partXml(part: ObjectPart, depth: number): string {
  const pad = '    '.repeat(depth)
  const attributes = Object.entries(part.attributes ?? {}).map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('')
  return `${pad}<${part.element}${attributes}/>\n`
}

/** One face value, formatted the way the export writes it. */
function faceValue(value: string | number | boolean): string {
  if (typeof value === 'number') return String(Math.trunc(value))
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return escapeAttribute(value)
}

/**
 * The attributes to write on one face element: what the caller set, plus the
 * tool's vendor-shaped defaults, each applied only where this control declares it.
 *
 * Rockwell's own displays carry the full face — font family and size, bold,
 * colours, alignment — so the defaults keep a drafted button looking like a vendor
 * one. They are no longer blanket: a list indicator's caption declares five
 * attributes and an alignment of `left|center|right`, so it gets those and not the
 * font set, and a symbol's face has no caption at all, so it gets none.
 *
 * @param type - The declared type of the face element.
 * @param given - The attributes the caller set, already escaped.
 * @returns The attributes in declaration order.
 */
function faceAttributes(type: SchemaType, given: Map<string, string>): string[] {
  const out: string[] = []
  for (const [name, declared] of Object.entries(type.attributes)) {
    const value = given.get(name)
    if (value !== undefined) {
      out.push(`${name}="${value}"`)
      continue
    }
    const fallback = name === 'alignment' ? faceAlignment(declared) : FACE_DEFAULTS[name]
    if (fallback === undefined) continue
    out.push(`${name}="${escapeAttribute(String(fallback))}"`)
  }
  return out
}

/** The caption alignment to default to, from what this control declares. */
function faceAlignment(declared: SchemaAttribute): string | undefined {
  const values = declared.values
  if (values === undefined || values.length === 0) return undefined
  if (values.includes('middleCenter')) return 'middleCenter'
  if (values.includes('center')) return 'center'
  return values[0]
}

/** The face attributes the tool fills in when the caller does not, vendor-shaped. */
const FACE_DEFAULTS: Readonly<Record<string, string | number | boolean>> = {
  fontFamily: 'Arial Unicode MS',
  fontSize: 14,
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  color: 'white',
  backColor: '#24384A',
  backStyle: 'transparent',
  blink: false,
  wordWrap: true,
}

/**
 * Render a visibility animation.
 *
 * @param visibility - Expression and the state that makes it true.
 * @param depth - Indentation depth of the control element.
 * @returns XML for the animations child.
 */
function animationsXml(visibility: NonNullable<ObjectAnimations['visibility']>, depth: number): string {
  const expression = visibility.expression.trim()
  if (expression === '') throw new EngineeringError('INVALID_ANIMATION', 'A visibility animation needs an expression.', 'Pass for example "{AutoRunning} = 0".')
  const trueState = visibility.expressionTrueState ?? 'visible'
  if (trueState !== 'visible' && trueState !== 'invisible') throw new EngineeringError('INVALID_ANIMATION', `${JSON.stringify(trueState)} is not a visibility state.`, 'Use "visible" or "invisible".')
  const pad = '    '.repeat(depth)
  return `${pad}<animations>\n${pad}    <animateVisibility expression="${escapeAttribute(expression)}" expressionTrueState="${trueState}"/>\n${pad}</animations>\n`
}

/**
 * Change attributes and connections on an existing object.
 *
 * @param xml - Display XML.
 * @param op - Target object and the changes.
 * @param model - The schema model, which decides the caption shape the target's element expects.
 * @returns The modified XML.
 */
export function setObject(xml: string, op: ObjectSetOperation, model: SchemaModel): string {
  let current = xml
  for (const [name, value] of Object.entries(op.attributes)) {
    if (!/^[A-Za-z_][\w.:-]*$/u.test(name)) throw new EngineeringError('INVALID_ATTRIBUTE', `${JSON.stringify(name)} is not an XML attribute name.`, 'Pass a plain attribute name such as "visible" or "left".')
    const tree = parseDisplayTree(current)
    const node = findNamed(tree.root, op.object)
    if (node === undefined) throw new EngineeringError('COMPONENT_NOT_FOUND', `No object is named ${JSON.stringify(op.object)} in this display.`, 'Call ftview_get to see the object names.')
    current = setNodeAttribute(tree, node, name, value)
  }
  if (op.caption !== undefined) {
    if (op.caption.length > 2000) throw new EngineeringError('INVALID_CAPTION', 'A caption is limited to 2000 characters.', 'Shorten the caption.')
    const tree = parseDisplayTree(current)
    const node = findNamed(tree.root, op.object)
    if (node === undefined) throw new EngineeringError('COMPONENT_NOT_FOUND', `No object is named ${JSON.stringify(op.object)} in this display.`, 'Call ftview_get to see the object names.')
    current = setCaption(tree, node, op.caption, objectFamily(model, node.type))
  }
  if (op.connections !== undefined) {
    for (const name of Object.keys(op.connections)) {
      if (!/^[A-Za-z_][\w.:-]*$/u.test(name)) throw new EngineeringError('INVALID_CONNECTION', `${JSON.stringify(name)} is not a connection name.`, 'Pass the connection name as the export writes it.')
      const tree = parseDisplayTree(current)
      const node = findNamed(tree.root, op.object)
      if (node === undefined) throw new EngineeringError('COMPONENT_NOT_FOUND', `No object is named ${JSON.stringify(op.object)} in this display.`, 'Call ftview_get to see the object names.')
      const expression = op.connections[name] as string
      let block = firstChildOfType(node, 'connections')
      if (block === undefined) {
        const depth = depthOf(tree.root, node)
        const inserted = insertChild(tree, node, connectionsXml({ [name]: expression }, depth + 1))
        current = inserted
        continue
      }
      const existing = block.children.find(child => child.type === 'connection' && decodeEntities(child.attributes.name ?? '') === name)
      if (existing !== undefined) {
        const existingTree = parseDisplayTree(current)
        const existingBlock = findNamed(existingTree.root, op.object)
        if (existingBlock === undefined) throw new EngineeringError('COMPONENT_NOT_FOUND', `No object is named ${JSON.stringify(op.object)} in this display.`, 'Call ftview_get to see the object names.')
        const connection = existingBlock.children.find(child => child.type === 'connections')?.children.find(child => child.type === 'connection' && decodeEntities(child.attributes.name ?? '') === name)
        if (connection === undefined) throw new EngineeringError('COMPONENT_NOT_FOUND', `Connection ${JSON.stringify(name)} disappeared while editing.`, 'Reopen the display and retry.')
        current = setNodeAttribute(existingTree, connection, 'expression', expression)
      } else {
        const depth = depthOf(tree.root, block)
        current = insertChild(tree, block, `${'    '.repeat(depth + 1)}<connection name="${escapeAttribute(name)}" expression="${escapeAttribute(expression)}"/>\n`)
      }
    }
  }
  return current
}

/**
 * Remove one object.
 *
 * @param xml - Display XML.
 * @param op - Target object.
 * @returns The modified XML.
 */
export function deleteObject(xml: string, op: ObjectDeleteOperation): string {
  const tree = parseDisplayTree(xml)
  const node = findNamed(tree.root, op.object)
  if (node === undefined) throw new EngineeringError('COMPONENT_NOT_FOUND', `No object is named ${JSON.stringify(op.object)} in this display.`, 'Call ftview_get to see the object names.')
  return removeNode(tree, node)
}

/**
 * Move one object within its siblings.
 *
 * @param xml - Display XML.
 * @param op - Target object and the new index.
 * @returns The modified XML.
 */
export function orderObject(xml: string, op: ObjectOrderOperation): string {
  const tree = parseDisplayTree(xml)
  const node = findNamed(tree.root, op.object)
  if (node === undefined) throw new EngineeringError('COMPONENT_NOT_FOUND', `No object is named ${JSON.stringify(op.object)} in this display.`, 'Call ftview_get to see the object names.')
  const parent = parentOf(tree.root, node)
  if (parent === undefined) throw new EngineeringError('UNSUPPORTED_TARGET', 'The display root cannot be reordered.', 'Target an object inside the display.')
  const element = xml.slice(node.start, node.end)
  const without = removeNode(tree, node)
  const next = parseDisplayTree(without)
  const target = op.object
  const parentName = parent.type === tree.root.type ? undefined : decodeEntities(parent.attributes.name ?? '')
  const container = parentName === undefined ? next.root : findNamed(next.root, parentName)
  if (container === undefined) throw new EngineeringError('COMPONENT_NOT_FOUND', `The parent of ${JSON.stringify(target)} disappeared while reordering.`, 'Reopen the display and retry.')
  return insertChild(next, container, element, op.index)
}

/**
 * Render the `<caption>` child that simple-button controls take.
 *
 * @param caption - Caption text.
 * @param attributes - Object attributes, for colour and font.
 * @param depth - Indentation depth of the control element.
 * @returns XML for the caption child.
 */
function captionXml(caption: string, attributes: Readonly<Record<string, string>>, depth: number): string {
  const pad = '    '.repeat(depth)
  const color = attributes.foreColor ?? 'white'
  return `${pad}<caption fontFamily="Arial Unicode MS" fontSize="16" bold="false" italic="false" underline="false" strikethrough="false" caption="${escapeAttribute(caption)}" color="${escapeAttribute(color)}" backColor="${escapeAttribute(attributes.backColor ?? '#0E1620')}" backStyle="transparent" alignment="middleCenter" wordWrap="true" blink="false"/>\n`
}
/**
 * Rename connections to the name a control's schema expects.
 *
 * A `multistateIndicator` binds through `Indicator`, not `Value`; importing the
 * wrong name fails in Studio with "connection with the name 'Value' is not valid".
 *
 * @param type - Control element type.
 * @param connections - Connections as the caller wrote them.
 * @returns Connections keyed by the names this control accepts.
 */
function connectionNamesFor(type: string, connections: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  if (type !== 'multistateIndicator' || connections.Value === undefined) return connections
  const mapped: Record<string, string> = {}
  for (const [name, expression] of Object.entries(connections)) mapped[name === 'Value' ? 'Indicator' : name] = expression
  return mapped
}
/**
 * Set the caption of an existing object in the shape its element expects.
 *
 * The schema family decides which shape that is: a control with a `<states>`
 * child keeps its words in the per-state `<caption>`, a control with a
 * `<caption>` child uses that child, and the rest take a `caption` attribute.
 * Writing the attribute where the schema declares neither is what Studio
 * rejects, so it is refused here.
 *
 * @param tree - Parsed display.
 * @param node - Target object.
 * @param caption - New caption text.
 * @param family - The element's schema family, undefined when the vocabulary does not declare it.
 * @returns The modified display XML.
 */
function setCaption(tree: DisplayTree, node: DisplayNode, caption: string, family: ObjectFamily | undefined): string {
  const escaped = escapeAttribute(caption)
  if (family === undefined) {
    // An older export keeps its displays in a <display> document whose objects
    // are generic elements the ME schema never described, so there is no family
    // to consult and the file's own shape is the only contract. A <gfx> document
    // is different: the schema governs it, and an element the host vocabulary
    // does not declare means the host schema is older than the export — guessing
    // the caption shape there can write content the newer Studio rejects.
    if (tree.root.type.toLowerCase() !== 'gfx') return setNodeAttribute(tree, node, 'caption', caption)
    throw new EngineeringError('SCHEMA_VOCABULARY_MISSING', `The schema vocabulary does not declare ${node.type}, so the shape of its caption cannot be chosen.`, 'Point FTVIEW_SCHEMA_DIR at the Schemas folder of the Studio release that wrote this export, or re-export the display from that release.')
  }
  if (family.states) {
    const inner = tree.xml.slice(node.tagEnd, node.contentEnd)
    if (!/<states[\s>]/u.test(inner)) throw new EngineeringError('INVALID_CAPTION', `${node.type} has no states to caption.`, 'Add the element with ftview_draft_object_add and states_json, or set states in Studio.')
    const replaced = inner.replace(/<caption\b[^>]*>/gu, tag => (/\bcaption="/u.test(tag) ? tag.replace(/\bcaption="[^"]*"/u, `caption="${escaped}"`) : tag))
    return tree.xml.slice(0, node.tagEnd) + replaced + tree.xml.slice(node.contentEnd)
  }
  if (family.captionChild) {
    const inner = tree.xml.slice(node.tagEnd, node.contentEnd)
    const replaced = inner.replace(/<caption\b[^>]*>/u, tag => (/\bcaption="/u.test(tag) ? tag.replace(/\bcaption="[^"]*"/u, `caption="${escaped}"`) : tag))
    if (replaced === inner) throw new EngineeringError('INVALID_CAPTION', `${node.type} has no caption child to change.`, 'Add the caption child in Studio, then retry.')
    return tree.xml.slice(0, node.tagEnd) + replaced + tree.xml.slice(node.contentEnd)
  }
  if (!family.captionAttribute) throw new EngineeringError('INVALID_CAPTION', `${node.type} has no caption: the schema declares neither a caption attribute nor a caption child for it.`, 'Write the words on a text object, or change an attribute this element does declare.')
  return setNodeAttribute(tree, node, 'caption', caption)
}

/** Attributes the alarm wizard writes on a `<trigger>` row; the import accepts these. */
export const TRIGGER_ATTRIBUTES = new Set([
  'type', 'ack-all-value', 'use-ack-all', 'ack-tag', 'exp', 'message-tag', 'message-handshake-exp',
  'message-notification-tag', 'remote-ack-exp', 'remote-ack-handshake-tag', 'label', 'handshake-tag',
])

/** Attributes the alarm wizard writes on a `<message>` row; the import accepts these. */
export const MESSAGE_ATTRIBUTES = new Set([
  'trigger-value', 'identifier', 'trigger', 'backcolor', 'forecolor', 'audio', 'display', 'print',
  'message-to-tag', 'text',
])

/** One `<trigger>` or `<message>` row found in an Alarms.xml. */
interface AlarmRow {
  readonly id: string
  readonly start: number
  readonly end: number
  readonly attributes: string
}

/** Collect every alarm row of one tag, with its id and byte span. */
function alarmRows(xml: string, tag: 'trigger' | 'message'): AlarmRow[] {
  const pattern = new RegExp(`<${tag}\\b((?:[^<>"']|"[^"]*"|'[^']*')*)/>`, 'gu')
  const rows: AlarmRow[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(xml)) !== null) {
    const attributes = match[1] ?? ''
    const id = attributeValue(attributes, 'id')
    if (id === undefined) continue
    rows.push({ id, start: match.index, end: match.index + match[0].length, attributes })
  }
  return rows
}

/** The next free row id: highest used number plus one. */
function nextAlarmId(rows: readonly AlarmRow[], prefix: string): string {
  let highest = 0
  for (const row of rows) {
    const digits = Number(row.id.slice(prefix.length))
    if (Number.isFinite(digits) && digits > highest) highest = digits
  }
  return `${prefix}${highest + 1}`
}

/** Indentation of the last row, so a new row lines up with its siblings. */
function alarmIndent(xml: string, row: AlarmRow | undefined): string {
  if (row === undefined) return '            '
  const lineStart = xml.lastIndexOf('\n', row.start) + 1
  const prefix = xml.slice(lineStart, row.start)
  return /^\s*$/u.test(prefix) ? prefix : '            '
}

/** Insert one row line above the line that closes its block. */
function insertAlarmRow(xml: string, closing: string, line: string): string {
  const at = xml.indexOf(closing)
  if (at < 0) throw new EngineeringError('ALARM_SHAPE', `The alarm document has no ${closing}.`, 'Pass an Alarms.xml exported by the Alarm Import Export Wizard; a hand-written skeleton is not enough.')
  const lineStart = xml.lastIndexOf('\n', at) + 1
  return xml.slice(0, lineStart) + line + xml.slice(lineStart)
}

/**
 * Add one alarm trigger with its first message row.
 *
 * Ids follow the wizard's own numbering (T and M, highest plus one), the new
 * trigger inherits the defaults the wizard gives a bit trigger, and the message
 * row is written in the shape the wizard exports, so a re-import round-trips.
 *
 * @param xml - Whole Alarms.xml.
 * @param op - Trigger expression and message text.
 * @returns The modified alarm document.
 */
export function addAlarm(xml: string, op: AlarmAddOperation): string {
  const exp = op.exp.trim()
  if (exp === '') {
    throw new EngineeringError('INVALID_ALARM', 'An alarm trigger needs an expression.', 'Pass an expression such as "{[PLC]PumpPS>5}"; run ftview_alarm_report to see the expressions this setup already uses.')
  }
  const eol = xml.includes('\r\n') ? '\r\n' : '\n'
  const triggers = alarmRows(xml, 'trigger')
  const messages = alarmRows(xml, 'message')
  const triggerId = nextAlarmId(triggers, 'T')
  const messageId = nextAlarmId(messages, 'M')
  const indent = alarmIndent(xml, triggers[triggers.length - 1] ?? messages[messages.length - 1])
  const ack = op.ackAll === undefined ? (op.type === 'bit' ? '1' : '0') : op.ackAll ? '1' : '0'
  const triggerLine = `${indent}<trigger id="${triggerId}" type="${op.type}" ack-all-value="${ack}" use-ack-all="${op.type === 'bit' ? 'true' : 'false'}" ack-tag="" exp="${escapeAttribute(exp)}" message-tag="" message-handshake-exp="" message-notification-tag="" remote-ack-exp="" remote-ack-handshake-tag="" label="${escapeAttribute(op.label ?? `Label${triggerId.slice(1)}`)}" handshake-tag=""/>${eol}`
  const messageLine = `${indent}<message id="${messageId}" trigger-value="${escapeAttribute(op.triggerValue ?? messageId.slice(1))}" identifier="0" trigger="#${triggerId}" backcolor="#800000" forecolor="#000000" audio="${op.audio ?? true}" display="${op.display ?? true}" print="${op.print ?? false}" message-to-tag="false" text="${escapeAttribute(op.text)}"/>${eol}`
  const withMessage = insertAlarmRow(xml, '</messages>', messageLine)
  return insertAlarmRow(withMessage, '</triggers>', triggerLine)
}

/**
 * Change one attribute on one alarm trigger or message row.
 *
 * @param xml - Whole Alarms.xml.
 * @param op - Target row, attribute and new value.
 * @returns The modified alarm document.
 */
export function setAlarmAttribute(xml: string, op: AlarmSetOperation): string {
  if (!/^[A-Za-z_][\w.:-]*$/u.test(op.attribute)) {
    throw new EngineeringError('INVALID_ATTRIBUTE', `${JSON.stringify(op.attribute)} is not an XML attribute name.`, 'Pass a plain attribute name such as "label" or "exp".')
  }
  const allowed = op.target === 'trigger' ? TRIGGER_ATTRIBUTES : MESSAGE_ATTRIBUTES
  if (!allowed.has(op.attribute)) {
    throw new EngineeringError('ALARM_ATTRIBUTE', `An alarm ${op.target} row has no ${JSON.stringify(op.attribute)} attribute.`, `Alarm ${op.target} rows accept: ${[...allowed].join(', ')}.`)
  }
  const row = alarmRows(xml, op.target).find(candidate => candidate.id === op.id)
  if (row === undefined) {
    throw new EngineeringError('ALARM_NOT_FOUND', `No alarm ${op.target} in this document has id ${JSON.stringify(op.id)}.`, 'Run ftview_alarm_report to list the trigger and message ids.')
  }
  if (new Set(['use-ack-all', 'audio', 'display', 'print', 'message-to-tag']).has(op.attribute) && !/^(true|false)$/u.test(op.value)) {
    throw new EngineeringError('INVALID_ALARM_VALUE', `${JSON.stringify(op.attribute)} takes "true" or "false", not ${JSON.stringify(op.value)}.`, 'Pass true or false.')
  }
  if (new Set(['ack-all-value', 'identifier', 'trigger-value']).has(op.attribute) && !/^-?\d*$/u.test(op.value)) {
    throw new EngineeringError('INVALID_ALARM_VALUE', `${JSON.stringify(op.attribute)} takes a number, not ${JSON.stringify(op.value)}.`, 'Pass an integer, or an empty value where the wizard allows one.')
  }
  const existing = new RegExp(`\\b${op.attribute}\\s*=\\s*("[^"]*"|'[^']*')`, 'u')
  const attributes = existing.test(row.attributes)
    ? row.attributes.replace(existing, `${op.attribute}="${escapeAttribute(op.value)}"`)
    : `${row.attributes} ${op.attribute}="${escapeAttribute(op.value)}"`
  return xml.slice(0, row.start) + `<${op.target}${attributes}/>` + xml.slice(row.end)
}

/**
 * Remove one alarm trigger and every message row that points at it.
 *
 * Deleting a trigger without its messages leaves rows whose `trigger` attribute
 * addresses nothing, which the wizard reports as import errors.
 *
 * @param xml - Whole Alarms.xml.
 * @param op - Trigger id to delete.
 * @returns The modified alarm document.
 */
export function deleteAlarm(xml: string, op: AlarmDeleteOperation): string {
  if (!/^T\d+$/u.test(op.trigger)) {
    throw new EngineeringError('INVALID_ALARM', `${JSON.stringify(op.trigger)} is not a trigger id.`, 'Pass the trigger id as the wizard writes it, for example "T12".')
  }
  const target = alarmRows(xml, 'trigger').find(row => row.id === op.trigger)
  if (target === undefined) {
    throw new EngineeringError('ALARM_NOT_FOUND', `No alarm trigger in this document has id ${JSON.stringify(op.trigger)}.`, 'Run ftview_alarm_report to list the trigger ids.')
  }
  const messages = alarmRows(xml, 'message').filter(row => attributeValue(row.attributes, 'trigger') === `#${op.trigger}`)
  const spans = [target, ...messages]
    .map(row => {
      let start = row.start
      while (start > 0 && xml[start - 1] !== '\n') start -= 1
      let end = row.end
      if (xml.startsWith('\r\n', end)) end += 2
      else if (xml[end] === '\n') end += 1
      return { start, end }
    })
    .sort((a, b) => b.start - a.start)
  let out = xml
  for (const span of spans) out = out.slice(0, span.start) + out.slice(span.end)
  return out
}