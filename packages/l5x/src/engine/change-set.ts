/** Validate and stage coordinated edits while retaining untouched XML bytes. */
import { createHash, randomUUID } from 'node:crypto'
import { instructionByName } from './instructions.ts'
import { loadL5x } from '../model/index.ts'
import type { L5xDocument } from '../model/types.ts'
import { parseLadder, lexLogic, rightRailReader } from './logic-syntax.ts'
import { compareProjects, runChecks } from './review.ts'
import { EngineeringError, type ProjectSnapshot } from '../session.ts'
import { typeInstances, typeIndex, udtDetail } from './details.ts'
import { uniqueRegion, xmlRegions, type XmlRegion } from './xml-regions.ts'
import { checkIdentifier } from './names.ts'

/** One block on an inserted FBD sheet: an instance tag, its structure and visible pins. */
export interface FbdBlockOp {
  readonly id: number
  readonly type: string
  readonly tag: string
  readonly structure: string
  readonly pins: readonly string[]
  readonly x?: number
  readonly y?: number
}

/** One reference on the sheet: an input tag or an output tag. */
export interface FbdRefOp {
  readonly id: number
  readonly direction: 'in' | 'out'
  readonly tag: string
  readonly x?: number
  readonly y?: number
}

/** One wire: references and blocks by id, with the pin named on the block side. */
export interface FbdWireOp {
  readonly from: number
  readonly to: number
  readonly from_pin?: string
  readonly to_pin?: string
}

/** One step on an inserted SFC chart. */
export interface SfcStepOp {
  readonly id: number
  readonly name: string
  readonly initial?: boolean
  readonly x?: number
  readonly y?: number
  readonly actions?: readonly { readonly id: number; readonly name: string; readonly qualifier: string; readonly boolean?: boolean }[]
}

/** One transition, with its condition written as Structured Text lines. */
export interface SfcTransitionOp {
  readonly id: number
  readonly name: string
  readonly condition: string
  readonly x?: number
  readonly y?: number
}

/** One directed link between a step and a transition. */
export interface SfcLinkOp {
  readonly from: number
  readonly to: number
  readonly show?: boolean
}

/** One SFC tag to create: a step or action structure, or a BOOL transition tag. */
export interface SfcTagOp {
  readonly scope: string
  readonly name: string
  readonly kind: 'step' | 'transition' | 'action'
  readonly initial?: boolean
}

type Operation =
  | { readonly operation: 'replace_rung'; readonly program: string; readonly routine: string; readonly rung: number; readonly text: string; readonly comment?: string }
  | { readonly operation: 'delete_rung'; readonly program: string; readonly routine: string; readonly rung: number }
  | { readonly operation: 'insert_rung'; readonly program: string; readonly routine: string; readonly rung: number; readonly text: string; readonly before_rung?: number; readonly comment?: string }
  | { readonly operation: 'set_rung_comment'; readonly program: string; readonly routine: string; readonly rung: number; readonly comment: string }
  | { readonly operation: 'replace_st'; readonly program: string; readonly routine: string; readonly code: string }
  | { readonly operation: 'add_routine'; readonly program: string; readonly name: string; readonly language: 'RLL' | 'ST' | 'FBD' | 'SFC'; readonly code: string }
  | { readonly operation: 'add_tag'; readonly scope: string; readonly name: string; readonly data_type: string; readonly value?: number; readonly dimensions?: string; readonly external_access?: string; readonly description: string }
  | { readonly operation: 'set_tag_description'; readonly scope: string; readonly name: string; readonly description: string }
  | { readonly operation: 'add_udt_member'; readonly udt: string; readonly name: string; readonly data_type: string; readonly description: string }
  | { readonly operation: 'set_udt_description'; readonly udt: string; readonly description: string }
  | { readonly operation: 'set_udt_member_description'; readonly udt: string; readonly member: string; readonly description: string }
| { readonly operation: 'add_sfc_tag'; readonly scope: string; readonly name: string; readonly kind: 'step' | 'transition' | 'action'; readonly initial?: boolean }
| { readonly operation: 'insert_sfc_sheet'; readonly program: string; readonly routine: string; readonly steps: readonly SfcStepOp[]; readonly transitions: readonly SfcTransitionOp[]; readonly links: readonly SfcLinkOp[] }
| { readonly operation: 'insert_fbd_sheet'; readonly program: string; readonly routine: string; readonly sheet: number; readonly blocks: readonly FbdBlockOp[]; readonly refs: readonly FbdRefOp[]; readonly wires: readonly FbdWireOp[] }

/**
 * Built-in structure types Studio defaults by itself: an export that declares the tag with no Data
 * block builds, which is how a CONTROL, a SERIAL_PORT_CONTROL and both alarm structures were used in
 * build-verified rungs this cycle. Listing them here lets add_tag create them.
 */
const BUILTIN_STRUCTURE_TYPES = new Set(['control', 'serial_port_control', 'alarm_analog', 'alarm_digital', 'fbd_math', 'fbd_timer', 'fbd_counter', 'fbd_compare', 'fbd_logical', 'message', 'timer', 'counter', 'pid', 'string'])

/** Scalar types the plugin can create with a literal initial value. */
const SCALAR_TYPES = new Set(['BOOL', 'SINT', 'INT', 'DINT', 'LINT', 'USINT', 'UINT', 'UDINT', 'ULINT', 'REAL', 'LREAL'])
/** Operation names accepted by a version-1 change set. */
const SUPPORTED_OPERATIONS = ['replace_rung', 'insert_rung', 'delete_rung', 'set_rung_comment', 'replace_st', 'add_routine', 'add_tag', 'set_tag_description', 'add_udt_member', 'set_udt_description', 'set_udt_member_description', 'insert_fbd_sheet', 'insert_sfc_sheet', 'add_sfc_tag'] as const
/** Compact contract returned with validation errors and embedded in tool descriptions. */
export const CHANGE_SET_HELP = `Operations (each also needs "operation"):
replace_rung {program,routine,rung,text,comment?}
insert_rung {program,routine,rung,text,before_rung?,comment?} — rung is the position the new rung takes (0..count); rungs below it renumber
delete_rung {program,routine,rung}
set_rung_comment {program,routine,rung,comment}
replace_st {program,routine,code}
add_routine {program,name,language:"RLL"|"ST"|"FBD"|"SFC",code} — an FBD routine takes an empty code; add sheets with insert_fbd_sheet
add_sfc_tag {scope,name,kind:"step"|"transition"|"action",initial?} — creates the SFC_STEP or SFC_ACTION structure tag, or a BOOL transition tag
insert_sfc_sheet {program,routine,steps:[{id,name,initial?,actions?:[{id,name,qualifier,boolean?}]}],transitions:[{id,name,condition}],links:[{from,to,show?}]} — one initial step, condition is Structured Text
insert_fbd_sheet {program,routine,sheet,blocks,refs,wires} — blocks {id,type,tag,structure,pins}, refs {id,direction,tag}, wires {from,to,from_pin?,to_pin?}; the block tag must carry the structure type Studio expects (FBD_MATH for ADD)
add_tag {scope,name,data_type,description,value? scalar, dimensions? "4 2", external_access? "Read/Write"|"Read Only"|"None"}
set_tag_description {scope,name,description}
add_udt_member {udt,name,data_type,description}
set_udt_description {udt,description}
set_udt_member_description {udt,member,description}
Identifiers are at most 40 characters. Example: {"version":1,"operations":[{"operation":"add_tag","scope":"controller","name":"SP_Start","data_type":"REAL","value":80,"description":"Start threshold"}]}`

/** Operations that change one existing data type. */
type UdtOperation = Extract<Operation, { operation: 'add_udt_member' | 'set_udt_description' | 'set_udt_member_description' }>
const UDT_OPERATIONS = ['add_udt_member', 'set_udt_description', 'set_udt_member_description'] as const
const isUdtOperation = (operation: Operation): operation is UdtOperation => (UDT_OPERATIONS as readonly string[]).includes(operation.operation)

/**
 * Refuse a name Studio 5000 will not accept, before it reaches a draft.
 *
 * An export never states the naming rules for the names it already carries, so a
 * draft used to accept `1Pump` or `Start PB` and the failure only appeared when
 * Studio built the project. The rule is cheap to state here, and the message
 * names the repair instead of the symptom.
 *
 * @param name - The identifier the operation would create.
 * @param kind - What is being named, for the message: "Tag", "Routine", …
 */
