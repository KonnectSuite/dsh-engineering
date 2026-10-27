/**
 * A small XML reader for FactoryTalk View display exports.
 *
 * Gfx exports are a regular subset of XML (no DTD, no namespaces, no mixed
 * content beyond captions), so a compact reader is enough and keeps the
 * renderer free of a DOM dependency: the same tree is produced in the browser
 * and in Node tests.
 *
 * @module dsh-engineering-ftview-viewer/xml
 */

/** One element in a display file. */
export interface XmlNode {
  /** Element name, e.g. `momentaryButton`. */
  readonly tag: string
  /** Attributes, verbatim. */
  readonly attributes: Readonly<Record<string, string>>
  /** Child elements, in document order. */
  readonly children: readonly XmlNode[]
  /** Decoded text directly inside this element. */
  readonly text: string
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

/** Decode the five predefined entities and numeric references. */
function decode(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/giu, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) return String.fromCodePoint(Number.parseInt(body.slice(2), 16))
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10))
    return ENTITIES[body.toLowerCase()] ?? whole
  })
}

/** Read attributes out of one start tag body. */
function attributesOf(body: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const match of body.matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/gu)) {
    const name = match[1] ?? ''
    const value = match[3] ?? match[4] ?? ''
    attributes[name] = decode(value)
  }
  return attributes
}

/**
 * Parse one display export into a tree.
 *
 * Comments, the XML declaration and whitespace between elements are ignored.
 * A malformed document throws rather than rendering a partial display.
 *
 * @param source - The XML text.
 * @returns The root element (`display`).
 */
export function parseXml(source: string): XmlNode {
  const root: XmlNode = { tag: '#root', attributes: {}, children: [], text: '' }
  const stack: XmlNode[] = [root]
  const pattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_:][-A-Za-z0-9_:.]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/gu
  let last = 0
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) {
      const text = source.slice(last, index)
      const parent = stack[stack.length - 1]
      if (parent !== undefined) (parent as { text: string }).text += decode(text)
    }
    last = index + match[0].length
    if (match[0].startsWith('<!--') || match[0].startsWith('<?')) continue
    if (match[1] !== undefined) {
      const parent = stack[stack.length - 1]
      if (parent !== undefined) (parent as { text: string }).text += match[1]
      continue
    }
    const closing = match[2] === '/'
    const tag = match[3] ?? ''
    if (closing) {
      const open = stack.pop()
      if (open === undefined || open.tag !== tag) throw new Error(`mismatched </${tag}> in display XML`)
      continue
    }
    const node: XmlNode = { tag, attributes: attributesOf(match[4] ?? ''), children: [], text: '' }
    const parent = stack[stack.length - 1]
    if (parent === undefined) throw new Error(`unexpected <${tag}>`)
    ;(parent as unknown as { children: XmlNode[] }).children.push(node)
    if (match[5] !== '/') stack.push(node)
  }
  if (stack.length !== 1) throw new Error(`unclosed <${stack[stack.length - 1]?.tag ?? ''}> in display XML`)
  // A display export roots at <gfx> (with <displaySettings> and the objects as
  // children); a hand-written or test document may root at <display>. Both are
  // one document element, so return whichever it is.
  const document = root.children[0]
  if (document === undefined) throw new Error('empty display XML')
  return document
}

/** The first child with one tag name. */
export function child(node: XmlNode, tag: string): XmlNode | undefined {
  return node.children.find(candidate => candidate.tag === tag)
}

/** Every child with one tag name. */
export function children(node: XmlNode, tag: string): readonly XmlNode[] {
  return node.children.filter(candidate => candidate.tag === tag)
}

/** One attribute, trimmed, or undefined when absent or empty. */
export function attribute(node: XmlNode, name: string): string | undefined {
  const value = node.attributes[name]
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** A numeric attribute with a fallback. */
export function numberAttribute(node: XmlNode, name: string, fallback: number): number {
  const value = attribute(node, name)
  if (value === undefined) return fallback
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
