/**
 * Resolve the program conversion errors a legacy migration leaves behind.
 *
 * The migration wizard marks every place it could not carry over with a
 * `PCE(code,label)` instruction, and leaves a `?` where an operand had no Logix
 * form. A marker on its own says nothing an engineer can act on: it does not say
 * which legacy instruction is missing or what the replacement should be.
 *
 * This module pairs each marked rung with the legacy rung it came from, reads
 * the legacy construct out of that rung, and answers with the work the rung
 * needs â€” classified `mechanical` when the answer follows from the two rung
 * texts, `review` when a decision is the engineer's.
 *
 * It reads text only: no Studio, no controller, and no claim that a repaired
 * rung behaves like the original until it is built.
 *
 * @module dsh-engineering-migration/engine/pce
 */

import { matchRoutine, type LogixRoutine } from './compare.ts'

/** One rung text as the headless legacy reader reported it. */
export interface LegacyRungRef {
  readonly file: string
  readonly rung: number
  readonly text: string
}

/** How a marker or an unknown operand can be answered. */
export type ResolutionKind =
  | 'delete-marker'
  | 'timer-operands'
  | 'counter-operands'
  | 'loop-index'
  | 'message-config'
  | 'status-word'
  | 'unknown-operand'
  | 'review'

/** What to do about one item, and whether that is engineering judgement. */
export interface Resolution {
  readonly kind: ResolutionKind
  /** `mechanical` when the answer follows from the rung texts; `review` when it needs a decision. */
  readonly work: 'mechanical' | 'review'
  readonly advice: string
  /** Replacement rung text, when the answer is a rewrite the caller can stage. */
  readonly proposed?: string
}

/** One `PCE(code,label)` occurrence, with the legacy rung behind it. */
export interface MarkerSite {
  readonly routine: string
  readonly rung: number
  readonly code: number
  readonly label: string
  readonly legacy: string
  readonly migrated: string
  readonly resolution: Resolution
}

/** One `?` operand, with the legacy instruction behind it. */
export interface OperandSite {
  readonly routine: string
  readonly rung: number
  readonly instruction: string
  readonly legacy: string
  readonly migrated: string
  readonly resolution: Resolution
  /** Whole rung text with every unknown operand filled in, when all of them are. */
  readonly rungText?: string
}

/** What the resolver found across a project. */
export interface PceReport {
  readonly markers: readonly MarkerSite[]
  readonly operands: readonly OperandSite[]
  readonly counts: {
    readonly markers: number
    readonly operands: number
    readonly mechanical: number
    readonly review: number
    readonly byCode: readonly { readonly code: number; readonly count: number }[]
  }
  /** Legacy ladder files that a routine was found for. */
  readonly matchedFiles: readonly string[]
  /** Marked rungs whose legacy file had no routine to pair with. */
  readonly unmatchedRungs: readonly string[]
  /** Legacy instruction â†’ Logix instruction, where a marker stands for a translation. */
  readonly translated: readonly { readonly routine: string; readonly rung: number; readonly legacy: string; readonly logix: string }[]
}

/** One instruction call in legacy text: `NAME{ operand, operand }`. */
interface LegacyCall {
  readonly name: string
  readonly operands: readonly string[]
}

/** One instruction call in Logix text: `NAME(arg, arg)`. */
interface LogixCall {
  readonly name: string
  readonly args: readonly string[]
  readonly start: number
}

/** Legacy mnemonics whose migrated form has a different name. */
const TRANSLATED: Readonly<Record<string, string>> = { BTW: 'MSG', BTR: 'MSG' }

/** The timer instructions whose legacy operands Logix keeps in the structure. */
const TIMERS = ['TON', 'TOF', 'RTO'] as const

/** The counter instructions whose legacy operands Logix keeps in the structure. */
const COUNTERS = ['CTU', 'CTD'] as const

/** Strip the CDATA wrapper a rung text may arrive in. */
function bareText(text: string): string {
  return text.replace(/^<!\[CDATA\[/u, '').replace(/\]\]>$/u, '').trim()
}