function requireIdentifier(name: string, kind: string): void {
  const issue = checkIdentifier(name)
  if (issue !== undefined) throw new EngineeringError(issue.code, `${kind} name is not usable: ${issue.message}`, issue.fix)
}

/** Parse a Studio `Dimensions` value: one to three positive sizes. */
function parseDimensions(row: Record<string, unknown>): string | undefined {
  const value = row.dimensions
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !/^[1-9]\d*(?: [1-9]\d*){0,2}$/u.test(value)) throw new EngineeringError('INVALID_CHANGE_SET', 'dimensions must be one to three space-separated positive integers')
  const sizes = value.split(' ').map(part => Number.parseInt(part, 10))
  if (sizes.some(size => size > 1_000_000) || sizes.reduce((product, size) => product * size, 1) > 10_000_000) throw new EngineeringError('INVALID_CHANGE_SET', 'dimensions exceed the supported element count')
  return value
}

/** Limits are resolved by the plugin's configuration before tools call this module. */
export interface ChangeSetLimits { readonly operations: number; readonly bytes: number }

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new EngineeringError('INVALID_CHANGE_SET', 'Expected an object')
  return value as Record<string, unknown>
}
function text(row: Record<string, unknown>, name: string): string {
  if (typeof row[name] !== 'string') throw new EngineeringError('INVALID_CHANGE_SET', `${name} must be a string`)
  return row[name]
}
function identifier(row: Record<string, unknown>, name: string): string {
  const value = text(row, name)
  // checkIdentifier names the exact rule and a usable repair; a regex here lost both,
  // so every invalid tag name came back as one generic INVALID_CHANGE_SET.
  const issue = checkIdentifier(value)
  if (issue !== undefined) throw new EngineeringError(issue.code, `${name} is not usable: ${issue.message}`, issue.fix)
  return value
}
function integer(row: Record<string, unknown>, name: string): number {
  const value = row[name]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new EngineeringError('INVALID_CHANGE_SET', `${name} must be a nonnegative safe integer`)
  return value
}
function fields(row: Record<string, unknown>, allowed: readonly string[]): void {
  const extra = Object.keys(row).filter(name => !allowed.includes(name))
  if (extra.length > 0) throw new EngineeringError('INVALID_CHANGE_SET', `Unsupported field(s): ${extra.join(', ')}. Allowed: ${allowed.join(', ')}`)
}
/** Whether one literal fits the scalar type's range and integer-ness. */
function fitsScalar(type: string, value: unknown): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  switch (type.toUpperCase()) {
    case 'BOOL': return value === 0 || value === 1
    case 'SINT': return Number.isInteger(value) && value >= -128 && value <= 127
    case 'INT': return Number.isInteger(value) && value >= -32768 && value <= 32767
    case 'DINT': return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647
    case 'USINT': return Number.isInteger(value) && value >= 0 && value <= 255
    case 'UINT': return Number.isInteger(value) && value >= 0 && value <= 65535
    case 'UDINT': return Number.isInteger(value) && value >= 0 && value <= 4294967295
    case 'LINT': return Number.isSafeInteger(value)
    case 'ULINT': return Number.isSafeInteger(value) && value >= 0
    case 'REAL': return Math.abs(value) <= 3.4028234663852886e38
    case 'LREAL': return Math.abs(value) <= Number.MAX_VALUE
    default: return false
  }
}
function externalAccess(row: Record<string, unknown>): string | undefined {
  const value = row.external_access
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new EngineeringError('INVALID_CHANGE_SET', 'external_access must be "Read/Write", "Read Only" or "None"')
  const normalized = value.trim().toLowerCase().replace(/[\s/]+/gu, '/')
  if (normalized === 'read/write') return 'Read/Write'
  if (normalized === 'read/only') return 'Read Only'
  if (normalized === 'none') return 'None'
  throw new EngineeringError('INVALID_CHANGE_SET', 'external_access must be "Read/Write", "Read Only" or "None"')
}

/**
 * Refuse rung text Studio cannot compile as written.
 *
 * The draft path and the change-set path both write NeutralText into a routine,
 * so both check it here: malformed structure, and a rung whose right power rail
 * is fed by a read-only instruction (`RxCMP_E_AUDIT_OUTPUTS` in Studio).
 */
export function checkRungText(text: string): void {
  const parsed = parseLadder(text)
  if (parsed.issues.length > 0) throw new EngineeringError('INVALID_LADDER', 'Rung contains malformed or unsupported NeutralText structure', 'Write one complete rung, ending in a semicolon.')
  const rail = rightRailReader(parsed.nodes)
  if (rail !== undefined) throw new EngineeringError('INVALID_LADDER', `The rung ends in ${rail}, which reads the condition but never drives the right power rail; Studio refuses to build it (RxCMP_E_AUDIT_OUTPUTS)`, 'End the rung with an output instruction such as OTE, OTL or a timer; put the condition before it.')
}

