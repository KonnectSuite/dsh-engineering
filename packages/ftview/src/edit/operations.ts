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
export type EditOperation = DisplaySetOperation | DisplayAddOperation | TagUpsertOperation

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
 * @param xml - Display XML.
 * @param name - New display name.
 * @returns The modified XML.
 */
export function renameDisplay(xml: string, name: string): string {
  return setAttribute(xml, undefined, 'name', name)
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
