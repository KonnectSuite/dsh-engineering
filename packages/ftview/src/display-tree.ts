/**
 * A source-positioned tree of one ME display.
 *
 * The flat object list was enough to report names, but authoring needs nesting
 * (groups), connection elements and state blocks, and every edit needs to
 * change only the bytes it owns. This scanner keeps element offsets in the
 * original text, so an untouched object is never re-serialized.
 *
 * @module dsh-engineering-ftview/display-tree
 */

import { EngineeringError } from './core.ts'

/** One element of a display document. */
export interface DisplayNode {
  /** Element name as written, e.g. `momentaryButton`. */
  readonly type: string
  /** Attributes in document order, values still entity-encoded. */
  readonly attributes: Readonly<Record<string, string>>
  /** Children in document order. */
  readonly children: readonly DisplayNode[]
  /** Offset of the opening `<`. */
  readonly start: number
  /** Offset just after the opening tag. */
  readonly tagEnd: number
  /** Offset just after the final child, or `tagEnd` for an empty element. */
  readonly contentEnd: number
  /** Offset just after the closing tag (or after `/>`). */
  readonly end: number
  /** True when the element was written as `<x ... />`. */
  readonly selfClosing: boolean
}

/** One parsed display document. */
export interface DisplayTree {
  /** The root element, `<gfx>` or `<display>`. */
  readonly root: DisplayNode
  /** The original text. */
  readonly xml: string
  /** Structural problems found while scanning. */
  readonly issues: readonly string[]
}

/** Decode the five XML entities that can appear in an attribute value. */
export function decodeEntities(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#10;', '\n')
    .replaceAll('&#xA;', '\n')
    .replaceAll('&amp;', '&')
}

/** Encode one attribute value for XML. */
export function encodeEntities(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\n', '&#10;')
}

/** One attribute of an opening tag. */
interface ParsedAttribute {
  readonly name: string
  readonly value: string
  readonly start: number
  readonly end: number
}

/** Scan one opening tag starting at `start`. */
function scanTag(xml: string, start: number): { name: string; attributes: ParsedAttribute[]; tagEnd: number; selfClosing: boolean } {
  let cursor = start + 1
  const nameMatch = /^[A-Za-z_][\w.:-]*/u.exec(xml.slice(cursor))
  if (nameMatch === null) throw new EngineeringError('INVALID_DISPLAY', `Malformed element at offset ${start}.`, 'Open the file with ftview_get and fix the markup, or restore it from a backup.')
  const name = nameMatch[0]
  cursor += name.length
  const attributes: ParsedAttribute[] = []
  while (cursor < xml.length) {
    const character = xml[cursor] as string
    if (character === '>') {
      const before = xml.slice(start, cursor)
      return { name, attributes, tagEnd: cursor + 1, selfClosing: /\/\s*$/u.test(before) }
    }
    if (/\s/u.test(character)) { cursor += 1; continue }
    if (character === '/') { cursor += 1; continue }
    const attributeStart = cursor
    const attributeName = /^[A-Za-z_][\w.:-]*/u.exec(xml.slice(cursor))
    if (attributeName === null) throw new EngineeringError('INVALID_DISPLAY', `Malformed attribute in <${name}> at offset ${cursor}.`, 'Fix the attribute name, then reopen the display.')
    cursor += attributeName[0].length
    while (xml[cursor] === ' ' || xml[cursor] === '\t') cursor += 1
    if (xml[cursor] !== '=') {
      attributes.push({ name: attributeName[0], value: '', start: attributeStart, end: cursor })
      continue
    }
    cursor += 1
    while (xml[cursor] === ' ' || xml[cursor] === '\t') cursor += 1
    const quote = xml[cursor]
    if (quote !== '"' && quote !== "'") throw new EngineeringError('INVALID_DISPLAY', `Unquoted value for ${attributeName[0]} in <${name}>.`, 'Quote every attribute value, then reopen the display.')
    const valueStart = cursor + 1
    cursor = xml.indexOf(quote, valueStart)
    if (cursor < 0) throw new EngineeringError('INVALID_DISPLAY', `Unterminated value for ${attributeName[0]} in <${name}>.`, 'Close the quote, then reopen the display.')
    attributes.push({ name: attributeName[0], value: xml.slice(valueStart, cursor), start: attributeStart, end: cursor + 1 })
    cursor += 1
  }
  throw new EngineeringError('INVALID_DISPLAY', `Unterminated <${name}> element.`, 'Fix the element, then reopen the display.')
}

