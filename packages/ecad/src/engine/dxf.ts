/**
 * Writing the drawing back out and proving what the write carried.
 *
 * `dxfBytes` serialises at the version the drawing was opened at. `verifyWritten`
 * then re-reads those bytes, rebuilds the model and compares it with the base
 * model plus the op counters the draft expected. It reports what it measured —
 * added/removed/changed primitives, unsupported types the writer dropped — and
 * never asserts fidelity it did not read back.
 *
 * @module dsh-engineering-ecad/engine/dxf
 */

import type { EcadSheetModel, EcadVerification } from './types.ts'
import type { OpenedSheet } from './parse.ts'
import { openSheet } from './parse.ts'
import { buildSheetModel } from './model.ts'
import { diffSheetModels } from './diff.ts'
import { EcadError } from './errors.ts'

/** What the caller expects the write to contain. */
export interface VerifyExpected {
  /** Per operation kind, the number of changes the applied draft reported. */
  readonly changes: Readonly<Record<string, number>>
  /** The model the draft was staged against. */
  readonly baseModel: EcadSheetModel
}

/** Options of {@link verifyWritten}. */
export interface VerifyOptions {
  /** Cap on compared diff rows. Defaults to 200000. */
  readonly maxChanges?: number
  /** Tolerance for geometry comparison. Defaults to 0.001. */
  readonly tolerance?: number
}

/**
 * Serialise the opened drawing to DXF bytes at its own version.
 *
 * @param opened - the opened (possibly edited) drawing.
 * @returns ASCII DXF bytes.
 * @throws EcadError `WRITE_FAILED` when the writer does not produce bytes.
 */
export function dxfBytes(opened: OpenedSheet): Uint8Array {
  const version = opened.db.version.name
  let output: string | Uint8Array
  try {
    output = opened.db.dxfOut(undefined, 16, version)
  } catch (error) {
    throw new EcadError('WRITE_FAILED', `writing ${opened.path} as ${version} failed: ${error instanceof Error ? error.message : String(error)}`, 'Re-open the drawing and retry; if the writer still fails, report the sheet so the gap can be measured.')
  }
  if (typeof output === 'string') return new TextEncoder().encode(output)
  if (output instanceof Uint8Array) return output
  throw new EcadError('WRITE_FAILED', `the DXF writer returned ${typeof output} for ${opened.path}`, 'Retry the export; a non-text DXF payload is a writer defect.')
}

/**
 * Re-read written bytes and compare the result with the base model and the
 * expected operation counters.
 *
 * @param opened - the drawing the bytes were written from (used for path and version context).
 * @param bytes - the written DXF bytes.
 * @param expected - expected op counters and the base model.
 * @param options - diff cap and tolerance.
 * @returns the verification with `ok`, counters, dropped types, problems and notes.
 */
