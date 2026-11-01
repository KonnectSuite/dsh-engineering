/**
 * The instruction catalog the ladder composer validates against.
 *
 * Logix has no instruction dictionary inside an L5X export, so a generated rung
 * could previously name any identifier and still parse. This table is the
 * contract: an instruction, its operand slots and the kind each slot accepts.
 *
 * The set covers what engineering programs actually use - measured against a
 * 1279-tag, 860-rung project - rather than every instruction the vendor ships.
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
  /** Accepted tag types where the vendor restricts the slot; omitted means any type the kind allows. */
  readonly types?: readonly string[]
  /** Largest value the vendor accepts for a literal in this slot (unbounded when omitted). */
  readonly maximum?: number
  /** Smallest value the vendor accepts for a literal in this slot (0 when omitted). */
  readonly minimum?: number
  /** True when the slot must name one array element (Arr[0]), not the array tag. */
  readonly arrayElement?: boolean
  /** True when the slot must name a declared array tag as a whole (Studio answers MUSTBEARRAY otherwise). */
  readonly arrayTag?: boolean
  /** True when the slot must not name a whole array tag; Studio answers MUSTBEDISCRETE for one. */
  readonly noArray?: boolean
  /** True for an array, structure or control operand that must be a tag but is not written. */
  readonly tagOnly?: boolean
  /** True when Studio requires a tag here: a literal is refused at build with RxCMP_E_AUDIT_INVALIDOPKIND. */
  readonly writable?: boolean
  /** True when this slot repeats for each remaining operand, as a JSR parameter list does. */
  readonly rest?: boolean
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
  /**
   * True when the catalogue knows the mnemonic but not its operand list. The composer refuses
   * these rather than claim an arity it cannot check; the rung text path still accepts them.
   */
  readonly notModelled?: boolean
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
/** A numeric slot that must be a tag: Studio refuses a literal destination, index or size. */
const numW = (name: string): InstructionOperand => ({ name, kind: 'NUMBER', writable: true })
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
  { name: 'ISINF', category: 'Comparison', summary: 'True when the source is infinite.', operands: [{ name: 'Source', kind: 'NUMBER', types: ['REAL'] }] },
  { name: 'ISNAN', category: 'Comparison', summary: 'True when the source is not a number.', operands: [{ name: 'Source', kind: 'NUMBER', types: ['REAL'] }] },

  // ASCII serial port. These need a controller with a serial port: they build on ControlLogix 5570
  // (1756-L73) and are refused on CompactLogix 5380 (5069) and ControlLogix 5580 (1756-L83E), where
  // the compiler answers RxCMP_E_AUDIT_INVALIDOPTYPE for every operand combination tried.
  { name: 'ABL', category: 'ASCII', summary: 'Count the characters in the serial port buffer until a line terminator.', operands: [num('Channel'), any('Serial Port Control'), num('Character Count')] },
  { name: 'ACB', category: 'ASCII', summary: 'Count the characters still in the serial port buffer.', operands: [num('Channel'), any('Serial Port Control'), num('Character Count')] },
  { name: 'ARD', category: 'ASCII', summary: 'Read characters from the serial port buffer into a destination.', operands: [num('Channel'), { name: 'Destination', kind: 'STRING', writable: true }, any('Serial Port Control'), num('Serial Port Control Length'), num('Characters Read')] },
  { name: 'ACL', category: 'ASCII', summary: 'Clear the serial port read buffer and the read and write queues.', operands: [num('Channel'), bool('Clear Serial Port Read'), bool('Clear Serial Port Write')] },
  { name: 'AHL', category: 'ASCII', summary: 'Apply an AND and OR mask to the serial port control lines.', operands: [num('Channel'), num('ANDMask'), num('ORMask'), any('Serial Port Control'), num('Channel Status')] },
  { name: 'ARL', category: 'ASCII', summary: 'Read a line from the serial port buffer into a destination.', operands: [num('Channel'), { name: 'Destination', kind: 'STRING', writable: true }, any('Serial Port Control'), num('Serial Port Control Length'), num('Characters Read')] },
  { name: 'AWA', category: 'ASCII', summary: 'Write characters to the serial port buffer, appended.', operands: [num('Channel'), str('Source'), any('Serial Port Control'), num('Serial Port Control Length'), num('Characters Sent')] },
  { name: 'AWT', category: 'ASCII', summary: 'Write characters to the serial port buffer.', operands: [num('Channel'), str('Source'), any('Serial Port Control'), num('Serial Port Control Length'), num('Characters Sent')] },

  // Math
  { name: 'ADD', category: 'Math', summary: 'Add source A and source B into the destination.', operands: [num('Source A'), num('Source B'), numW('Destination')] },
  { name: 'SUB', category: 'Math', summary: 'Subtract source B from source A into the destination.', operands: [num('Source A'), num('Source B'), numW('Destination')] },
  { name: 'MUL', category: 'Math', summary: 'Multiply source A by source B into the destination.', operands: [num('Source A'), num('Source B'), numW('Destination')] },
  { name: 'DIV', category: 'Math', summary: 'Divide source A by source B into the destination.', operands: [num('Source A'), num('Source B'), numW('Destination')] },
  { name: 'MOD', category: 'Math', summary: 'Remainder of source A divided by source B.', operands: [num('Source A'), num('Source B'), numW('Destination')] },
  { name: 'SQR', category: 'Math', summary: 'Square root of the source into the destination.', operands: [num('Source'), numW('Destination')] },
  { name: 'CPT', category: 'Math', summary: 'Compute an expression into the destination; the destination comes first in the rung text.', operands: [numW('Destination'), expression()] },

  { name: 'STD', category: 'File and array', summary: 'Standard deviation of the array elements into a REAL destination.', operands: [{ name: 'Array', kind: 'ANY', tagOnly: true }, { name: 'Dimension to Vary', kind: 'NUMBER', maximum: 2 }, { name: 'Destination', kind: 'NUMBER', writable: true, types: ['REAL'] }, { name: 'Control', kind: 'ANY', writable: true, types: ['CONTROL'] }, num('Length'), num('Position')] },
  { name: 'SIZE', category: 'File and array', summary: 'Number of elements in one dimension of an array into the size tag.', operands: [{ name: 'Source', kind: 'ANY', tagOnly: true, arrayTag: true }, { name: 'Dimension to Vary', kind: 'NUMBER', maximum: 2 }, numW('Size')] },
  { name: 'JXR', category: 'Program control', summary: 'Run an external routine; parameters and a return tag may follow the control structure.', operands: [routine('External routine name'), { name: 'External routine control', kind: 'ANY', writable: true }] },
  { name: 'PID', category: 'Process', summary: 'PID loop: the structure, the process variable, the tieback, the control variable, an optional master loop, and the inhold bit and value.', operands: [{ name: 'PID', kind: 'ANY', writable: true, types: ['PID'] }, num('Process variable'), num('Tieback'), { name: 'Control variable', kind: 'NUMBER', writable: true }, any('PID master loop'), bool('Inhold bit'), num('Inhold value')] },
  { name: 'ALMA', category: 'Alarm', summary: 'Analog alarm: the input is compared with the limits in the ALARM_ANALOG structure.', operands: [{ name: 'Alarm', kind: 'ANY', writable: true, types: ['ALARM_ANALOG'] }, num('In'), bool('ProgAckAll'), bool('ProgDisable'), bool('ProgEnable')] },
  { name: 'ALMD', category: 'Alarm', summary: 'Digital alarm: the condition in the ALARM_DIGITAL structure, acknowledged and reset from the program.', operands: [{ name: 'Alarm', kind: 'ANY', writable: true, types: ['ALARM_DIGITAL'] }, bool('ProgAck'), bool('ProgReset'), bool('ProgDisable'), bool('ProgEnable')] },
  // Audited against the installed help and a Studio build: the compact table had these wrong.
  { name: 'SRT', category: 'File and array', summary: 'Sort the elements of an array in place, using a control structure for length and position.', operands: [{ name: 'Array', kind: 'ANY', tagOnly: true }, { name: 'Dimension to Vary', kind: 'NUMBER', maximum: 2 }, { name: 'Control', kind: 'ANY', writable: true, types: ['CONTROL'] }, num('Length'), num('Position')] },
  { name: 'SWPB', category: 'Move', summary: 'Rearrange the bytes of the source into the destination; the order mode is a number (0 or 1), not the word HIGHLOW.', operands: [num('Source'), num('Order Mode'), { name: 'Dest', kind: 'NUMBER', writable: true }] },
  { name: 'STOD', category: 'String', summary: 'Convert a string to an integer value in the destination.', operands: [str('Source'), { name: 'Dest', kind: 'NUMBER', writable: true }] },
  { name: 'DTOS', category: 'String', summary: 'Convert an integer value to its decimal string in the destination.', operands: [num('Source'), { name: 'Dest', kind: 'STRING', writable: true }] },
  { name: 'STOR', category: 'String', summary: 'Convert a string to a REAL value in the destination.', operands: [str('Source'), numW('Destination')] },

  // Move
  { name: 'MOV', category: 'Move', summary: 'Move the source value into the destination.', operands: [num('Source'), numW('Destination')] },
  { name: 'COP', category: 'Move', summary: 'Copy elements from the source to the destination.', operands: [{ name: 'Source', kind: 'ANY', tagOnly: true, arrayElement: true }, { name: 'Destination', kind: 'ANY', writable: true, arrayElement: true }, num('Length')] },
  { name: 'CPS', category: 'Move', summary: 'Synchronous copy: copy Source to Dest without allowing the source to change during the copy.', operands: [{ name: 'Source', kind: 'ANY', tagOnly: true, arrayElement: true }, { name: 'Dest', kind: 'ANY', writable: true, arrayElement: true }, num('Length')] },
  { name: 'CLR', category: 'Move', summary: 'Clear the destination to zero.', operands: [numW('Destination')] },

  // Timer and counter
  { name: 'TON', category: 'Timer and counter', summary: 'Timer on delay: accumulates while the rung is true; the accumulator operand is written as 0.', operands: [{ name: 'Timer', kind: 'TIMER' }, num('Preset'), num('Accum')] },
  { name: 'TOF', category: 'Timer and counter', summary: 'Timer off delay: accumulates after the rung goes false; the accumulator operand is written as 0.', operands: [{ name: 'Timer', kind: 'TIMER' }, num('Preset'), num('Accum')] },
  { name: 'RTO', category: 'Timer and counter', summary: 'Retentive timer on: accumulates and holds its value; the accumulator operand is written as 0.', operands: [{ name: 'Timer', kind: 'TIMER' }, num('Preset'), num('Accum')] },
  { name: 'RES', category: 'Timer and counter', summary: 'Reset a timer or counter structure.', operands: [{ name: 'Structure', kind: 'ANY', writable: true }] },
  { name: 'CTU', category: 'Timer and counter', summary: 'Count up on each false-to-true rung transition.', operands: [{ name: 'Counter', kind: 'COUNTER' }, num('Preset'), num('Accum')] },
  { name: 'CTD', category: 'Timer and counter', summary: 'Count down on each false-to-true rung transition.', operands: [{ name: 'Counter', kind: 'COUNTER' }, num('Preset'), num('Accum')] },

  // Program control
  { name: 'JSR', category: 'Program control', summary: 'Jump to a subroutine; the second operand is the return parameter, written 0 when the routine returns nothing.', operands: [routine('Routine Name'), { name: 'Return Par', kind: 'ANY' }] },
  { name: 'RET', category: 'Program control', summary: 'Return from a subroutine.', operands: [] },
  { name: 'JMP', category: 'Program control', summary: 'Jump to a label in the same routine.', operands: [label()] },
  { name: 'LBL', category: 'Program control', summary: 'Label target for a JMP.', operands: [label()] },
  { name: 'MCR', category: 'Program control', summary: 'Master control relay zone boundary.', operands: [] },

  // Bit
  { name: 'AND', category: 'Bit', summary: 'Bitwise AND of two sources into the destination.', operands: [num('Source A'), num('Source B'), numW('Destination')] },
  { name: 'OR', category: 'Bit', summary: 'Bitwise OR of two sources into the destination.', operands: [num('Source A'), num('Source B'), numW('Destination')] },
  { name: 'XOR', category: 'Bit', summary: 'Bitwise exclusive OR of two sources into the destination.', operands: [num('Source A'), num('Source B'), numW('Destination')] },
  { name: 'NOT', category: 'Bit', summary: 'Bitwise complement of the source into the destination.', operands: [num('Source'), numW('Destination')] },
  { name: 'BSL', category: 'Bit', summary: 'Bit shift left through an array.', operands: [{ name: 'Array', kind: 'ANY', tagOnly: true }, { name: 'Control', kind: 'ANY', writable: true, types: ['CONTROL'] }, bool('Source bit'), num('Length')] },
  { name: 'BSR', category: 'Bit', summary: 'Bit shift right through an array.', operands: [{ name: 'Array', kind: 'ANY', tagOnly: true }, { name: 'Control', kind: 'ANY', writable: true, types: ['CONTROL'] }, bool('Source bit'), num('Length')] },

  // String. Operand order is the order the vendor's own instruction metadata uses, so a
  // composed rung reads the way an export from Studio does.
  { name: 'CONCAT', category: 'String', summary: 'Concatenate: append source B to source A and write the joined string to the destination.', operands: [str('Source A'), str('Source B'), { name: 'Dest', kind: 'STRING', writable: true }] },
  { name: 'MID', category: 'String', summary: 'Extract part of a string: copy Qty characters from Start into the destination string.', operands: [str('Source'), num('Qty'), { name: 'Start', kind: 'NUMBER', minimum: 1 }, { name: 'Dest', kind: 'STRING', writable: true }] },
  { name: 'FIND', category: 'String', summary: 'Find: search the source string and write the first position of Search to the result.', operands: [str('Source'), str('Search'), { name: 'Start', kind: 'NUMBER', minimum: 1 }, { name: 'Result', kind: 'ANY', writable: true, types: ['DINT'] }] },
  { name: 'INSERT', category: 'String', summary: 'Insert source B into source A at Start and write the result to the destination.', operands: [str('Source A'), str('Source B'), { name: 'Start', kind: 'NUMBER', minimum: 1 }, { name: 'Dest', kind: 'STRING', writable: true }] },
  { name: 'DELETE', category: 'String', summary: 'Delete Qty characters from the source starting at Start into the destination.', operands: [str('Source'), num('Qty'), { name: 'Start', kind: 'NUMBER', minimum: 1 }, { name: 'Dest', kind: 'STRING', writable: true }] },
  { name: 'LOWER', category: 'String', summary: 'Lower case: copy the source string to the destination in lower case.', operands: [str('Source'), { name: 'Dest', kind: 'STRING', writable: true }] },
  { name: 'UPPER', category: 'String', summary: 'Upper case: copy the source string to the destination in upper case.', operands: [str('Source'), { name: 'Dest', kind: 'STRING', writable: true }] },
  { name: 'RTOS', category: 'String', summary: 'Real to string: convert a REAL value into the destination string.', operands: [num('Source'), { name: 'Dest', kind: 'STRING', writable: true }] },

  // File and array
  { name: 'FLL', category: 'File and array', summary: 'File fill: fill Length elements at the destination with the source value.', operands: [num('Source'), { name: 'Dest', kind: 'ANY', writable: true, arrayElement: true }, num('Length')] },

  // Program control. SBR carries no operands: its parameters are the JSR arguments.
  { name: 'SBR', category: 'Program control', summary: 'Subroutine label a JSR calls; its parameters are the arguments the JSR passes.', operands: [] },

  // Masked, array and system instructions. Their operand lists are the vendor operand
  // fields in written order, including the Length and Position fields that a control
  // structure carries: the compact table below had several of these wrong, and a wrong
  // count is only caught by Studio.
  { name: 'MVM', category: 'Move', summary: 'Masked move: copy the source through the mask into the destination.', operands: [num('Source'), num('Mask'), { name: 'Dest', kind: 'NUMBER', writable: true }] },
  { name: 'GSV', category: 'Communications', summary: 'Get system value: read one attribute of a class instance into the destination.', operands: [keyword('Class'), keyword('Instance'), keyword('Attribute'), { name: 'Dest', kind: 'ANY', writable: true }] },
  { name: 'SSV', category: 'Communications', summary: 'Set system value: write the source into one attribute of a class instance.', operands: [keyword('Class'), keyword('Instance'), keyword('Attribute'), { name: 'Source', kind: 'ANY', tagOnly: true }] },
  { name: 'SQO', category: 'Sequencer', summary: 'Sequencer output: drive the destination from one masked step of the array.', operands: [{ name: 'Array', kind: 'ANY', tagOnly: true }, num('Mask'), { name: 'Dest', kind: 'NUMBER', writable: true, noArray: true }, { name: 'Control', kind: 'ANY', writable: true, types: ['CONTROL'] }, num('Length'), num('Position')] },
  { name: 'SQL', category: 'Sequencer', summary: 'Sequencer load: store the source into the current step of the array.', operands: [any('Array'), num('Source'), any('Control'), num('Length'), num('Position')] },
  { name: 'FAL', category: 'File and array', summary: 'File arithmetic and logic. Not modelled: eight operand shapes were refused by the compiler, so write this one by hand until a real export shows the accepted form.', notModelled: true, operands: [] },
  { name: 'DCM', category: 'Safety', summary: 'Dual Channel Input Monitor. GuardLogix safety instruction. Not modelled: its safety-function and input-type operands are drop-down names, not tags, so the composer refuses it; the operand count comes from production usage and the vendor help table.', notModelled: true, operands: [{ name: 'DCM', kind: 'ANY' }, { name: 'Safety Function', kind: 'ANY' }, { name: 'Input Type', kind: 'ANY' }, { name: 'Input Delay', kind: 'NUMBER' }, { name: 'Channel A', kind: 'ANY' }, { name: 'Channel B', kind: 'ANY' }, { name: 'Status', kind: 'ANY' }, { name: 'Reset', kind: 'ANY' }] },
  { name: 'DCS', category: 'Safety', summary: 'Dual Channel Input Stop. GuardLogix safety instruction. Not modelled: its safety-function and input-type operands are drop-down names, not tags, so the composer refuses it; the operand count comes from production usage and the vendor help table.', notModelled: true, operands: [{ name: 'DCS', kind: 'ANY' }, { name: 'Safety Function', kind: 'ANY' }, { name: 'Input Type', kind: 'ANY' }, { name: 'Input Delay', kind: 'NUMBER' }, { name: 'Startup Inhibit', kind: 'ANY' }, { name: 'Reset Type', kind: 'ANY' }, { name: 'Channel A', kind: 'ANY' }, { name: 'Channel B', kind: 'ANY' }, { name: 'Status', kind: 'ANY' }, { name: 'Reset', kind: 'ANY' }] },
  { name: 'CROUT', category: 'Safety', summary: 'Configurable Redundant Output. GuardLogix safety instruction. Not modelled: its safety-function and input-type operands are drop-down names, not tags, so the composer refuses it; the operand count comes from production usage and the vendor help table.', notModelled: true, operands: [{ name: 'CROUT', kind: 'ANY' }, { name: 'Feedback Type', kind: 'ANY' }, { name: 'Feedback Reaction Time', kind: 'NUMBER' }, { name: 'Enable', kind: 'ANY' }, { name: 'Channel A', kind: 'ANY' }, { name: 'Channel B', kind: 'ANY' }, { name: 'Input Status', kind: 'ANY' }, { name: 'Output Status', kind: 'ANY' }, { name: 'Reset', kind: 'ANY' }] },
  { name: 'FSC', category: 'File and array', summary: 'File search and compare. Not modelled: six operand shapes were refused or crashed the compiler, so write this one by hand until a real export shows the accepted form.', notModelled: true, operands: [] },

  // Operand lists the vendor fields give in full. One-shot storage/output, a masked
  // compare and the bit-distribute and average forms each had too few operands, which the
  // composer's own arity check then defended.
  { name: 'OSR', category: 'Contacts and coils', summary: 'One shot rising: true for one scan when the storage bit goes false to true.', operands: [{ name: 'Storage', kind: 'BOOL' }, { name: 'Dest', kind: 'BOOL', writable: true }] },
  { name: 'OSF', category: 'Contacts and coils', summary: 'One shot falling: true for one scan when the storage bit goes true to false.', operands: [{ name: 'Storage', kind: 'BOOL' }, { name: 'Dest', kind: 'BOOL', writable: true }] },
  { name: 'MEQ', category: 'Comparison', summary: 'Masked equal: true when source and compare agree through the mask.', operands: [num('Source'), num('Mask'), num('Compare')] },
  { name: 'BTD', category: 'Move', summary: 'Bit distribute: copy Length bits from the source bit position to the destination bit position.', operands: [num('Source'), num('Source bit'), { name: 'Dest', kind: 'NUMBER', writable: true }, { name: 'Dest bit', kind: 'NUMBER', writable: true }, num('Length')] },
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

  // FOR runs a named routine until the index passes the terminal value, so its first
  // operand is a routine, not an address. The compact table had a routine name, a source
  // and an expression, which is neither the right count nor the right meaning.
  { name: 'FOR', category: 'Program control', summary: 'For loop: run the named routine, adding the step to the index, until the index passes the terminal value.', operands: [routine(), numW('Index'), num('Initial value'), num('Terminal value'), num('Step size')] },

  // Mnemonics the catalogue knows but cannot model. Each needs operands this catalogue has no
  // source for, and the compact table's empty slot list made them claim "takes 0 operands" -
  // a confident wrong answer with no way forward. Drafting the rung text still works.
  { name: 'EOT', category: 'Program control', summary: 'End of transition, for a Sequential Function Chart step.', operands: [], notModelled: true },
  { name: 'SFR', category: 'Program control', summary: 'Reset an SFC routine to a target state.', operands: [], notModelled: true },
  { name: 'SFP', category: 'Program control', summary: 'Pause an SFC routine at a target state.', operands: [], notModelled: true },

  // Operand lists transcribed from the installed Logix 5000 instruction help (Help\ENU\rs5000),
  // which states each slot by name; pseudo-operands Length and Position are real operands here.
  { name: 'FFL', category: 'File and array', summary: 'FIFO load: copy the source into the next FIFO element.', operands: [any('Source'), any('FIFO'), any('Control'), num('Length'), num('Position')] },
  { name: 'FFU', category: 'File and array', summary: 'FIFO unload: move the oldest FIFO element into the destination.', operands: [any('FIFO'), any('Destination'), any('Control'), num('Length'), num('Position')] },
  { name: 'LFL', category: 'File and array', summary: 'LIFO load: push the source onto a LIFO stack.', operands: [any('Source'), any('LIFO'), any('Control'), num('Length'), num('Position')] },
  { name: 'LFU', category: 'File and array', summary: 'LIFO unload: pop the most recent LIFO element into the destination.', operands: [any('LIFO'), any('Destination'), any('Control'), num('Length'), num('Position')] },
  { name: 'DTR', category: 'Compare', summary: 'Data transition: pass source bits through the mask and compare them with the reference.', operands: [any('Source'), any('Mask'), any('Reference')] },
  { name: 'ATAN2', category: 'Math', summary: 'Two-argument arctangent: the angle of Source Y over Source X.', operands: [any('Source Y'), any('Source X'), any('Dest')] },
  { name: 'SQI', category: 'Sequencer', summary: 'Sequencer input: compare the source with one masked step of the array.', operands: [any('Array'), any('Mask'), any('Source'), any('Control'), num('Length'), num('Position')] },
  { name: 'EVENT', category: 'Program control', summary: 'Trigger an event task.', operands: [keyword('Task')] },

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
 * Logix Designer 36 renamed sixteen ladder instructions - `EQU` became `EQ`,
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
