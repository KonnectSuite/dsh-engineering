/**
 * Compose one ladder rung from a structure, never from prose.
 *
 * The composer is the generation half of the pair: the caller decides the logic,
 * this module decides the NeutralText. Every instruction is checked against the
 * catalog (or a declared AOI), every operand against the export, and the emitted
 * text is re-parsed by the same parser `draft_rung` uses. A rung that fails any
 * of those never reaches a draft.
 *
 * @module dsh-engineering-l5x/engine/ladder
 */

import { L5xError } from '../core/errors.ts'
import type { ProjectSnapshot } from '../session.ts'
import { resolveTag } from './tag-resolution.ts'
import { COUNTER_TYPES, instructionByName, nearestInstructions, NUMERIC_TYPES, STRING_TYPES, TIMER_TYPES, type InstructionInfo } from './instructions.ts'
import { parseLadder, rightRailReader } from './logic-syntax.ts'
import { mnemonicsIn, spellingForProject } from './mnemonics.ts'

/** One instruction node. */
export interface InstructionNode {
  /** Instruction mnemonic, for example `XIC`. */
  readonly instr: string
  /** Operands in written order. */
  readonly args?: readonly string[]
}

/** A left-to-right sequence of nodes. */
export interface SeriesNode {
  /** Nodes evaluated in series. */
  readonly series: readonly LadderNodeSpec[]
}

/** Parallel paths, each a left-to-right sequence. */
export interface ParallelNode {
  /** One entry per path. */
  readonly parallel: readonly (readonly LadderNodeSpec[])[]
}

/** One node of the composition tree. */
export type LadderNodeSpec = InstructionNode | SeriesNode | ParallelNode

/** One operand, with what the export says about it. */
export interface ComposedOperand {
  /** Operand text as emitted. */
  readonly text: string
  /** Whether the export declares it (false for numeric literals). */
  readonly resolved: boolean
  /** Canonical declaration when it resolves. */
  readonly canonical?: string
  /** Declared data type when it resolves. */
  readonly data_type?: string
}

/** One composed rung. */
export interface ComposedRung {
  /** NeutralText, ready for `draft_rung`. */
  readonly neutral_text: string
  /** Instruction count. */
  readonly instructions: number
  /** Operands in written order. */
  readonly operands: readonly ComposedOperand[]
  /** Where the instruction grammar came from. */
  readonly grounding: 'catalog' | 'aoi' | 'mixed'
}

/** A composition result: one rung, or a pattern's pair. */
export interface ComposedRungs {
  /** Rungs in evaluation order. */
  readonly rungs: readonly ComposedRung[]
  /** Pattern name, when a pattern produced them. */
  readonly pattern?: string
}

/** Named patterns the composer can expand. */
export const PATTERNS = ['start_stop_latch', 'fault_latch', 'ton_delay', 'interlock', 'analog_scale', 'totalizer', 'run_hour_meter'] as const
/** One pattern name. */
export type PatternName = (typeof PATTERNS)[number]

const MAX_INSTRUCTIONS = 64
const MAX_DEPTH = 16
const LITERAL = /^-?(?:\d+\.?\d*|\.\d+)$/u
const TAG_TEXT = /^[A-Za-z_][A-Za-z0-9_:.[\]]*$/u

/** A numeric literal, which is not a declaration. */
const isLiteral = (text: string): boolean => LITERAL.test(text)