function parseOne(value: unknown, declaredTypes: ReadonlySet<string>): Operation {
  const row = object(value)
  switch (row.operation) {
    case 'replace_rung':
    case 'insert_rung':
    case 'delete_rung': {
      fields(row, row.operation === 'delete_rung' ? ['operation', 'program', 'routine', 'rung'] : row.operation === 'insert_rung' ? ['operation', 'program', 'routine', 'rung', 'text', 'before_rung', 'comment'] : ['operation', 'program', 'routine', 'rung', 'text', 'comment'])
      const selected = { program: identifier(row, 'program'), routine: identifier(row, 'routine'), rung: integer(row, 'rung') }
      if (row.operation === 'delete_rung') return { operation: row.operation, ...selected }
      const source = text(row, 'text')
      checkRungText(source)
      const comment = row.comment === undefined ? {} : { comment: text(row, 'comment') }
      if (row.operation === 'replace_rung') return { operation: row.operation, ...selected, text: source, ...comment }
      return { operation: row.operation, ...selected, text: source, ...comment, ...(row.before_rung === undefined ? {} : { before_rung: integer(row, 'before_rung') }) }
    }
    case 'set_rung_comment':
      fields(row, ['operation', 'program', 'routine', 'rung', 'comment'])
      return { operation: row.operation, program: identifier(row, 'program'), routine: identifier(row, 'routine'), rung: integer(row, 'rung'), comment: text(row, 'comment') }
    case 'replace_st':
      fields(row, ['operation', 'program', 'routine', 'code'])
      return { operation: row.operation, program: identifier(row, 'program'), routine: identifier(row, 'routine'), code: text(row, 'code') }
    case 'add_routine': {
      fields(row, ['operation', 'program', 'name', 'language', 'code'])
      if (row.language !== 'RLL' && row.language !== 'ST' && row.language !== 'FBD' && row.language !== 'SFC') throw new EngineeringError('INVALID_CHANGE_SET', 'language must be "RLL", "ST" or "FBD"')
    if (row.language === 'FBD' && String(row.code ?? '').trim() !== '') throw new EngineeringError('INVALID_CHANGE_SET', 'An FBD routine takes no code; create it empty and add sheets with draft_fbd')
    if (row.language === 'SFC' && String(row.code ?? '').trim() !== '') throw new EngineeringError('INVALID_CHANGE_SET', 'An SFC routine takes no code; create it empty and add the chart with draft_sfc')
      return { operation: row.operation, program: identifier(row, 'program'), name: identifier(row, 'name'), language: row.language, code: text(row, 'code') }
    }
    case 'add_sfc_tag': {
      fields(row, ['operation', 'scope', 'name', 'kind', 'initial'])
      if (row.kind !== 'step' && row.kind !== 'transition' && row.kind !== 'action') throw new EngineeringError('INVALID_CHANGE_SET', 'kind must be "step", "transition" or "action"')
      return { operation: row.operation, scope: identifier(row, 'scope'), name: identifier(row, 'name'), kind: row.kind, ...(row.initial === undefined ? {} : { initial: row.initial === true }) }
    }
    case 'insert_sfc_sheet': {
      fields(row, ['operation', 'program', 'routine', 'steps', 'transitions', 'links'])
      return {
        operation: row.operation,
        program: identifier(row, 'program'),
        routine: identifier(row, 'routine'),
        steps: sfcSteps(row.steps),
        transitions: sfcTransitions(row.transitions),
        links: sfcLinks(row.links),
      }
    }
    case 'insert_fbd_sheet': {
      fields(row, ['operation', 'program', 'routine', 'sheet', 'blocks', 'refs', 'wires'])
      return {
        operation: row.operation,
        program: identifier(row, 'program'),
        routine: identifier(row, 'routine'),
        sheet: fbdId(row.sheet, 'sheet'),
        blocks: fbdBlocks(row.blocks),
        refs: fbdRefs(row.refs),
        wires: fbdWires(row.wires),
      }
    }
    case 'add_tag': {
      fields(row, ['operation', 'scope', 'name', 'data_type', 'value', 'dimensions', 'external_access', 'description'])
      const dataType = text(row, 'data_type')
      if (!declaredTypes.has(dataType.toLowerCase())) throw new EngineeringError('UNKNOWN_DATA_TYPE', `Data type "${dataType}" is not a scalar or declared type in this export; call get_component kind="udt" or project_overview to check names`)
      const scalar = SCALAR_TYPES.has(dataType.toUpperCase())
      const dimensions = parseDimensions(row)
      const access = externalAccess(row)
      if (!scalar && row.value !== undefined) throw new EngineeringError('INVALID_CHANGE_SET', 'A declared-type tag takes Studio default values; omit value')
      if (dimensions !== undefined && row.value !== undefined) throw new EngineeringError('INVALID_CHANGE_SET', 'An array tag takes Studio default element values; omit value')
      if (dimensions === undefined && scalar) {
        // A Logix scalar defaults to its type's zero. Requiring `value` here made
        // the ordinary "declare a REAL" operation invalid, which is what failed
        // two add_tag operations in a live session.
        if (row.value !== undefined && !fitsScalar(dataType, row.value)) throw new EngineeringError('INVALID_CHANGE_SET', `value ${String(row.value)} does not fit ${dataType}; BOOL accepts 0/1 and integer types accept their signed/unsigned range`)
        return { operation: row.operation, scope: identifier(row, 'scope'), name: identifier(row, 'name'), data_type: dataType, ...(row.value === undefined ? {} : { value: row.value as number }), description: text(row, 'description'), ...(access === undefined ? {} : { external_access: access }) }
      }
      return { operation: row.operation, scope: identifier(row, 'scope'), name: identifier(row, 'name'), data_type: dataType, ...(dimensions === undefined ? {} : { dimensions }), description: text(row, 'description'), ...(access === undefined ? {} : { external_access: access }) }
    }
    case 'add_udt_member': {
      fields(row, ['operation', 'udt', 'name', 'data_type', 'description'])
      const dataType = text(row, 'data_type')
      if (dataType.toUpperCase() === 'BIT') throw new EngineeringError('UNSUPPORTED_OPERATION', 'A BIT member needs a backing member and bit position; append a BOOL, numeric or declared-type member instead')
      if (!declaredTypes.has(dataType.toLowerCase())) throw new EngineeringError('UNKNOWN_DATA_TYPE', `Data type "${dataType}" is not a scalar or declared type in this export`)
      return { operation: row.operation, udt: identifier(row, 'udt'), name: identifier(row, 'name'), data_type: dataType, description: text(row, 'description') }
    }
    case 'set_udt_description':
      fields(row, ['operation', 'udt', 'description'])
      return { operation: row.operation, udt: identifier(row, 'udt'), description: text(row, 'description') }
    case 'set_udt_member_description':
      fields(row, ['operation', 'udt', 'member', 'description'])
      return { operation: row.operation, udt: identifier(row, 'udt'), member: identifier(row, 'member'), description: text(row, 'description') }
    case 'set_tag_description':
      fields(row, ['operation', 'scope', 'name', 'description'])
      return { operation: row.operation, scope: identifier(row, 'scope'), name: identifier(row, 'name'), description: text(row, 'description') }
    default: throw new EngineeringError('INVALID_CHANGE_SET', `Unsupported operation "${String(row.operation)}"; supported: ${SUPPORTED_OPERATIONS.join(', ')}. Arbitrary XML replacement is not accepted.`)
  }
}

function parseOperations(request: string, maximum: number, declaredTypes: ReadonlySet<string>): readonly Operation[] {
  let value: unknown
  try { value = JSON.parse(request) } catch (error) { throw new EngineeringError('INVALID_CHANGE_SET', `Invalid JSON: ${error instanceof Error ? error.message : String(error)}. ${CHANGE_SET_HELP}`) }
  const root = object(value)
  fields(root, ['version', 'operations'])
  if (root.version !== 1 || !Array.isArray(root.operations) || root.operations.length < 1 || root.operations.length > maximum) throw new EngineeringError('INVALID_CHANGE_SET', `version must be 1 with between 1 and ${maximum} operations. ${CHANGE_SET_HELP}`)
  const operations: Operation[] = []
  const failures: { readonly code: string; readonly message: string; readonly fix?: string }[] = []
  for (const [index, entry] of root.operations.entries()) {
    try { operations.push(parseOne(entry, declaredTypes)) }
    catch (error) {
      const code = error instanceof EngineeringError ? error.code : 'INVALID_CHANGE_SET'
      const message = error instanceof Error ? error.message.replace(/^[A-Z][A-Z_]*: /u, '') : String(error)
      failures.push({ code, message: `#${index} [${code}]: ${message}`, ...(error instanceof EngineeringError && error.fix !== undefined ? { fix: error.fix } : {}) })
    }
  }
  if (failures.length > 0) {
    // One failed operation is the ordinary repair case: keep its own fix (including any suggested
    // name) instead of the generic help text, so the caller can correct the operation directly.
    const fix = failures.length === 1 ? failures[0]!.fix : undefined
    throw new EngineeringError('INVALID_CHANGE_SET', `${failures.length} of ${root.operations.length} operation(s) failed:\n${failures.map(failure => `- ${failure.message}`).join('\n')}\n${CHANGE_SET_HELP}`, fix)
  }
  return operations
}
const escape = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
const cdata = (value: string): string => `<![CDATA[${value.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`
const replace = (xml: string, start: number, end: number, value: string): string => xml.slice(0, start) + value + xml.slice(end)

function editable(region: XmlRegion): void {
  const protectedRegion = (region: XmlRegion): boolean => region.kind === 'EncodedData' || /safety/iu.test(region.attributes.Class ?? '') || Object.entries(region.attributes).some(([name, value]) => /Encrypted|SourceProtected/iu.test(name) && value.toLowerCase() !== 'false') || region.children.some(protectedRegion)
  if (protectedRegion(region)) throw new EngineeringError('PROTECTED_TARGET', 'Safety or protected target cannot be changed')
}
function insert(xml: string, region: XmlRegion, child: string): string {
  if (!region.selfClosing) return replace(xml, region.contentEnd, region.contentEnd, child)
  return replace(xml, region.start, region.end, xml.slice(region.start, region.end).replace(/\/\s*>$/u, '>') + child + `</${region.kind}>`)
}
function stContent(code: string): string {
  if (lexLogic(code).issues.length > 0) throw new EngineeringError('INVALID_ST', 'Structured Text contains unterminated comments or strings')
  return '<STContent>' + code.split('\n').map((line, index) => `<Line Number="${index}">${cdata(line)}</Line>`).join('') + '</STContent>'
}

/** Replace a description attribute or element inside one region. */
function setDescription(xml: string, region: XmlRegion, value: string): string {
  const element = `<Description>${escape(value)}</Description>`
  const open = xml.slice(region.start, region.contentStart)
  if (/\sDescription="/u.test(open)) return replace(xml, region.start, region.contentStart, open.replace(/(\sDescription=")[^"]*(")/u, (_match, start: string, end: string) => `${start}${escape(value)}${end}`))
  const child = region.children.find(entry => entry.kind === 'Description')
  if (child !== undefined) return replace(xml, child.start, child.end, element)
  // A real export puts Description first inside Tag, DataType and Member - before Data or
  // Members. Appending it to the region end put it after those children, out of element order.
  return replace(xml, region.contentStart, region.contentStart, element)
}

interface ApplyContext {
  readonly document: L5xDocument
  readonly allowUdtInstances?: boolean
}