export async function verifyWritten(opened: OpenedSheet, bytes: Uint8Array, expected: VerifyExpected, options: VerifyOptions = {}): Promise<EcadVerification> {
  const problems: string[] = []
  const notes: string[] = []
  const applied: Record<string, number> = {}
  const dropped: Record<string, number> = {}
  const empty = (): EcadVerification => ({ ok: false, expected: expected.changes, applied, dropped, problems, notes })

  let reopened: OpenedSheet
  try {
    reopened = await openSheet({ path: opened.path, bytes })
  } catch (error) {
    problems.push(`the written bytes could not be read back as DXF: ${error instanceof Error ? error.message : String(error)}`)
    return empty()
  }
  notes.push(`re-read ${bytes.byteLength} bytes as ${reopened.dxfVersion}`)

  const written = buildSheetModel(reopened)
  if (written.stats.truncated) problems.push('the written drawing exceeds the entity cap; the comparison is incomplete')
  const diff = diffSheetModels(expected.baseModel, written, {
    tolerance: options.tolerance ?? 0.001,
    maxChanges: options.maxChanges ?? 200_000
  })
  if (diff.truncated) problems.push('the model comparison hit its row cap; the comparison is incomplete')
  notes.push(`model comparison: ${diff.added.length} added, ${diff.removed.length} removed, ${diff.changed.length} changed primitive(s)`)
  const changedRows = diff.added.length + diff.removed.length + diff.changed.length
  if (changedRows > 0 && Object.values(expected.changes).every(count => !Number.isFinite(count) || count <= 0)) {
    problems.push(`no change was expected but the written drawing differs from the base model in ${changedRows} primitive(s); the base model or the op list is stale`)
  }

  // Observed counters, derived from what the re-read model actually contains.
  for (const change of diff.added) {
    if (change.entityKind === 'text') {
      const owner = change.after?.g
      const key = owner ? 'addTextInBlock' : 'addText'
      applied[key] = (applied[key] ?? 0) + 1
    } else if (change.entityKind === 'line') applied.addLine = (applied.addLine ?? 0) + 1
    else if (change.entityKind === 'polyline') applied.addPolyline = (applied.addPolyline ?? 0) + 1
    else if (change.entityKind === 'leader') applied.addLeader = (applied.addLeader ?? 0) + 1
    else if (change.entityKind === 'insert') applied.addBlock = (applied.addBlock ?? 0) + 1
    else if (change.entityKind === 'hatch') applied.addHatch = (applied.addHatch ?? 0) + 1
    else applied.addOther = (applied.addOther ?? 0) + 1
  }
  applied.erase = diff.removed.length
  let textChanges = 0
  let attributeChanges = 0
  let layerChanges = 0
  let geometryChanges = 0
  for (const change of diff.changed) {
    const reason = change.reason
    if (reason.includes('text changed')) {
      if (change.after?.g || change.before?.g) attributeChanges += 1
      else textChanges += 1
    }
    if (reason.includes('layer changed')) layerChanges += 1
    if (reason.includes('position changed') || reason.includes('geometry changed') || reason.includes('angle changed') || reason.includes('size changed')) geometryChanges += 1
  }
  applied.setText = textChanges
  applied.setAttribute = attributeChanges
  applied.setLayer = layerChanges
  applied.move = geometryChanges
  applied.rotate = 0

  // Compare only where the observation is a lower bound the expectation cannot
  // exceed for a different reason: a `move` on several ids also shows up as
  // geometry changes on entities that another op created, so extra observations
  // are not failures — missing ones are.
  const aliases: Record<string, readonly string[]> = {
    addText: ['addText', 'addTextInBlock'],
    addPolyline: ['addPolyline', 'addRectangle', 'addRevisionCloud'],
    addRectangle: ['addRectangle', 'addPolyline'],
    addRevisionCloud: ['addRevisionCloud', 'addPolyline'],
    addLeader: ['addLeader', 'addPolyline'],
    move: ['move', 'rotate', 'setText'],
    rotate: ['rotate', 'move'],
    setText: ['setText', 'addText']
  }
  for (const [kind, count] of Object.entries(expected.changes)) {
    if (!Number.isFinite(count) || count <= 0) continue
    const keys = aliases[kind] ?? [kind]
    const observed = keys.reduce((sum, key) => sum + (applied[key] ?? 0), 0)
    if (observed < count) {
      problems.push(`the draft applied ${count} ${kind} change(s) but the written drawing shows ${observed}`)
    } else {
      notes.push(`${kind}: ${count} expected, ${observed} observed in the re-read model`)
    }
  }

  // Unsupported entity types the writer dropped are named, never swallowed.
  for (const [type, count] of Object.entries(expected.baseModel.stats.unsupported)) {
    const carried = written.stats.unsupported[type] ?? 0
    if (carried < count) dropped[type] = count - carried
  }
  const droppedTotal = Object.values(dropped).reduce((sum, count) => sum + count, 0)
  if (droppedTotal > 0) problems.push(`the written drawing dropped ${droppedTotal} unsupported entit${droppedTotal === 1 ? 'y' : 'ies'}: ${Object.entries(dropped).map(([type, count]) => `${type} ×${count}`).join(', ')}`)
  else if (Object.keys(expected.baseModel.stats.unsupported).length > 0) notes.push('every unsupported entity type in the base model survived the write')

  if (written.layouts.length !== expected.baseModel.layouts.length) {
    notes.push(`layout count changed from ${expected.baseModel.layouts.length} to ${written.layouts.length}`)
  }
  notes.push(`written model: ${written.stats.entities} primitive(s), ${written.stats.approximate} approximate, version ${written.dxfVersion}`)

  return {
    ok: problems.length === 0,
    expected: expected.changes,
    applied,
    dropped,
    problems,
    notes
  }
}

/**
 * Convenience: write the edited drawing and verify it in one step.
 *
 * @param opened - the edited drawing.
 * @param expected - expected op counters and the base model.
 * @param options - verify options.
 */
export async function writeAndVerify(opened: OpenedSheet, expected: VerifyExpected, options: VerifyOptions = {}): Promise<{ bytes: Uint8Array; verification: EcadVerification }> {
  const bytes = dxfBytes(opened)
  const verification = await verifyWritten(opened, bytes, expected, options)
  return { bytes, verification }
}