/** A BOOL-ish check for the slot validation below uses this resolved operand. */
function resolveOperand(project: ProjectSnapshot, text: string): ReturnType<typeof resolveTag> {
  const document = project.document
  const direct = resolveTag(document, 'controller', text)
  if (direct.resolved) return direct
  // A rung is written inside a program, so an unqualified program tag is the
  // ordinary case. Resolve it when exactly one program declares the base name;
  // two programs declaring it is an ambiguity the caller must settle.
  const base = text.split(/[.[:]/u)[0] ?? text
  const declared = document.tags.filter(tag => tag.name.toUpperCase() === base.toUpperCase())
  // A draft may declare the tag this rung is written against; that is not an error.
  const staged = (project.stagedTags ?? []).find(tag => tag.name.toUpperCase() === base.toUpperCase())
  if (staged !== undefined && declared.length === 0) {
    return { symbol: text, scope: staged.scope, resolved: true, canonical: staged.name, data_type: staged.dataType, aliases: [], indices_verified: false }
  }
  if (declared.length === 1) return resolveTag(document, declared[0]!.scope, text)
  if (declared.length > 1) {
    throw new L5xError(
      'AMBIGUOUS_TAG',
      `${base} is declared in ${declared.length} scopes.`,
      'Declare the tag once, or stage the rung through a routine in the program that owns it.',
      declared.map(tag => tag.scope),
    )
  }
  return direct
}
/** One tag or literal operand, checked against its slot kind. */
/** A label or routine name is an identifier, never an address. */
const IDENTIFIER_TEXT = /^[A-Za-z_][A-Za-z0-9_]*$/u

/**
 * An expression is text with operators, not an address, so it is not resolved
 * against tags. It is still checked for the shapes that would corrupt the rung: an
 * unbalanced bracket, an unterminated string, or an embedded terminator.
 *
 * @param text - The expression as written.
 * @param seen - Operands reported with the composed rung.
 * @returns The operand to emit.
 */
function checkExpression(text: string, seen: ComposedOperand[]): ComposedOperand {
  let parentheses = 0
  let brackets = 0
  let quote = ''
  let broken = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index)
    if (quote !== '') {
      if (character === '$') { index += 1; continue }
      if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") { quote = character; continue }
    if (character === ';') { broken = true; break }
    if (character === '(') parentheses += 1
    else if (character === ')') { parentheses -= 1; if (parentheses < 0) { broken = true; break } }
    else if (character === '[') brackets += 1
    else if (character === ']') { brackets -= 1; if (brackets < 0) { broken = true; break } }
  }
  if (broken || quote !== '' || parentheses !== 0 || brackets !== 0) {
    throw new L5xError('INVALID_OPERAND', '"' + text + '" is not a balanced expression.', 'Balance the brackets, close the strings, and do not embed a rung terminator.')
  }
  const operand: ComposedOperand = { text, resolved: false }
  seen.push(operand)
  return operand
}

/**
 * A routine name resolves against the export's routines, the way a tag resolves
 * against its declarations. This is a JSR target, not an address.
 *
 * @param project - The export the rung is being composed into.
 * @param text - The routine name as written.
 * @param seen - Operands reported with the composed rung.
 * @returns The operand to emit, with the routine spelling the export uses.
 */
function checkRoutine(project: ProjectSnapshot, text: string, seen: ComposedOperand[]): ComposedOperand {
  const routine = project.document.routines.find(entry => entry.name.toUpperCase() === text.toUpperCase())
  if (routine === undefined) {
    const candidates = project.document.routines.map(entry => entry.name).slice(0, 8)
    throw new L5xError('ROUTINE_NOT_FOUND', 'No routine named "' + text + '" exists in this export.', candidates.length === 0 ? 'This export has no routines; declare one before jumping to it.' : 'Retry with one of the routine names, or declare the routine first.', candidates)
  }
  const operand: ComposedOperand = { text: routine.name, resolved: true, canonical: routine.name }
  seen.push(operand)
  return operand
}

/**
 * A keyword names a system class, an instance or an attribute — GSV(Program, Main,
 * LastScanTime, Dest). It is an identifier the controller interprets, never a tag, so
 * resolving it against the tag table would refuse every GSV and SSV.
 *
 * @param text - The keyword as written.
 * @param seen - Operands reported with the composed rung.
 * @returns The operand to emit.
 */
function checkKeyword(text: string, seen: ComposedOperand[]): ComposedOperand {
  if (!IDENTIFIER_TEXT.test(text)) throw new L5xError('INVALID_OPERAND', '"' + text + '" is not a keyword; a class, instance or attribute is a bare identifier.', 'Pass the keyword the controller names, for example Program, Main or LastScanTime.')
  const operand: ComposedOperand = { text, resolved: false }
  seen.push(operand)
  return operand
}

/**
 * A label is an identifier inside its own routine. Whether a matching LBL exists is
 * a property of the finished rung, so it is not decided here.
 *
 * @param text - The label as written.
 * @param seen - Operands reported with the composed rung.
 * @returns The operand to emit.
 */
function checkLabel(text: string, seen: ComposedOperand[]): ComposedOperand {
  if (!IDENTIFIER_TEXT.test(text)) throw new L5xError('INVALID_OPERAND', '"' + text + '" is not a label name.', 'A label starts with a letter or underscore and holds letters, digits and underscores.')
  const operand: ComposedOperand = { text, resolved: false }
  seen.push(operand)
  return operand
}

