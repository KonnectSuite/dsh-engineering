/**
 * The legacy instruction set, as data.
 *
 * One row per mnemonic an RSLogix 500 or RSLogix 5 program can contain, saying
 * what it becomes in Logix, how its operands move, and whether the change is
 * mechanical or needs a person. The resolver, the assessment risk report and the
 * corpus page all read this table, so a session asks instead of researching.
 *
 * **Provenance rule.** Every row names the manual and the *instruction section* it
 * was derived from. The sections are citation, not text: this table restates
 * behaviour in this bundle's own words and never reproduces a page of a vendor
 * manual. Where a row rests on something a manual does not state — what the
 * conversion wizard actually emitted — `basis` says `observed` and names the
 * export it was seen in, so a reader can check the artifact instead.
 *
 * The publication numbers below are the manuals, not links:
 *
 * - SLC 500: *SLC 500 Instruction Set Reference Manual*, 1747-RM001.
 * - PLC-5: *PLC-5 Instruction Set Reference*, 1785-6.1.
 * - Logix: *Logix 5000 Controllers General Instructions Reference Manual*,
 *   1756-RM003; current revision 1756-RM018A (Sep 2025).
 *
 * @module dsh-engineering-migration/knowledge/instructions
 */

/** Which legacy family carries the mnemonic. */
export type InstructionFamily = 'slc' | 'plc5' | 'both'

/** Whether the replacement is a rewrite or a judgement call. */
export type InstructionWork = 'mechanical' | 'review'

/** One legacy instruction. */
export interface InstructionRow {
  /** The legacy mnemonic, as the legacy rung spells it. */
  readonly legacy: string
  /** The family whose instruction set defines it. */
  readonly family: InstructionFamily
  /** The Logix instruction, or `null` when Logix has no direct equivalent. */
  readonly logix: string | null
  /** How the operands move, in one line. */
  readonly operands: string
  /** Mechanical when the rung text decides it; review when a person must. */
  readonly work: InstructionWork
  /** What to do, and what to check afterwards. */
  readonly advice: string
  /** Manual and instruction section, or `observed` with the export it was seen in. */
  readonly basis: string
}

const SLC = 'SLC 500 Instruction Set Reference Manual (1747-RM001)'
const PLC5 = 'PLC-5 Instruction Set Reference (1785-6.1)'
const LOGIX = 'Logix 5000 Controllers General Instructions Reference Manual (1756-RM003, current revision 1756-RM018A)'

