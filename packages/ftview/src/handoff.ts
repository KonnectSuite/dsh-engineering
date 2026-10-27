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
  /** True when the trees are identical. */
  readonly matched: boolean
  /** Differences, capped by the caller. */
  readonly differences: readonly SignatureDifference[]
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

/** Collect differences between two signatures at one path. */
function diff(expected: ObjectSignature, actual: ObjectSignature, path: string, out: SignatureDifference[]): void {
  if (out.length >= 50) return
  if (expected.type !== actual.type) {
    out.push({ path, expected: expected.type, actual: actual.type })
    return
  }
  const names = new Set([...Object.keys(expected.attributes), ...Object.keys(actual.attributes)])
  for (const name of names) {
    if (expected.attributes[name] !== actual.attributes[name]) {
      out.push({ path: `${path} @${name}`, expected: expected.attributes[name], actual: actual.attributes[name] })
      if (out.length >= 50) return
    }
  }
  const expectedChildren = expected.children
  const actualChildren = actual.children
  for (let index = 0; index < Math.max(expectedChildren.length, actualChildren.length); index += 1) {
    const left = expectedChildren[index]
    const right = actualChildren[index]
    const label = left?.name ?? right?.name ?? `child[${index}]`
    if (left === undefined) { out.push({ path: `${path} > ${label}`, actual: 'present in import, missing in draft' }); continue }
    if (right === undefined) { out.push({ path: `${path} > ${label}`, expected: 'present in draft, missing in import' }); continue }
    diff(left, right, `${path} > ${label}`, out)
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
    try {
      diff(signatureOf(intended), signatureOf(actual), file, differences)
    } catch (error) {
      results.push({ file, matched: false, differences: [{ path: file, expected: 'a parsable display', actual: error instanceof Error ? error.message : String(error) }] })
      continue
    }
    results.push({ file, matched: differences.length === 0, differences })
  }
  return results
}

/** Whether every verification matched. */
export function allMatched(results: readonly DisplayVerification[]): boolean {
  return results.every(result => result.matched)
}