function checkOperand(project: ProjectSnapshot, text: string, kind: InstructionInfo['operands'][number]['kind'], seen: ComposedOperand[]): ComposedOperand {
  // Three slot kinds are not tag references: a computed expression, a routine name and
  // a label. Resolving them as tags refused every CPT, CMP, JSR, JMP and LBL.
  if (kind === 'EXPRESSION') return checkExpression(text, seen)
  if (kind === 'ROUTINE') return checkRoutine(project, text, seen)
  if (kind === 'LABEL') return checkLabel(text, seen)
  if (kind === 'KEYWORD') return checkKeyword(text, seen)
  if (isLiteral(text)) {
    // A literal is a value, not an address: only the slots that take a value accept it.
    if (kind === 'BOOL') throw new L5xError('INVALID_OPERAND', `${text} is a number where a BOOL tag is required.`, 'Pass a declared BOOL tag.')
    if (kind === 'TIMER') throw new L5xError('INVALID_OPERAND', `${text} is a number where a timer is required.`, 'Pass a declared TIMER tag.')
    // A number is not a string. The count the string instructions take is the separate
    // Qty or Start slot, so a literal in a string slot is always a mistake.
    if (kind === 'STRING') throw new L5xError('INVALID_OPERAND', `${text} is a number where a STRING tag is required.`, 'Pass a declared STRING tag.')
    const operand: ComposedOperand = { text, resolved: false }
    seen.push(operand)
    return operand
  }
  if (!TAG_TEXT.test(text)) {
    throw new L5xError('INVALID_OPERAND', `"${text}" is not a tag or a number.`, 'Pass a declared tag name, a member path, or a numeric literal; no spaces or quotes.')
  }
  const resolution = resolveOperand(project, text)
  if (!resolution.resolved) {
    const near = project.document.tags
      .map(tag => tag.name)
      .filter(name => name.toLowerCase().includes(text.split('.')[0]!.toLowerCase()))
      .slice(0, 5)
    throw new L5xError(
      'TAG_NOT_FOUND',
      `No tag named "${text}" resolves in this export.`,
      near.length === 0 ? 'Call list_components kind="tag" to see the declared names.' : 'Retry with one of the candidates, or declare the tag first.',
      near,
    )
  }
  const type = (resolution.data_type ?? '').toUpperCase()
  const operand: ComposedOperand = { text, resolved: true, canonical: resolution.canonical ?? text, ...(type === '' ? {} : { data_type: type }) }
  seen.push(operand)
  if (kind === 'BOOL' && type !== 'BOOL') {
    throw new L5xError('INVALID_OPERAND', `${text} is ${type || 'an unknown type'}; this slot needs a BOOL tag.`, 'Use a BOOL tag, or an alias that resolves to BOOL.', [])
  }
  if (kind === 'NUMBER' && !NUMERIC_TYPES.has(type)) {
    throw new L5xError('INVALID_OPERAND', `${text} is ${type || 'an unknown type'}; this slot needs a numeric value or tag.`, 'Pass a numeric literal or an INT, DINT, REAL or similar tag.', [])
  }
  if (kind === 'STRING' && !STRING_TYPES.has(type)) {
    throw new L5xError('INVALID_OPERAND', `${text} is ${type || 'an unknown type'}; this slot needs a STRING tag.`, 'Pass a declared STRING tag, or a STRING array element.', [])
  }
  if (kind === 'TIMER' && !TIMER_TYPES.has(type)) {
    throw new L5xError('INVALID_OPERAND', `${text} is ${type || 'an unknown type'}; this slot needs a timer.`, 'Pass a declared TIMER tag (TON, TOF or RTO instance).', [])
  }
  return operand
}

