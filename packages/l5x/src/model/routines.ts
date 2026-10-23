/**
 * Routine reader — ladder as NeutralText with rung comments, Structured Text
 * as its lines.
 *
 * A ladder rung is returned as the compact NeutralText the export already
 * stores, e.g. `XIC(Motor_Start)XIO(Motor_Fault)OTE(Motor_Run);`, which is what
 * makes one rung a single readable line instead of its graphical XML. Any other
 * routine language is reported by name rather than decomposed.
 */

import type { L5xDocument, L5xRoutine, L5xRoutineBody, L5xRoutineInfo, L5xRung } from './types.ts'
import { descriptionOf, programElements } from './module.ts'
import { attribute, elementChildren, firstChild, nodeText, optionalAttribute, type XmlElement } from './xml.ts'
import type { L5xDiagramNode } from './types.ts'

/** The language code a ladder routine carries. */
const LADDER = 'RLL'

/** The language code a Structured Text routine carries. */
const STRUCTURED_TEXT = 'ST'

/**
 * List routines with the size of each body.
 *
 * The listing names the program, so a caller can pass the name back to
 * {@link getRoutine}. Only the count for the routine's own language is
 * reported, which is why at most one count is ever present.
 *
 * @param document - The parsed project.
 * @param program - Program name to restrict to; empty or omitted keeps every program.
 * @returns One entry per routine, in written order.
 */
export function listRoutines(document: L5xDocument, program = ''): readonly L5xRoutineInfo[] {
  const routines = program === '' ? document.routines : document.routines.filter(routine => routine.program === program)
  return routines.map(routineInfoOf)
}

/**
 * Read one routine's body.
 *
 * @param document - The parsed project.
 * @param program - Program holding the routine.
 * @param routineName - Routine name.
 * @returns The routine, or undefined when that program has no such routine.
 */
export function getRoutine(document: L5xDocument, program: string, routineName: string): L5xRoutine | undefined {
  return document.routines.find(routine => routine.program === program && routine.name === routineName)
}

/**
 * Read every program's routines of a controller.
 *
 * @param controller - The controller element.
 * @returns The routines, in program then written order.
 */
export function buildRoutines(controller: XmlElement): readonly L5xRoutine[] {
  const routines: L5xRoutine[] = []
  for (const program of programElements(controller)) {
    const programName = optionalAttribute(program, 'Name', '')
    const elements = firstChild(program, 'Routines')
    if (elements === undefined) continue
    for (const routine of elementChildren(elements, 'Routine')) routines.push(routineBody(programName, routine))
  }
  return routines
}

/**
 * Decode one routine element's body.
 *
 * Add-on instructions read their internal routines through this, so an AOI's
 * ladder and Structured Text are decoded exactly as a program's are.
 *
 * @param owner - Program or add-on instruction the routine belongs to.
 * @param routine - The `<Routine>` element.
 * @returns The routine with its body decoded.
 */
export function routineBody(owner: string, routine: XmlElement): L5xRoutine {
  const type = optionalAttribute(routine, 'Type', '')
  return {
    program: owner,
    name: optionalAttribute(routine, 'Name', ''),
    type,
    description: descriptionOf(routine),
    body: decodeBody(type, routine),
  }
}

/** A listing entry for one routine already read. */
function routineInfoOf(routine: L5xRoutine): L5xRoutineInfo {
  const entry = {
    program: routine.program,
    name: routine.name,
    type: routine.type,
    description: routine.description,
  }
  if (routine.body.type === LADDER) return { ...entry, rungCount: routine.body.rungs.length }
  if (routine.body.type === STRUCTURED_TEXT) return { ...entry, lineCount: splitLines(routine.body.code).length }
  return entry
}

/**
 * The numbered lines of a Structured Text body.
 *
 * An empty body has no lines: the reader joins the export's lines with `\n`, so
 * a body of no lines and a body of one empty line both read as `''`, and the
 * export's own line count is what a listing reports.
 *
 * @param code - A Structured Text body.
 * @returns One entry per line, numbered from zero in body order.
 */
export function splitLines(code: string): readonly { readonly number: number; readonly text: string }[] {
  if (code === '') return []
  return code.split('\n').map((text, number) => ({ number, text }))
}

/** The body of a routine, by its declared language. */
function decodeBody(type: string, routine: XmlElement): L5xRoutineBody {
  if (type === LADDER) return { type: LADDER, rungs: decodeRungs(routine) }
  if (type === STRUCTURED_TEXT) return { type: STRUCTURED_TEXT, code: decodeLines(routine).join('\n') }
  if ((type === 'FBD' && firstChild(routine, 'FBDContent') !== undefined) || (type === 'SFC' && firstChild(routine, 'SFCContent') !== undefined)) {
    return { type, nodes: decodeDiagram(routine, type === 'FBD' ? 'FBDContent' : 'SFCContent') }
  }
  return { type: 'other', note: `${type} detailed parsing not yet supported` }
}

function decodeDiagram(routine: XmlElement, contentName: string): readonly L5xDiagramNode[] {
  const content = firstChild(routine, contentName)
  if (content === undefined) return []
  const nodes: L5xDiagramNode[] = []
  for (const sheet of elementChildren(content, 'Sheet')) {
    const number = Number.parseInt(sheet.attrs['Number'] ?? '0', 10)
    const visit = (child: XmlElement): void => {
      const text = nodeText(child)
      if (Object.keys(child.attrs).length > 0 || text !== undefined) {
        const node: L5xDiagramNode = {
          kind: child.name, sheet: number,
          ...(child.attrs['ID'] === undefined ? {} : { id: child.attrs['ID'] }),
          ...(child.attrs['Operand'] === undefined ? {} : { operand: child.attrs['Operand'] }),
          ...(child.attrs['FromID'] === undefined ? {} : { fromId: child.attrs['FromID'] }),
          ...(child.attrs['ToID'] === undefined ? {} : { toId: child.attrs['ToID'] }),
          ...(text === undefined ? {} : { text }),
        }
        nodes.push(node)
      }
      for (const nested of child.children) if ('attrs' in nested) visit(nested)
    }
    for (const child of sheet.children) if ('attrs' in child) visit(child)
  }
  return nodes
}

/**
 * One ladder routine's rungs, as NeutralText with their comments.
 *
 * @param routine - The `<Routine>` element of a ladder routine.
 * @returns One entry per rung, in written order.
 */
export function decodeRungs(routine: XmlElement): readonly L5xRung[] {
  const content = firstChild(routine, 'RLLContent')
  if (content === undefined) return []
  return elementChildren(content, 'Rung').map(decodeRung)
}

/** A Structured Text routine's source lines, verbatim and in written order. */
function decodeLines(routine: XmlElement): readonly string[] {
  const content = firstChild(routine, 'STContent')
  if (content === undefined) return []
  return elementChildren(content, 'Line').map(line => nodeText(line) ?? '')
}

/**
 * One rung as NeutralText, with its comment when the export carries one.
 *
 * @param rung - The `<Rung>` element.
 * @returns The rung, with empty text when the export wrote none.
 */
function decodeRung(rung: XmlElement): L5xRung {
  const textElement = firstChild(rung, 'Text')
  const text = textElement === undefined ? '' : (nodeText(textElement) ?? '').trim()
  const comment = optionalAttribute(rung, 'Comment', '')
  const number = Number.parseInt(attribute(rung, 'Number'), 10)
  if (comment === '') return { number, text }
  return { number, comment, text }
}
