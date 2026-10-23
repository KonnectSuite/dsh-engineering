import type { Project } from './model.ts'

/** One static inspection finding from a saved L5X export. */
export interface Finding {
  readonly severity: 'warning' | 'info'
  readonly code: string
  readonly location: string
  readonly message: string
  readonly evidence: string
}

/**
 * Source-backed review hints. These are not Studio 5000 build diagnostics.
 * @param project - Saved controller export projection.
 * @returns Static findings without changing the controller export.
 */
export function inspectProject(project: Project): Finding[] {
  const findings: Finding[] = []
  const programs = new Map(project.programs.map(program => [program.name.toLowerCase(), program]))
  const scheduled = new Map<string, string[]>()
  for (const task of project.tasks) for (const name of task.programs) {
    const key = name.toLowerCase()
    scheduled.set(key, [...(scheduled.get(key) ?? []), task.name])
    if (!programs.has(key)) findings.push({ severity: 'warning', code: 'missing-scheduled-program', location: `Task ${task.name}`,
      message: `Scheduled program ${name} is absent from this export.`, evidence: `${task.name} → ${name}` })
  }
  for (const program of project.programs) {
    const location = `Program ${program.name}`
    const owners = scheduled.get(program.name.toLowerCase()) ?? []
    if (owners.length === 0) findings.push({ severity: 'info', code: 'unscheduled-program', location,
      message: 'Program is not scheduled by an exported task.', evidence: program.name })
    if (owners.length > 1) findings.push({ severity: 'warning', code: 'duplicate-schedule', location,
      message: 'Program appears in more than one task schedule.', evidence: owners.join(', ') })
    if (program.main !== '' && !program.routines.some(routine => routine.name.toLowerCase() === program.main.toLowerCase()))
      findings.push({ severity: 'warning', code: 'missing-main-routine', location,
        message: `Main routine ${program.main} is absent from this export.`, evidence: program.main })
    const routineNames = new Set(program.routines.map(routine => routine.name.toLowerCase()))
    for (const routine of program.routines) {
      const routineLocation = `${program.name}/${routine.name}`
      if (routine.type !== 'RLL' && routine.type !== 'ST') findings.push({ severity: 'info', code: 'unsupported-diagram',
        location: routineLocation, message: `${routine.type} is listed but is not diagrammed.`, evidence: routine.type })
      if (routine.type !== 'RLL') continue
      for (const rung of routine.rungs) {
        for (const match of rung.text.matchAll(/\bJSR\s*\(\s*([^,()\s]+)/giu)) {
          const target = match[1]
          if (target !== undefined && !routineNames.has(target.toLowerCase())) findings.push({ severity: 'warning', code: 'unresolved-jsr',
            location: `${routineLocation} rung ${rung.number}`, message: `Called routine ${target} is absent from this program export.`, evidence: match[0] })
        }
      }
    }
  }
  return findings
}
