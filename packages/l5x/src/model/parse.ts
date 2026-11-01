/**
 * Parse — turn an `.l5x` export into the document every reader answers from.
 *
 * Parsing is eager and total: one pass builds the controller summary, programs,
 * tasks, routines, tags, types, instructions, and modules, so a later read never
 * re-walks the XML and the same text always yields the same entries. Building
 * everything up front is what lets a caller parse once and ask many questions.
 */

import type { L5xAlarm, L5xControllerSummary, L5xDocument, L5xProgram, L5xTask } from './types.ts'
import { L5xParseError } from './errors.ts'
import { controllerElement, descriptionOf, programElements, L5X_ROOT_TAG } from './module.ts'
import { documentRoot, elementChildren, firstChild, optionalAttribute, parseXml, type XmlElement } from './xml.ts'
import { buildRoutines } from './routines.ts'
import { buildTags } from './tags.ts'
import { buildUdts, vendorTypeNames } from './udts.ts'
import { buildAois } from './aois.ts'
import { buildModules } from './modules.ts'

/** Controller elements of documents already parsed, so a reader can walk them. */
const controllerElements = new WeakMap<L5xDocument, XmlElement>()

/**
 * Parse a Studio 5000 L5X export.
 *
 * @param xml - The export's text.
 * @returns The parsed document, with every reader's answer already built.
 * @throws L5xParseError When the text is not well-formed XML, when its root
 * element is not `<RSLogix5000Content>`, or when it has no `<Controller>`.
 */
export function loadL5x(xml: string): L5xDocument {
  const root = documentRoot(parseXml(xml))
  if (root.name !== L5X_ROOT_TAG) {
    throw new L5xParseError(`Not an L5X file (root element is <${root.name}>, expected <${L5X_ROOT_TAG}>)`)
  }
  const controller = controllerElement(root)
  const document: L5xDocument = {
    controller: controllerSummary(controller),
    programs: buildPrograms(controller),
    tasks: buildTasks(controller),
    routines: buildRoutines(controller),
    tags: buildTags(controller),
    udts: buildUdts(controller),
  vendorTypes: vendorTypeNames(controller),
    aois: buildAois(controller),
    modules: buildModules(controller),
    alarms: buildAlarms(controller),
  }
  controllerElements.set(document, controller)
  return document
}

function buildAlarms(controller: XmlElement): readonly L5xAlarm[] {
  const results: L5xAlarm[] = []
  const visit = (element: XmlElement): void => {
    if (element.name === 'Alarm' || element.name === 'TagBasedAlarm') {
      results.push({ name: optionalAttribute(element, 'Name', ''), kind: element.name, description: descriptionOf(element) })
    }
    for (const child of element.children) if ('attrs' in child) visit(child)
  }
  visit(controller)
  return results
}

/**
 * The document element behind a parsed document.
 *
 * The document reports a controller *summary*, so a reader that walks the XML
 * asks for the element here rather than re-parsing the export. A consumer needs
 * this only to reach an element-level reader; every document-level read answers
 * from the parsed document alone.
 *
 * @param document - A document from {@link loadL5x}.
 * @returns That document's controller element.
 * @throws L5xParseError When the document was not produced by {@link loadL5x}.
 */
export function controllerElementOf(document: L5xDocument): XmlElement {
  const controller = controllerElements.get(document)
  if (controller === undefined) throw new L5xParseError('Not a parsed document: no controller element')
  return controller
}

/** The controller's own metadata. */
function controllerSummary(controller: XmlElement): L5xControllerSummary {
  return {
    name: optionalAttribute(controller, 'Name', ''),
    processorType: optionalAttribute(controller, 'ProcessorType', ''),
    description: descriptionOf(controller),
    majorRev: optionalAttribute(controller, 'MajorRev', ''),
    minorRev: optionalAttribute(controller, 'MinorRev', ''),
  }
}

/** The controller's programs. */
function buildPrograms(controller: XmlElement): readonly L5xProgram[] {
  return programElements(controller).map(program => ({
    name: optionalAttribute(program, 'Name', ''),
    safety: /safety/iu.test(optionalAttribute(program, 'Class', '')),
    mainRoutine: optionalAttribute(program, 'MainRoutineName', ''),
    description: descriptionOf(program),
  }))
}

/** The controller's tasks and what each schedules. */
function buildTasks(controller: XmlElement): readonly L5xTask[] {
  const tasks = firstChild(controller, 'Tasks')
  if (tasks === undefined) return []
  return elementChildren(tasks, 'Task').map(task => ({
    name: optionalAttribute(task, 'Name', ''),
    type: optionalAttribute(task, 'Type', ''),
    rate: optionalAttribute(task, 'Rate', ''),
    priority: optionalAttribute(task, 'Priority', ''),
    description: descriptionOf(task),
    programs: scheduledPrograms(task),
    safety: /safety/iu.test(optionalAttribute(task, 'Class', '')),
  }))
}

/** The program names one task schedules. */
function scheduledPrograms(task: XmlElement): readonly string[] {
  const scheduled = firstChild(task, 'ScheduledPrograms')
  if (scheduled === undefined) return []
  return elementChildren(scheduled, 'ScheduledProgram').map(program => optionalAttribute(program, 'Name', ''))
}
