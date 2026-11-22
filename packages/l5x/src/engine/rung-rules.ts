/**
 * Ladder rungs that Studio refuses, found in an export that already contains them.
 *
 * `l5x_compose_rung` cannot emit either of these, because it builds the rung and
 * checks it before staging. An export, a hand edit or an import has no such
 * guard: the export states no rule, so a rung that drives nothing looks like a
 * rung that does.
 *
 * Only rules this model can prove are here. A rung whose tail is an instruction
 * that reads the condition and never drives the right rail — `XIC`, `XIO`,
 * `EQU`, `ONS` and the rest of that set — cannot be built, whatever the rest of
 * the rung says. A rung whose tail is some other instruction is left alone,
 * because deciding whether it drives the rail needs the instruction's pin model,
 * and a guess there would be noise on a project that compiles.
 *
 * @module dsh-engineering-l5x/engine/rung-rules
 */

import { parseLadder, rightRailReader } from './logic-syntax.ts'
import type { L5xRoutine } from '../model/types.ts'

/** One rung-shaped problem. */
export interface RungFinding {
  /** Stable rule id. */
  readonly rule: string
  /** How firmly the rule applies. */
  readonly severity: 'info' | 'warning' | 'critical'
  /** What is wrong, in the reader's terms. */
  readonly message: string
  /** The rung the finding is about. */
  readonly evidence: unknown
  /** How sure the structural check is. */
  readonly confidence: 'high' | 'medium' | 'low'
}

/**
 * Instructions that only compile on a controller with a serial port. Studio's help says so, and
 * builds on a 5069 and a 1756-L83E refused every operand combination with INVALIDOPTYPE while the
 * same rungs built on a 1756-L73.
 */
const SERIAL_PORT_INSTRUCTIONS = ['ABL', 'ACB', 'ACL', 'AHL', 'ARD', 'ARL', 'AWA', 'AWT']

/** Processor families where a build proved a serial-port instruction is refused. */
const NO_SERIAL_PORT = [/^5069-/u, /^1756-L8/u]

/** The subroutine instruction that must open a routine's logic. */
const SUBROUTINE_OPEN = 'SBR'

/**
 * Check one ladder routine's rungs for structure Studio refuses.
 *
 * @param routine - A routine whose body has already been decoded as `RLL`.
 * @returns One finding per broken rung, in rung order.
 */
export function rungFindings(routine: L5xRoutine, options: { readonly processorType?: string } = {}): readonly RungFinding[] {
  if (routine.body.type !== 'RLL') return []
  const findings: RungFinding[] = []
  const where = (number: number): string => `${routine.program}::${routine.name} rung ${number}`

  for (const rung of routine.body.rungs) {
    const parsed = parseLadder(rung.text)
    // A rung this parser cannot read is a different finding; do not pile on.
    if (parsed.issues.length > 0) continue
    const reader = rightRailReader(parsed.nodes)
    if (reader === undefined) continue
    findings.push({
      rule: 'RUNG_NO_OUTPUT',
      severity: 'warning',
      message: `${where(rung.number)} ends in ${reader}, which reads the rung condition but never drives the right power rail; Studio refuses to build such a rung`,
      evidence: { program: routine.program, routine: routine.name, rung: rung.number, instruction: reader, text: rung.text.slice(0, 400) },
      confidence: 'high',
    })
  }

  // A serial-port instruction on a processor family that has no serial port cannot build.
  const processor = options.processorType ?? ''
  if (NO_SERIAL_PORT.some(family => family.test(processor))) {
    for (const rung of routine.body.rungs) {
      for (const mnemonic of SERIAL_PORT_INSTRUCTIONS) {
        if (!new RegExp(`(?:^|[^A-Za-z0-9_])${mnemonic}[ \\t]*\\(`, 'u').test(rung.text)) continue
        findings.push({
          rule: 'SERIAL_PORT_INSTRUCTION_UNSUPPORTED',
          severity: 'critical',
          message: `${where(rung.number)} uses ${mnemonic}, a serial-port instruction, and ${processor} has no serial port; Studio's compiler rejects it with RxCMP_E_AUDIT_INVALIDOPTYPE. Move the logic to a controller with a serial port, such as a 1756-L73.`,
          evidence: { program: routine.program, routine: routine.name, rung: rung.number, instruction: mnemonic, processor_type: processor, text: rung.text.slice(0, 400) },
          confidence: 'high',
        })
        break
      }
    }
  }

  // JSR carries its return-parameter slot. A build proved JSR(Sub) alone is refused.
  for (const rung of routine.body.rungs) {
    const jsr = /(?:^|[^A-Za-z0-9_])JSR[ \t]*\([ \t]*([^,()]+?)[ \t]*\)/u.exec(rung.text)
    if (jsr === null) continue
    findings.push({
      rule: 'JSR_WITHOUT_RETURN',
      severity: 'critical',
      message: `${where(rung.number)} calls JSR(${jsr[1]}) without a return-parameter slot; Studio refuses it with RxCMP_E_AUDIT_INVALIDNOOFOPS. Write JSR(${jsr[1]},0) when the subroutine returns nothing.`,
      evidence: { program: routine.program, routine: routine.name, rung: rung.number, text: rung.text.slice(0, 400) },
      confidence: 'high',
    })
  }

  // A subroutine's SBR opens the routine. Anywhere else, the routine cannot build.
  const opens = routine.body.rungs[0]
  if (opens !== undefined) {
    const first = parseLadder(opens.text).nodes[0]
    const firstIsSubroutine = first?.kind === 'instruction' && first.name.toUpperCase() === SUBROUTINE_OPEN
    const declaresSubroutine = routine.body.rungs.some(rung => /(?:^|[^A-Za-z0-9_])SBR[ \t]*\(/iu.test(rung.text))
    if (declaresSubroutine && !firstIsSubroutine) {
      findings.push({
        rule: 'SBR_NOT_FIRST',
        severity: 'warning',
        message: `${routine.program}::${routine.name} declares SBR but its first rung does not open with SBR; Studio requires the subroutine instruction first in the routine`,
        evidence: { program: routine.program, routine: routine.name, rung: opens.number, text: opens.text.slice(0, 400) },
        confidence: 'high',
      })
    }
  }

  return findings
}