/** Split arguments at top-level commas, respecting parentheses and subscripts. */
function splitArgs(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < body.length; index++) {
    const char = body[index]
    if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(body.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(body.slice(start).trim())
  return parts.filter(part => part !== '')
}

/** Read the `NAME{ â€¦ }` calls of a legacy rung, in order. */
export function legacyCalls(text: string): LegacyCall[] {
  const calls: LegacyCall[] = []
  for (const match of text.matchAll(/\b([A-Z][A-Z0-9_]*)\s*\{([^}]*)\}/gu)) {
    const name = match[1] ?? ''
    const body = (match[2] ?? '').trim()
    calls.push({ name, operands: body === '' ? [] : body.split(/\s*,\s*/u).map(part => part.trim()) })
  }
  return calls
}

/** Read the `NAME( â€¦ )` calls of a Logix rung, in order, matching nested parentheses. */
export function logixCalls(text: string): LogixCall[] {
  const calls: LogixCall[] = []
  const pattern = /\b([A-Z][A-Z0-9_]*)\s*\(/gu
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1] ?? ''
    const open = (match.index ?? 0) + match[0].length - 1
    let depth = 0
    let close = -1
    for (let index = open; index < text.length; index++) {
      const char = text[index]
      if (char === '(') depth += 1
      else if (char === ')') {
        depth -= 1
        if (depth === 0) {
          close = index
          break
        }
      }
    }
    if (close === -1) break
    calls.push({ name, args: splitArgs(text.slice(open + 1, close)), start: match.index ?? 0 })
    pattern.lastIndex = close + 1
  }
  return calls
}

/** Whether two rungs carry the same instructions, once a marker is ignored. */
function sameSequence(legacy: readonly LegacyCall[], logix: readonly LogixCall[]): boolean {
  const wanted = legacy.map(call => TRANSLATED[call.name] ?? call.name)
  const found = logix.filter(call => call.name !== 'PCE').map(call => call.name)
  if (wanted.length !== found.length) return false
  return wanted.every((name, index) => name === found[index])
}

/** Remove every `PCE(code,label)` call, leaving a rung a caller can stage. */
export function stripMarkers(text: string): string {
  return bareText(text)
    .replace(/\s*\bPCE\s*\(\s*\d+\s*,\s*[A-Za-z_][\w]*\s*\)/gu, '')
    .replace(/\s{2,}/gu, ' ')
    .trim()
}

/** Format a number the way a timer preset reads in a Logix field. */
function seconds(value: number): string {
  const rounded = Math.round(value * 1_000_000) / 1_000_000
  return `${rounded}`
}

/** The legacy operand at an index, as text, or an empty string. */
function operandAt(call: LegacyCall | undefined, index: number): string {
  return call?.operands[index]?.trim() ?? ''
}

/** The first legacy call with this mnemonic. */
function legacyCallOf(calls: readonly LegacyCall[], name: string): LegacyCall | undefined {
  return calls.find(call => call.name === name)
}

/** The Logix call carrying an unknown operand, with the operand positions. */
function unknownCalls(logix: readonly LogixCall[]): { call: LogixCall; positions: number[] }[] {
  const found: { call: LogixCall; positions: number[] }[] = []
  for (const call of logix) {
    if (call.name === 'PCE') continue
    const positions: number[] = []
    call.args.forEach((arg, index) => {
      if (arg.trim() === '?') positions.push(index)
    })
    if (positions.length > 0) found.push({ call, positions })
  }
  return found
}

/** Answer a timer whose legacy operands Logix folded into the structure. */
function timerResolution(name: string, legacy: LegacyCall | undefined, call: LogixCall): Resolution {
  const timer = call.args[0]?.trim() ?? ''
  const base = Number(operandAt(legacy, 1))
  const preset = Number(operandAt(legacy, 2))
  const accumulator = operandAt(legacy, 3)
  if (legacy === undefined || !Number.isFinite(base) || !Number.isFinite(preset) || base <= 0) {
    return {
      kind: 'timer-operands',
      work: 'review',
      advice: `${name} lost its operand list and the legacy rung does not say which timer it came from; read the legacy rung before filling it in.`,
    }
  }
  const initialise = accumulator !== '' && Number(accumulator) !== 0
    ? ` Legacy started the accumulator at ${accumulator} counts; write ${timer}.ACC only if that start mattered.`
    : ''
  return {
    kind: 'timer-operands',
    work: 'mechanical',
    advice: `${name} took its time base (${base} s) and preset (${preset}) as operands; Logix keeps both in the timer structure. Write ${timer}.PRE := ${seconds(preset * base)} s, drop the two operands, and the marker on this rung goes with them.${initialise}`,
    proposed: `${name}(${timer})`,
  }
}

