/**
 * The rest of the Logix Designer ladder instruction set, written compactly.
 *
 * Each row is `CATEGORY` and a space separated list of `NAME=codes`, where the codes are the operand
 * slots in written order: A/B source A/B, S source, D destination, L length, P position, T timer,
 * C counter, K control, X expression, B BOOL tag, R routine name. The viewer labels a block from
 * these slots, and the composer builds a legal rung from them, so one table serves both.
 *
 * A mnemonic appears once in the catalog: an entry that instructions.ts already declares
 * with named slots (SQR, BSL, BSR) is not repeated here.
 */
import type { OperandKind } from './instructions.ts'

const TABLE: readonly (readonly [string, string])[] = [
  ['Contacts and coils', 'UID= UIE='],
  ['Math', 'NEG=SD ABS=SD XPY=ABD LN=SD LOG=SD EXP=SD DEG=SD RAD=SD TOD=SD FRD=SD TRUNC=SD SIN=SD COS=SD TAN=SD ASN=SD ACS=SD ATN=SD SCL=SD'],
  ['Move', 'CPS=SDL SWPB=SD'],
  ['File and array', 'SRT=DLX STD=DL SIZE=D'],
  ['Sequencer', 'SQC=KLP'],
  ['Program control', 'JXR=R BRK= NOP= TND='],
  ['Communications', 'MSG=K'],
  ['ASCII', 'ACN=AL ASR=ALS AHL=AL AEX=ALD'],
  ['String', 'STOD=SD DTOS=SD STOR=SSD'],
  ['Process', 'PID=K PIDE=K'],
  ['Alarm', 'ALMA=D ALMD=D'],
]

const slot = (code: string): { name: string; kind: OperandKind } => {
  switch (code) {
    case 'A': return { name: 'Source A', kind: 'NUMBER' }
    case 'B': return { name: 'Source B', kind: 'NUMBER' }
    case 'S': return { name: 'Source', kind: 'NUMBER' }
    case 'D': return { name: 'Dest', kind: 'NUMBER' }
    case 'L': return { name: 'Length', kind: 'NUMBER' }
    case 'P': return { name: 'Position', kind: 'NUMBER' }
    case 'T': return { name: 'Timer', kind: 'TIMER' }
    case 'C': return { name: 'Counter', kind: 'COUNTER' }
    case 'K': return { name: 'Control', kind: 'ANY' }
    case 'X': return { name: 'Expression', kind: 'EXPRESSION' }
    case 'R': return { name: 'Routine Name', kind: 'ROUTINE' }
    default: return { name: 'Tag', kind: 'BOOL' }
  }
}

/** One catalogued instruction: mnemonic, category, and its operand slots in written order. */
export interface MoreInstruction {
  readonly name: string
  readonly category: string
  readonly slots: readonly { readonly name: string; readonly kind: OperandKind }[]
}

export const MORE_INSTRUCTIONS: readonly MoreInstruction[] = TABLE.flatMap(([category, list]) =>
  list.trim().split(/\s+/u).filter(token => token !== '').map(token => {
    const [name, codes = ''] = token.split('=')
    return { name, category, slots: [...codes].map(slot) }
  }))
