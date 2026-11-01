/**
 * Every instruction the composer offers must render with named operands.
 *
 * The browser run (`e2e:instructions`) proves it on a real page; this holds the same invariant in
 * the fast suite, because the failure mode — a block silently falling back to "Operand 1" — is one
 * missing map entry away at all times.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INSTRUCTIONS } from '../packages/l5x/src/engine/instructions.ts'
import { instructionPins } from '../packages/viewer/src/client/instructions.ts'

test('the renderer labels every catalogued instruction', () => {
  const missing = []
  for (const instruction of INSTRUCTIONS) {
    const pins = instructionPins[instruction.name]
    if (pins === undefined) { missing.push(instruction.name); continue }
    // A contact draws its tag under a glyph, so it carries no pin rows of its own.
    if (!['XIC', 'XIO', 'OTE', 'OTL', 'OTU'].includes(instruction.name) && instruction.operands.length > 0 && pins.length === 0) {
      missing.push(`${instruction.name}(no pins)`)
    }
  }
  assert.deepEqual(missing, [], 'every catalogued instruction has pins the ladder can label')
})

test('an instruction never renders a bare index label', () => {
  const generic = Object.entries(instructionPins)
    .filter(([, pins]) => pins.includes('operand.operand'))
    .map(([name]) => name)
  assert.deepEqual(generic, [], 'a pin label is a name, never "Operand N"')
})

test('the catalogue covers every instruction family', () => {
  const names = new Set(INSTRUCTIONS.map(instruction => instruction.name))
  assert.ok(names.size >= 118, `the catalogue covers the Logix set (has ${names.size})`)
  // One instruction from each family the renderer used to fall back on.
  for (const name of ['XIC', 'EQU', 'ADD', 'MOV', 'TON', 'CTU', 'JSR', 'MSG', 'COP', 'SQO', 'GSV', 'ACL', 'PID', 'MAJ', 'OSR']) {
    assert.ok(names.has(name), `${name} is in the catalogue`)
  }
})
