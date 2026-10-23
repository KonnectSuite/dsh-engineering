/**
 * The XML access layer the L5X readers navigate through.
 *
 * `fast-xml-parser` runs in preserved order, so a document is an array of
 * name-keyed nodes and the export's element order survives parsing. Nothing
 * outside this module touches that array: readers ask for children, an
 * attribute, or an element's text and get plain values back.
 *
 * Text follows the reference parser's ElementTree semantics, which is the
 * behavior the readers reproduce. An element's text is the concatenated
 * character data directly inside it — text nodes and CDATA sections, in order —
 * and stops at the first child element; a comment contributes nothing. The
 * readers then decide whether to strip, because the reference strips
 * descriptions and ladder text but keeps Structured Text lines verbatim.
 */

import { XMLParser } from 'fast-xml-parser'
import { SyntaxValidator } from 'fast-xml-validator'
import { L5xParseError } from './errors.ts'

/** An element's attributes, exactly as the export wrote them (always strings). */
interface XmlAttributes {
  readonly [name: string]: string
}

/** One parsed element, in whatever position the export wrote it. */
export interface XmlElement {
  /** The element's tag name; a non-element node has a reserved name instead. */
  readonly name: string
  /** The element's direct children, in written order; empty for an empty element. */
  readonly children: readonly XmlNode[]
  /** The element's attributes; empty for an element with none. */
  readonly attrs: XmlAttributes
}

/** A node inside an element: a child element, character data, or a comment. */
export type XmlNode =
  /** A child element, with its own children and attributes. */
  | XmlElement
  /** Character data between elements, or inside an empty element. */
  | { readonly name: '#text'; readonly text: string }
  /** A CDATA section, whose character data is reported as this element's text. */
  | { readonly name: '#cdata'; readonly text: string }
  /** A comment, which contributes no text. */
  | { readonly name: '#comment'; readonly text: string }

const TEXT_NODE = '#text'
const COMMENT_NODE = '#comment'

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  attributesGroupName: ':@',
  // The reference parser yields attribute values as text and never coerces
  // them, so `Number="0"` stays `"0"` and `parseInt` decides what it means.
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
  // CDATA is written in real exports. Naming the key keeps CDATA structurally
  // distinct from text at THIS boundary; `nodeText` merges the two, which is
  // what ElementTree reports, while comment nodes stay distinguishable.
  cdataPropName: '#cdata',
  // The reference parser reports a comment as its own node, so the readers can
  // tell one from character data. Left unnamed, the parser drops comments
  // entirely.
  commentPropName: '#comment',
})

const CDATA_NODE = '#cdata'

/**
 * Parse XML text into preserved-order nodes, one per top-level node.
 *
 * The document is validated first so a malformed export is refused with the
 * parser's own description of what is wrong — an unclosed tag, a stray
 * character — rather than with the partial tree a permissive parse would leave
 * behind. This is a parse failure, not a recoverable one: a reader that went on
 * would report an export that is not there.
 *
 * @param xml - The document text.
 * @returns Every top-level node, in written order.
 * @throws L5xParseError When the text is not well-formed XML.
 */