function applyOperation(xml: string, operation: Operation, context: ApplyContext): string {
  let root = uniqueRegion(xmlRegions(xml), 'RSLogix5000Content')
  let controller = uniqueRegion(root.children, 'Controller')
  const program = (name: string): XmlRegion => {
    const found = uniqueRegion(uniqueRegion(controller.children, 'Programs').children, 'Program', name)
    if (/safety/iu.test(found.attributes.Class ?? '') || /^safety$/iu.test(name)) throw new EngineeringError('PROTECTED_TARGET', 'Safety programs cannot be changed')
    const tasks = controller.children.find(child => child.kind === 'Tasks')
    if (tasks?.children.some(task => /safety/iu.test(`${task.attributes.Type ?? ''} ${task.attributes.Class ?? ''}`) && task.children.some(child => child.kind === 'ScheduledPrograms' && child.children.some(program => program.attributes.Name?.toLowerCase() === name.toLowerCase())))) throw new EngineeringError('PROTECTED_TARGET', 'Safety-scheduled programs cannot be changed')
    return found
  }
  if (operation.operation === 'add_udt_member' || operation.operation === 'set_udt_description' || operation.operation === 'set_udt_member_description') {
    const dataTypes = uniqueRegion(controller.children, 'DataTypes')
    const type = uniqueRegion(dataTypes.children, 'DataType', operation.udt)
    const declaredClass = type.attributes.Class
    const vendorOwned = declaredClass === undefined ? type.attributes.Family !== 'NoFamily' : declaredClass !== 'User'
    if (vendorOwned) throw new EngineeringError('PROTECTED_TARGET', 'Module-defined and built-in data types are vendor-owned and cannot be changed')
    if (operation.operation === 'set_udt_description') return setDescription(xml, type, operation.description)
    const members = uniqueRegion(type.children, 'Members')
    if (operation.operation === 'set_udt_member_description') {
      const member = uniqueRegion(members.children, 'Member', operation.member)
      return setDescription(xml, member, operation.description)
    }
    const instances = typeInstances(context.document, operation.udt)
    if (context.allowUdtInstances !== true && instances.length > 0) throw new EngineeringError('UDT_HAS_INSTANCES', `Data type ${operation.udt} has ${instances.length} instance(s) (first: ${instances[0]}); changing a member rewrites serialized tag data. Change the data type in Studio, or remove every instance first; a member change rewrites serialized tag data.`)
    requireIdentifier(operation.name, 'Data type member')
    if (members.children.some(member => member.attributes.Name?.toLowerCase() === operation.name.toLowerCase())) throw new EngineeringError('NAME_COLLISION', 'Member already exists in the data type')
    const dataType = operation.data_type.toUpperCase()
    const scalar = SCALAR_TYPES.has(dataType)
    const radix = scalar ? (dataType === 'REAL' || dataType === 'LREAL' ? 'Float' : 'Decimal') : 'NullType'
    const opening = `<Member Name="${operation.name}" DataType="${operation.data_type}" Dimension="0" Radix="${radix}" Hidden="false" ExternalAccess="Read/Write"`
    // Studio writes a member description as a child element; as an attribute it is ignored
    // (XMLSrv_W_INVALID_ATTRIBUTE), which silently dropped the text.
    return insert(xml, members, operation.description === ''
      ? `${opening}/>`
      : `${opening}><Description>${cdata(operation.description)}</Description></Member>`)
  }
  if (operation.operation === 'add_sfc_tag') {
    const owner = operation.scope.toLowerCase() === 'controller' ? controller : program(operation.scope)
    requireIdentifier(operation.name, 'Tag')
    // A program may have no Tags region yet: create it with the first SFC tag inside.
    const existingTags = owner.children.find(child => child.kind === 'Tags')
    if (existingTags === undefined) {
      // Element order matters: Tags precedes Routines in a program.
      const routines = owner.children.find(child => child.kind === 'Routines')
      if (routines !== undefined) return replace(xml, routines.start, routines.start, `<Tags>${sfcTagXml(operation)}</Tags>`)
      return insert(xml, owner, `<Tags>${sfcTagXml(operation)}</Tags>`)
    }
    const tags = existingTags
    if (tags.children.some(tag => tag.attributes.Name?.toLowerCase() === operation.name.toLowerCase())) throw new EngineeringError('NAME_COLLISION', 'Tag already exists in this scope')
    return insert(xml, tags, sfcTagXml(operation))
  }
  if (operation.operation === 'add_tag' || operation.operation === 'set_tag_description') {
    let owner = operation.scope.toLowerCase() === 'controller' ? controller : program(operation.scope)
    let tags = owner.children.find(child => child.kind === 'Tags')
    if (tags === undefined && operation.operation === 'add_tag') {
      // A project may omit the Tags element; the first tag still needs a place to go. Element
      // order matters: Tags precedes Routines in a program and Programs in the controller.
      const anchor = owner.children.find(child => child.kind === (owner.kind === 'Program' ? 'Routines' : 'Programs'))
      const at = anchor?.start ?? owner.contentEnd
      xml = replace(xml, at, at, '<Tags></Tags>')
      root = uniqueRegion(xmlRegions(xml), 'RSLogix5000Content')
      controller = uniqueRegion(root.children, 'Controller')
      owner = operation.scope.toLowerCase() === 'controller' ? controller : program(operation.scope)
      tags = owner.children.find(child => child.kind === 'Tags')
    }
    if (tags === undefined) tags = uniqueRegion(owner.children, 'Tags')
    if (operation.operation === 'add_tag') {
      requireIdentifier(operation.name, 'Tag')
      if (tags.children.some(tag => tag.attributes.Name?.toLowerCase() === operation.name.toLowerCase())) throw new EngineeringError('NAME_COLLISION', 'Tag already exists in the selected scope')
      if (operation.dimensions === undefined && operation.value !== undefined) {
        const float = operation.data_type.toUpperCase() === 'REAL' || operation.data_type.toUpperCase() === 'LREAL'
        return insert(xml, tags, `<Tag Name="${operation.name}" TagType="Base" DataType="${operation.data_type}" Radix="${float ? 'Float' : 'Decimal'}" Constant="false" ExternalAccess="${operation.external_access ?? 'Read/Write'}"><Description>${escape(operation.description)}</Description><Data Format="L5K">${cdata(String(operation.value))}</Data></Tag>`)
      }
      const scalar = SCALAR_TYPES.has(operation.data_type.toUpperCase())
      const radix = scalar ? ` Radix="${operation.data_type.toUpperCase() === 'REAL' || operation.data_type.toUpperCase() === 'LREAL' ? 'Float' : 'Decimal'}"` : ''
      const dimensions = operation.dimensions === undefined ? '' : ` Dimensions="${operation.dimensions}"`
      return insert(xml, tags, `<Tag Name="${operation.name}" TagType="Base" DataType="${operation.data_type}"${dimensions}${radix} Constant="false" ExternalAccess="${operation.external_access ?? 'Read/Write'}"><Description>${escape(operation.description)}</Description></Tag>`)
    }
    const tag = uniqueRegion(tags.children, 'Tag', operation.name); editable(tag)
    if (tag.attributes.Description !== undefined) throw new EngineeringError('UNSUPPORTED_TARGET', 'Attribute-style descriptions require the legacy description tool')
    const description = tag.children.find(child => child.kind === 'Description')
    return description === undefined ? tag.selfClosing ? insert(xml, tag, `<Description>${escape(operation.description)}</Description>`) : replace(xml, tag.contentStart, tag.contentStart, `<Description>${escape(operation.description)}</Description>`)
      : replace(xml, description.start, description.end, `<Description>${escape(operation.description)}</Description>`)
  }
  const owner = program(operation.program)
  const routines = uniqueRegion(owner.children, 'Routines')
  if (operation.operation === 'add_routine') {
    requireIdentifier(operation.name, 'Routine')
    if (routines.children.some(routine => routine.attributes.Name?.toLowerCase() === operation.name.toLowerCase())) throw new EngineeringError('NAME_COLLISION', 'Routine already exists')
    let body: string
    if (operation.language === 'FBD') body = '<FBDContent SheetSize="B - 11 x 17 in" SheetOrientation="Landscape"/>'
    else if (operation.language === 'SFC') body = '<SFCContent SheetSize="Letter - 8.5 x 11 in" SheetOrientation="Landscape"/>'
    else if (operation.language === 'ST') body = stContent(operation.code)
    else {
      const lines = (operation.code ?? '').split('\n').filter(line => line.trim() !== '')
      for (const line of lines) checkRungText(line)
      body = '<RLLContent>' + lines.map((line, index) => `<Rung Number="${index}" Type="N"><Text>${cdata(line)}</Text></Rung>`).join('') + '</RLLContent>'
    }
    return insert(xml, routines, `<Routine Name="${operation.name}" Type="${operation.language}">${body}</Routine>`)
  }
  const routine = uniqueRegion(routines.children, 'Routine', operation.routine); editable(routine)
  if (operation.operation === 'insert_sfc_sheet') {
    if (routine.attributes.Type !== 'SFC') throw new EngineeringError('UNSUPPORTED_TARGET', 'Selected routine is not a sequential function chart')
    const chart = sfcChartXml(operation)
    const content = routine.children.find(child => child.kind === 'SFCContent')
    if (content === undefined) {
      const element = xml.slice(routine.start, routine.end)
      const open = element.indexOf('>')
      if (open < 0) throw new EngineeringError('INVALID_OPERATION', 'The SFC routine element is malformed')
      const head = element.slice(0, open).replace(/\/$/u, '')
      return replace(xml, routine.start, routine.end, `${head}><SFCContent SheetSize="Letter - 8.5 x 11 in" SheetOrientation="Landscape">${chart}</SFCContent></Routine>`)
    }
    if (content.selfClosing) {
      const element = xml.slice(content.start, content.end)
      const head = element.replace(/\/>$/u, '>')
      return replace(xml, content.start, content.end, `${head}${chart}</SFCContent>`)
    }
    const closing = content.end - '</SFCContent>'.length
    return replace(xml, closing, closing, chart)
  }
  if (operation.operation === 'insert_fbd_sheet') {
    if (routine.attributes.Type !== 'FBD') throw new EngineeringError('UNSUPPORTED_TARGET', 'Selected routine is not a function block diagram')
    const sheet = fbdSheetXml(operation)
    const content = routine.children.find(child => child.kind === 'FBDContent')
    if (content === undefined) {
      const element = xml.slice(routine.start, routine.end)
      const open = element.indexOf('>')
      if (open < 0) throw new EngineeringError('INVALID_OPERATION', 'The FBD routine element is malformed')
      const head = element.slice(0, open).replace(/\/$/u, '')
      return replace(xml, routine.start, routine.end, `${head}><FBDContent>${sheet}</FBDContent></Routine>`)
    }
    if (content.selfClosing) {
      const element = xml.slice(content.start, content.end)
      const head = element.replace(/\/>$/u, '>')
      return replace(xml, content.start, content.end, `${head}${sheet}</FBDContent>`)
    }
    const closing = content.end - '</FBDContent>'.length
    return replace(xml, closing, closing, sheet)
  }
  if (operation.operation === 'replace_st') {
    if (routine.attributes.Type !== 'ST') throw new EngineeringError('UNSUPPORTED_TARGET', 'Selected routine is not Structured Text')
    const content = uniqueRegion(routine.children, 'STContent')
    return replace(xml, content.start, content.end, stContent(operation.code))
  }
  if (routine.attributes.Type !== 'RLL') throw new EngineeringError('UNSUPPORTED_TARGET', 'Selected routine is not ladder')
  const content = uniqueRegion(routine.children, 'RLLContent')
  const rungs = content.children.filter(child => child.kind === 'Rung')
  const targets = rungs.filter(rung => Number(rung.attributes.Number) === operation.rung)
  if (operation.operation === 'insert_rung') {
    checkRungText(operation.text)
    const numbers = rungs.map(rung => Number(rung.attributes.Number))
    const before = operation.before_rung
    const index = before === undefined ? operation.rung : numbers.indexOf(before)
    if (before !== undefined && index < 0) throw new EngineeringError('AMBIGUOUS_TARGET', 'Insertion target rung is absent or ambiguous')
    if (before !== undefined && operation.rung !== index) throw new EngineeringError('INVALID_OPERATION', `A rung inserted before rung ${before} takes number ${index}; pass "${index}" as rung.`, 'Pass the rung number the new rung occupies; the rungs at and below that number shift down by one.')
    if (!Number.isInteger(index) || index < 0 || index > rungs.length) throw new EngineeringError('INVALID_OPERATION', `Cannot insert a rung at ${operation.rung}: this routine has ${rungs.length} rung(s), so the position is 0..${rungs.length}.`, `Pass rung 0 to put it first, or rung ${rungs.length} to append it.`)
    const newRung = `<Rung Number="${index}" Type="N">${commentXml(operation.comment)}<Text>${cdata(operation.text)}</Text></Rung>`
    const inserted = index < rungs.length ? replace(xml, rungs[index]!.start, rungs[index]!.start, newRung) : insert(xml, content, newRung)
    return renumberRungs(inserted, operation.program, operation.routine)
  }
  if (targets.length !== 1) throw new EngineeringError('AMBIGUOUS_TARGET', 'Selected rung is absent or ambiguous')
  const target = targets[0]!
  if (operation.operation === 'delete_rung') return renumberRungs(replace(xml, target.start, target.end, ''), operation.program, operation.routine)
  if (operation.operation === 'set_rung_comment') {
    return replace(xml, target.start, target.end, rungWith(target, retainedText(xml, target), operation.comment))
  }
  if (operation.comment !== undefined) {
    checkRungText(operation.text)
    return replace(xml, target.start, target.end, rungWith(target, `<Text>${cdata(operation.text)}</Text>`, operation.comment))
  }
  checkRungText(operation.text)
  const contentText = uniqueRegion(target.children, 'Text')
  return replace(xml, contentText.start, contentText.end, `<Text>${cdata(operation.text)}</Text>`)
}

