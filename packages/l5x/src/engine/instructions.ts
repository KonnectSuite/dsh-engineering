/**
 * The instruction catalog the ladder composer validates against.
 *
 * Logix has no instruction dictionary inside an L5X export, so a generated rung
 * could previously name any identifier and still parse. This table is the
 * contract: an instruction, its operand slots and the kind each slot accepts.
 *
 * The set covers what engineering programs actually use — measured against a
 * 1279-tag, 860-rung project — rather than every instruction the vendor ships.
 * An unknown name is refused with the nearest catalog names; an AOI declared by
 * the project is accepted separately, because its pins live in the export.
 *
 * @module dsh-engineering-l5x/engine/instructions
 */

/** What one operand slot accepts. */
export type OperandKind = 'BOOL' | 'NUMBER' | 'ANY' | 'TIMER' | 'COUNTER'

/** One operand slot. */
export interface InstructionOperand {
  /** Slot name as the programming manual presents it. */
  readonly name: string
  /** What the slot accepts. */
  readonly kind: OperandKind
  /** True when the instruction accepts the slot but does not require it. */
  readonly optional?: boolean
}

/** One catalogued instruction. */
export interface InstructionInfo {
  /** Instruction mnemonic, upper case. */
  readonly name: string
  /** Grouping shown by the listing tool. */
  readonly category: string
  /** One line on what the instruction does. */
  readonly summary: string
  /** Operand slots in written order. */
  readonly operands: readonly InstructionOperand[]
}

/** Scalar data types the composer treats as numbers. */
export const NUMERIC_TYPES: ReadonlySet<string> = new Set(['SINT', 'INT', 'DINT', 'LINT', 'USINT', 'UINT', 'UDINT', 'ULINT', 'REAL', 'LREAL'])
/** Timer data types. */
export const TIMER_TYPES: ReadonlySet<string> = new Set(['TIMER', 'TON', 'TOF', 'RTO'])
/** Counter data types. */
export const COUNTER_TYPES: ReadonlySet<string> = new Set(['COUNTER', 'CTU', 'CTD', 'CTUD'])

/** Slot helpers kept terse: the table reads as data, not code. */
const bool = (name = 'Tag'): InstructionOperand => ({ name, kind: 'BOOL' })
const num = (name = 'Source'): InstructionOperand => ({ name, kind: 'NUMBER' })

