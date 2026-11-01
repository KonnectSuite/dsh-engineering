import { documentRoot, elementChildren, firstChild, parseXml, type XmlElement, type XmlNode } from '../model/xml.ts'
import { EngineeringError, type ProjectSnapshot } from '../session.ts'
import { reviewDownloadSource } from './download-review.ts'

function controller(project: ProjectSnapshot): XmlElement {
  const node = firstChild(documentRoot(parseXml(project.xml)), 'Controller')
  if (project.exportKind !== 'controller' || node === undefined) throw new EngineeringError('CONTROLLER_EXPORT_REQUIRED', 'A full controller export is required')
  return node
}

function named(parent: XmlElement | undefined, kind: string, name: string): XmlElement {
  const matches = parent === undefined ? [] : elementChildren(parent, kind).filter(node => node.attrs.Name === name)
  if (matches.length === 0) throw new EngineeringError('COMPONENT_NOT_FOUND', `No ${kind} named ${name} in this project.`, 'Call project_overview to confirm the project state, then retry.')
  if (matches.length > 1) throw new EngineeringError('AMBIGUOUS_TARGET', `Expected one ${kind} named ${name}; found ${matches.length}`, 'More than one ' + kind + ' matches this name; narrow the target.')
  return matches[0]!
}

/** Compare every controller XML structure, including fields not modeled by the index. */
function canonical(node: XmlNode, omit?: XmlElement, ignoreModifiedDate = false, ignoreEncodedPayload = false): unknown {
  if (node === omit) return '#target-routine'
  if (!('children' in node)) return node.name === '#comment' || node.text.trim() === '' ? null : ['text', node.text]
  const attrs = Object.entries(node.attrs).filter(([key]) => !(ignoreModifiedDate && node.name === 'Controller' && key === 'LastModifiedDate'))
  const children = node.children.filter(child => !(ignoreEncodedPayload && node.name === 'EncodedData' && !('children' in child)))
  return [node.name, attrs.sort(([a], [b]) => a.localeCompare(b)), children.map(child => canonical(child, omit, ignoreModifiedDate, ignoreEncodedPayload)).filter(value => value !== null)]
}

export function controllerContent(project: ProjectSnapshot, ignoreModifiedDate = false, ignoreEncodedPayload = false): string {
  return JSON.stringify(canonical(controller(project), undefined, ignoreModifiedDate, ignoreEncodedPayload))
}

/** Validate one edited routine component for review in the user's IDE.
 * @param baseline - original routine export from Studio.
 * @param draft - unchanged-on-disk proposal derived from that export.
 * @param program - intended containing program.
 * @param routine - intended existing routine.
 * @returns import target and source identity; no Studio import or controller operation occurs.
 */
export function studioRoutineImportPlan(baseline: ProjectSnapshot, draft: ProjectSnapshot, program: string, routine: string): object {
  for (const value of [program, routine]) if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) throw new EngineeringError('INVALID_TARGET', 'Program and routine must be Logix identifiers')
  const before = documentRoot(parseXml(baseline.xml)); const after = documentRoot(parseXml(draft.xml))
  if (before.attrs.TargetType !== 'Routine' || before.attrs.TargetName !== routine
      || after.attrs.TargetType !== 'Routine' || after.attrs.TargetName !== routine) {
    throw new EngineeringError('ROUTINE_COMPONENT_REQUIRED', 'Export the selected routine from the visible IDE first; full controller exports cannot be used as routine import files')
  }
  const beforeController = firstChild(before, 'Controller'); const afterController = firstChild(after, 'Controller')
  if (beforeController === undefined || afterController === undefined) throw new EngineeringError('INVALID_COMPONENT', 'Routine export requires controller context')
  const oldProgram = named(firstChild(beforeController, 'Programs'), 'Program', program)
  const newProgram = named(firstChild(afterController, 'Programs'), 'Program', program)
  const oldRoutine = named(firstChild(oldProgram, 'Routines'), 'Routine', routine)
  const newRoutine = named(firstChild(newProgram, 'Routines'), 'Routine', routine)
  const protectedNode = (node: XmlNode): boolean => 'children' in node && (node.name === 'EncodedData'
    || /safety/iu.test(node.attrs.Class ?? '')
    || Object.entries(node.attrs).some(([key, value]) => /Encrypted|SourceProtected/iu.test(key) && value !== 'false')
    || node.children.some(protectedNode))
  if (protectedNode(before) || protectedNode(after) || /safety/iu.test(program)) throw new EngineeringError('PROTECTED_TARGET', 'Safety or protected components require the engineer workflow')
  if (!['RLL', 'ST'].includes(oldRoutine.attrs.Type ?? '') || oldRoutine.attrs.Type !== newRoutine.attrs.Type
      || oldRoutine.attrs.Use !== 'Target' || newRoutine.attrs.Use !== 'Target') throw new EngineeringError('UNSUPPORTED_TARGET', 'Use an existing unprotected RLL or ST routine exported as Target')
  if (JSON.stringify(canonical(before, oldRoutine)) !== JSON.stringify(canonical(after, newRoutine))) throw new EngineeringError('UNRELATED_CHANGE', 'Only the selected routine may change; preserve dependency and export context')
  if (JSON.stringify(canonical(oldRoutine)) === JSON.stringify(canonical(newRoutine))) throw new EngineeringError('NO_CHANGE', 'Routine is unchanged')
  return {
    operation: 'studio_ide_routine_import_plan', program, routine, routine_type: newRoutine.attrs.Type,
    controller_name: beforeController?.attrs.Name ?? null, source_path: baseline.path, source_sha256: baseline.sha256,
    component_path: draft.path, component_sha256: draft.sha256, software_revision: baseline.softwareRevision,
    validation: { xml: 'passed', source_and_draft_hashes: 'checked_by_calling_tool', changes_confined_to_routine: true, studio_import: 'not_run', studio_verify: 'not_run', machine_behavior: 'not_verified' },
    controller_contacted: false, ide_modified: false,
    steps: ['Observe the same Studio IDE and confirm the saved project, program, routine and offline state.',
      'Back up the saved project before replacement. Revalidate the proposal immediately before import.',
      'Navigate to the intended program routine import command using fresh observed UI controls; choose component_path.',
      'Review the collision preview: replace only this routine, retain existing dependencies, and stop for unexpected changes.',
      'After import, run Verify in Studio and inspect its diagnostics; unresolved errors block handoff.',
      'Present the result for engineering review. The engineer performs download; do not accept online edits or change controller mode through UI automation.'],
  }
}

