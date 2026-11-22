/**
 * Prove that what Studio imported is what we authored.
 *
 * An export is the vendor's own view of an application. Comparing a fresh
 * export against the prepared draft, object by object, is the only evidence
 * that the import took: file hashes would say nothing about what the engine
 * kept, normalised or rejected.
 *
 * @module dsh-engineering-ftview/handoff
 */

import type { FsService } from './core.ts'
import { attributeOf, parseDisplayTree, walk, type DisplayNode } from './display-tree.ts'

/** One object as it exists in a display. */
export interface ObjectSignature {
  /** Element type, e.g. `momentaryButton`. */
  readonly type: string
  /** Object name when it has one. */
  readonly name?: string
  /** Attributes, decoded, sorted by name. */
  readonly attributes: Readonly<Record<string, string>>
  /** Nested objects, in document order. */
  readonly children: readonly ObjectSignature[]
}

/** One difference between intended and imported. */
export interface SignatureDifference {
  /** Where the difference sits, e.g. `Main Screen > StartButton > caption`. */
  readonly path: string
  /** What the draft had. */
  readonly expected?: string
  /** What the import produced. */
  readonly actual?: string
}

/** Compare one display's intended and imported trees. */
export interface DisplayVerification {
  /** Export-relative display file. */
  readonly file: string
  /** True when the trees are identical after ignoring vendor defaults the draft did not set. */
  readonly matched: boolean
  /** Differences, capped by the caller. */
  readonly differences: readonly SignatureDifference[]
  /** Attributes or elements the vendor import added; normalisation, not a mismatch. */
  readonly normalised?: readonly SignatureDifference[]
}

/** One signature of a node, recursively. */
function signatureOfNode(node: DisplayNode): ObjectSignature {
  const attributes: Record<string, string> = {}
  for (const name of Object.keys(node.attributes).sort()) attributes[name] = attributeOf(node, name) ?? ''
  return {
    type: node.type,
    ...(node.attributes.name === undefined ? {} : { name: attributeOf(node, 'name') }),
    attributes,
    children: node.children.filter(child => child.attributes.name !== undefined || ['group', 'connections', 'states'].includes(child.type)).map(signatureOfNode),
  }
}

/**
 * Signature of one display document: its objects, nested, without layout noise.
 *
 * @param xml - Display XML.
 * @returns Root signature.
 */
export function signatureOf(xml: string): ObjectSignature {
  const tree = parseDisplayTree(xml)
  return { type: tree.root.type, attributes: {}, children: tree.root.children.map(signatureOfNode) }
}

/** Named colours the vendor exporter may emit where the draft wrote hex. */
const NAMED_COLOURS: Readonly<Record<string, string>> = {
  aqua: '#00ffff',
  black: '#000000',
  blue: '#0000ff',
  cyan: '#00ffff',
  fuchsia: '#ff00ff',
  gray: '#808080',
  green: '#008000',
  grey: '#808080',
  lime: '#00ff00',
  magenta: '#ff00ff',
  maroon: '#800000',
  navy: '#000080',
  olive: '#808000',
  purple: '#800080',
  red: '#ff0000',
  silver: '#c0c0c0',
  teal: '#008080',
  white: '#ffffff',
  yellow: '#ffff00',
}

/**
 * Compare one attribute, treating a named colour and its hex form as equal.
 *
 * The vendor export writes `white` where an authored display wrote `#FFFFFF`;
 * that is the same colour, not a mismatch the import introduced.
 */
function sameAttributeValue(name: string, left: string, right: string): boolean {
  if (left === right) return true
  if (!/colou?r/iu.test(name)) return false
  const canonical = (value: string): string => {
    const lower = value.trim().toLowerCase()
    const named = NAMED_COLOURS[lower]
    if (named !== undefined) return named
    if (/^#[0-9a-f]{6}$/u.test(lower)) return lower
    if (/^#[0-9a-f]{3}$/u.test(lower)) return `#${lower[1]}${lower[1]}${lower[2]}${lower[2]}${lower[3]}${lower[3]}`
    return lower
  }
  return canonical(left) === canonical(right)
}

/** Collect differences between two signatures at one path. */
function diff(expected: ObjectSignature, actual: ObjectSignature, path: string, out: SignatureDifference[], normalised: SignatureDifference[]): void {
  if (out.length >= 50) return
  if (expected.type !== actual.type) {
    out.push({ path, expected: expected.type, actual: actual.type })
    return
  }
  const names = new Set([...Object.keys(expected.attributes), ...Object.keys(actual.attributes)])
  for (const name of names) {
    const left = expected.attributes[name]
    const right = actual.attributes[name]
    if (left === undefined) {
      // An attribute the draft did not set is a vendor default the import
      // filled in, not a mismatch: the vendor export always carries its full
      // attribute set, while an authored display only carries what it set.
      normalised.push({ path: `${path} @${name}`, actual: right })
      continue
    }
    if (right === undefined || !sameAttributeValue(name, left, right)) {
      out.push({ path: `${path} @${name}`, expected: left, actual: right })
      if (out.length >= 50) return
    }
  }
  const expectedChildren = expected.children
  const actualChildren = actual.children
  for (let index = 0; index < Math.max(expectedChildren.length, actualChildren.length); index += 1) {
    const left = expectedChildren[index]
    const right = actualChildren[index]
    const label = left?.name ?? right?.name ?? `child[${index}]`
    if (left === undefined) { normalised.push({ path: `${path} > ${label}`, actual: 'present in import, missing in draft' }); continue }
    if (right === undefined) { out.push({ path: `${path} > ${label}`, expected: 'present in draft, missing in import' }); continue }
    diff(left, right, `${path} > ${label}`, out, normalised)
  }
}

/**
 * Compare the prepared draft's displays with a fresh export.
 *
 * @param fs - Filesystem provider.
 * @param root - Export folder produced by the vendor after the import.
 * @param expected - Export-relative file to intended XML.
 * @returns One verification per display.
 */
export async function verifyDisplays(fs: FsService, root: string, expected: ReadonlyMap<string, string>): Promise<readonly DisplayVerification[]> {
  const results: DisplayVerification[] = []
  for (const [file, intended] of expected) {
    const bytes = await fs.readBytes(`${root}/${file}`, undefined, 64 * 1024 * 1024)
    const actual = new TextDecoder('utf-8').decode(bytes)
    const differences: SignatureDifference[] = []
    const normalised: SignatureDifference[] = []
    try {
      diff(signatureOf(intended), signatureOf(actual), file, differences, normalised)
    } catch (error) {
      results.push({ file, matched: false, differences: [{ path: file, expected: 'a parsable display', actual: error instanceof Error ? error.message : String(error) }] })
      continue
    }
    results.push({ file, matched: differences.length === 0, differences, ...(normalised.length === 0 ? {} : { normalised }) })
  }
  return results
}

/** Whether every verification matched. */
export function allMatched(results: readonly DisplayVerification[]): boolean {
  return results.every(result => result.matched)
}
