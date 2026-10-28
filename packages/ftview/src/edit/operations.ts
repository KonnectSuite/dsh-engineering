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

/** One staged edit. */
export type EditOperation = DisplaySetOperation | DisplayAddOperation | TagUpsertOperation | DisplayCreateOperation | ObjectAddOperation | ObjectSetOperation | ObjectDeleteOperation | ObjectOrderOperation

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
}

/** One face of a button or indicator, written as `<states><state>`. */
export interface ObjectState {
  /** State id as the export writes it: "0", "1" or "Error" for buttons. */
  readonly stateId?: string
  /** Value that selects this state on a value-triggered indicator. */
  readonly value?: number
  /** Caption drawn on the face. */
  readonly caption?: string
  /** Caption font size, default 14. */
  readonly fontSize?: number
  /** Caption colour, default "white". */
  readonly color?: string
  /** Face background colour. */
  readonly backColor?: string
  /** Face border colour. */
  readonly borderColor?: string
  /** Blink the face. */
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

/**
 * Controls whose face is a `<states>` child rather than a `caption` attribute.
 *
 * `Gfx-ME17.xsd` rejects `caption` on these elements; their captions and colours
 * live in per-state `<caption>` children.
 */
const STATEFUL_TYPES = new Set([
  'momentaryButton', 'maintainButton', 'maintainedButton', 'latchedButton', 'multistateButton',
  'rampButton', 'multistateIndicator',
])

/** Controls whose caption is a <caption> child rather than a states face. */
const CAPTION_CHILD_TYPES = new Set([
  'gotoButton', 'closeButton', 'clearAlarmBannerButton', 'acknowledgeAlarmButton', 'silenceAlarmsButton',
  'diagnosticsClearButton', 'diagnosticsClearAllButton', 'informationAckButton',
  'moveUpKey', 'moveDownKey', 'moveLeftKey', 'moveRightKey',
])

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
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
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

/** Elements that are parts of an object, never objects themselves. */
const RESERVED = new Set(['gfx', 'display', 'displaySettings', 'connections', 'connection', 'states', 'state', 'caption', 'imageSettings', 'animations', 'parameters', 'parameter', 'font', 'color'])

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
 * @param op - Display identity and size.
 * @returns Whole XML text.
 */
export function createDisplay(op: DisplayCreateOperation): string {
  const settings: Record<string, string> = {}
  if (op.displayType !== undefined) settings.displayType = op.displayType
  settings.width = String(op.width)
  settings.height = String(op.height)
  if (op.backColor !== undefined) settings.backColor = op.backColor
  if (op.displayNumber !== undefined) settings.displayNumber = String(op.displayNumber)
  const attributes = Object.entries(settings).map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">\n    <displaySettings${attributes}/>\n</gfx>\n`
}

/**
 * Add one object to a display.
 *
 * @param xml - Display XML.
 * @param op - Object type, name, geometry and connections.
 * @returns The modified XML.
 */
export function addObject(xml: string, op: ObjectAddOperation): string {
  assertObjectStyle(op.type, op.name)
  const tree = parseDisplayTree(xml)
  const build = (depth: number): string => {
    const attributes: Record<string, string> = { name: escapeAttribute(op.name), ...op.attributes }
    const stateful = STATEFUL_TYPES.has(op.type)
    const captionChild = CAPTION_CHILD_TYPES.has(op.type)
    if (op.caption !== undefined && !stateful && !captionChild && attributes.caption === undefined) attributes.caption = escapeAttribute(op.caption)
    const children: string[] = []
    if (captionChild) {
      if (op.caption !== undefined) children.push(captionXml(op.caption, op.attributes, depth))
      if (op.animations?.visibility !== undefined) children.push(animationsXml(op.animations.visibility, depth))
      if (op.connections !== undefined) children.push(connectionsXml(op.connections, depth))
    } else if (stateful) {
      const states = op.states ?? defaultStates(op.caption, op.attributes)
      if (states !== undefined && states.length > 0) children.push(statesXml(states, depth, op.type))
      if (op.animations?.visibility !== undefined) children.push(animationsXml(op.animations.visibility, depth))
      if (op.connections !== undefined) children.push(connectionsXml(op.connections, depth))
    } else {
      if (op.connections !== undefined) children.push(connectionsXml(op.connections, depth))
      if (op.animations?.visibility !== undefined) children.push(animationsXml(op.animations.visibility, depth))
    }
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
 * Render `<states>` with one `<state>` and `<caption>` per face.
 *
 * @param states - Faces to write.
 * @param depth - Indentation depth of the control element.
 * @param type - Control type, used for the state-id rules.
 * @returns XML for the states child.
 */
function statesXml(states: readonly ObjectState[], depth: number, type: string): string {
  const pad = '    '.repeat(depth)
  const statePad = '    '.repeat(depth + 1)
  const captionPad = '    '.repeat(depth + 2)
  const indicator = type === 'multistateIndicator'
  if (!indicator && states.length > 3) throw new EngineeringError('INVALID_STATES', 'A button accepts at most three states (0, 1 and Error).', 'Pass at most three states, or use multistateIndicator for many values.')
  const rendered = states.map((state, index) => {
    const stateId = state.stateId ?? String(index)
    if (!indicator && !/^(0|1|Error)$/u.test(stateId)) throw new EngineeringError('INVALID_STATES', `${JSON.stringify(stateId)} is not a button state id.`, 'Use "0", "1" or "Error" for a button state.')
    if (indicator && !/^(\d+|Error)$/u.test(stateId)) throw new EngineeringError('INVALID_STATES', `${JSON.stringify(stateId)} is not an indicator state id.`, 'Use a number (0, 1, 2 …) or "Error" for an indicator state.')
    const face = state.backColor ?? '#24384A'
    const border = state.borderColor ?? face
    const attrs = [`stateId="${escapeAttribute(stateId)}"`]
    if (state.value !== undefined) attrs.push(`value="${Math.trunc(state.value)}"`)
    attrs.push(`backColor="${escapeAttribute(face)}"`, `borderColor="${escapeAttribute(border)}"`, `blink="${state.blink === true ? 'true' : 'false'}"`)
    const caption = `<caption fontFamily="Arial Unicode MS" fontSize="${state.fontSize ?? 14}" bold="false" italic="false" underline="false" strikethrough="false" caption="${escapeAttribute(state.caption ?? '')}" color="${escapeAttribute(state.color ?? 'white')}" backColor="${escapeAttribute(face)}" backStyle="transparent" alignment="middleCenter" wordWrap="true" blink="false"/>`
    return `${statePad}<state ${attrs.join(' ')}>\n${captionPad}${caption}\n${statePad}</state>\n`
  })
  return `${pad}<states>\n${rendered.join('')}${pad}</states>\n`
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
 * @returns The modified XML.
 */
export function setObject(xml: string, op: ObjectSetOperation): string {
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
    current = setNodeAttribute(tree, node, 'caption', op.caption)
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