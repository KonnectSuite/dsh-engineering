/**
 * The acceptance gate: `ecad_compare` proves what a CAD edit changed.
 *
 * Authoring left this row, so the row's promise about a changed drawing is now a
 * comparison promise: a person keeps a copy, edits the drawing in AryaCAD
 * Electrical, and the pair of files is compared here. These specs drive that
 * sequence through the tool surface — a kept copy, a copy edited outside this row,
 * and the comparison that must name the change and nothing else. The variants are
 * built by editing DXF text in memory, because nothing in this row writes drawing
 * geometry any more.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { harness, fixtureBytes } from './harness.mjs'

/** The committed sheet every variant is derived from. */
const BASE = 'Prints/ACME-007.dxf'
/** The variant written beside it, standing in for the drawing that came back from the CAD app. */
const REV = 'Prints/ACME-007-rev-B.dxf'

/** One fixture as DXF text lines, so a variant can be built by editing a line. */
function lines() {
  return new TextDecoder().decode(fixtureBytes('tiny.dxf')).split(/\r?\n/u)
}

/** Re-encode edited lines as the bytes of a variant drawing. */
function bytesOf(edited) {
  return new TextEncoder().encode(edited.join('\n'))
}

/** Indexes of the value line of every `code`/`value` pair in the fixture. */
function pairs(rows, code, value) {
  const hits = []
  for (let index = 0; index + 1 < rows.length; index += 1) {
    if (rows[index] === code && rows[index + 1] === value) hits.push(index + 1)
  }
  return hits
}

/**
 * Replace one `code`/`value` pair by occurrence index, failing loudly when the
 * occurrence does not exist — a variant that edited nothing at all would make the
 * comparison claim prove nothing.
 *
 * @param code - the DXF group code line to anchor on.
 * @param value - the value line that must follow it.
 * @param replacement - the new value line.
 * @param occurrence - which match to edit, counting from zero.
 */
function editOne(code, value, replacement, occurrence = 0) {
  const rows = lines()
  const hits = pairs(rows, code, value)
  assert.ok(hits.length > occurrence, `expected a ${code}/${value} pair at occurrence ${occurrence}, found ${hits.length}`)
  rows[hits[occurrence]] = replacement
  return bytesOf(rows)
}

/** The bytes of one whole entity record removed from the fixture. */
function withoutFirstEntity(entityKind) {
  const rows = lines()
  let start = -1
  for (let index = 0; index + 1 < rows.length; index += 1) {
    if (rows[index] === '0' && rows[index + 1] === entityKind) {
      start = index
      break
    }
  }
  assert.notEqual(start, -1, `the fixture carries a ${entityKind} entity this spec can remove`)
  let end = start + 1
  while (end < rows.length && rows[end] !== '0') end += 1
  return bytesOf([...rows.slice(0, start), ...rows.slice(end)])
}

/** A workspace holding the kept copy and one edited variant. */
function pair(variant) {
  return harness(new Map([
    [`/ws/${BASE}`, fixtureBytes('tiny.dxf')],
    [`/ws/${REV}`, variant],
  ]))
}

/** Call the tool and assert the success envelope shape the row promises. */
async function compare(instance, a, b, what) {
  const answer = await instance.call('ecad_compare', { a, b })
  assert.equal(answer.error, undefined, `${what}: ${JSON.stringify(answer.error)}`)
  assert.equal(typeof answer.summary, 'string')
  assert.ok(Array.isArray(answer.data.rows), `${what} returns change rows`)
  assert.equal(typeof answer.data.a.version, 'string', `${what} names the kept copy's version`)
  assert.equal(typeof answer.data.b.version, 'string', `${what} names the edited copy's version`)
  return answer
}

test('an unchanged drawing compares clean, so the gate cannot invent a change', async () => {
  const instance = harness(new Map([
    [`/ws/${BASE}`, fixtureBytes('tiny.dxf')],
    ['/ws/Prints/copy.dxf', fixtureBytes('tiny.dxf')],
  ]))
  const answer = await compare(instance, BASE, 'Prints/copy.dxf', 'unchanged')
  assert.deepEqual(
    { added: answer.data.added, removed: answer.data.removed, changed: answer.data.changed },
    { added: 0, removed: 0, changed: 0 },
    'a byte-identical copy must report no change',
  )
  assert.deepEqual(answer.data.rows, [], 'no change means no rows')
  assert.equal(answer.data.truncated, false, 'the comparison did not hit its row cap')
  assert.equal(answer.coverage.complete, true, 'the answer is complete')
  assert.deepEqual(answer.coverage.unverified, [], 'a clean comparison leaves nothing unverified')
  assert.equal(answer.data.a.version, answer.data.b.version, 'the two copies hash to the same version')
})

