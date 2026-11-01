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
export type OperandKind = 'BOOL' | 'NUMBER' | 'ANY' | 'TIMER' | 'COUNTER' | 'STRING' | 'EXPRESSION' | 'ROUTINE' | 'LABEL'

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
/** String data types the string instructions take. */
export const STRING_TYPES: ReadonlySet<string> = new Set(['STRING'])
/** Counter data types. */
export const COUNTER_TYPES: ReadonlySet<string> = new Set(['COUNTER', 'CTU', 'CTD', 'CTUD'])

import { MORE_INSTRUCTIONS } from './instruction-set.ts'
import { MNEMONIC_PAIRS } from './mnemonics.ts'

/** Slot helpers kept terse: the table reads as data, not code. */
const bool = (name = 'Tag'): InstructionOperand => ({ name, kind: 'BOOL' })
const num = (name = 'Source'): InstructionOperand => ({ name, kind: 'NUMBER' })
const any = (name: string): InstructionOperand => ({ name, kind: 'ANY' })
const str = (name: string): InstructionOperand => ({ name, kind: 'STRING' })
/** A computed expression: text with operators, not an address. */
const expression = (name = 'Expression'): InstructionOperand => ({ name, kind: 'EXPRESSION' })
/** The name of a routine in the export, which is not a tag. */
const routine = (name = 'Routine'): InstructionOperand => ({ name, kind: 'ROUTINE' })
/** A label a JMP targets inside its own routine. */
const label = (name = 'Label'): InstructionOperand => ({ name, kind: 'LABEL' })