/**
 * Scan one display document into a tree.
 *
 * @param xml - Whole display file.
 * @returns Root element, the source text and any structural issues.
 */
export function parseDisplayTree(xml: string): DisplayTree {
  const issues: string[] = []
  let root: DisplayNode | undefined
  const stack: { type: string; attributes: Record<string, string>; children: DisplayNode[]; start: number; tagEnd: number; selfClosing: boolean }[] = []
  let cursor = 0
  while (cursor < xml.length) {
    const open = xml.indexOf('<', cursor)
    if (open < 0) break
    if (xml.startsWith('<!--', open)) {
      const end = xml.indexOf('-->', open + 4)
      if (end < 0) { issues.push(`Unterminated comment at offset ${open}.`); break }
      cursor = end + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', open)) {
      const end = xml.indexOf(']]>', open + 9)
      if (end < 0) { issues.push(`Unterminated CDATA at offset ${open}.`); break }
      cursor = end + 3
      continue
    }
    if (xml.startsWith('<?', open)) {
      const end = xml.indexOf('?>', open + 2)
      if (end < 0) { issues.push(`Unterminated processing instruction at offset ${open}.`); break }
      cursor = end + 2
      continue
    }
    if (xml.startsWith('<!', open)) {
      const end = xml.indexOf('>', open + 2)
      if (end < 0) { issues.push(`Unterminated declaration at offset ${open}.`); break }
      cursor = end + 1
      continue
    }
    if (xml.startsWith('</', open)) {
      const end = xml.indexOf('>', open + 2)
      if (end < 0) { issues.push(`Unterminated closing tag at offset ${open}.`); break }
      const name = xml.slice(open + 2, end).trim()
      const current = stack.pop()
      if (current === undefined || current.type !== name) {
        issues.push(`Unexpected </${name}> at offset ${open}.`)
        cursor = end + 1
        continue
      }
      const node: DisplayNode = {
        type: current.type,
        attributes: current.attributes,
        children: current.children,
        start: current.start,
        tagEnd: current.tagEnd,
        contentEnd: current.children.length === 0 ? current.tagEnd : (current.children[current.children.length - 1] as DisplayNode).end,
        end: end + 1,
        selfClosing: false,
      }
      const parent = stack[stack.length - 1]
      if (parent === undefined) root = node
      else parent.children.push(node)
      cursor = end + 1
      continue
    }
    const tag = scanTag(xml, open)
    const attributes: Record<string, string> = {}
    for (const attribute of tag.attributes) attributes[attribute.name] = attribute.value
    if (tag.selfClosing) {
      const node: DisplayNode = { type: tag.name, attributes, children: [], start: open, tagEnd: tag.tagEnd, contentEnd: tag.tagEnd, end: tag.tagEnd, selfClosing: true }
      const parent = stack[stack.length - 1]
      if (parent === undefined) root = node
      else parent.children.push(node)
      cursor = tag.tagEnd
      continue
    }
    stack.push({ type: tag.name, attributes, children: [], start: open, tagEnd: tag.tagEnd, selfClosing: false })
    cursor = tag.tagEnd
  }
  if (stack.length > 0) issues.push(`Unclosed element <${stack[stack.length - 1]?.type}>.`)
  if (root === undefined) throw new EngineeringError('INVALID_DISPLAY', 'The file has no root element.', 'Pass a FactoryTalk View display XML file.')
  return { root, xml, issues }
}

/** The raw text of one node. */
export function nodeText(tree: DisplayTree, node: DisplayNode): string {
  return tree.xml.slice(node.start, node.end)
}

/** Children of one type, in document order. */
export function childrenOfType(node: DisplayNode, type: string): readonly DisplayNode[] {
  return node.children.filter(child => child.type === type)
}

/** The first child of one type. */
export function firstChildOfType(node: DisplayNode, type: string): DisplayNode | undefined {
  return node.children.find(child => child.type === type)
}

/** Decoded attribute value, or undefined when absent. */
export function attributeOf(node: DisplayNode, name: string): string | undefined {
  const raw = node.attributes[name]
  return raw === undefined ? undefined : decodeEntities(raw)
}

/** Depth-first walk. */
export function walk(node: DisplayNode, visit: (node: DisplayNode, depth: number) => void, depth = 0): void {
  visit(node, depth)
  for (const child of node.children) walk(child, visit, depth + 1)
}

