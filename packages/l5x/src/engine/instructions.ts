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
export type OperandKind = 'BOOL' | 'NUMBER' | 'ANY' | 'TIMER' | 'COUNTER' | 'STRING' | 'EXPRESSION' | 'ROUTINE' | 'LABEL' | 'KEYWORD'

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
/** A symbolic name such as a GSV class or attribute: an identifier, not a tag. */
const keyword = (name: string): InstructionOperand => ({ name, kind: 'KEYWORD' })

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
  { name: 'BSL', category: 'Bit', summary: 'Bit shift left through an array.', operands: [{ name: 'Array', kind: 'ANY' }, { name: 'Control', kind: 'ANY' }, num('Source bit'), num('Length')] },
  { name: 'BSR', category: 'Bit', summary: 'Bit shift right through an array.', operands: [{ name: 'Array', kind: 'ANY' }, { name: 'Control', kind: 'ANY' }, num('Source bit'), num('Length')] },

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

  // Masked, array and system instructions. Their operand lists are the vendor operand
  // fields in written order, including the Length and Position fields that a control
  // structure carries: the compact table below had several of these wrong, and a wrong
  // count is only caught by Studio.
  { name: 'MVM', category: 'Move', summary: 'Masked move: copy the source through the mask into the destination.', operands: [num('Source'), num('Mask'), num('Dest')] },
  { name: 'GSV', category: 'Communications', summary: 'Get system value: read one attribute of a class instance into the destination.', operands: [keyword('Class'), keyword('Instance'), keyword('Attribute'), any('Dest')] },
  { name: 'SSV', category: 'Communications', summary: 'Set system value: write the source into one attribute of a class instance.', operands: [keyword('Class'), keyword('Instance'), keyword('Attribute'), any('Source')] },
  { name: 'SQO', category: 'Sequencer', summary: 'Sequencer output: drive the destination from one masked step of the array.', operands: [any('Array'), num('Mask'), num('Dest'), any('Control'), num('Length'), num('Position')] },
  { name: 'SQL', category: 'Sequencer', summary: 'Sequencer load: store the source into the current step of the array.', operands: [any('Array'), num('Source'), any('Control'), num('Length'), num('Position')] },
  { name: 'FAL', category: 'File and array', summary: 'File arithmetic and logic: evaluate the expression across Length elements.', operands: [any('Control'), num('Length'), num('Position'), num('Mode'), any('Dest'), expression()] },
  { name: 'FSC', category: 'File and array', summary: 'File search and compare: evaluate the expression across Length elements and report the position.', operands: [any('Control'), num('Length'), num('Position'), num('Mode'), expression()] },

  // Operand lists the vendor fields give in full. One-shot storage/output, a masked
  // compare and the bit-distribute and average forms each had too few operands, which the
  // composer's own arity check then defended.
  { name: 'OSR', category: 'Contacts and coils', summary: 'One shot rising: true for one scan when the storage bit goes false to true.', operands: [{ name: 'Storage', kind: 'BOOL' }, { name: 'Dest', kind: 'BOOL' }] },
  { name: 'OSF', category: 'Contacts and coils', summary: 'One shot falling: true for one scan when the storage bit goes true to false.', operands: [{ name: 'Storage', kind: 'BOOL' }, { name: 'Dest', kind: 'BOOL' }] },
  { name: 'MEQ', category: 'Comparison', summary: 'Masked equal: true when source and compare agree through the mask.', operands: [num('Source'), num('Mask'), num('Compare')] },
  { name: 'BTD', category: 'Move', summary: 'Bit distribute: copy Length bits from the source bit position to the destination bit position.', operands: [num('Source'), num('Source bit'), num('Dest'), num('Dest bit'), num('Length')] },
  { name: 'AVE', category: 'File and array', summary: 'Average: average the array along one dimension into the destination.', operands: [any('Array'), num('Dimension'), any('Dest'), any('Control'), num('Length'), num('Position')] },

  // Motion. Every operand is a field of the instruction box, in the order the vendor
  // metadata writes them, so the count and order are right and the type is left open: this
  // catalogue cannot verify AXIS, MOTION_GROUP or the enumerated unit types.
  { name: 'MAJ', category: 'Motion', summary: 'Motion axis jog: run the axis continuously at a speed until a stop.', operands: [any('Axis'), any('MotionControl'), any('Direction'), any('Speed'), any('SpeedUnits'), any('AccelRate'), any('AccelUnits'), any('DecelRate'), any('DecelUnits'), any('Profile'), any('AccelJerk'), any('DecelJerk'), any('JerkUnits'), any('Merge'), any('MergeSpeed'), any('LockPosition'), any('LockDirection')] },
  { name: 'MAM', category: 'Motion', summary: 'Motion axis move: one positioning move with the given type, speed, acceleration and merge.', operands: [any('Axis'), any('MotionControl'), any('MoveType'), any('Position'), any('Speed'), any('SpeedUnits'), any('AccelRate'), any('AccelUnits'), any('DecelRate'), any('DecelUnits'), any('Profile'), any('AccelJerk'), any('DecelJerk'), any('JerkUnits'), any('Merge'), any('MergeSpeed'), any('LockPosition'), any('LockDirection'), any('EventDistance'), any('CalculatedData')] },
  { name: 'MAPC', category: 'Motion', summary: 'Motion axis position cam: slave the axis to a master through a cam profile.', operands: [any('SlaveAxis'), any('MasterAxis'), any('MotionControl'), any('Direction'), any('CamProfile'), any('SlaveScaling'), any('MasterScaling'), any('ExecutionMode'), any('ExecutionSchedule'), any('MasterLockPosition'), any('CamLockPosition'), any('CamType'), any('MasterReference'), any('MasterDirection')] },
  { name: 'MAS', category: 'Motion', summary: 'Motion axis stop: stop the axis with the given stop type and deceleration.', operands: [any('Axis'), any('MotionControl'), any('StopType'), any('ChangeDecel'), any('DecelRate'), any('DecelUnits'), any('ChangeDecelJerk'), any('DecelJerk'), any('JerkUnits')] },
  { name: 'MATC', category: 'Motion', summary: 'Motion axis time cam: drive the axis from a cam profile against time.', operands: [any('Axis'), any('MotionControl'), any('Direction'), any('CamProfile'), any('DistanceScaling'), any('TimeScaling'), any('ExecutionMode'), any('ExecutionSchedule'), any('LockPosition'), any('CamType'), any('LockDirection'), any('InstructionMode')] },
  { name: 'MAH', category: 'Motion', summary: 'Motion axis home: home the axis using the configured home sequence.', operands: [any('Axis'), any('MotionControl')] },
  { name: 'MDF', category: 'Motion', summary: 'Motion axis disarm: disarm the axis so motion is no longer commanded.', operands: [any('Axis'), any('MotionControl')] },
  { name: 'MDW', category: 'Motion', summary: 'Motion axis dwell: hold the axis at its position for a time.', operands: [any('Axis'), any('MotionControl')] },
  { name: 'MGS', category: 'Motion', summary: 'Motion group stop: stop every axis in the group.', operands: [any('Group'), any('MotionControl'), any('StopMode')] },
  { name: 'MGSP', category: 'Motion', summary: 'Motion group shutdown: shut the group down.', operands: [any('Group'), any('MotionControl')] },
  { name: 'MRP', category: 'Motion', summary: 'Motion redefinition of position: redefine the axis position.', operands: [any('Axis'), any('MotionControl'), any('Type'), any('PositionSelect'), any('Position')] },
  { name: 'MSF', category: 'Motion', summary: 'Motion axis shutdown: shut the axis down.', operands: [any('Axis'), any('MotionControl')] },
  { name: 'MSO', category: 'Motion', summary: 'Motion servo on: turn the axis servo drive on.', operands: [any('Axis'), any('MotionControl')] },

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
