/** Locate validated XML elements without serializing untouched source bytes. */
import { documentRoot, parseXml } from '../model/xml.ts'
import { EngineeringError } from '../session.ts'

/** Element positions in the original export, including its start and closing tags. */
export interface XmlRegion {
  readonly kind: string
  readonly attributes: Readonly<Record<string, string>>
  readonly start: number
  readonly contentStart: number
  readonly contentEnd: number
  readonly end: number
  readonly children: readonly XmlRegion[]
  readonly selfClosing: boolean
}
interface MutableRegion {
  kind: string; attributes: Readonly<Record<string, string>>; start: number; contentStart: number; contentEnd: number; end: number; children: MutableRegion[]; selfClosing: boolean
}

/** Locate elements in XML that has already passed the L5X parser.
 * @param xml - Validated export text.
 * @returns Source regions; malformed or unsupported markup throws before editing.
 */
export function xmlRegions(xml: string): readonly XmlRegion[] {
  const roots: MutableRegion[] = []
  const stack: MutableRegion[] = []
  let cursor = 0
  while (cursor < xml.length) {
    const start = xml.indexOf('<', cursor)
    if (start < 0) break
    const skip = xml.startsWith('<!--', start) ? '-->' : xml.startsWith('<![CDATA[', start) ? ']]>' : xml.startsWith('<?', start) ? '?>' : undefined
    if (skip !== undefined) {
      const end = xml.indexOf(skip, start + 2)
      if (end < 0) throw new EngineeringError('INVALID_XML_REGION', 'Unterminated XML text block')
      cursor = end + skip.length; continue
    }
    if (xml.startsWith('<!', start)) throw new EngineeringError('UNSUPPORTED_XML', 'XML declarations other than comments and CDATA cannot be edited')
    let quote = ''
    let end = start + 1
    for (; end < xml.length; end++) {
      const char = xml[end]!
      if (quote !== '') { if (char === quote) quote = '' }
      else if (char === '"' || char === "'") quote = char
      else if (char === '>') break
    }
    if (end === xml.length) throw new EngineeringError('INVALID_XML_REGION', 'Unterminated XML element')
    cursor = end + 1
    const markup = xml.slice(start, cursor)
    if (markup.startsWith('</')) {
      const region = stack.pop()
      if (region === undefined || markup.slice(2, -1).trim() !== region.kind) throw new EngineeringError('INVALID_XML_REGION', 'Mismatched closing element')
      region.contentEnd = start; region.end = cursor
      continue
    }
    const selfClosing = /\/\s*>$/u.test(markup)
    const element = documentRoot(parseXml(selfClosing ? markup : markup.slice(0, -1) + '/>'))
    const region: MutableRegion = { kind: element.name, attributes: element.attrs, start, contentStart: cursor, contentEnd: cursor, end: cursor, children: [], selfClosing }
    const parent = stack[stack.length - 1]
    if (parent === undefined) roots.push(region)
    else parent.children.push(region)
    if (!selfClosing) stack.push(region)
  }
  if (stack.length > 0) throw new EngineeringError('INVALID_XML_REGION', 'Unclosed XML element')
  return roots
}

/** Find exactly one direct child, with optional case-insensitive Logix name matching.
 * @param parents - Source regions to search.
 * @param kind - XML element name.
 * @param name - Optional Name attribute.
 * @returns Unique matching region, or throws for absent or ambiguous targets.
 */
export function uniqueRegion(parents: readonly XmlRegion[], kind: string, name?: string): XmlRegion {
  const matches = parents.filter(region => region.kind === kind && (name === undefined || region.attributes.Name?.toLowerCase() === name.toLowerCase()))
  // Absent and ambiguous are different repairs: a missing name needs the declared names, a
  // duplicated one needs a narrower scope. Reporting both as AMBIGUOUS_TARGET sent a reader
  // looking for duplicates that were never there.
  if (matches.length === 0) throw new EngineeringError('COMPONENT_NOT_FOUND', `No ${kind}${name === undefined ? '' : ' named ' + name} in this scope.`, 'Call list_components to see the names this scope declares, then retry with one of them.')
  if (matches.length > 1) throw new EngineeringError('AMBIGUOUS_TARGET', `Expected one ${kind}${name === undefined ? '' : ` named ${name}`}; found ${matches.length}`, 'Narrow the scope: more than one ' + kind + ' matches this name.')
  return matches[0]!
}