/** Resolve one instruction node and emit it. */
function composeInstruction(project: ProjectSnapshot, node: InstructionNode, operands: ComposedOperand[], counter: { instructions: number }): { text: string; grounding: 'catalog' | 'aoi' } {
  // The spec is caller-supplied JSON. Check its shape instead of trusting it: an empty
  // object or a numeric mnemonic used to surface as an INTERNAL defect, which reads to the
  // model as "the plugin is broken" rather than "fix the argument".
  const mnemonic = typeof node.instr === 'string' ? node.instr.trim() : ''
  if (mnemonic === '') {
    throw new L5xError('INVALID_LADDER_SPEC', 'An instruction node needs a mnemonic.', 'Pass {"instr":"XIC","args":["Tag"]}; call list_instructions for the mnemonics this catalogue knows.')
  }
  const args = node.args ?? []
  if (!Array.isArray(args) || args.some(argument => typeof argument !== 'string')) {
    throw new L5xError('INVALID_LADDER_SPEC', 'Every operand must be a string.', 'Pass operands as strings, for example ["StartPB"] or ["MainTimer","500"].')
  }
  counter.instructions += 1
  if (counter.instructions > MAX_INSTRUCTIONS) {
    throw new L5xError('LADDER_TOO_LARGE', `One rung may hold at most ${MAX_INSTRUCTIONS} instructions.`, 'Split the logic across rungs.')
  }
  const instruction = instructionByName(mnemonic)
  if (instruction !== undefined) {
    // Refuse an unmodelled operand list explicitly. Claiming an arity this catalogue cannot
    // check is worse than refusing: it answers with confidence and leaves no way forward.
    if (instruction.notModelled === true) {
      throw new L5xError('INSTRUCTION_NOT_MODELLED', `${instruction.name} is catalogued, but this catalogue does not model its operands.`, `Write the rung text with draft_rung (for example {"text":"${instruction.name}(...);"}) and run draft_validate; draft_rung does not use the catalogue for arity. Call list_instructions to see which names are modelled.`)
    }
    // A slot marked rest repeats for every remaining operand, so a JSR may pass as many
    // parameters as its target routine declares.
    const restSlot = instruction.operands.find(slot => slot.rest === true)
    const kindAt = (index: number): InstructionInfo['operands'][number]['kind'] => (instruction.operands[index] ?? restSlot)?.kind ?? 'ANY'
    const required = instruction.operands.filter(slot => slot.optional !== true && slot.rest !== true).length
    if (args.length < required || (restSlot === undefined && args.length > instruction.operands.length)) {
      const shape = instruction.operands.map(slot => `${slot.name}${slot.optional === true ? '?' : ''}`).join(', ')
      throw new L5xError(
        'INVALID_OPERAND',
        `${instruction.name} takes ${required === instruction.operands.length ? String(required) : `${required}-${instruction.operands.length}`} operand(s): ${shape}; ${args.length} were supplied.`,
        `Call list_instructions with filter "${instruction.name}" for the exact operand order.`,
      )
    }
    // Emit the resolved operand text rather than the caller's spelling: a routine name
    // keeps the case the export uses, and a tag, literal or expression is unchanged
    // because checkOperand preserves the text it was given.
    const emitted = args.map((argument, index) => {
      const operand = checkOperand(project, argument, kindAt(index), operands)
      const text = operand.text
      // Studio refuses a literal in a writable slot only at build time, with
      // RxCMP_E_AUDIT_INVALIDOPKIND and no operand position. The catalog marks those slots so the
      // composer can refuse them and state the written order instead. A slot of kind ANY is not
      // automatically writable: JSR's return parameter and PID's master loop accept 0.
      const slot = instruction.operands[index] ?? restSlot
      if (slot?.writable === true && isLiteral(text)) {
        const what = slot.name === 'Destination' ? 'destination' : slot.name.toLowerCase()
        const fix = slot.name === 'Destination'
          ? `Operands are written in this order: ${instruction.operands.map(entry => entry.name).join(', ')}. For arithmetic and move instructions the destination comes last.`
          : slot.name === 'Index'
            ? 'Pass a declared DINT tag as the loop index; the initial, terminal and step values may be literals.'
            : `Pass a declared tag for the ${slot.name} slot; Studio refuses a literal there.`
        throw new L5xError('INVALID_OPERAND', `${text} is a literal where ${instruction.name} needs a writable ${what}.`, fix)
      }
      // Studio checks the declared type at build time too (RxCMP_E_AUDIT_INVALIDOPTYPE):
      // STD's Destination must be REAL even though its slot kind is NUMBER.
      if (slot?.types !== undefined && operand.resolved && operand.data_type !== undefined && !slot.types.includes(operand.data_type)) {
        throw new L5xError('INVALID_OPERAND', `${text} is ${operand.data_type}; ${instruction.name} ${slot.name} must be ${slot.types.join(' or ')}.`, `Use a tag of type ${slot.types.join(' or ')}.`)
      }
      return text
    })
    return { text: `${emittedMnemonic(project, instruction.name)}(${emitted.join(',')})`, grounding: 'catalog' }
  }
  const aoi = project.document.aois.find(entry => entry.name.toUpperCase() === mnemonic.toUpperCase())
  if (aoi === undefined) {
    throw new L5xError(
      'UNKNOWN_INSTRUCTION',
      `"${mnemonic}" is neither a catalogued instruction nor an AOI declared in this export.`,
      // A name this catalogue does not carry may still be a valid instruction: about a hundred of the set are not modelled here. Point at the path that does not need the catalogue.
      'Call list_instructions for the catalogued names; an AOI must be declared in the project. If the name is a real instruction this catalogue does not carry, write the rung text with draft_rung and run draft_validate instead.',
      nearestInstructions(node.instr),
    )
  }
  // A real AOI call begins with its instance tag: AOI_Alarm(ALM_MCR_AOI, In, Cmd). The parameter
  // values alone produced text Studio refused with INVALIDOPTYPE because the first slot expected
  // an instance of the AOI, not an input.
  if (args.length === 0) {
    throw new L5xError('INVALID_OPERAND', `${aoi.name} needs its instance tag as the first operand.`, `Pass the declared tag whose data type is ${aoi.name}, for example ${aoi.name}(MyInstance, In1, Out1).`)
  }
  const instance = checkOperand(project, args[0], 'ANY', operands)
  if (isLiteral(instance.text)) {
    throw new L5xError('INVALID_OPERAND', `${instance.text} is a literal where ${aoi.name} needs an instance tag of type ${aoi.name}.`, `Declare an instance with draft_tag data_type "${aoi.name}", or pass the declared instance first.`)
  }
  if ((instance.data_type ?? '').toUpperCase() !== aoi.name.toUpperCase()) {
    throw new L5xError('INVALID_OPERAND', `${instance.text} is ${instance.data_type ?? 'an unknown type'}; ${aoi.name} needs an instance tag of type ${aoi.name}.`, `Pass the declared ${aoi.name} instance first, or declare one with draft_tag data_type "${aoi.name}".`)
  }
  const required = aoi.parameters.filter(parameter => parameter.required === true)
  const supplied = args.slice(1)
  if (supplied.length !== required.length) {
    const shape = required.map(parameter => `${parameter.name} (${parameter.usage} ${parameter.dataType})`).join(', ')
    throw new L5xError(
      'INVALID_OPERAND',
      `${aoi.name} takes its instance tag and ${required.length} required parameter(s)${required.length === 0 ? '' : `: ${shape}`}; ${supplied.length} were supplied.`,
      'Pass the required parameters in declaration order; optional parameters keep their declared defaults and are not operands.',
    )
  }
  const kindOf = (dataType: string): InstructionInfo['operands'][number]['kind'] => {
    const type = dataType.toUpperCase()
    if (type === 'BOOL') return 'BOOL'
    if (STRING_TYPES.has(type)) return 'STRING'
    if (TIMER_TYPES.has(type)) return 'TIMER'
    if (COUNTER_TYPES.has(type)) return 'COUNTER'
    if (NUMERIC_TYPES.has(type)) return 'NUMBER'
    return 'ANY'
  }
  const parameters = supplied.map((argument, index) => {
    const parameter = required[index]!
    const operand = checkOperand(project, argument, kindOf(parameter.dataType), operands)
    if ((parameter.usage === 'Output' || parameter.usage === 'InOut') && isLiteral(operand.text)) {
      throw new L5xError('INVALID_OPERAND', `${operand.text} is a literal where ${aoi.name}'s ${parameter.usage} parameter ${parameter.name} needs a tag.`, `Pass a declared ${parameter.dataType} tag for ${parameter.name}.`)
    }
    return operand.text
  })
  return { text: `${aoi.name}(${[instance.text, ...parameters].join(',')})`, grounding: 'aoi' }
}
/** True for a plain object a composition node can be. */
function isSpecNode(value: unknown): value is LadderNodeSpec {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Emit one node tree, validating as it goes. */
/** The mnemonics an export already writes, cached per parsed document. */
const projectSpellings = new WeakMap<object, ReadonlySet<string>>()

/** Every mnemonic one export's ladder routines already use. */
function spellingsOf(project: ProjectSnapshot): ReadonlySet<string> {
  const key = project.document as unknown as object
  const cached = projectSpellings.get(key)
  if (cached !== undefined) return cached
  const used = new Set<string>()
  for (const routine of project.document.routines) {
    if (routine.body.type !== 'RLL') continue
    for (const rung of routine.body.rungs) for (const name of mnemonicsIn(rung.text)) used.add(name)
  }
  projectSpellings.set(key, used)
  return used
}

/**
 * The spelling to emit for one instruction.
 *
 * A rung composed into a project should read the way that project already reads.
 * Logix Designer 36 renamed sixteen ladder instructions (EQU to EQ, SQR to SQRT,
 * …), so when the export writes the other published spelling, emit that one and
 * the new rung matches its neighbours. Otherwise emit the catalog name, which is
 * also the name the viewer labels a block with, so the common case is unchanged.
 *
 * @param project - The export the rung is being composed into.
 * @param name - The catalog mnemonic.
 * @returns The spelling to write into the rung.
 */
function emittedMnemonic(project: ProjectSnapshot, name: string): string {
  return spellingForProject(name, spellingsOf(project), project.document.controller.majorRev)
}

function composeNode(project: ProjectSnapshot, node: LadderNodeSpec, operands: ComposedOperand[], counter: { instructions: number }, depth: number, grounds: Set<'catalog' | 'aoi'>): string {
  // A node is a caller-supplied object: a number or an array here would make the 'in'
  // operator throw, so reject the shape with a repairable failure first.
  if (!isSpecNode(node)) {
    throw new L5xError('INVALID_LADDER_SPEC', 'A composition node must be an object.', 'Use {"series":[...]}, {"parallel":[[...],[...]]} or {"instr":"XIC","args":["Tag"]}.')
  }
  if (depth > MAX_DEPTH) throw new L5xError('LADDER_TOO_LARGE', `Branch nesting exceeds ${MAX_DEPTH}.`, 'Flatten the branches.')
  if ('parallel' in node) {
    if (!Array.isArray(node.parallel) || node.parallel.length < 2) {
      throw new L5xError('INVALID_LADDER_SPEC', 'A parallel branch needs at least two paths.', 'Wrap the alternative paths in "parallel": [[...],[...]].')
    }
    const paths = node.parallel.map(path => {
      if (!Array.isArray(path) || path.length === 0) throw new L5xError('INVALID_LADDER_SPEC', 'A parallel path cannot be empty.', 'Give every path at least one instruction.')
      return path.map(entry => composeNode(project, entry, operands, counter, depth + 1, grounds)).join('')
    })
    return `[${paths.join(' ,')} ]`
  }
  if ('series' in node) {
    if (!Array.isArray(node.series) || node.series.length === 0) {
      throw new L5xError('INVALID_LADDER_SPEC', 'A series cannot be empty.', 'Give the series at least one instruction.')
    }
    return node.series.map(entry => composeNode(project, entry, operands, counter, depth + 1, grounds)).join('')
  }
  const composed = composeInstruction(project, node, operands, counter)
  grounds.add(composed.grounding)
  return composed.text
}

/** Validate the rung we just emitted with the parser the draft path uses. */
function verify(project: ProjectSnapshot, text: string, operands: readonly ComposedOperand[], instructions: number, grounds: ReadonlySet<'catalog' | 'aoi'>): ComposedRung {
  const parsed = parseLadder(text)
  if (parsed.issues.length > 0) {
    // The composer produced text its own parser rejects: a defect, never a draft.
    throw new L5xError('COMPOSER_DEFECT', `The composed rung does not parse: ${parsed.issues[0]?.message ?? 'unknown issue'}`, 'This is a plugin defect; report the spec that produced it.')
  }
  const rail = rightRailReader(parsed.nodes)
  if (rail !== undefined) {
    throw new L5xError('INVALID_LADDER_SPEC', `The rung ends in ${rail}, which reads the condition but never drives the right power rail; Studio refuses to build such a rung.`, 'End the series with an output instruction such as OTE, OTL or a timer; put the condition before it.')
  }
  const grounding = grounds.size === 2 ? 'mixed' : grounds.has('aoi') ? 'aoi' : 'catalog'
  return { neutral_text: text, instructions, operands, grounding }
}

/**
 * Compose one rung from a structure tree.
 *
 * @param project - Fresh export snapshot the operands are resolved against.
 * @param spec - The composition tree.
 * @returns The validated rung.
 */
/**
 * Collect every tag slot in one specification that does not resolve.
 *
 * The composer stops at the first failure while emitting text, so a caller with three undefined
 * tags learned them one round trip at a time. This scan uses the catalog's slot kinds, so only
 * slots that take a tag are checked and keywords, numbers, labels and expressions are left alone.
 *
 * @param project - The open project.
 * @param spec - Composition tree.
 * @param found - Set collecting unresolved operand text.
 * @param depth - Recursion guard.
 */
function unresolvedTagOperands(project: ProjectSnapshot, spec: LadderNodeSpec, found: Set<string>, depth: number): void {
  if (depth > 20) return
  if ('series' in spec) {
    for (const child of spec.series) unresolvedTagOperands(project, child, found, depth + 1)
    return
  }
  if ('parallel' in spec) {
    for (const path of spec.parallel) for (const child of path) unresolvedTagOperands(project, child, found, depth + 1)
    return
  }
  const instruction = instructionByName(spec.instr)
  if (instruction === undefined) return
  const tagKinds = new Set(['BOOL', 'ANY', 'TIMER', 'COUNTER', 'STRING'])
  const last = instruction.operands[instruction.operands.length - 1]
  for (const [index, raw] of (spec.args ?? []).entries()) {
    const slot = instruction.operands[Math.min(index, instruction.operands.length - 1)] ?? last
    if (slot === undefined || !tagKinds.has(slot.kind)) continue
    if (typeof raw !== 'string') continue
    const operand = raw.trim()
    if (!TAG_TEXT.test(operand)) continue
    if (!resolveOperand(project, operand).resolved) found.add(operand)
  }
}

function composeRungBody(project: ProjectSnapshot, spec: LadderNodeSpec): ComposedRung {
  const operands: ComposedOperand[] = []

  const counter = { instructions: 0 }
  const grounds = new Set<'catalog' | 'aoi'>()
  const text = `${composeNode(project, spec, operands, counter, 0, grounds)};`
  // A build proved a bare SBR rung is not accepted: alone it fails inside the SDK
  // (LgxSrv_E_FATAL_ERROR), and beside RET the compiler answers AUDIT_OUTPUTS because SBR does not
  // drive the right rail. Refuse it here with what to do instead.
  if (counter.instructions === 1 && /^SBR\(\s*\);/u.test(text.trim())) {
    throw new L5xError(
      'INVALID_LADDER_SPEC',
      'A rung whose only instruction is SBR() is not buildable: Studio fails it with LgxSrv_E_FATAL_ERROR, or with AUDIT_OUTPUTS when a RET rung follows.',
      'Write the subroutine body without a header rung, or declare parameters with SBR(params) and pass the same parameters from JSR.',
    )
  }
  if (counter.instructions === 0) throw new L5xError('INVALID_LADDER_SPEC', 'The specification contains no instruction.', 'Give the rung at least one instruction.')
  return verify(project, text, operands, counter.instructions, grounds)
}

/** A required pattern argument. */
/**
 * Refuse a pattern call that omits any of its required tag arguments, naming all of them at once.
 *
 * @param pattern - Pattern being expanded.
 * @param args - Caller arguments.
 * @param names - Every required tag argument, in declaration order.
 */
function requirePatternArgs(pattern: string, args: Readonly<Record<string, unknown>>, names: readonly string[], numbers: readonly string[] = []): void {
  const all = [...names, ...numbers]
  const missing = [
    ...names.filter(name => typeof args[name] !== 'string' || String(args[name]).trim() === ''),
    ...numbers.filter(name => typeof args[name] !== 'number' || !Number.isFinite(args[name])),
  ]
  if (missing.length === 0) return
  throw new L5xError(
    'INVALID_ARGUMENT',
    `${pattern} needs ${all.join(', ')}; missing: ${missing.join(', ')}.`,
    `Pass all of: ${all.join(', ')}; tag names as strings and ranges as numbers.`,
  )
}

function arg(args: Readonly<Record<string, unknown>>, name: string): string {
  const value = args[name]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new L5xError('INVALID_ARGUMENT', `Pattern argument ${name} must be a non-empty string.`, `Pass ${name} as a declared tag name.`)
  }
  return value.trim()
}