export function routineEditPlan(baseline: ProjectSnapshot, draft: ProjectSnapshot, program: string, routine: string): { xpath: string } {
  for (const value of [program, routine]) if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) throw new EngineeringError('INVALID_TARGET', 'Program and routine must be Logix identifiers')
  const before = controller(baseline); const after = controller(draft)
  const oldProgram = named(firstChild(before, 'Programs'), 'Program', program)
  const newProgram = named(firstChild(after, 'Programs'), 'Program', program)
  const tasks = firstChild(before, 'Tasks')
  const safetyScheduled = tasks !== undefined && elementChildren(tasks, 'Task').some(task => /safety/iu.test(task.attrs.Class ?? '')
    && firstChild(task, 'ScheduledPrograms')?.children.some(child => 'attrs' in child && child.attrs.Name === program))
  if (/safety/iu.test(oldProgram.attrs.Class ?? '') || /safety/iu.test(program)
      || safetyScheduled
      || baseline.document.tasks.some(task => /safety/iu.test(task.name) && task.programs.includes(program)))
    throw new EngineeringError('PROTECTED_TARGET', 'Safety programs cannot be imported through the ACD edit tool')
  const oldRoutine = named(firstChild(oldProgram, 'Routines'), 'Routine', routine)
  const newRoutine = named(firstChild(newProgram, 'Routines'), 'Routine', routine)
  if (/safety/iu.test(oldRoutine.attrs.Class ?? '') || /safety/iu.test(newRoutine.attrs.Class ?? ''))
    throw new EngineeringError('PROTECTED_TARGET', 'Safety routines cannot be edited')
  if (!['RLL', 'ST'].includes(oldRoutine.attrs.Type ?? '') || oldRoutine.attrs.Type !== newRoutine.attrs.Type)
    throw new EngineeringError('UNSUPPORTED_TARGET', 'Only existing RLL and ST routines of the same type are supported')
  const protectedRoutine = (node: XmlElement): boolean => node.name === 'EncodedData'
    || Object.entries(node.attrs).some(([key, value]) => /Encrypted|SourceProtected/iu.test(key) && value !== 'false')
    || node.children.some(child => 'children' in child && protectedRoutine(child))
  if (protectedRoutine(oldRoutine) || protectedRoutine(newRoutine)) throw new EngineeringError('PROTECTED_TARGET', 'Encoded or protected routines cannot be edited')
  const review = reviewDownloadSource(baseline, draft)
  if (!review.eligible) throw new EngineeringError('EDIT_BLOCKED', review.blockers.join('; '))
  if (JSON.stringify(canonical(before, oldRoutine)) !== JSON.stringify(canonical(after, newRoutine)))
    throw new EngineeringError('UNRELATED_CHANGE', 'The draft must change only the selected routine; tags, modules, other logic and controller metadata must remain intact')
  if (JSON.stringify(canonical(oldRoutine)) === JSON.stringify(canonical(newRoutine))) throw new EngineeringError('NO_CHANGE', 'Selected routine is unchanged')
  return { xpath: `Controller/Programs/Program[@Name='${program}']/Routines/Routine[@Name='${routine}']` }
}
