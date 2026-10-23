import { compareProjects, type Change } from './review.ts'
import { EngineeringError, type ProjectSnapshot } from '../session.ts'

function safetyPrograms(project: ProjectSnapshot): string[] {
  const names = new Set(project.document.programs.filter(program => /safety/iu.test(program.name)).map(program => program.name))
  for (const task of project.document.tasks) {
    if (/safety/iu.test(task.name)) for (const name of task.programs) names.add(name)
  }
  for (const match of project.xml.matchAll(/<Program\b([^>]*)>/gu)) {
    if (!/\bClass=["']Safety["']/iu.test(match[1] ?? '')) continue
    const name = /\bName=["']([^"']+)["']/u.exec(match[1] ?? '')?.[1]
    if (name !== undefined) names.add(name)
  }
  return [...names].sort()
}

function safetyState(project: ProjectSnapshot): string {
  const programs = safetyPrograms(project)
  const safetyInfo = /<SafetyInfo\b[\s\S]*?(?:\/>|<\/SafetyInfo>)/u.exec(project.xml)?.[0] ?? ''
  const safetyTags = [...project.xml.matchAll(/<Tag\b[^>]*(?:\bClass=["']Safety["']|\bSafety=["']true["'])[^>]*(?:\/>|>[\s\S]*?<\/Tag>)/giu)].map(match => match[0])
  const safetyMappings = [...project.xml.matchAll(/<SafetyTagMap(?:ping)?\b[\s\S]*?(?:\/>|<\/SafetyTagMap(?:ping)?>)/giu)].map(match => match[0])
  return JSON.stringify({
    safetyInfo,
    safetyTags,
    safetyMappings,
    programs,
    tasks: project.document.tasks.filter(task => /safety/iu.test(task.name) || task.programs.some(name => programs.includes(name))),
    definitions: project.document.programs.filter(program => programs.includes(program.name)),
    routines: project.document.routines.filter(routine => programs.includes(routine.program)),
    tags: project.document.tags.filter(tag => programs.includes(tag.scope)),
  })
}

function encodedDefinitions(project: ProjectSnapshot): readonly string[] {
  return [...project.xml.matchAll(/<EncodedData\b[\s\S]*?<\/EncodedData>|<EncodedData\b[^>]*\/>/gu)].map(match => match[0])
}

export interface DownloadReview {
  readonly baseline_sha256: string
  readonly source_sha256: string
  readonly controller: string
  readonly processor_type: string
  readonly change_count: number
  readonly changes: readonly Change[]
  readonly safety_changed: boolean
  readonly eligible: boolean
  readonly blockers: readonly string[]
}

/** This review is a release gate, not a claim that the machine is safe to run. */
export function reviewDownloadSource(baseline: ProjectSnapshot, source: ProjectSnapshot): DownloadReview {
  if (baseline.exportKind !== 'controller' || source.exportKind !== 'controller') throw new EngineeringError('CONTROLLER_EXPORT_REQUIRED', 'Both baseline and source must be full controller exports')
  const differences = compareProjects(baseline, source) as { changes: Change[] }
  const safetyChanged = safetyState(baseline) !== safetyState(source)
  const blockers: string[] = []
  if (baseline.document.controller.name !== source.document.controller.name || baseline.document.controller.processorType !== source.document.controller.processorType) blockers.push('Controller identity or processor type differs from baseline')
  if (baseline.softwareRevision !== source.softwareRevision) blockers.push('Studio project revision differs from baseline')
  if (differences.changes.length === 0) blockers.push('No engineering change was found relative to baseline; refusing an unchanged backup download')
  if (safetyChanged) blockers.push('Safety task, program, routine, tag, or safety metadata differs; use Studio 5000 safety review')
  if (differences.changes.some(change => change.component === 'module')) blockers.push('I/O module configuration differs from baseline; review in Studio 5000')
  if (JSON.stringify(encodedDefinitions(baseline)) !== JSON.stringify(encodedDefinitions(source))) blockers.push('Encoded or source-protected definition changed')
  return {
    baseline_sha256: baseline.sha256, source_sha256: source.sha256,
    controller: source.document.controller.name, processor_type: source.document.controller.processorType,
    change_count: differences.changes.length, changes: differences.changes,
    safety_changed: safetyChanged, eligible: blockers.length === 0, blockers,
  }
}
