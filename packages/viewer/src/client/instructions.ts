/**
 * Pin names for the instructions a Logix export can carry, in operand order.
 *
 * Drawn rather than guessed: a mnemonic missing here still renders its operands, labelled
 * "Operand N", so a partial table degrades to a readable block instead of a wrong one.
 * An AOI call is labelled from its own definition instead (model.aoiPins).
 */
export type PinKey =
  | 'operand.source' | 'operand.destination' | 'operand.length' | 'operand.position'
  | 'operand.timer' | 'operand.preset' | 'operand.accum' | 'operand.control'
  | 'operand.a' | 'operand.b' | 'operand.sourceA' | 'operand.sourceB'
  | 'operand.routine' | 'operand.parameter' | 'operand.expression'

const ARITHMETIC: readonly PinKey[] = ['operand.sourceA', 'operand.sourceB', 'operand.destination']
const COMPARE: readonly PinKey[] = ['operand.sourceA', 'operand.sourceB']
const UNARY: readonly PinKey[] = ['operand.source', 'operand.destination']
const FILE: readonly PinKey[] = ['operand.source', 'operand.destination', 'operand.length']
const TIMER: readonly PinKey[] = ['operand.timer', 'operand.preset', 'operand.accum']
const CONTROL: readonly PinKey[] = ['operand.timer', 'operand.preset', 'operand.accum', 'operand.control']

export const instructionPins: Record<string, readonly PinKey[]> = {
  // Move and copy
  MOV: UNARY, MVM: UNARY, CLR: ['operand.destination'], SWPB: UNARY, BTD: FILE, COP: FILE, CPS: FILE,
  FLL: ['operand.destination', 'operand.length', 'operand.source'],
  // Compare
  EQU: COMPARE, NEQ: COMPARE, LES: COMPARE, LEQ: COMPARE, GRT: COMPARE, GEQ: COMPARE, MEQ: COMPARE,
  LIM: ['operand.a', 'operand.b', 'operand.sourceA'], CMP: ['operand.expression'],
  // Compute and math
  ADD: ARITHMETIC, SUB: ARITHMETIC, MUL: ARITHMETIC, DIV: ARITHMETIC, MOD: ARITHMETIC,
  AND: ARITHMETIC, OR: ARITHMETIC, XOR: ARITHMETIC, NEG: UNARY, ABS: UNARY, NOT: UNARY, SQR: UNARY,
  CPT: ['operand.destination', 'operand.expression'],
  SCL: UNARY, TOD: UNARY, FRD: UNARY, DEG: UNARY, RAD: UNARY, LN: UNARY, LOG: UNARY, EXP: UNARY,
  // File and array
  AVE: FILE, STD: FILE, SRT: ['operand.destination', 'operand.length', 'operand.position'],
  FAL: ['operand.control', 'operand.length', 'operand.position'],
  FSC: ['operand.control', 'operand.length', 'operand.position'],
  SQO: ['operand.control', 'operand.length', 'operand.position'],
  SQC: ['operand.control', 'operand.length', 'operand.position'],
  SQL: ['operand.control', 'operand.length', 'operand.position'],
  BSL: ['operand.a', 'operand.timer', 'operand.length'], BSR: ['operand.a', 'operand.timer', 'operand.length'],
  // Timer and counter
  TON: TIMER, TOF: TIMER, RTO: TIMER, RES: ['operand.timer'],
  CTU: CONTROL, CTD: CONTROL,
  // Program control
  JSR: ['operand.routine', 'operand.parameter'], JXR: ['operand.routine'], RET: [],
  FOR: ['operand.routine', 'operand.a', 'operand.b'], BRK: [], NOP: [], AFI: [], TND: [],
  UID: [], UIE: [], SFR: [], SFP: [], EOT: [], TOR: [],
  // One shot and bit
  ONS: ['operand.a'], OSR: ['operand.a'], OSF: ['operand.a'],
  // Generic system instructions
  GSV: ['operand.a', 'operand.b', 'operand.length', 'operand.destination'],
  SSV: ['operand.a', 'operand.b', 'operand.length', 'operand.source'],
  MSG: ['operand.control'], PID: ['operand.control'],
  // ASCII
  ACN: ['operand.a', 'operand.length'], ARD: ['operand.a', 'operand.length', 'operand.destination'],
  ASR: ['operand.a', 'operand.length', 'operand.source'], AWA: ['operand.a', 'operand.length', 'operand.source'],
  AHL: ['operand.a', 'operand.length'], AWT: ['operand.a', 'operand.length', 'operand.source'],
  AEX: ['operand.a', 'operand.length', 'operand.destination'],
  ABL: ['operand.a', 'operand.length'], ACB: ['operand.a', 'operand.length'],
  // Motion and drive, whose pins are the axis and the operand
  MAJ: ['operand.a', 'operand.b'], MAS: ['operand.a'], MAM: ['operand.a', 'operand.b'],
  MSO: ['operand.a'], MSF: ['operand.a'], MGS: ['operand.a'], MGSP: ['operand.a'], MAH: ['operand.a'],
  MAPC: ['operand.a'], MATC: ['operand.a'], MDW: ['operand.a'],
  // Migrated PLC-5 and SLC instructions, which is where an unlabelled block reads worst.
  AFI: [], JMP: ['operand.a'], LBL: ['operand.a'], NXT: [], SBR: ['operand.a'], RET: ['operand.parameter'],
  MID: ['operand.source', 'operand.length', 'operand.destination'],
  LIMIT: ['operand.a', 'operand.b', 'operand.sourceA'], SCP: ['operand.source', 'operand.parameter', 'operand.destination'],
  CONCAT: ['operand.source', 'operand.destination', 'operand.length'],
  FIND: ['operand.source', 'operand.parameter', 'operand.length', 'operand.position'],
  STOD: ['operand.source', 'operand.destination'], DTOS: ['operand.source', 'operand.destination'],
  EVENT: ['operand.a', 'operand.b'], ACL: ['operand.a'], ARL: ['operand.a'], IIM: ['operand.a', 'operand.b'],
  INT: ['operand.a'], SIN: ['operand.source', 'operand.destination'], COS: ['operand.source', 'operand.destination'],
  TAN: ['operand.source', 'operand.destination'], ASN: ['operand.source', 'operand.destination'],
  ACS: ['operand.source', 'operand.destination'], ATN: ['operand.source', 'operand.destination'],
  TRUNC: ['operand.source', 'operand.destination'],
  // The migration wizard leaves this marker where it could not convert an instruction.
  PCE: ['operand.message'],
}