/**
 * Rewrite every rung number in one routine to its document position.
 * Studio keeps a ladder routine numbered 0..n-1, so inserting or deleting a rung
 * in the middle renumbers the rungs below it; the edit is applied right to left so
 * the earlier offsets stay valid.
 */
function renumberRungs(xml: string, programName: string, routineName: string): string {
  const root = uniqueRegion(xmlRegions(xml), 'RSLogix5000Content')
  const programs = root.children.find(child => child.kind === 'Controller')?.children.find(child => child.kind === 'Programs')
  const owner = programs?.children.find(child => child.kind === 'Program' && child.attributes.Name?.toLowerCase() === programName.toLowerCase())
  const routine = owner?.children.find(child => child.kind === 'Routines')?.children.find(child => child.kind === 'Routine' && child.attributes.Name?.toLowerCase() === routineName.toLowerCase())
  const rungs = routine?.children.find(child => child.kind === 'RLLContent')?.children.filter(child => child.kind === 'Rung') ?? []
  let output = xml
  for (let index = rungs.length - 1; index >= 0; index -= 1) {
    const rung = rungs[index]!
    if (Number(rung.attributes.Number) === index) continue
    const element = output.slice(rung.start, rung.end)
    const close = element.indexOf('>')
    if (close < 0) continue
    const head = element.slice(0, close + 1)
    const rewritten = head.replace(/\bNumber="[^"]*"/u, `Number="${index}"`)
    if (rewritten === head) continue
    output = output.slice(0, rung.start) + rewritten + element.slice(close + 1) + output.slice(rung.end)
  }
  return output
}

/** A comment element, or nothing when the comment is cleared. */
function commentXml(comment: string | undefined): string {
  return comment === undefined || comment === '' ? '' : `<Comment>${cdata(comment)}</Comment>`
}

/** The rung's existing `<Text>` element, verbatim, for a comment-only edit. */
function retainedText(xml: string, rung: XmlRegion): string {
  const text = rung.children.find(child => child.kind === 'Text')
  return text === undefined ? '<Text><![CDATA[]]></Text>' : xml.slice(text.start, text.end)
}

/** Rebuild one rung element with a comment and a text element. */
function rungWith(rung: XmlRegion, text: string, comment: string | undefined): string {
  const type = rung.attributes.Type ?? 'N'
  return `<Rung Number="${rung.attributes.Number}" Type="${type}">${commentXml(comment)}${text}</Rung>`
}

/** Every type name a change may reference: scalars, declared types and add-on instructions. */
function declaredTypeNames(project: ProjectSnapshot): ReadonlySet<string> {
  const names = new Set<string>([...SCALAR_TYPES].map(name => name.toLowerCase()))
  for (const name of BUILTIN_STRUCTURE_TYPES) names.add(name)
  for (const name of typeIndex(project.document).keys()) names.add(name)
  // An add-on instruction is a data type for tags: its instance tag is the first operand of every
  // AOI call, so draft_tag must be able to declare one.
  for (const aoi of project.document.aois) names.add(aoi.name.toLowerCase())
  return names
}