/** The catalog, in category order. */
export const INSTRUCTIONS: readonly InstructionInfo[] = [  // Contacts and coils
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
  { name: 'CMP', category: 'Comparison', summary: 'Compare: true when the expression is true.', operands: [expression()] },

  // Math
  { name: 'ADD', category: 'Math', summary: 'Add source A and source B into the destination.', operands: [num('Source A'), num('Source B'), num('Destination')] },
  { name: 'SUB', category: 'Math', summary: 'Subtract source B from source A into the destination.', operands: [num('Source A'), num('Source B'), num('Destination')] },
  { name: 'MUL', category: 'Math', summary: 'Multiply source A by source B into the destination.', operands: [num('Source A'), num('Source B'), num('Destination')] },
  { name: 'DIV', category: 'Math', summary: 'Divide source A by source B into the destination.', operands: [num('Source A'), num('Source B'), num('Destination')] },
  { name: 'MOD', category: 'Math', summary: 'Remainder of source A divided by source B.', operands: [num('Source A'), num('Source B'), num('Destination')] },
  { name: 'SQR', category: 'Math', summary: 'Square root of the source into the destination.', operands: [num('Source'), num('Destination')] },
  { name: 'CPT', category: 'Math', summary: 'Compute an expression into the destination.', operands: [expression(), num('Destination')] },

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
  { name: 'JSR', category: 'Program control', summary: 'Jump to a subroutine; parameters follow the routine name.', operands: [routine(), { name: 'Parameter', kind: 'ANY', optional: true }] },
  { name: 'RET', category: 'Program control', summary: 'Return from a subroutine.', operands: [] },
  { name: 'JMP', category: 'Program control', summary: 'Jump to a label in the same routine.', operands: [label()] },
  { name: 'LBL', category: 'Program control', summary: 'Label target for a JMP.', operands: [label()] },
  { name: 'MCR', category: 'Program control', summary: 'Master control relay zone boundary.', operands: [] },

  // Bit
  { name: 'AND', category: 'Bit', summary: 'Bitwise AND of two sources into the destination.', operands: [num('Source A'), num('Source B'), num('Destination')] },
  { name: 'OR', category: 'Bit', summary: 'Bitwise OR of two sources into the destination.', operands: [num('Source A'), num('Source B'), num('Destination')] },
  { name: 'XOR', category: 'Bit', summary: 'Bitwise exclusive OR of two sources into the destination.', operands: [num('Source A'), num('Source B'), num('Destination')] },
  { name: 'NOT', category: 'Bit', summary: 'Bitwise complement of the source into the destination.', operands: [num('Source'), num('Destination')] },
  { name: 'BSL', category: 'Bit', summary: 'Bit shift left through an array.', operands: [{ name: 'Array', kind: 'ANY' }, { name: 'Control', kind: 'ANY' }, num('Length')] },
  { name: 'BSR', category: 'Bit', summary: 'Bit shift right through an array.', operands: [{ name: 'Array', kind: 'ANY' }, { name: 'Control', kind: 'ANY' }, num('Length')] },

  // String. Operand order is the order the vendor's own instruction metadata uses, so a
  // composed rung reads the way an export from Studio does.
  { name: 'CONCAT', category: 'String', summary: 'Concatenate: append source B to source A and write the joined string to the destination.', operands: [str('Source A'), str('Source B'), str('Dest')] },
  { name: 'MID', category: 'String', summary: 'Extract part of a string: copy Qty characters from Start into the destination string.', operands: [str('Source'), num('Qty'), num('Start'), str('Dest')] },
  { name: 'FIND', category: 'String', summary: 'Find: search the source string and write the first position of Search to the result.', operands: [str('Source'), str('Search'), num('Start'), any('Result')] },
  { name: 'INSERT', category: 'String', summary: 'Insert source B into source A at Start and write the result to the destination.', operands: [str('Source A'), str('Source B'), num('Start'), str('Dest')] },
  { name: 'DELETE', category: 'String', summary: 'Delete Qty characters from the source starting at Start into the destination.', operands: [str('Source'), num('Qty'), num('Start'), str('Dest')] },
  { name: 'LOWER', category: 'String', summary: 'Lower case: copy the source string to the destination in lower case.', operands: [str('Source'), str('Dest')] },
  { name: 'UPPER', category: 'String', summary: 'Upper case: copy the source string to the destination in upper case.', operands: [str('Source'), str('Dest')] },
  { name: 'RTOS', category: 'String', summary: 'Real to string: convert a REAL value into the destination string.', operands: [num('Source'), str('Dest')] },

  // File and array
  { name: 'FLL', category: 'File and array', summary: 'File fill: fill Length elements at the destination with the source value.', operands: [num('Source'), any('Dest'), num('Length')] },

  // Program control. SBR carries no operands: its parameters are the JSR arguments.
  { name: 'SBR', category: 'Program control', summary: 'Subroutine label a JSR calls; its parameters are the arguments the JSR passes.', operands: [] },

  // The rest of the set, declared compactly in instruction-set.ts so this table stays readable.
  ...MORE_INSTRUCTIONS.map(instruction => ({
    name: instruction.name,
    category: instruction.category,
    summary: `${instruction.name} from the Logix instruction set.`,
    operands: instruction.slots,
  })),
]

/**
 * Alternate spellings resolved to the catalog name.
 *
 * Logix Designer 36 renamed sixteen ladder instructions — `EQU` became `EQ`,
 * `SQR` became `SQRT`, and so on. The catalog keeps one name per instruction,
 * because that name is also the key the viewer labels a block with, so composed
 * text, parsed text and a rendered block agree. Lookup still accepts the other
 * published spelling: an export may carry it at any revision.
 *
 * An alias therefore only ever points at a name the catalog declares. Fourteen
 * pairs have exactly one side catalogued; a pair with neither is left alone, and
 * `instructionByName` reports it as unknown with the nearest names as before.
 */
const CATALOG_NAMES: ReadonlySet<string> = new Set(INSTRUCTIONS.map(instruction => instruction.name))
const ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
  MNEMONIC_PAIRS.flatMap(({ legacy, modern }): [string, string][] => {
    const hasLegacy = CATALOG_NAMES.has(legacy)
    const hasModern = CATALOG_NAMES.has(modern)
    if (hasLegacy === hasModern) return []
    return hasLegacy ? [[modern, legacy]] : [[legacy, modern]]
  }),
)

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