test('a text value changed in the CAD app is reported as a text change', async () => {
  const instance = pair(editOne('1', 'M', 'M-REVISED'))
  const answer = await compare(instance, BASE, REV, 'text edit')
  assert.equal(answer.data.changed, 1, `exactly one primitive changed: ${JSON.stringify(answer.data.rows)}`)
  assert.deepEqual({ added: answer.data.added, removed: answer.data.removed }, { added: 0, removed: 0 })
  const [row] = answer.data.rows
  assert.equal(row.kind, 'changed')
  assert.match(row.reason, /text changed/u, row.reason)
  assert.equal(typeof row.layer, 'string')
  assert.equal(typeof row.entityKind, 'string')
  assert.ok(row.before !== undefined && row.after !== undefined, 'a change row carries both sides')
  assert.notEqual(JSON.stringify(row.before), JSON.stringify(row.after), 'the two sides differ')
  assert.equal(answer.data.a.version !== answer.data.b.version, true, 'the versions differ, so the pair is not one file')
})

test('a moved insertion point is reported as a position change, not a text change', async () => {
  const instance = pair(editOne('10', '0.2', '41.25'))
  const answer = await compare(instance, BASE, REV, 'position edit')
  assert.equal(answer.data.changed, 1, `exactly one primitive moved: ${JSON.stringify(answer.data.rows)}`)
  const [row] = answer.data.rows
  assert.match(row.reason, /position changed/u, row.reason)
  assert.doesNotMatch(row.reason, /text changed/u, `the text did not move: ${row.reason}`)
})

test('a primitive deleted in the CAD app is reported as removed with its kind and layer', async () => {
  const instance = pair(withoutFirstEntity('TEXT'))
  const answer = await compare(instance, BASE, REV, 'removal')
  assert.equal(answer.data.removed, 1, `exactly one primitive disappeared: ${JSON.stringify(answer.data.rows)}`)
  assert.equal(answer.data.added, 0, 'nothing was added')
  const [row] = answer.data.rows
  assert.equal(row.kind, 'removed')
  assert.match(row.entityKind, /text/u, row.entityKind)
  assert.ok(row.before !== undefined && row.after === undefined, 'a removal row carries only the earlier side')
})

test('a comparison that hits its row cap says the change list is incomplete', async () => {
  const instance = harness(new Map([
    [`/ws/${BASE}`, fixtureBytes('tiny.dxf')],
    ['/ws/Prints/titleblock.dxf', fixtureBytes('titleblock.dxf')],
  ]))
  const uncapped = await instance.call('ecad_compare', { a: BASE, b: 'Prints/titleblock.dxf' })
  assert.equal(uncapped.error, undefined, JSON.stringify(uncapped.error))
  assert.equal(uncapped.data.truncated, false, 'the same pair is complete without a cap')
  const total = uncapped.data.added + uncapped.data.removed + uncapped.data.changed
  assert.ok(total > 10, `the pair needs a cap to be interesting, got ${total}`)

  const capped = await instance.call('ecad_compare', { a: BASE, b: 'Prints/titleblock.dxf', limit: 1 })
  assert.equal(capped.error, undefined, JSON.stringify(capped.error))
  assert.equal(capped.data.rows.length, 1, 'the cap is honoured in the rows returned')
  assert.equal(capped.data.truncated, true, 'the answer flags that it was capped')
  assert.equal(capped.coverage.complete, false, 'a capped answer is not complete')
  assert.match(capped.coverage.unverified.join(' '), /row cap/u, capped.coverage.unverified.join(' '))
  assert.equal(
    capped.data.added + capped.data.removed + capped.data.changed,
    1,
    'the counts stop at the cap too, so only the truncated flag reveals the cut',
  )
})