/** One prepared draft and its review data. */
export interface PreparedChangeSet {
  readonly xml: string
  readonly operations: readonly Operation[]
  readonly source_sha256: string
  readonly draft_sha256: string
  readonly diff: unknown
  readonly checks: unknown
  readonly validation: { readonly xml: string; readonly studio_import: string; readonly studio_build: string; readonly behavior: string }
  readonly prepared: 'computed' | 'cache'
}

/** Baseline audit for one snapshot, reused by every preparation against it. */
const baselineAudits = new WeakMap<ProjectSnapshot, { findings: readonly ChangeFinding[]; summary: unknown }>()
/** Last full preparation per snapshot, so apply does not recompute checks and diff. */
const preparedCache = new WeakMap<ProjectSnapshot, { key: string; result: PreparedChangeSet }>()

interface ChangeFinding { readonly rule: string; readonly severity: string; readonly message: string; readonly evidence: unknown }

function findingKey(finding: ChangeFinding): string { return JSON.stringify([finding.rule, finding.severity, finding.message, finding.evidence]) }

function baselineAudit(project: ProjectSnapshot): { findings: readonly ChangeFinding[]; summary: unknown } {
  const cached = baselineAudits.get(project)
  if (cached !== undefined) return cached
  const audit = runChecks(project) as unknown as { findings: readonly ChangeFinding[]; summary: unknown }
  baselineAudits.set(project, audit)
  return audit
}

/** Findings this draft adds or resolves, not the whole project audit. */
function deltaChecks(project: ProjectSnapshot, draft: ProjectSnapshot): object {
  const before = baselineAudit(project)
  const after = runChecks(draft, project) as unknown as { findings: readonly ChangeFinding[]; summary: unknown }
  const beforeKeys = new Set(before.findings.map(findingKey))
  const afterKeys = new Set(after.findings.map(findingKey))
  const added = after.findings.filter(finding => !beforeKeys.has(findingKey(finding)))
  const resolved = before.findings.filter(finding => !afterKeys.has(findingKey(finding)))
  return {
    summary: after.summary,
    baseline_summary: before.summary,
    new_finding_count: added.length,
    resolved_count: resolved.length,
    new_findings: added.slice(0, 25),
    truncated: added.length > 25,
    note: 'Lists only findings this draft adds or resolves; call run_checks for the full project audit.',
  }
}

/** Prepare every operation in memory, without writing a draft or touching Studio.
 * @param project - Hash-verified baseline.
 * @param request - Version-1 JSON change set.
 * @param limits - Validated operation and draft-size limits.
 * @returns Draft text and review data; malformed, unsupported or protected changes throw.
 */
export function prepareChangeSet(project: ProjectSnapshot, request: string, limits: ChangeSetLimits): PreparedChangeSet {
  if (Buffer.byteLength(request, 'utf8') > limits.bytes) throw new EngineeringError('REQUEST_TOO_LARGE', 'Change-set request exceeds maxFileBytes')
  if (!/<\?xml[^>]*encoding=["'](?:UTF-8|utf-8)["']/u.test(project.xml) && /<\?xml[^>]*encoding=/u.test(project.xml)) throw new EngineeringError('UNSUPPORTED_ENCODING', 'Change-set writing requires UTF-8 exports')
  const cacheKey = `${limits.operations}:${limits.bytes}:${createHash('sha256').update(request).digest('hex')}`
  const cached = preparedCache.get(project)
  if (cached?.key === cacheKey) return { ...cached.result, prepared: 'cache' as const }
  const operations = parseOperations(request, limits.operations, declaredTypeNames(project))
  let xml = project.xml
  const encoded = (text: string): readonly string[] => [...text.matchAll(/<EncodedData\b[^>]*>[\s\S]*?<\/EncodedData>/gu)].map(match => match[0])
  const protectedBefore = encoded(project.xml)
  for (const operation of operations) {
    xml = applyOperation(xml, operation, { document: project.document })
    if (Buffer.byteLength(xml, 'utf8') > limits.bytes) throw new EngineeringError('DRAFT_TOO_LARGE', 'Draft exceeds maxFileBytes')
  }
  if (xml === project.xml) throw new EngineeringError('NO_CHANGE', 'Change set does not alter the project')
  if (JSON.stringify(encoded(xml)) !== JSON.stringify(protectedBefore)) throw new EngineeringError('PROTECTED_TARGET', 'Encoded definitions changed')
  const document = loadL5x(xml)
  const sha256 = createHash('sha256').update(xml).digest('hex')
  const draft: ProjectSnapshot = { ...project, xml, document, sha256, bytes: Buffer.byteLength(xml, 'utf8') }
  const result = { xml, operations, source_sha256: project.sha256, draft_sha256: sha256, diff: compareProjects(project, draft), checks: deltaChecks(project, draft), validation: { xml: 'passed', studio_import: 'not_run', studio_build: 'not_run', behavior: 'not_run' }, prepared: 'computed' as const }
  preparedCache.set(project, { key: cacheKey, result })
  return result
}

/** One changed data type as a Studio Data Type import component.
 * @param project - Hash-verified baseline.
 * @param request - Version-1 JSON change set holding one or more UDT operations.
 * @returns Component L5X text plus the type-level difference; no file is written.
 */
export function prepareUdtComponent(project: ProjectSnapshot, request: string) {
  if (!/<\?xml[^>]*encoding=["'](?:UTF-8|utf-8)["']/u.test(project.xml) && /<\?xml[^>]*encoding=/u.test(project.xml)) throw new EngineeringError('UNSUPPORTED_ENCODING', 'Component writing requires UTF-8 exports')
  const operations = parseOperations(request, 100, declaredTypeNames(project))
  const udtOperations = operations.filter(isUdtOperation)
  if (udtOperations.length !== operations.length || udtOperations.length === 0) throw new EngineeringError('INVALID_CHANGE_SET', 'A UDT component accepts only add_udt_member, set_udt_description and set_udt_member_description operations')
  const target = udtOperations[0]!.udt
  if (udtOperations.some(operation => operation.udt.toLowerCase() !== target.toLowerCase())) throw new EngineeringError('INVALID_CHANGE_SET', 'A UDT component changes exactly one data type')
  let xml = project.xml
  for (const operation of operations) xml = applyOperation(xml, operation, { document: project.document, allowUdtInstances: true })
  const root = uniqueRegion(xmlRegions(xml), 'RSLogix5000Content')
  const controller = uniqueRegion(root.children, 'Controller')
  const dataTypes = uniqueRegion(controller.children, 'DataTypes')
  const type = uniqueRegion(dataTypes.children, 'DataType', target)
  const before = udtDetail(project.document, target)
  const after = udtDetail(loadL5x(xml), target)
  if (before === undefined || after === undefined) throw new EngineeringError('COMPONENT_NOT_FOUND', `Data type ${target} not found`)
  const component = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="${project.softwareRevision}" TargetName="${escape(target)}" TargetType="DataType" ContainsContext="false"><Controller Use="Context" Name="${escape(project.document.controller.name)}"><DataTypes>${xml.slice(type.start, type.end)}</DataTypes></Controller></RSLogix5000Content>\n`
  return { xml: component, operations, udt: target, source_sha256: project.sha256,
    component_sha256: createHash('sha256').update(component).digest('hex'),
    changes: { before, after }, validation: { xml: 'passed', studio_import: 'not_run' as const } }
}

/** Stage a fully prepared change set into a new file, retaining proposal validation compatibility.
 * @param ctx - Filesystem service.
 * @param session - Calling chat's project/proposal records.
 * @param project - Current source snapshot.
 * @param request - Version-1 operations JSON.
 * @param outputPath - New draft beside the source.
 * @param expectedHash - Baseline hash reviewed during preparation.
 * @param limits - Operation and byte limits.
 * @param signal - Cancellation for filesystem operations.
 * @returns Proposal identity, hash-bound changes and static validation; no SDK or controller operations.
 */


/** One positive integer field of an FBD node. */
function fbdId(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new EngineeringError('INVALID_CHANGE_SET', `${what} must be a non-negative integer`)
  return value
}

/** Validate the block list of an FBD sheet. */
function fbdBlocks(value: unknown): readonly FbdBlockOp[] {
  if (!Array.isArray(value) || value.length === 0) throw new EngineeringError('INVALID_CHANGE_SET', 'blocks must be a non-empty array')
  return value.map((entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null) throw new EngineeringError('INVALID_CHANGE_SET', `blocks[${index}] must be an object`)
    const row = entry as Record<string, unknown>
    const type = String(row.type ?? '').toUpperCase()
    if (instructionByName(type) === undefined) throw new EngineeringError('UNKNOWN_INSTRUCTION', `Block type "${type}" is not a catalogued instruction`)
    const pins = Array.isArray(row.pins) ? row.pins.map(pin => String(pin)) : []
    if (pins.length === 0) throw new EngineeringError('INVALID_CHANGE_SET', `blocks[${index}].pins must name the pins the block shows`)
    if (new Set(pins).size !== pins.length) throw new EngineeringError('INVALID_CHANGE_SET', `blocks[${index}].pins repeats a pin`)
    const structure = String(row.structure ?? '')
    if (structure === '') throw new EngineeringError('INVALID_CHANGE_SET', `blocks[${index}].structure must name the block's structure type, for example FBD_MATH`)
    return {
      id: fbdId(row.id, `blocks[${index}].id`),
      type,
      tag: String(row.tag ?? ''),
      structure,
      pins,
      ...(row.x === undefined ? {} : { x: fbdId(row.x, `blocks[${index}].x`) }),
      ...(row.y === undefined ? {} : { y: fbdId(row.y, `blocks[${index}].y`) }),
    }
  })
}

/** Validate the reference list of an FBD sheet. */
function fbdRefs(value: unknown): readonly FbdRefOp[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new EngineeringError('INVALID_CHANGE_SET', 'refs must be an array')
  return value.map((entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null) throw new EngineeringError('INVALID_CHANGE_SET', `refs[${index}] must be an object`)
    const row = entry as Record<string, unknown>
    const direction = row.direction
    if (direction !== 'in' && direction !== 'out') throw new EngineeringError('INVALID_CHANGE_SET', `refs[${index}].direction must be "in" or "out"`)
    return {
      id: fbdId(row.id, `refs[${index}].id`),
      direction,
      tag: String(row.tag ?? ''),
      ...(row.x === undefined ? {} : { x: fbdId(row.x, `refs[${index}].x`) }),
      ...(row.y === undefined ? {} : { y: fbdId(row.y, `refs[${index}].y`) }),
    }
  })
}

/** Validate the wire list of an FBD sheet. */
function fbdWires(value: unknown): readonly FbdWireOp[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new EngineeringError('INVALID_CHANGE_SET', 'wires must be an array')
  return value.map((entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null) throw new EngineeringError('INVALID_CHANGE_SET', `wires[${index}] must be an object`)
    const row = entry as Record<string, unknown>
    return {
      from: fbdId(row.from, `wires[${index}].from`),
      to: fbdId(row.to, `wires[${index}].to`),
      ...(row.from_pin === undefined ? {} : { from_pin: String(row.from_pin) }),
      ...(row.to_pin === undefined ? {} : { to_pin: String(row.to_pin) }),
    }
  })
}