/** The catalog, in category order. */
export const INSTRUCTIONS: readonly InstructionInfo[] = [
  // Contacts and coils
  { name: 'XIC', category: 'Contacts and coils', summary: 'Examine if closed: true when the BOOL tag is true.', operands: [bool()] },
  { name: 'XIO', category: 'Contacts and coils', summary: 'Examine if open: true when the BOOL tag is false.', operands: [bool()] },
  { name: 'OTE', category: 'Contacts and coils', summary: 'Output energize: sets the BOOL tag to the rung condition.', operands: [bool()] },
  { name: 'OTL', category: 'Contacts and coils', summary: 'Output latch: sets the BOOL tag when the rung is true and holds it.', operands: [bool()] },
  { name: 'OTU', category: 'Contacts and coils', summary: 'Output unlatch: clears a latched BOOL tag when the rung is true.', operands: [bool()] },
  { name: 'ONS', category: 'Contacts and coils', summary: 'One shot: true for one scan when the rung goes true.', operands: [{ name: 'Storage', kind: 'BOOL' }] },
  { name: 'AFI', category: 'Contacts and coils', summary: 'Always false instruction: disables the rung and its outputs.', operands: [] },

  // Comparison
  { name: 'EQU', category: 'Comparison', summary: 'Equal: true when source A equals source B.', operands: [num('Source A'), num('Source B')] },
  { name: 'NEQ', category: 'Comparison', summary: 'Not equal.', operands: [num('Source A'), num('Source B')] },
  { name: 'GRT', category: 'Comparison', summary: 'Greater than.', operands: [num('Source A'), num('Source B')] },
  { name: 'GEQ', category: 'Comparison', summary: 'Greater than or equal.', operands: [num('Source A'), num('Source B')] },
  { name: 'LES', category: 'Comparison', summary: 'Less than.', operands: [num('Source A'), num('Source B')] },
  { name: 'LEQ', category: 'Comparison', summary: 'Less than or equal.', operands: [num('Source A'), num('Source B')] },
  { name: 'LIM', category: 'Comparison', summary: 'Limit test: true when the test value lies between the limits.', operands: [num('Low limit'), num('Test'), num('High limit')] },
  { name: 'CMP', category: 'Comparison', summary: 'Compare: true when the expression is true.', operands: [{ name: 'Expression', kind: 'ANY' }] },

  // Math
  { name: 'ADD', category: 'Math', summary: 'Add source A and source B into the destination.', operands: [num('Source A'), num('Source B'), num('Destination')] },
  { name: 'SUB', category: 'Math', summary: 'Subtract source B from source A into the destination.', operands: [num('Source A'), num('Source B'), num('Destination')] },
  { name: 'MUL', category: 'Math', summary: 'Multiply source A by source B into the destination.', operands: [num('Source A'), num('Source B'), num('Destination')] },
  { name: 'DIV', category: 'Math', summary: 'Divide source A by source B into the destination.', operands: [num('Source A'), num('Source B'), num('Destination')] },
  { name: 'MOD', category: 'Math', summary: 'Remainder of source A divided by source B.', operands: [num('Source A'), num('Source B'), num('Destination')] },
  { name: 'SQR', category: 'Math', summary: 'Square root of the source into the destination.', operands: [num('Source'), num('Destination')] },
  { name: 'CPT', category: 'Math', summary: 'Compute an expression into the destination.', operands: [{ name: 'Expression', kind: 'ANY' }, num('Destination')] },

  // Move
  { name: 'MOV', category: 'Move', summary: 'Move the source value into the destination.', operands: [num('Source'), num('Destination')] },
  { name: 'COP', category: 'Move', summary: 'Copy elements from the source to the destination.', operands: [{ name: 'Source', kind: 'ANY' }, { name: 'Destination', kind: 'ANY' }, num('Length')] },
  { name: 'CLR', category: 'Move', summary: 'Clear the destination to zero.', operands: [num('Destination')] },

  // Timer and counter
  { name: 'TON', category: 'Timer and counter', summary: 'Timer on delay: accumulates while the rung is true.', operands: [{ name: 'Timer', kind: 'TIMER' }, num('Preset')] },
  { name: 'TOF', category: 'Timer and counter', summary: 'Timer off delay: accumulates after the rung goes false.', operands: [{ name: 'Timer', kind: 'TIMER' }, num('Preset')] },
  { name: 'RTO', category: 'Timer and counter', summary: 'Retentive timer on: accumulates and holds its value.', operands: [{ name: 'Timer', kind: 'TIMER' }, num('Preset')] },
  { name: 'RES', category: 'Timer and counter', summary: 'Reset a timer or counter structure.', operands: [{ name: 'Structure', kind: 'ANY' }] },
  { name: 'CTU', category: 'Timer and counter', summary: 'Count up on each false-to-true rung transition.', operands: [{ name: 'Counter', kind: 'COUNTER' }, num('Preset')] },
  { name: 'CTD', category: 'Timer and counter', summary: 'Count down on each false-to-true rung transition.', operands: [{ name: 'Counter', kind: 'COUNTER' }, num('Preset')] },

  // Program control
  { name: 'JSR', category: 'Program control', summary: 'Jump to a subroutine; parameters follow the routine name.', operands: [{ name: 'Routine', kind: 'ANY' }, { name: 'Parameter', kind: 'ANY', optional: true }] },
  { name: 'RET', category: 'Program control', summary: 'Return from a subroutine.', operands: [] },
  { name: 'JMP', category: 'Program control', summary: 'Jump to a label in the same routine.', operands: [{ name: 'Label', kind: 'ANY' }] },
  { name: 'LBL', category: 'Program control', summary: 'Label target for a JMP.', operands: [{ name: 'Label', kind: 'ANY' }] },
  { name: 'MCR', category: 'Program control', summary: 'Master control relay zone boundary.', operands: [] },

  // Bit
  { name: 'AND', category: 'Bit', summary: 'Bitwise AND of two sources into the destination.', operands: [num('Source A'), num('Source B'), num('Destination')] },
  { name: 'OR', category: 'Bit', summary: 'Bitwise OR of two sources into the destination.', operands: [num('Source A'), num('Source B'), num('Destination')] },
  { name: 'XOR', category: 'Bit', summary: 'Bitwise exclusive OR of two sources into the destination.', operands: [num('Source A'), num('Source B'), num('Destination')] },
  { name: 'NOT', category: 'Bit', summary: 'Bitwise complement of the source into the destination.', operands: [num('Source'), num('Destination')] },
  { name: 'BSL', category: 'Bit', summary: 'Bit shift left through an array.', operands: [{ name: 'Array', kind: 'ANY' }, { name: 'Control', kind: 'ANY' }, num('Length')] },
  { name: 'BSR', category: 'Bit', summary: 'Bit shift right through an array.', operands: [{ name: 'Array', kind: 'ANY' }, { name: 'Control', kind: 'ANY' }, num('Length')] },
]

/** Alias spellings accepted for a catalog name. */
const ALIASES: Readonly<Record<string, string>> = { EQ: 'EQU', NE: 'NEQ', GT: 'GRT', GE: 'GEQ', LT: 'LES', LE: 'LEQ', LIMIT: 'LIM', MOVE: 'MOV' }

/** The catalog entry for one mnemonic, following the alias table. */
export function instructionByName(name: string): InstructionInfo | undefined {
  const upper = name.toUpperCase()
  const canonical = ALIASES[upper] ?? upper
  return INSTRUCTIONS.find(instruction => instruction.name === canonical)
}

/** The catalog name a caller should use for a mnemonic. */
export function canonicalInstruction(name: string): string {
  const upper = name.toUpperCase()
  return ALIASES[upper] ?? upper
}

/** Up to `limit` catalog names closest to one unknown mnemonic. */
export function nearestInstructions(name: string, limit = 5): readonly string[] {
  const upper = name.toUpperCase()
  const scored = INSTRUCTIONS.map(instruction => {
    let score = 0
    const candidate = instruction.name
    for (let index = 0; index < Math.min(candidate.length, upper.length); index += 1) {
      if (candidate[index] === upper[index]) score += 1
      else break
    }
    for (const letter of new Set(upper)) if (candidate.includes(letter)) score += 0.1
    return { name: candidate, score }
  })
  return scored.sort((left, right) => right.score - left.score).slice(0, limit).map(row => row.name)
}
