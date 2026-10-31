/**
 * Pin labels for every catalogued Logix instruction, derived from the one catalogue the composer
 * validates against (`packages/l5x/src/engine/instructions.ts`).
 *
 * Deriving instead of hand-listing is the point: an instruction added to the catalogue is labelled
 * here the moment it exists, so a block cannot silently fall back to "Operand 1". A slot whose name
 * has no locale entry is shown verbatim, which still beats an index.
 */
import { INSTRUCTIONS } from '../../../l5x/src/engine/instructions.ts'

/** Locale keys the viewer can translate; anything else is shown as written. */
export type PinKey =
  | 'operand.source' | 'operand.destination' | 'operand.length' | 'operand.position'
  | 'operand.timer' | 'operand.preset' | 'operand.accum' | 'operand.control'
  | 'operand.a' | 'operand.b' | 'operand.sourceA' | 'operand.sourceB'
  | 'operand.routine' | 'operand.parameter' | 'operand.expression'

/** Catalogue slot names, as the programming manual writes them, mapped to their locale key. */
const SLOT_KEYS: Readonly<Record<string, PinKey>> = {
  'Source A': 'operand.sourceA',
  'Source B': 'operand.sourceB',
  Source: 'operand.source',
  Dest: 'operand.destination',
  Destination: 'operand.destination',
  Length: 'operand.length',
  Position: 'operand.position',
  Timer: 'operand.timer',
  Counter: 'operand.counter' as PinKey,
  Control: 'operand.control',
  Expression: 'operand.expression',
  'Routine Name': 'operand.routine',
  Array: 'operand.a',
  Test: 'operand.b',
  'Low limit': 'operand.a',
  'High limit': 'operand.b',
}

/** Per-mnemonic overrides where the catalogue name is right but a better label exists. */
const OVERRIDES: Readonly<Record<string, readonly string[]>> = {
  OSR: ['operand.storage' as PinKey], OSF: ['operand.storage' as PinKey], ONS: ['operand.storage' as PinKey],
  TON: ['operand.timer', 'operand.preset', 'operand.accum'],
  TOF: ['operand.timer', 'operand.preset', 'operand.accum'],
  RTO: ['operand.timer', 'operand.preset', 'operand.accum'],
  CTU: ['operand.counter', 'operand.preset', 'operand.accum'],
  CTD: ['operand.counter', 'operand.preset', 'operand.accum'],
  MSG: ['operand.control'],
}

/** Instruction pins by mnemonic: one locale key or verbatim slot name per operand. */
export const instructionPins: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  INSTRUCTIONS.map(instruction => [instruction.name,
    OVERRIDES[instruction.name]
    ?? instruction.operands.map(operand => SLOT_KEYS[operand.name] ?? operand.name)]),
)