/** A pattern's named tags, expanded to one or two rungs. */
export function composePattern(project: ProjectSnapshot, pattern: PatternName, args: Readonly<Record<string, unknown>>): ComposedRungs {
  const one = (spec: LadderNodeSpec): ComposedRungs => ({ rungs: [composeRung(project, spec)], pattern })
  if (pattern === 'start_stop_latch') {
    requirePatternArgs(pattern, args, ['start', 'stop', 'run'])
    const start = arg(args, 'start')
    const stop = arg(args, 'stop')
    const run = arg(args, 'run')
    return one({ series: [
      { parallel: [[{ instr: 'XIC', args: [start] }], [{ instr: 'XIC', args: [run] }]] },
      { instr: 'XIO', args: [stop] },
      { instr: 'OTE', args: [run] },
    ] })
  }
  if (pattern === 'interlock') {
    const conditions = args.conditions
    if (!Array.isArray(conditions) || conditions.length === 0) {
      throw new L5xError('INVALID_ARGUMENT', 'interlock needs conditions: at least one tag.', 'Pass conditions as an array of declared BOOL tag names.')
    }
    requirePatternArgs(pattern, args, ['output'])
    const output = arg(args, 'output')
    return one({ series: [
      ...conditions.map(condition => ({ instr: 'XIC', args: [String(condition)] })),
      { instr: 'OTE', args: [output] },
    ] })
  }
  if (pattern === 'ton_delay') {
    requirePatternArgs(pattern, args, ['enable', 'timer'], ['preset_ms'])
    const enable = arg(args, 'enable')
    const timer = arg(args, 'timer')
    const preset = args.preset_ms
    if (typeof preset !== 'number' || !Number.isFinite(preset) || preset < 0) {
      throw new L5xError('INVALID_ARGUMENT', 'ton_delay needs preset_ms as a non-negative number.', 'Pass the preset in milliseconds, for example 1500.')
    }
    return one({ series: [{ instr: 'XIC', args: [enable] }, { instr: 'TON', args: [timer, String(preset), '0'] }] })
  }
  if (pattern === 'analog_scale') {
    requirePatternArgs(pattern, args, ['source', 'destination'], ['in_min', 'in_max', 'out_min', 'out_max'])
    const source = arg(args, 'source')
    const destination = arg(args, 'destination')
    const numbers = (name: string): string => {
      const value = args[name]
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new L5xError('INVALID_ARGUMENT', `analog_scale needs ${name} as a number.`, 'Pass the engineering-range endpoints, for example in_min: 0, in_max: 100.')
      }
      // A float literal, or the expression divides as integers at runtime.
      return Number.isInteger(value) ? `${value}.0` : String(value)
    }
    const inMin = numbers('in_min')
    const inMax = numbers('in_max')
    const outMin = numbers('out_min')
    const outMax = numbers('out_max')
    // CPT takes the destination first: a build refused CPT(expr, dest) with INVALIDOPKIND and
    // accepted CPT(dest, expr).
    return one({ series: [{
      instr: 'CPT',
      args: [destination, `(${source} - ${inMin}) / (${inMax} - ${inMin}) * (${outMax} - ${outMin}) + ${outMin}`],
    }] })
  }
  if (pattern === 'totalizer') {
    requirePatternArgs(pattern, args, ['enable', 'rate', 'total'])
    const enable = arg(args, 'enable')
    const rate = arg(args, 'rate')
    const total = arg(args, 'total')
    // Accumulate in place: ADD(total, rate, total). The source and destination share a tag, which
    // Studio allows for a math instruction written as a single output.
    return one({ series: [
      { instr: 'XIC', args: [enable] },
      { instr: 'ADD', args: [total, rate, total] },
    ] })
  }
  if (pattern === 'run_hour_meter') {
    requirePatternArgs(pattern, args, ['run', 'timer', 'hours'])
    const run = arg(args, 'run')
    const timer = arg(args, 'timer')
    const hours = arg(args, 'hours')
    const preset = args.preset_ms ?? 3_600_000
    if (typeof preset !== 'number' || !Number.isFinite(preset) || preset <= 0) {
      throw new L5xError('INVALID_ARGUMENT', 'run_hour_meter needs preset_ms as a positive number.', 'Pass the interval in milliseconds; the default is one hour (3600000).')
    }
    // The timer's own .DN bit opens its rung, so the timer resets in the same scan that counts the
    // hour and the accumulator runs exactly once per interval.
    return {
      pattern,
      rungs: [
        composeRung(project, { series: [{ instr: 'XIO', args: [`${timer}.DN`] }, { instr: 'XIC', args: [run] }, { instr: 'TON', args: [timer, String(preset), '0'] }] }),
        composeRung(project, { series: [{ instr: 'XIC', args: [`${timer}.DN`] }, { instr: 'ADD', args: [hours, '1', hours] }] }),
      ],
    }
  }
  // fault_latch: set on the fault, clear on the reset — two rungs, never one.
  requirePatternArgs(pattern, args, ['fault', 'reset', 'latched'])
  const fault = arg(args, 'fault')
  const reset = arg(args, 'reset')
  const latched = arg(args, 'latched')
  return {
    pattern,
    rungs: [
      composeRung(project, { series: [{ instr: 'XIC', args: [fault] }, { instr: 'OTL', args: [latched] }] }),
      composeRung(project, { series: [{ instr: 'XIC', args: [reset] }, { instr: 'OTU', args: [latched] }] }),
    ],
  }
}