/**
 * One FBD sheet, in the shape Studio writes and accepts.
 *
 * Verified against Logix Designer 37: a block is an instance, so its tag must carry the block's
 * structure type (FBD_MATH for ADD); input wires name ToParam, output wires name FromParam.
 */
export function fbdSheetXml(operation: Extract<Operation, { operation: 'insert_fbd_sheet' }>): string {
  const ids = new Map<number, 'block' | 'ref'>()
  const pins = new Map<number, ReadonlySet<string>>()
  for (const block of operation.blocks) {
    if (ids.has(block.id)) throw new EngineeringError('INVALID_CHANGE_SET', `Node id ${block.id} is used twice`)
    ids.set(block.id, 'block')
    pins.set(block.id, new Set(block.pins))
  }
  for (const ref of operation.refs) {
    if (ids.has(ref.id)) throw new EngineeringError('INVALID_CHANGE_SET', `Node id ${ref.id} is used twice`)
    ids.set(ref.id, 'ref')
  }
  for (const wire of operation.wires) {
    const from = ids.get(wire.from)
    const to = ids.get(wire.to)
    if (from === undefined || to === undefined) throw new EngineeringError('INVALID_CHANGE_SET', `A wire names id ${wire.from} or ${wire.to}, which no node uses`)
    if (from === 'block' && wire.from_pin === undefined) throw new EngineeringError('INVALID_CHANGE_SET', `The wire from block ${wire.from} must name from_pin`)
    if (to === 'block' && wire.to_pin === undefined) throw new EngineeringError('INVALID_CHANGE_SET', `The wire into block ${wire.to} must name to_pin`)
    if (wire.from_pin !== undefined && pins.get(wire.from)?.has(wire.from_pin) !== true) throw new EngineeringError('INVALID_CHANGE_SET', `Block ${wire.from} does not show pin "${wire.from_pin}"`)
    if (wire.to_pin !== undefined && pins.get(wire.to)?.has(wire.to_pin) !== true) throw new EngineeringError('INVALID_CHANGE_SET', `Block ${wire.to} does not show pin "${wire.to_pin}"`)
  }

  // One sheet cannot both drive and read a tag: Studio aborts the import for it. Chained blocks
  // are wired directly, and a tag written on one sheet is read on another.
  const written = new Set(operation.refs.filter(ref => ref.direction === 'out').map(ref => ref.tag.toLowerCase()))
  for (const ref of operation.refs) {
    if (ref.direction === 'in' && written.has(ref.tag.toLowerCase())) {
      throw new EngineeringError('INVALID_CHANGE_SET',
        `Sheet ${operation.sheet} both writes and reads tag "${ref.tag}", which Studio refuses to import.`,
        'Wire the blocks to each other directly (from_pin on the driving block, to_pin on the reading block), or move the read to another sheet.')
    }
  }

  const parts: string[] = []
  for (const ref of operation.refs) {
    const kind = ref.direction === 'in' ? 'IRef' : 'ORef'
    parts.push(`<${kind} ID="${ref.id}" X="${ref.x ?? 180}" Y="${ref.y ?? 60}" Operand="${escapeXml(ref.tag)}" HideDesc="false"/>`)
  }
  for (const block of operation.blocks) {
    parts.push(`<Block Type="${block.type}" ID="${block.id}" X="${block.x ?? 300}" Y="${block.y ?? 20}" Operand="${escapeXml(block.tag)}" VisiblePins="${escapeXml(block.pins.join(' '))}" HideDesc="false"/>`)
  }
  for (const wire of operation.wires) {
    const fromPin = wire.from_pin === undefined ? '' : ` FromParam="${escapeXml(wire.from_pin)}"`
    const toPin = wire.to_pin === undefined ? '' : ` ToParam="${escapeXml(wire.to_pin)}"`
    parts.push(`<Wire FromID="${wire.from}"${fromPin} ToID="${wire.to}"${toPin}/>`)
  }
  return `<Sheet Number="${operation.sheet}">${parts.join('')}</Sheet>`
}

/** Escape an attribute value. */
function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}


/** Validate an SFC step list. */
function sfcSteps(value: unknown): readonly SfcStepOp[] {
  if (!Array.isArray(value) || value.length === 0) throw new EngineeringError('INVALID_CHANGE_SET', 'steps must be a non-empty array')
  const steps = value.map((entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null) throw new EngineeringError('INVALID_CHANGE_SET', `steps[${index}] must be an object`)
    const row = entry as Record<string, unknown>
    const actions = Array.isArray(row.actions) ? row.actions.map((action: unknown, at: number) => {
      if (typeof action !== 'object' || action === null) throw new EngineeringError('INVALID_CHANGE_SET', `steps[${index}].actions[${at}] must be an object`)
      const item = action as Record<string, unknown>
      return {
        id: fbdId(item.id, `steps[${index}].actions[${at}].id`),
        name: String(item.name ?? ''),
        qualifier: String(item.qualifier ?? 'NonStored'),
        ...(item.boolean === undefined ? {} : { boolean: item.boolean === true }),
      }
    }) : undefined
    return {
      id: fbdId(row.id, `steps[${index}].id`),
      name: String(row.name ?? ''),
      ...(row.initial === undefined ? {} : { initial: row.initial === true }),
      ...(row.x === undefined ? {} : { x: fbdId(row.x, `steps[${index}].x`) }),
      ...(row.y === undefined ? {} : { y: fbdId(row.y, `steps[${index}].y`) }),
      ...(actions === undefined ? {} : { actions }),
    }
  })
  const initials = steps.filter(step => step.initial === true).length
  if (initials !== 1) throw new EngineeringError('INVALID_CHANGE_SET', `An SFC chart needs exactly one initial step; this one has ${initials}.`, 'Mark one step with initial: true.')
  return steps
}