/** Every named object in the display, nested, in document order. */
export function namedObjects(root: DisplayNode): readonly DisplayNode[] {
  const found: DisplayNode[] = []
  for (const child of root.children) walk(child, node => { if (node.attributes.name !== undefined) found.push(node) })
  return found
}

/** Serialize attributes with their original quoting. */
function renderAttributes(attributes: Readonly<Record<string, string>>): string {
  return Object.entries(attributes).map(([name, value]) => ` ${name}="${value}"`).join('')
}

/**
 * Set one attribute on a node, changing only its opening tag.
 *
 * @param tree - Parsed display.
 * @param node - Target element.
 * @param name - Attribute name.
 * @param value - Plain value; entities are encoded here.
 * @returns New document text.
 */
export function setAttribute(tree: DisplayTree, node: DisplayNode, name: string, value: string): string {
  const tag = tree.xml.slice(node.start, node.tagEnd)
  const encoded = encodeEntities(value)
  const pattern = new RegExp(`(\\s${name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s*=\\s*)("[^"]*"|'[^']*')`, 'u')
  if (pattern.test(tag)) {
    const replaced = tag.replace(pattern, `$1"${encoded}"`)
    return tree.xml.slice(0, node.start) + replaced + tree.xml.slice(node.tagEnd)
  }
  // Insert before the tag's closing '>' or '/>'.
  const insertion = /(\/?)\s*>$/u.exec(tag)
  if (insertion === null) throw new EngineeringError('INVALID_DISPLAY', `Cannot extend <${node.type}>.`, 'Fix the opening tag, then retry.')
  const at = tag.length - insertion[0].length
  const closing = insertion[1] === '/' ? '/>' : '>'
  const rebuilt = `${tag.slice(0, at)} ${name}="${encoded}"${closing}`
  return tree.xml.slice(0, node.start) + rebuilt + tree.xml.slice(node.tagEnd)
}

/** Remove one element from a document. */
export function removeNode(tree: DisplayTree, node: DisplayNode): string {
  return tree.xml.slice(0, node.start) + tree.xml.slice(node.end)
}

/**
 * Insert an element inside a parent, at one child index.
 *
 * @param tree - Parsed display.
 * @param parent - Parent element.
 * @param childXml - Element text, already indented for its depth.
 * @param index - Insert before this child; defaults to the end.
 * @returns New document text.
 */
export function insertChild(tree: DisplayTree, parent: DisplayNode, childXml: string, index?: number): string {
  if (parent.selfClosing) {
    const tag = tree.xml.slice(parent.start, parent.tagEnd)
    const opened = tag.replace(/\/\s*>$/u, '>')
    const rebuilt = `${opened}${childXml}</${parent.type}>`
    return tree.xml.slice(0, parent.start) + rebuilt + tree.xml.slice(parent.tagEnd)
  }
  const children = parent.children
  if (index === undefined || index >= children.length) {
    // Append on a new line after the last child, not inside its own line.
    const newline = tree.xml.indexOf('\n', parent.contentEnd)
    const at = newline < 0 ? tree.xml.length : newline + 1
    return tree.xml.slice(0, at) + childXml + tree.xml.slice(at)
  }
  const at = (children[Math.max(0, index)] as DisplayNode).start
  return tree.xml.slice(0, at) + childXml + tree.xml.slice(at)
}

/** Indentation prefix for one depth. */
export function indent(depth: number): string {
  return '    '.repeat(Math.max(0, depth))
}

/**
 * Render a new element.
 *
 * @param type - Element name.
 * @param attributes - Attribute values, already encoded where needed.
 * @param inner - Child markup, or undefined for an empty element.
 * @param depth - Indentation depth.
 * @returns Element text.
 */
export function renderElement(type: string, attributes: Readonly<Record<string, string>>, inner: string | undefined, depth: number): string {
  const open = `${indent(depth)}<${type}${renderAttributes(attributes)}`
  return inner === undefined ? `${open}/>\n` : `${open}>\n${inner}${indent(depth)}</${type}>\n`
}

/** Locate one named object anywhere in the tree. */
export function findNamed(root: DisplayNode, name: string): DisplayNode | undefined {
  let found: DisplayNode | undefined
  walk(root, node => {
    if (found === undefined && attributeOf(node, 'name') === name) found = node
  })
  return found
}

/** Path of one node, e.g. `gfx > group[Group1] > momentaryButton`. */
export function nodePath(node: DisplayNode): string {
  return node.type
}
