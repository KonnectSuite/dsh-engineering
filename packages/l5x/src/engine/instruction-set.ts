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
const TABLE: readonly (readonly [string, string])[] = [
  ['Contacts and coils', 'OSF=B OSR=B UID= UIE='],
  ['Comparison', 'MEQ=AB'],
  ['Math', 'NEG=SD ABS=SD XPY=ABD LN=SD LOG=SD EXP=SD DEG=SD RAD=SD TOD=SD FRD=SD TRUNC=SD SIN=SD COS=SD TAN=SD ASN=SD ACS=SD ATN=SD SCL=SD'],
  ['Move', 'MVM=SD CPS=SDL BTD=SDL SWPB=SD'],
  ['File and array', 'FAL=KLX FSC=KLX SRT=DLX AVE=DL STD=DL SIZE=D'],
  ['Sequencer', 'SQO=KLP SQC=KLP SQL=KLP'],
  ['Program control', 'JXR=R FOR=RBX BRK= NOP= TND= EOT= SFR= SFP='],
  ['Communications', 'MSG=K GSV=AXD SSV=AXS'],
  ['ASCII', 'ACN=AL ARD=ALD ASR=ALS AWA=ALS AHL=AL AWT=ALS AEX=ALD ABL=AL ACB=AL'],
  ['String', 'STOD=SD DTOS=SD STOR=SSD'],
  ['Process', 'PID=K PIDE=K'],
  ['Alarm', 'ALMA=D ALMD=D'],
  ['Motion', 'MAJ=AB MAS=A MAM=AB MSO=A MSF=A MGS=A MGSP=A MAH=A MAPC=A MATC=A MDW=A MRP=A MDF=A'],
]

const slot = (code: string): { name: string; kind: 'BOOL' | 'NUMBER' | 'ANY' | 'TIMER' | 'COUNTER' } => {
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
    case 'X': return { name: 'Expression', kind: 'ANY' }
    case 'R': return { name: 'Routine Name', kind: 'ANY' }
    default: return { name: 'Tag', kind: 'BOOL' }
  }
}

/** One catalogued instruction: mnemonic, category, and its operand slots in written order. */
export interface MoreInstruction {
  readonly name: string
  readonly category: string
  readonly slots: readonly { readonly name: string; readonly kind: 'BOOL' | 'NUMBER' | 'ANY' | 'TIMER' | 'COUNTER' }[]
}

export const MORE_INSTRUCTIONS: readonly MoreInstruction[] = TABLE.flatMap(([category, list]) =>
  list.trim().split(/\s+/u).filter(token => token !== '').map(token => {
    const [name, codes = ''] = token.split('=')
    return { name, category, slots: [...codes].map(slot) }
  }))
