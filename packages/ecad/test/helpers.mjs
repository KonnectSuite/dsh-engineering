/**
 * Shared test helpers.
 *
 * The synthetic-model helpers build plain JSON sheet models directly, so the
 * checks, cross-reference, diff and render specs do not need a DXF file to
 * exercise a rule. The corpus constant points at the owner's read-only print
 * set; every spec that uses it skips when the directory is absent.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { defaultProfile, openSheet } from '../src/engine/index.ts'

/**
 * Truthiness assertion.
 *
 * Node 26's `assert.ok(value)` without a message raises `ERR_INVALID_ARG_TYPE`
 * when it runs through tsx, so every truth check goes through this helper with
 * an explicit message instead.
 */
export function ok(value, message = 'expected a truthy value') {
  assert.equal(Boolean(value), true, message)
}

export const here = dirname(fileURLToPath(import.meta.url))
export const fixturesDir = join(here, 'fixtures')

/** The owner's real print set, read-only and never committed. */
export const corpusDir = 'C:/Users/KNPhu/AryaCode/KonnectSuite/tmp/ecad-corpus/Prints/DXF'

/** True when the real corpus is present on this machine. */
export const corpusAvailable = existsSync(corpusDir)

/** Open one committed fixture. */
export async function openFixture(name) {
  return openSheet({ path: name, bytes: new Uint8Array(readFileSync(join(fixturesDir, name))) })
}

/** A fresh default profile. */
export function profile() {
  return defaultProfile()
}

/** One render-model entity with the required fields filled in. */
export function entity(id, kind, fields = {}) {
  return { id, k: kind, layer: '0', color: 7, ...fields }
}

/** One layout. */
export function layout(id, entities, kind = 'model') {
  return {
    id,
    name: id,
    kind,
    extents: { min: [0, 0], max: [10, 10] },
    entities
  }
}

/** One synthetic sheet model. */
export function sheetModel({ path = 'SYNTH-001.dxf', layouts = [], layers = [], blocks = [], units = 0 } = {}) {
  const all = layouts.flatMap(entry => entry.entities)
  const byKind = {}
  for (const entry of all) byKind[entry.k] = (byKind[entry.k] ?? 0) + 1
  return {
    schema: 1,
    path,
    version: 'test-version',
    dxfVersion: 'AC1032',
    units,
    layouts,
    layers,
    blocks,
    stats: { entities: all.length, byKind, unsupported: {}, approximate: 0, truncated: false }
  }
}

/** A layer row. */
export function layer(name, color = 7, visible = true) {
  return { name, color, visible }
}

/** A TEXT entity. */
export function text(id, value, { x = 0, y = 0, layer = '0', h = 0.1, color = 7, rot = 0, ha = 0, va = 0, g } = {}) {
  return { id, k: 'text', layer, color, t: value, p: [x, y], h, rot, ha, va, ...(g ? { g } : {}) }
}

/** A title block for a synthetic sheet. */
export function titleBlock(fields = {}, layoutId = 'Model') {
  const mapped = {}
  for (const [field, value] of Object.entries(fields)) {
    mapped[field] = { value, source: 'text', confidence: 0.9 }
  }
  return { layout: layoutId, fields: mapped }
}