/** Answer a counter whose legacy operands Logix folded into the structure. */
function counterResolution(name: string, legacy: LegacyCall | undefined, call: LogixCall): Resolution {
  const counter = call.args[0]?.trim() ?? ''
  const preset = Number(operandAt(legacy, 1))
  if (legacy === undefined || !Number.isFinite(preset)) {
    return {
      kind: 'counter-operands',
      work: 'review',
      advice: `${name} lost its operand list and the legacy rung does not say which counter it came from; read the legacy rung before filling it in.`,
    }
  }
  return {
    kind: 'counter-operands',
    work: 'mechanical',
    advice: `${name} took its preset as an operand; Logix keeps it in the counter structure. Write ${counter}.PRE := ${preset}, drop the operands, and the marker on this rung goes with them.`,
    proposed: `${name}(${counter})`,
  }
}

/** Answer a FOR/NXT loop whose index operand has no Logix form. */
function loopResolution(call: LogixCall): Resolution {
  const label = call.args[0]?.trim() ?? ''
  const index = call.args[1]?.trim() ?? ''
  const rest = call.args.slice(2).join(',')
  return {
    kind: 'loop-index',
    work: 'review',
    advice: `Logix has FOR and NXT, so the loop survives; the marker is about its index. The legacy FOR wrote the index into the status file (${index}), which is an INT with no equivalent, so declare a DINT tag for the index (one per nested loop), check the LBL ${label === '' ? 'the FOR names' : label} exists in this routine, then pass FOR(${label},<DINT tag>,${rest}). Naming that tag here would put an undeclared symbol in the export, which fails the import, so it is the engineer's declaration to make.`,
  }
}

/**
 * Fill the operands the wizard could not translate, from the legacy rung.
 *
 * @param legacy - calls of the legacy rung.
 * @param text - a marker-free migrated rung.
 * @returns the repaired rung text and the instructions that stayed unknown.
 */
export function repairOperands(legacy: readonly LegacyCall[], text: string): { text: string; unresolved: string[] } {
  const edits: { start: number; end: number; text: string }[] = []
  const unresolved: string[] = []
  for (const match of text.matchAll(/\b([A-Z][A-Z0-9_]*)\s*\(([^()]*)\)/gu)) {
    const name = match[1] ?? ''
    const args = match[2] ?? ''
    if (!args.includes('?')) continue
    const call = legacyCallOf(legacy, name)
    const tag = args.split(',')[0]?.trim() ?? ''
    const timer = (TIMERS as readonly string[]).includes(name)
    const counter = (COUNTERS as readonly string[]).includes(name)
    const base = Number(operandAt(call, 1))
    const known = timer || counter
      ? call !== undefined && tag !== '' && (timer ? Number.isFinite(base) && base > 0 && Number.isFinite(Number(operandAt(call, 2))) : Number.isFinite(Number(operandAt(call, 1))))
      : false
    if (!known) {
      unresolved.push(`${name}(${args})`)
      continue
    }
    edits.push({ start: match.index, end: match.index + match[0].length, text: `${name}(${tag})` })
  }
  let repaired = text
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    repaired = repaired.slice(0, edit.start) + edit.text + repaired.slice(edit.end)
  }
  return { text: repaired, unresolved }
}

/** Answer a block transfer the wizard turned into a message instruction. */
function messageResolution(name: string, legacy: LegacyCall | undefined): Resolution {
  const rack = operandAt(legacy, 0)
  const group = operandAt(legacy, 1)
  const module = operandAt(legacy, 2)
  const control = operandAt(legacy, 3)
  const table = operandAt(legacy, 4)
  const length = operandAt(legacy, 5)
  const continuous = operandAt(legacy, 6)
  const detail = legacy === undefined
    ? 'the legacy rung does not show the block transfer operands'
    : `rack ${rack || '?'} group ${group || '?'} slot ${module || '?'}, control ${control || '?'}, data table ${table || '?'}, ${length || '?'} element(s)${continuous === '' ? '' : `, continuous ${continuous}`}`
  return {
    kind: 'message-config',
    work: 'review',
    advice: `${name} became a MSG instruction, and the marker says the message was not configured. Set the message type to PLC-5 Typed ${name === 'BTW' ? 'Write' : 'Read'} and carry the transfer (${detail}), then set the communication path to the PLC-5 or the DH+ gateway. The logic shape survives; the message parameters do not.`,
  }
}

