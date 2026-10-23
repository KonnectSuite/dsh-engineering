/**
 * Indexed and bit-level usage of one array tag.
 *
 * Reviewing alarm words, HMI index maps and timer tables means asking which
 * elements and bits a program already uses. Parsing references answers that from
 * the same evidence the reference tools report; it does not prove runtime
 * consumption by an external HMI or another controller.
 */

import type { L5xTag } from '../model/types.ts'
import { evidenceOf } from './analysis.ts'
import { EngineeringError, type ProjectSnapshot } from '../session.ts'

/** Bits an element exposes when the declared type has a fixed width. */
const ELEMENT_BITS: Readonly<Record<string, number>> = { DINT: 32, INT: 16, SINT: 8 }

interface Row {
  index: number | null
  bits: Set<number>
  reads: number
  writes: number
  unknown: number
  dynamic: boolean
  examples: string[]
}

function rowOf(rows: Map<number | null, Row>, index: number | null): Row {
  const existing = rows.get(index)
  if (existing !== undefined) return existing
  const created: Row = { index, bits: new Set(), reads: 0, writes: 0, unknown: 0, dynamic: false, examples: [] }
  rows.set(index, created)
  return created
}

function count(row: Row, access: string): void {
  if (access === 'read') row.reads += 1
  else if (access === 'write') row.writes += 1
  else row.unknown += 1
}

/** Map one declared tag's indexed and bit-level occurrences.
 * @param project - Opened export.
 * @param scope - Declaring scope: `controller` or a program name.
 * @param name - Declared tag name.
 * @returns Used and free element bits, read/write counts and examples.
 */
export function usageMap(project: ProjectSnapshot, scope: string, name: string): object {
  const tag: L5xTag | undefined = project.document.tags.find(entry => entry.name.toLowerCase() === name.toLowerCase() && entry.scope.toLowerCase() === scope.toLowerCase())
  if (tag === undefined) throw new EngineeringError('COMPONENT_NOT_FOUND', `Tag ${name} is not declared in scope ${scope}`)
  const rows = new Map<number | null, Row>()
  const scopePrefix = `${tag.scope}::`.toLowerCase()
  for (const reference of evidenceOf(project)) {
    // The raw operand keeps array indices and bit digits that the canonical
    // resolver drops; the resolved scope proves it names this declaration.
    if (reference.resolved !== undefined && !reference.resolved.toLowerCase().startsWith(scopePrefix)) continue
    const raw = reference.symbol.toLowerCase()
    if (!raw.startsWith(tag.name.toLowerCase())) continue
    const suffix = reference.symbol.slice(tag.name.length)
    // `Alarm` must not claim `Alarms[0]`; the next character settles it.
    if (suffix !== '' && !/^[.[]/u.test(suffix)) continue
    // A member path after an index (`Alarms[0].6`) is a bit; a member after the
    // tag itself (`Cooling.Blower_1`) is structure access, not an array index.
    const indexes = [...suffix.matchAll(/\[([^\]]*)\]/gu)].map(match => match[1] ?? '')
    const bits = [...suffix.replace(/\[[^\]]*\]/gu, '').matchAll(/\.(\d+)/gu)].map(match => Number.parseInt(match[1] ?? '', 10))
    const wholeElement = indexes.length === 0
    const dynamic = indexes.some(value => !/^\d+$/u.test(value))
    const index = dynamic || indexes.length === 0 ? null : Number.parseInt(indexes[0]!, 10)
    const row = rowOf(rows, wholeElement ? null : index)
    if (dynamic) {
      row.dynamic = true
    } else {
      for (const bit of bits) if (Number.isInteger(bit)) row.bits.add(bit)
    }
    count(row, reference.access)
    if (row.examples.length < 3) row.examples.push(`${reference.routine}${reference.rung === undefined ? '' : ` rung ${reference.rung}`}${reference.line === undefined ? '' : ` line ${reference.line}`}: ${reference.symbol}`)
  }
  const width = ELEMENT_BITS[tag.dataType.toUpperCase()]
  const indexes = [...rows.values()].filter(row => row.index !== null).sort((left, right) => left.index! - right.index!)
  const whole = rows.get(null)
  return {
    project_id: project.id, source_sha256: project.sha256,
    tag: { name: tag.name, scope: tag.scope, data_type: tag.dataType },
    element_bit_width: width ?? null,
    indexes: indexes.map(row => ({
      index: row.index,
      bits_used: [...row.bits].sort((left, right) => left - right),
      bits_free: width === undefined ? null : Array.from({ length: width }, (_value, bit) => bit).filter(bit => !row.bits.has(bit)),
      dynamic_index: row.dynamic,
      reads: row.reads, writes: row.writes, unknown: row.unknown,
      examples: row.examples,
    })),
    whole_element: whole === undefined ? null : { reads: whole.reads, writes: whole.writes, unknown: whole.unknown, bits_used: [...whole.bits].sort((left, right) => left - right), examples: whole.examples },
    complete: false,
    note: 'Counts cover exported RLL/ST/FBD operands only. External HMI, produced/consumed and driver consumers are not visible; dynamic indices are not expanded.',
  }
}