export function parseXml(xml: string): readonly XmlNode[] {
  assertWellFormed(xml)
  try {
    const parsed: unknown = parser.parse(xml)
    return normalise(asSequence(parsed))
  } catch (error) {
    /* v8 ignore next -- nesting past the parser's limit is a bare Error; the fallback keeps the message readable. */
    throw new L5xParseError(`Malformed XML: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** The parser's top-level value, which preservation makes a sequence of nodes. */
function asSequence(parsed: unknown): readonly unknown[] {
  /* v8 ignore next -- preservation always returns an array; this narrows the parser's any-typed result for the adapter below. */
  return Array.isArray(parsed) ? parsed : []
}

/**
 * Refuse text that is not well-formed XML.
 *
 * The validator reports what is wrong — an unclosed tag, a repeated attribute,
 * a stray character — where a permissive parse would return a partial tree that
 * a reader would then report as a project. This is a parse failure, not a
 * recoverable one.
 *
 * @param xml - The document text.
 * @throws L5xParseError When the text is not well-formed XML.
 */
function assertWellFormed(xml: string): void {
  try {
    SyntaxValidator.validate(xml)
  } catch (error) {
    /* v8 ignore next -- the validator reports refusal as a ValidationError; the literal fallback only covers a non-Error throw. */
    throw new L5xParseError(`Malformed XML: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * The document element.
 *
 * An export begins with an XML declaration, which parses as a top-level node
 * named `?xml`, and may carry processing instructions or a DOCTYPE before the
 * root; the first node that is neither is the document element.
 *
 * @param nodes - Top-level nodes from {@link parseXml}.
 * @returns The root element.
 * @throws L5xParseError When the document has no root element.
 */
export function documentRoot(nodes: readonly XmlNode[]): XmlElement {
  for (const node of nodes) {
    if (isElement(node) && !node.name.startsWith('?')) return node
  }
  throw new L5xParseError('Malformed XML: no root element')
}

/**
 * Direct children of an element that carry a tag name.
 *
 * @param element - Element to read.
 * @param name - Tag name to match, case-sensitively.
 * @returns Matching children, in written order.
 */
export function elementChildren(element: XmlElement, name: string): readonly XmlElement[] {
  const matches: XmlElement[] = []
  for (const child of element.children) {
    if (isElement(child) && child.name === name) matches.push(child)
  }
  return matches
}

/**
 * The first direct child with a tag name.
 *
 * @param element - Element to read.
 * @param name - Tag name to match, case-sensitively.
 * @returns The first matching child, or undefined when there is none.
 */
export function firstChild(element: XmlElement, name: string): XmlElement | undefined {
  for (const child of element.children) {
    if (isElement(child) && child.name === name) return child
  }
  return undefined
}

/**
 * An attribute value.
 *
 * @param element - Element to read.
 * @param name - Attribute name.
 * @returns The value, exactly as written.
 * @throws L5xParseError When the element does not carry the attribute.
 */
export function attribute(element: XmlElement, name: string): string {
  const value = element.attrs[name]
  if (value === undefined) {
    throw new L5xParseError(`Malformed XML: <${element.name}> has no ${name} attribute`)
  }
  return value
}

/**
 * An attribute value, or a caller-chosen substitute when it is absent.
 *
 * @param element - Element to read.
 * @param name - Attribute name.
 * @param fallback - Value returned when the attribute is absent.
 * @returns The value, exactly as written, or the fallback.
 */
export function optionalAttribute(element: XmlElement, name: string, fallback: string): string {
  return element.attrs[name] ?? fallback
}

/**
 * An attribute value, or undefined when it is absent or empty.
 *
 * The reference readers emit a field only when the export declares something to
 * put in it, so an attribute written as `Radix=""` is reported as undeclared.
 *
 * @param element - Element to read.
 * @param name - Attribute name.
 * @returns The value, or undefined when it is absent or empty.
 */
export function presentAttribute(element: XmlElement, name: string): string | undefined {
  return element.attrs[name] || undefined
}

/**
 * An element's text: its character data, stopping at the first child element.
 *
 * A comment contributes nothing, which is what the reference parser reports.
 * The loop keeps its element arm as the break condition even though `isElement`
 * already answered it, because that answer is what narrows `child` to a node
 * that carries text.
 *
 * @param element - Element to read.
 * @returns The text, or undefined when the element holds none. The caller
 * decides whether to strip it.
 */
export function nodeText(element: XmlElement): string | undefined {
  let text = ''
  for (const child of element.children) {
    if (isElement(child)) break
    /* v8 ignore next -- a node named as an element is already excluded above, so the comment test is the only remaining arm. */
    if (child.name !== COMMENT_NODE) text += child.text
  }
  return text === '' ? undefined : text
}

/**
 * Whether a node is an element rather than character data or a comment.
 *
 * @param node - Node to classify.
 * @returns True when the node carries children rather than character data.
 */
export function isElement(node: XmlNode): node is XmlElement {
  return node.name !== TEXT_NODE && node.name !== COMMENT_NODE && node.name !== CDATA_NODE
}

/**
 * Convert the parser's own object layout into {@link XmlNode} values.
 *
 * `fast-xml-parser` keys a preserved-order node by its tag name and carries
 * children and attributes under reserved keys. The reserved text and comment
 * names carry their character data directly, an element name carries the array
 * of its children, and an attribute group appears only on an element that has
 * attributes.
 *
 * @param value - The children at one position of a parsed document.
 * @returns The equivalent nodes, in written order.
 */
/* v8 ignore start -- adapter for fast-xml-parser's preserved-order output; every arm in
   this region is one that layout does not produce, and the suite holds every arm a real
   export does reach. */
function normalise(value: readonly unknown[]): readonly XmlNode[] {
  const nodes: XmlNode[] = []
  for (const entry of value) {
    if (isRecord(entry)) nodes.push(...nodesOf(entry))
  }
  return nodes
}

/** Every node of one parsed entry, in written order. */
function nodesOf(entry: XmlNodeMap): readonly XmlNode[] {
  const nodes: XmlNode[] = []
  for (const name of Object.keys(entry)) {
    if (name === ':@') continue
    const children = entry[name]
    if (name === TEXT_NODE) nodes.push(characterData(entry))
    else if (name === COMMENT_NODE) nodes.push({ name: COMMENT_NODE, text: '' })
    else if (name === CDATA_NODE) nodes.push(cdataNode(children))
    else if (Array.isArray(children)) nodes.push(elementNode(name, children, entry))
  }
  return nodes
}

/** Character data carried by an entry that declares the text node name. */
function characterData(entry: XmlNodeMap): XmlNode {
  const text = entry[TEXT_NODE]
  return { name: TEXT_NODE, text: typeof text === 'string' ? text : '' }
}

/** A CDATA section, which nests the character data it carries. */
function cdataNode(children: unknown): XmlNode {
  let text = ''
  if (Array.isArray(children)) {
    for (const child of children) {
      if (isRecord(child)) text += cdataTextOf(child)
    }
  }
  return { name: CDATA_NODE, text }
}

/** The character data inside one entry of a CDATA section. */
function cdataTextOf(child: XmlNodeMap): string {
  const text = child[TEXT_NODE]
  return typeof text === 'string' ? text : ''
}

/** One element entry, with its children and attributes. */
function elementNode(name: string, children: readonly unknown[], entry: XmlNodeMap): XmlElement {
  return { name, children: normalise(children), attrs: attributesOf(entry) }
}

/** The attribute group of an element entry, or an empty group when it has none. */
function attributesOf(entry: XmlNodeMap): XmlAttributes {
  const raw = entry[':@']
  const attrs: Record<string, string> = {}
  if (isRecord(raw)) {
    for (const key of Object.keys(raw)) {
      const value = raw[key]
      if (typeof value === 'string') attrs[key] = value
    }
  }
  return attrs
}
/* v8 ignore stop */

/** A preserved-order node as the parser writes it, before conversion. */
interface XmlNodeMap {
  readonly [name: string]: unknown
}

/** Whether a parsed value is a keyed record rather than a primitive. */
function isRecord(value: unknown): value is XmlNodeMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