/** Every row, ordered by family then mnemonic. */
export const INSTRUCTIONS: readonly InstructionRow[] = [
  // ---- timers and counters -------------------------------------------------
  {
    legacy: 'TON',
    family: 'both',
    logix: 'TON',
    operands: 'four legacy operands (timer file, time base, preset, accumulator) collapse to one TIMER structure; .PRE takes seconds',
    work: 'mechanical',
    advice: 'Keep the timer tag, write .PRE as preset x time base in seconds, and set .ACC only when the legacy accumulator was non-zero.',
    basis: `${SLC}, TON; ${LOGIX}, TON`,
  },
  {
    legacy: 'TOF',
    family: 'both',
    logix: 'TOF',
    operands: 'timer file, time base, preset, accumulator collapse to one TIMER structure',
    work: 'mechanical',
    advice: 'Same mapping as TON; .PRE is preset x time base in seconds.',
    basis: `${SLC}, TOF; ${LOGIX}, TOF`,
  },
  {
    legacy: 'RTO',
    family: 'both',
    logix: 'RTO',
    operands: 'timer file, time base, preset, accumulator collapse to one TIMER structure',
    work: 'mechanical',
    advice: 'RTO keeps its accumulator across a false rung in both families; only the structure changes.',
    basis: `${SLC}, RTO; ${LOGIX}, RTO`,
  },
  {
    legacy: 'CTU',
    family: 'both',
    logix: 'CTU',
    operands: 'counter file, preset, accumulator collapse to one COUNTER structure',
    work: 'mechanical',
    advice: 'Write .PRE from the legacy preset. The preset is the operand the legacy rung still records, so it is answerable without asking anyone.',
    basis: `${SLC}, CTU; ${LOGIX}, CTU`,
  },
  {
    legacy: 'CTD',
    family: 'both',
    logix: 'CTD',
    operands: 'counter file, preset, accumulator collapse to one COUNTER structure',
    work: 'mechanical',
    advice: 'Same mapping as CTU; keep the down-count wiring as it was.',
    basis: `${SLC}, CTD; ${LOGIX}, CTD`,
  },
  {
    legacy: 'RES',
    family: 'both',
    logix: 'RES',
    operands: 'the timer or counter file becomes the structure tag',
    work: 'mechanical',
    advice: 'RES(address) becomes RES(structure); nothing else moves.',
    basis: `${SLC}, RES; ${LOGIX}, RES`,
  },

  // ---- one-shots -----------------------------------------------------------
  {
    legacy: 'ONS',
    family: 'slc',
    logix: 'ONS',
    operands: 'the storage bit is the operand Logix keeps',
    work: 'mechanical',
    advice: 'Keep the storage bit and drop the legacy addressing around it; one scan of true is the whole contract.',
    basis: `${SLC}, ONS; ${LOGIX}, ONS`,
  },
  {
    legacy: 'OSR',
    family: 'both',
    logix: 'OSR',
    operands: 'the legacy pair (bit, storage bit) becomes the storage bit alone',
    work: 'mechanical',
    advice: 'Logix OSR takes only the storage bit, so the second operand of the legacy pair is the one to keep. Carrying both is what makes Logix reject the rung.',
    basis: `${SLC}, OSR; ${LOGIX}, OSR; the second operand was carried through by the wizard in _e2e/out/Slitter10-resolved.L5X (observed)`,
  },
  {
    legacy: 'OSF',
    family: 'both',
    logix: 'OSF',
    operands: 'the legacy pair (bit, storage bit) becomes the storage bit alone',
    work: 'mechanical',
    advice: 'Logix OSF takes only the storage bit, as OSR does.',
    basis: `${SLC}, OSF; ${LOGIX}, OSF`,
  },

  // ---- data movement -------------------------------------------------------
  {
    legacy: 'MOV',
    family: 'both',
    logix: 'MOV',
    operands: 'legacy source then destination; Logix writes the destination first',
    work: 'mechanical',
    advice: 'The operands are the same two values in the opposite order. Take the order from the wizard’s output rather than retyping it.',
    basis: `${SLC}, MOV; ${LOGIX}, MOV`,
  },
  {
    legacy: 'MVM',
    family: 'both',
    logix: 'MVM',
    operands: 'legacy source, mask, destination; Logix takes the destination first',
    work: 'mechanical',
    advice: 'Same three values, destination first; the mask is unchanged.',
    basis: `${SLC}, MVM; ${LOGIX}, MVM`,
  },
  {
    legacy: 'COP',
    family: 'both',
    logix: 'COP',
    operands: 'file operands become array operands; the length stays a length',
    work: 'mechanical',
    advice: 'Confirm the destination order against the wizard’s rung, then check the array length still covers the legacy file.',
    basis: `${SLC}, COP; ${LOGIX}, COP`,
  },
  {
    legacy: 'FLL',
    family: 'both',
    logix: 'FLL',
    operands: 'file operands become array operands; the length stays a length',
    work: 'mechanical',
    advice: 'Same as COP: array bounds are the thing to check, not the instruction.',
    basis: `${SLC}, FLL; ${LOGIX}, FLL`,
  },
  {
    legacy: 'CLR',
    family: 'both',
    logix: 'CLR',
    operands: 'single destination',
    work: 'mechanical',
    advice: 'CLR(destination); a status word has no Logix equivalent, so clearing S:x is a rung to delete, not to translate.',
    basis: `${SLC}, CLR; ${LOGIX}, CLR`,
  },

  // ---- arithmetic ----------------------------------------------------------
  {
    legacy: 'ADD',
    family: 'both',
    logix: 'ADD',
    operands: 'source A, source B, destination — same order',
    work: 'mechanical',
    advice: 'One-for-one; check that the destination type holds the result (an INT destination truncates where a DINT would not).',
    basis: `${SLC}, ADD; ${LOGIX}, ADD`,
  },
  {
    legacy: 'SUB',
    family: 'both',
    logix: 'SUB',
    operands: 'source A, source B, destination — same order',
    work: 'mechanical',
    advice: 'One-for-one, with the same type caution as ADD.',
    basis: `${SLC}, SUB; ${LOGIX}, SUB`,
  },
  {
    legacy: 'MUL',
    family: 'both',
    logix: 'MUL',
    operands: 'source A, source B, destination — same order',
    work: 'mechanical',
    advice: 'One-for-one; an overflow that the SLC flagged needs the destination widened.',
    basis: `${SLC}, MUL; ${LOGIX}, MUL`,
  },
  {
    legacy: 'DIV',
    family: 'both',
    logix: 'DIV',
    operands: 'source A, source B, destination — same order',
    work: 'mechanical',
    advice: 'Integer DIV truncates in both families; if the legacy code relied on that, say so in a rung comment rather than "fixing" it.',
    basis: `${SLC}, DIV; ${LOGIX}, DIV`,
  },
  {
    legacy: 'SQR',
    family: 'both',
    logix: 'SQR',
    operands: 'source and destination',
    work: 'mechanical',
    advice: 'One-for-one.',
    basis: `${SLC}, SQR; ${LOGIX}, SQR`,
  },
  {
    legacy: 'NEG',
    family: 'both',
    logix: 'NEG',
    operands: 'source and destination',
    work: 'mechanical',
    advice: 'One-for-one.',
    basis: `${SLC}, NEG; ${LOGIX}, NEG`,
  },
  {
    legacy: 'SCL',
    family: 'slc',
    logix: 'SCL',
    operands: 'rate and offset stay numbers; the source and destination become tags',
    work: 'mechanical',
    advice: 'One-for-one; scale factors are plain numbers in both families.',
    basis: `${SLC}, SCL; ${LOGIX}, SCL`,
  },

  // ---- comparison and logic ------------------------------------------------
  {
    legacy: 'EQU',
    family: 'both',
    logix: 'EQU',
    operands: 'source A, source B — same order',
    work: 'mechanical',
    advice: 'Comparison instructions map one-for-one across both families.',
    basis: `${SLC}, EQU; ${LOGIX}, EQU`,
  },
  {
    legacy: 'NEQ',
    family: 'both',
    logix: 'NEQ',
    operands: 'source A, source B — same order',
    work: 'mechanical',
    advice: 'One-for-one.',
    basis: `${SLC}, NEQ; ${LOGIX}, NEQ`,
  },
  {
    legacy: 'LES',
    family: 'both',
    logix: 'LES',
    operands: 'source A, source B — same order',
    work: 'mechanical',
    advice: 'One-for-one.',
    basis: `${SLC}, LES; ${LOGIX}, LES`,
  },
  {
    legacy: 'LEQ',
    family: 'both',
    logix: 'LEQ',
    operands: 'source A, source B — same order',
    work: 'mechanical',
    advice: 'One-for-one.',
    basis: `${SLC}, LEQ; ${LOGIX}, LEQ`,
  },
  {
    legacy: 'GRT',
    family: 'both',
    logix: 'GRT',
    operands: 'source A, source B — same order',
    work: 'mechanical',
    advice: 'One-for-one.',
    basis: `${SLC}, GRT; ${LOGIX}, GRT`,
  },
  {
    legacy: 'GEQ',
    family: 'both',
    logix: 'GEQ',
    operands: 'source A, source B — same order',
    work: 'mechanical',
    advice: 'One-for-one.',
    basis: `${SLC}, GEQ; ${LOGIX}, GEQ`,
  },
  {
    legacy: 'LIM',
    family: 'both',
    logix: 'LIM',
    operands: 'low limit, test, high limit — three operands in both families',
    work: 'mechanical',
    advice: 'Three operands, unchanged order; a two-operand LIM in a converted rung is a conversion mistake, not a style choice.',
    basis: `${SLC}, LIM; ${LOGIX}, LIM`,
  },
  {
    legacy: 'MEQ',
    family: 'both',
    logix: 'MEQ',
    operands: 'source, mask, compare — same order',
    work: 'mechanical',
    advice: 'One-for-one; the mask is a value, not an address, in both families.',
    basis: `${SLC}, MEQ; ${LOGIX}, MEQ`,
  },
  {
    legacy: 'AND',
    family: 'both',
    logix: 'AND',
    operands: 'source A, source B, destination — same order',
    work: 'mechanical',
    advice: 'Bitwise, one-for-one; watch the word size (INT versus DINT).',
    basis: `${SLC}, AND; ${LOGIX}, AND`,
  },
  {
    legacy: 'OR',
    family: 'both',
    logix: 'OR',
    operands: 'source A, source B, destination — same order',
    work: 'mechanical',
    advice: 'Bitwise, one-for-one.',
    basis: `${SLC}, OR; ${LOGIX}, OR`,
  },
  {
    legacy: 'XOR',
    family: 'both',
    logix: 'XOR',
    operands: 'source A, source B, destination — same order',
    work: 'mechanical',
    advice: 'Bitwise, one-for-one.',
    basis: `${SLC}, XOR; ${LOGIX}, XOR`,
  },
  {
    legacy: 'NOT',
    family: 'both',
    logix: 'NOT',
    operands: 'source and destination',
    work: 'mechanical',
    advice: 'Bitwise complement; one-for-one.',
    basis: `${SLC}, NOT; ${LOGIX}, NOT`,
  },

  // ---- control flow --------------------------------------------------------
  {
    legacy: 'JMP',
    family: 'both',
    logix: 'JMP',
    operands: 'label number stays a label',
    work: 'mechanical',
    advice: 'Logix has JMP and LBL; keep the pair together in one routine.',
    basis: `${SLC}, JMP; ${LOGIX}, JMP`,
  },
  {
    legacy: 'LBL',
    family: 'both',
    logix: 'LBL',
    operands: 'label number stays a label',
    work: 'mechanical',
    advice: 'Same as JMP. A label the wizard renamed (LABEL_0) is still the same jump target.',
    basis: `${SLC}, LBL; ${LOGIX}, LBL`,
  },
  {
    legacy: 'JSR',
    family: 'both',
    logix: 'JSR',
    operands: 'a legacy subroutine becomes a routine; SLC/PLC-5 parameter passing becomes In/Out parameters',
    work: 'review',
    advice: 'A routine call is a design decision: which parameters become In/Out, and whether the subroutine is still a subroutine at all. Do not accept the wizard’s split without reading it.',
    basis: `${SLC}, JSR/SBR/RET; ${LOGIX}, JSR, and the routine-parameter model in 1756-PM001`,
  },
  {
    legacy: 'SBR',
    family: 'both',
    logix: 'SBR',
    operands: 'the subgroup start becomes the routine header (no operands)',
    work: 'review',
    advice: 'SBR( ) with no operands is correct for a routine with no parameters. If the legacy SBR passed a file, the parameters need designing.',
    basis: `${SLC}, SBR; ${LOGIX}, SBR`,
  },
  {
    legacy: 'RET',
    family: 'both',
    logix: 'RET',
    operands: 'no operands in either family',
    work: 'mechanical',
    advice: 'RET ends the routine in both families.',
    basis: `${SLC}, RET; ${LOGIX}, RET`,
  },
  {
    legacy: 'FOR',
    family: 'both',
    logix: 'FOR',
    operands: 'the legacy index was a status word (S:24); Logix FOR needs a declared DINT tag',
    work: 'review',
    advice: 'Declare the loop index as a DINT tag, point FOR at it, and check the NXT still closes the same loop. The wizard leaves the status word in place, which is why this cannot be answered from the rung text alone.',
    basis: `${SLC}, FOR/NXT; ${LOGIX}, FOR; the status-word index was observed in _e2e/out/EN049-Migrated.L5X (observed)`,
  },
  {
    legacy: 'NXT',
    family: 'both',
    logix: 'NXT',
    operands: 'no operands; it closes the FOR above it',
    work: 'review',
    advice: 'Treat NXT with its FOR: the pair is one decision about the loop index.',
    basis: `${SLC}, FOR/NXT; ${LOGIX}, NXT`,
  },
  {
    legacy: 'AFI',
    family: 'both',
    logix: 'AFI',
    operands: 'no operands',
    work: 'mechanical',
    advice: 'AFI exists in Logix and disables the rest of the rung; it is the one instruction the conversion can keep as-is.',
    basis: `${SLC}, AFI; ${LOGIX}, AFI`,
  },

  // ---- data files, messages and process ------------------------------------
  {
    legacy: 'BSL',
    family: 'both',
    logix: 'BSL',
    operands: 'a legacy bit file becomes a DINT array; the control element becomes a CONTROL structure',
    work: 'review',
    advice: 'Decide the array width before accepting the rewrite: a 16-bit legacy file in a 32-bit DINT array shifts twice as far per step.',
    basis: `${SLC}, BSL; ${LOGIX}, BSL`,
  },
  {
    legacy: 'BSR',
    family: 'both',
    logix: 'BSR',
    operands: 'a legacy bit file becomes a DINT array; the control element becomes a CONTROL structure',
    work: 'review',
    advice: 'Same width decision as BSL, and the same CONTROL structure mapping.',
    basis: `${SLC}, BSR; ${LOGIX}, BSR`,
  },
  {
    legacy: 'SQO',
    family: 'both',
    logix: 'SQO',
    operands: 'file, mask, control, length and position become array, mask, CONTROL, length, position',
    work: 'review',
    advice: 'A sequencer is a state machine in disguise: check that the step list is still the intended sequence, not just that the operands parse.',
    basis: `${SLC}, SQO; ${LOGIX}, SQO`,
  },
  {
    legacy: 'SQC',
    family: 'both',
    logix: 'SQC',
    operands: 'file, mask, control, length and position become array, mask, CONTROL, length, position',
    work: 'review',
    advice: 'Same mapping as SQO; the comparison source is the part to verify.',
    basis: `${SLC}, SQC; ${LOGIX}, SQC`,
  },
  {
    legacy: 'SQI',
    family: 'both',
    logix: 'SQI',
    operands: 'file, mask, control, length and position become array, mask, CONTROL, length, position',
    work: 'review',
    advice: 'Same mapping as SQO.',
    basis: `${SLC}, SQI; ${LOGIX}, SQI`,
  },
  {
    legacy: 'PID',
    family: 'both',
    logix: 'PID',
    operands: 'control block, process variable, tieback, setpoint, output become a PID structure and tag operands',
    work: 'review',
    advice: 'Gains, timing and the PD/derivative form differ between the families. This is a control-loop tuning decision, not a text rewrite.',
    basis: `${SLC}, PID; ${LOGIX}, PID`,
  },
  {
    legacy: 'FAL',
    family: 'both',
    logix: 'FAL',
    operands: 'the legacy expression list becomes a Logix expression; length and position become operands',
    work: 'review',
    advice: 'A flattened FAL hides its expression in the operand list. Rewrite it as an explicit expression and read it back.',
    basis: `${SLC}, FAL; ${LOGIX}, FAL`,
  },
  {
    legacy: 'CPT',
    family: 'both',
    logix: 'CPT',
    operands: 'the expression and the destination',
    work: 'review',
    advice: 'CPT exists in both families, but the expression syntax is not identical; retype it rather than trusting a flattened operand list.',
    basis: `${SLC}, CPT; ${LOGIX}, CPT`,
  },
  {
    legacy: 'MSG',
    family: 'both',
    logix: 'MSG',
    operands: 'the control block becomes a MESSAGE structure, and the path is explicit',
    work: 'review',
    advice: 'Set the MESSAGE type and the communication path deliberately. The legacy control block carries the rack, group and slot the path is built from, and a wrong path reports success while moving nothing.',
    basis: `${SLC}, MSG; ${LOGIX}, MSG`,
  },

  // ---- PLC-5 block transfers and immediate I/O ------------------------------
  {
    legacy: 'BTW',
    family: 'plc5',
    logix: 'MSG',
    operands: 'rack, group, slot, control, data table, length become a MESSAGE structure carrying a PLC-5 Typed Write',
    work: 'review',
    advice: 'A block transfer is a message in Logix. Read the rack/group/slot out of the legacy operands, build the path from them, and confirm the length in words.',
    basis: `${PLC5}, BTW; ${LOGIX}, MSG; the rack/group/slot to MSG mapping was observed in _e2e/out/EN049-Migrated.L5X (observed)`,
  },
  {
    legacy: 'BTR',
    family: 'plc5',
    logix: 'MSG',
    operands: 'rack, group, slot, control, data table, length become a MESSAGE structure carrying a PLC-5 Typed Read',
    work: 'review',
    advice: 'Same mapping as BTW with a Read. The continuous bit in the legacy operand list decides whether the message re-triggers; set that on the MSG.',
    basis: `${PLC5}, BTR; ${LOGIX}, MSG; observed in _e2e/out/EN049-Migrated.L5X (observed)`,
  },
  {
    legacy: 'IIM',
    family: 'plc5',
    logix: null,
    operands: 'immediate input with mask has no Logix instruction',
    work: 'review',
    advice: 'Logix updates I/O on the module’s RPI, not mid-scan. If the logic needed the instant value, the requirement has to be met with the module configuration or a CPS from the module tag — say which, and record it as an exception.',
    basis: `${PLC5}, IIM; no Logix equivalent in ${LOGIX}`,
  },
  {
    legacy: 'IOM',
    family: 'plc5',
    logix: null,
    operands: 'immediate output with mask has no Logix instruction',
    work: 'review',
    advice: 'Same as IIM: the mid-scan write has no direct equivalent. Use the module’s update and document why the timing is still acceptable.',
    basis: `${PLC5}, IOM; no Logix equivalent in ${LOGIX}`,
  },
  {
    legacy: 'SVC',
    family: 'plc5',
    logix: null,
    operands: 'service communications has no Logix instruction',
    work: 'review',
    advice: 'SVC was a PLC-5 comms service call. In Logix the equivalent is a MSG or explicit GSV/SSV work — decide which, and check the code is not relying on the old scan-time behaviour.',
    basis: `${PLC5}, SVC; no Logix equivalent in ${LOGIX}`,
  },
  {
    legacy: 'DTR',
    family: 'plc5',
    logix: null,
    operands: 'data transition (file to file with mask and compare) has no single Logix instruction',
    work: 'review',
    advice: 'Rebuild it from MVM/CPS plus a comparison, or a structured-text loop. The mask and the compare value are the parts to preserve exactly.',
    basis: `${PLC5}, DTR; no single Logix equivalent in ${LOGIX}`,
  },
  {
    legacy: 'TOD',
    family: 'plc5',
    logix: 'GSV',
    operands: 'the time-of-day registers become a GSV of the WallClockTime object',
    work: 'review',
    advice: 'Read the controller clock with GSV instead of copying time registers; the legacy registers do not exist in Logix, and the controller time is not the same thing as the program’s scan time.',
    basis: `${PLC5}, TOD; ${LOGIX}, GSV`,
  },
  {
    legacy: 'HSC',
    family: 'both',
    logix: 'HSC',
    operands: 'the legacy counter function is module-based; the Logix HSC instruction belongs to a counter module',
    work: 'review',
    advice: 'A high-speed counter is hardware before it is an instruction: confirm the module that provides it, then configure HSC. Nothing in the rung text answers this.',
    basis: `${SLC}, HSC; ${LOGIX}, HSC`,
  },
]