/** Answer a rung that only cleared a legacy status word. */
function statusWordResolution(legacy: LegacyCall | undefined): Resolution {
  const word = operandAt(legacy, 0)
  return {
    kind: 'status-word',
    work: 'review',
    advice: `The legacy rung cleared status word ${word === '' ? '(unknown)' : word}, which has no Logix equivalent, so nothing but the marker survived. Decide what the rung protected and either delete it or write the equivalent Logix condition. Note a rung whose only instruction is a marker touches the right rail with no output instruction, which fails the Studio build audit (RxCMP_E_AUDIT_OUTPUTS).`,
  }
}

/**
 * Pair a legacy rung list with the routines of a Logix export.
 *
 * @param legacyRungs - rung texts from the headless legacy read.
 * @param routines - routines from `readLogix`.
 * @returns the paired rungs and the files that found no routine.
 */
export function pairRungs(
  legacyRungs: readonly LegacyRungRef[],
  routines: readonly LogixRoutine[],
): { pairs: { routine: string; rung: number; legacy: string; migrated: string }[]; unmatched: string[] } {
  const byFile = new Map<string, LegacyRungRef[]>()
  for (const rung of legacyRungs) {
    const list = byFile.get(rung.file) ?? []
    list.push(rung)
    byFile.set(rung.file, list)
  }
  const pairs: { routine: string; rung: number; legacy: string; migrated: string }[] = []
  const unmatched: string[] = []
  for (const [file, rungs] of byFile) {
    const routine = matchRoutine(file, routines)
    if (routine === undefined) {
      unmatched.push(file)
      continue
    }
    for (let index = 0; index < routine.texts.length; index++) {
      const migrated = routine.texts[index] ?? ''
      if (!/PCE\s*\(/u.test(migrated) && !migrated.includes('?')) continue
      pairs.push({ routine: routine.name, rung: index, legacy: bareText(rungs[index]?.text ?? ''), migrated: bareText(migrated) })
    }
  }
  return { pairs, unmatched }
}

/**
 * Turn every marker and unknown operand into a work item.
 *
 * @param legacyRungs - rung texts from the headless legacy read.
 * @param routines - routines from `readLogix`.
 * @returns the worklist, its counts, and the legacy constructs a marker stands for.
 */
export function resolvePces(
  legacyRungs: readonly LegacyRungRef[],
  routines: readonly LogixRoutine[],
): PceReport {
  const { pairs, unmatched } = pairRungs(legacyRungs, routines)
  const markers: MarkerSite[] = []
  const operands: OperandSite[] = []
  const translated: { routine: string; rung: number; legacy: string; logix: string }[] = []
  const matchedFiles = new Set<string>()
  for (const pair of pairs) matchedFiles.add(pair.routine)

  for (const pair of pairs) {
    const legacy = legacyCalls(pair.legacy)
    const logix = logixCalls(pair.migrated)
    const markerCalls = logix.filter(call => call.name === 'PCE')
    const hasUnknown = pair.migrated.includes('?')
    const sequence = sameSequence(legacy, logix)
    const stripped = stripMarkers(pair.migrated)

    for (const call of markerCalls) {
      const code = Number(call.args[0] ?? '')
      const label = call.args[1] ?? ''
      let resolution: Resolution
      if (code === 152) {
        resolution = statusWordResolution(legacyCallOf(legacy, 'CLR') ?? legacy[0])
      } else if (code === 150 || code === 210) {
        const block = legacyCallOf(legacy, 'BTW') ?? legacyCallOf(legacy, 'BTR') ?? legacy[0]
        resolution = messageResolution(block?.name ?? 'BTR', block)
        translated.push({
          routine: pair.routine,
          rung: pair.rung,
          legacy: `${block?.name ?? 'BTR'}${block === undefined ? '' : ` { ${block.operands.join(', ')} }`}`,
          logix: 'MSG',
        })
      } else if (code === 116) {
        const loop = logix.find(entry => entry.name === 'FOR')
        resolution = loopResolution(loop ?? { name: 'FOR', args: [], start: 0 })
      } else if (sequence && !hasUnknown) {
        resolution = {
          kind: 'delete-marker',
          work: 'mechanical',
          advice: 'The rung already carries the same instructions, in the same order, as the legacy rung, so the marker stands for nothing the rung lost. Remove it; the build is what proves the rewrite.',
          proposed: stripped,
        }
      } else if (sequence && hasUnknown) {
        const repaired = repairOperands(legacy, stripped)
        resolution = repaired.unresolved.length === 0
          ? {
              kind: 'delete-marker',
              work: 'mechanical',
              advice: 'The instructions match the legacy rung one for one; the marker stands for the operands the wizard could not type, and every one of them is timer or counter data the legacy rung still records. The proposal fills them in and drops the marker.',
              proposed: repaired.text,
            }
          : {
              kind: 'delete-marker',
              work: 'review',
              advice: `The instructions match the legacy rung one for one; the marker is what the wizard writes when an operand had no Logix form. ${repaired.unresolved.join(', ')} still ${repaired.unresolved.length === 1 ? 'has' : 'have'} no Logix form, so repair those first, then remove the marker.`,
            }
      } else {
        const wanted = legacy.map(entry => TRANSLATED[entry.name] ?? entry.name)
        const found = logix.filter(entry => entry.name !== 'PCE').map(entry => entry.name)
        const missing = wanted.filter(name => !found.includes(name))
        const extra = found.filter(name => !wanted.includes(name))
        resolution = {
          kind: 'review',
          work: 'review',
          advice: `The migrated rung does not carry the same instructions as the legacy rung: legacy ${wanted.join(', ') || '(none)'}; migrated ${found.join(', ') || '(none)'}${missing.length > 0 ? `; missing ${[...new Set(missing)].join(', ')}` : ''}${extra.length > 0 ? `; extra ${[...new Set(extra)].join(', ')}` : ''}.`,
        }
      }
      markers.push({ routine: pair.routine, rung: pair.rung, code, label, legacy: pair.legacy, migrated: pair.migrated, resolution })
    }

    for (const entry of unknownCalls(logix)) {
      const name = entry.call.name
      const legacyCall = legacyCallOf(legacy, name)
      let resolution: Resolution
      if ((TIMERS as readonly string[]).includes(name)) resolution = timerResolution(name, legacyCall, entry.call)
      else if ((COUNTERS as readonly string[]).includes(name)) resolution = counterResolution(name, legacyCall, entry.call)
      else if (name === 'FAL' || name === 'CPT') {
        resolution = {
          kind: 'unknown-operand',
          work: 'review',
          advice: `${name} kept its expression but lost ${entry.positions.length} operand(s) the wizard could not type. The legacy rung is the only record of what they were; read it before writing the Logix expression by hand.`,
        }
      } else {
        resolution = {
          kind: 'unknown-operand',
          work: 'review',
          advice: `${name} has ${entry.positions.length} operand(s) the wizard could not type. Read the legacy rung and fill them in; the instruction itself exists in Logix.`,
        }
      }
      const repaired = resolution.work === 'mechanical' && markerCalls.length === 0
        ? repairOperands(legacy, stripped)
        : undefined
      operands.push({
        routine: pair.routine,
        rung: pair.rung,
        instruction: name,
        legacy: pair.legacy,
        migrated: pair.migrated,
        resolution,
        ...(repaired !== undefined && repaired.unresolved.length === 0 ? { rungText: repaired.text } : {}),
      })
    }
  }

  const byCode = new Map<number, number>()
  for (const marker of markers) byCode.set(marker.code, (byCode.get(marker.code) ?? 0) + 1)
  const mechanical = [...markers, ...operands].filter(entry => entry.resolution.work === 'mechanical').length
  const review = markers.length + operands.length - mechanical
  return {
    markers,
    operands,
    counts: {
      markers: markers.length,
      operands: operands.length,
      mechanical,
      review,
      byCode: [...byCode.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count })),
    },
    matchedFiles: [...matchedFiles],
    unmatchedRungs: unmatched,
    translated,
  }
}
