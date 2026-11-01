// The built artifact (lib/) must carry the behaviour the source tests prove.
// Skipped when the package has not been built, so a fresh clone still runs green.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const lib = join(import.meta.dirname, '..', 'lib')
const built = existsSync(join(lib, 'engine', 'instructions.js'))
const skip = built ? false : 'lib/ not built'
const load = path => import(pathToFileURL(join(lib, ...path.split('/'))).href)

test('the built engine carries the catalogued safety instructions', { skip }, async () => {
  const { instructionByName } = await load('engine/instructions.js')
  for (const name of ['DCM', 'DCS', 'CROUT']) assert.ok(instructionByName(name) !== undefined, name)
  assert.equal(instructionByName('DCM')?.operands.length, 8)
  assert.equal(instructionByName('DCS')?.operands.length, 10)
  assert.equal(instructionByName('CROUT')?.operands.length, 9)
  // FAL and FSC were refused rather than guessed.
  assert.equal(instructionByName('FAL')?.notModelled, true)
})

test('the built engine emits the modern spelling for a v37 project', { skip }, async () => {
  const { spellingForProject } = await load('engine/mnemonics.js')
  assert.equal(spellingForProject('MOV', new Set(), '37'), 'MOVE')
  assert.equal(spellingForProject('EQU', new Set(), '37'), 'EQ')
  assert.equal(spellingForProject('MOV', new Set(), '19'), 'MOV')
})

test('the built catalog marks the slots that must be tags', { skip }, async () => {
  const { instructionByName } = await load('engine/instructions.js')
  for (const [name, slotName] of [['ADD', 'Destination'], ['FOR', 'Index'], ['SIZE', 'Size'], ['STD', 'Control'], ['SWPB', 'Dest'], ['MVM', 'Dest'], ['NEG', 'Dest']]) {
    const slot = instructionByName(name)?.operands.find(operand => operand.name === slotName)
    assert.equal(slot?.writable, true, `${name} ${slotName}`)
  }
  assert.equal(instructionByName('ADD')?.operands[0]?.writable, undefined)
  // The vendor restricts STD's Destination to REAL; the built slot must carry that type.
  const destination = instructionByName('STD')?.operands.find(operand => operand.name === 'Destination')
  assert.deepEqual(destination?.types, ['REAL'])
  // CPS and COP copy between array elements: Source is tag-only, Dest writable, both element-addressed.
  for (const name of ['CPS', 'COP']) {
    const copy = instructionByName(name)?.operands ?? []
    assert.equal(copy[0]?.tagOnly, true, name)
    assert.equal(copy[0]?.arrayElement, true, name)
    assert.equal(copy[1]?.writable, true, name)
    assert.equal(copy[1]?.arrayElement, true, name)
  }
})

test('the built engine knows an infinite check is input-type and REAL-only', { skip }, async () => {
  const { instructionByName } = await load('engine/instructions.js')
  assert.deepEqual(instructionByName('ISINF')?.operands[0]?.types, ['REAL'])
  const { parseLadder, rightRailReader } = await load('engine/logic-syntax.js')
  const parsed = parseLadder('ISINF(R);')
  assert.equal(rightRailReader(parsed.nodes), 'ISINF')
})

test('the built engine reports a JSR without its return slot', { skip }, async () => {
  const { rungFindings } = await load('engine/rung-rules.js')
  const routine = {
    program: 'P', name: 'R', type: 'RLL', description: '',
    body: { type: 'RLL', rungs: [{ number: 0, text: 'XIC(A)JSR(Sub);' }] },
  }
  assert.ok(rungFindings(routine).some(finding => finding.rule === 'JSR_WITHOUT_RETURN'))
})