/**
 * Compose one rung, naming every undefined tag when the first one fails.
 *
 * The composer stops emitting at the first unresolved operand, which is right for the text but
 * leaves a caller fixing three typos over three calls. Only a genuine TAG_NOT_FOUND is enriched,
 * so every other refusal keeps its own precedence and message.
 */
export function composeRung(project: ProjectSnapshot, spec: LadderNodeSpec): ComposedRung {
  try {
    return composeRungBody(project, spec)
  } catch (error) {
    if (!(error instanceof L5xError) || error.code !== 'TAG_NOT_FOUND') throw error
    const missing = new Set<string>()
    unresolvedTagOperands(project, spec, missing, 0)
    if (missing.size < 2) throw error
    const quoted = [...missing].map(name => `"${name}"`)
    const near = [...new Set([...missing].flatMap(name => project.document.tags
      .map(tag => tag.name)
      .filter(candidate => candidate.toLowerCase().includes(name.split('.')[0]!.toLowerCase()))))].slice(0, 5)
    throw new L5xError(
      'TAG_NOT_FOUND',
      `No tags named ${quoted.join(', ')} resolve in this export.`,
      near.length === 0 ? 'Call list_components kind="tag" to see the declared names.' : 'Retry with one of the candidates, or declare the tags first.',
      near,
    )
  }
}