/** Lookup table, upper-cased mnemonic to row. */
const BY_MNEMONIC = new Map<string, InstructionRow>(INSTRUCTIONS.map(row => [row.legacy.toUpperCase(), row] as const))

/**
 * Find one legacy instruction.
 *
 * @param mnemonic - The mnemonic as written in the legacy rung.
 * @returns The row, or `undefined` when the table does not cover it.
 */
export function lookupInstruction(mnemonic: string): InstructionRow | undefined {
  return BY_MNEMONIC.get(mnemonic.trim().toUpperCase())
}

/**
 * One sentence of advice for an instruction, with its basis.
 *
 * @param mnemonic - The mnemonic as written in the legacy rung.
 * @returns Advice plus basis, or `undefined` when the table does not cover it.
 */
export function instructionAdvice(mnemonic: string): string | undefined {
  const row = lookupInstruction(mnemonic)
  if (row === undefined) return undefined
  const target = row.logix === null ? 'no direct Logix instruction' : `${row.legacy} -> ${row.logix}`
  return `${target} (${row.work}): ${row.advice} Basis: ${row.basis}.`
}

/** The mnemonics the table covers, for coverage checks and the corpus page. */
export function coveredMnemonics(): readonly string[] {
  return INSTRUCTIONS.map(row => row.legacy)
}