/** Validate an SFC transition list. */
function sfcTransitions(value: unknown): readonly SfcTransitionOp[] {
  if (!Array.isArray(value) || value.length === 0) throw new EngineeringError('INVALID_CHANGE_SET', 'transitions must be a non-empty array')
  return value.map((entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null) throw new EngineeringError('INVALID_CHANGE_SET', `transitions[${index}] must be an object`)
    const row = entry as Record<string, unknown>
    const condition = String(row.condition ?? '')
    if (condition.trim() === '') throw new EngineeringError('INVALID_CHANGE_SET', `transitions[${index}].condition must be Structured Text`)
    return {
      id: fbdId(row.id, `transitions[${index}].id`),
      name: String(row.name ?? ''),
      condition,
      ...(row.x === undefined ? {} : { x: fbdId(row.x, `transitions[${index}].x`) }),
      ...(row.y === undefined ? {} : { y: fbdId(row.y, `transitions[${index}].y`) }),
    }
  })
}

/** Validate an SFC link list against the nodes. */
function sfcLinks(value: unknown): readonly SfcLinkOp[] {
  if (!Array.isArray(value) || value.length === 0) throw new EngineeringError('INVALID_CHANGE_SET', 'links must be a non-empty array')
  return value.map((entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null) throw new EngineeringError('INVALID_CHANGE_SET', `links[${index}] must be an object`)
    const row = entry as Record<string, unknown>
    return {
      from: fbdId(row.from, `links[${index}].from`),
      to: fbdId(row.to, `links[${index}].to`),
      ...(row.show === undefined ? {} : { show: row.show === true }),
    }
  })
}

/**
 * One SFC chart in the shape Studio writes: steps with optional actions, transitions with a
 * Structured Text condition, and directed links. Studio adds no Sheet element here.
 *
 * Positions are presentation, not structure, so Studio accepts a chart whose steps all land on one
 * point - it simply draws one box on top of the other. The defaults therefore lay the chart out the
 * way Studio does: steps down the sheet at a 200 pitch, each transition between the steps it links.
 * An explicit x/y still wins.
 */
export function sfcChartXml(operation: Extract<Operation, { operation: 'insert_sfc_sheet' }>): string {
  const ids = new Set<number>()
  const claim = (id: number, what: string): void => {
    if (ids.has(id)) throw new EngineeringError('INVALID_CHANGE_SET', `Node id ${id} is used twice (${what})`)
    ids.add(id)
  }
  for (const step of operation.steps) {
    claim(step.id, 'step')
    for (const action of step.actions ?? []) claim(action.id, 'action')
  }
  for (const transition of operation.transitions) claim(transition.id, 'transition')
  for (const link of operation.links) {
    if (!ids.has(link.from) || !ids.has(link.to)) throw new EngineeringError('INVALID_CHANGE_SET', `A link names id ${link.from} or ${link.to}, which no step or transition uses`)
  }
  const parts: string[] = []
  // The Y a step takes when the caller gave none: declaration order runs down the sheet.
  const stepY = new Map<number, number>()
  for (const [index, step] of operation.steps.entries()) stepY.set(step.id, step.y ?? 100 + index * 200)
  for (const step of operation.steps) {
    const x = step.x ?? 300
    const y = stepY.get(step.id) ?? 100
    const head = `<Step ID="${step.id}" X="${x}" Y="${y}" Operand="${escapeXml(step.name)}" HideDesc="false" DescX="${x + 40}" DescY="${y - 20}" DescWidth="0" InitialStep="${step.initial === true ? 'true' : 'false'}" PresetUsesExpr="false" LimitHighUsesExpr="false" LimitLowUsesExpr="false" ShowActions="true"`
    const actions = step.actions ?? []
    if (actions.length === 0) { parts.push(`${head}/>`); continue }
    const body = actions.map(action => `<Action ID="${action.id}" Operand="${escapeXml(action.name)}" Qualifier="${escapeXml(action.qualifier)}" IsBoolean="${action.boolean === false ? 'false' : 'true'}" PresetUsesExpr="false"/>`).join('')
    parts.push(`${head}>${body}</Step>`)
  }
  for (const [index, transition] of operation.transitions.entries()) {
    const x = transition.x ?? 300
    // Between the two steps it joins when the links say which those are; otherwise its own slot.
    const from = operation.links.find(link => link.to === transition.id && stepY.has(link.from))
    const to = operation.links.find(link => link.from === transition.id && stepY.has(link.to))
    const fromY = from === undefined ? undefined : stepY.get(from.from)
    const toY = to === undefined ? undefined : stepY.get(to.to)
    const y = transition.y ?? (fromY === undefined || toY === undefined ? 200 + index * 200 : Math.round((fromY + toY) / 2))
    const lines = transition.condition.split(/\r?\n/u).filter(line => line.trim() !== '')
      .map((line, lineIndex) => `<Line Number="${lineIndex}"><![CDATA[${line}]]></Line>`).join('')
    parts.push(`<Transition ID="${transition.id}" X="${x}" Y="${y}" Operand="${escapeXml(transition.name)}" HideDesc="false" DescX="${x + 60}" DescY="${y - 20}" DescWidth="0"><Condition><STContent>${lines}</STContent></Condition></Transition>`)
  }
  for (const link of operation.links) {
    parts.push(`<DirectedLink FromID="${link.from}" ToID="${link.to}" Show="${link.show === false ? 'false' : 'true'}"/>`)
  }
  return parts.join('')
}


/** Member values of an SFC tag, in the order Studio writes them. */
function sfcTagXml(operation: Extract<Operation, { operation: 'add_sfc_tag' }>): string {
  const member = (name: string, type: string, value: string, radix?: string): string =>
    `<DataValueMember Name="${name}" DataType="${type}"${radix === undefined ? '' : ` Radix="${radix}"`} Value="${value}"/>`
  if (operation.kind === 'transition') {
    return `<Tag Name="${operation.name}" TagType="Base" DataType="BOOL" Radix="Decimal" Constant="false" ExternalAccess="Read/Write"/>`
  }
  const members = operation.kind === 'step'
    ? [
        member('Status', 'DINT', operation.initial === true ? '16#a020_0201' : '16#0020_0201', 'Hex'),
        member('X', 'BOOL', operation.initial === true ? '1' : '0'),
        member('FS', 'BOOL', '0'),
        member('SA', 'BOOL', operation.initial === true ? '1' : '0'),
        member('LS', 'BOOL', '0'),
        member('DN', 'BOOL', '0'),
        member('OV', 'BOOL', '0'),
        member('AlarmEn', 'BOOL', '0'),
        member('AlarmLow', 'BOOL', '0'),
        member('AlarmHigh', 'BOOL', '0'),
        member('Reset', 'BOOL', '0'),
        member('PauseTimer', 'BOOL', '1'),
        member('PRE', 'DINT', '0'),
        member('T', 'DINT', '0'),
        member('TMax', 'DINT', '0'),
        member('Count', 'DINT', '0'),
        member('LimitLow', 'DINT', '0'),
        member('LimitHigh', 'DINT', '0'),
      ].join('')
    : [
        member('Status', 'DINT', '16#0020_0000', 'Hex'),
        member('A', 'BOOL', '0'),
        member('Q', 'BOOL', '0'),
        member('PauseTimer', 'BOOL', '1'),
        member('PRE', 'DINT', '100'),
        member('T', 'DINT', '0'),
        member('Count', 'DINT', '0'),
      ].join('')
  const type = operation.kind === 'step' ? 'SFC_STEP' : 'SFC_ACTION'
  return `<Tag Name="${operation.name}" TagType="Base" DataType="${type}" Constant="false" ExternalAccess="Read/Write"><Data Format="Decorated"><Structure DataType="${type}">${members}</Structure></Data></Tag>`
}
