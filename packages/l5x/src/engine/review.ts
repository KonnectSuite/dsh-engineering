import type { ProjectSnapshot } from '../session.ts'
import { evidenceOf, resolveSymbol, type Evidence } from './analysis.ts'
import type { L5xDocument, L5xRoutine } from '../model/types.ts'
import { engineeringTags, moduleConfigurations } from './configuration.ts'

export interface Change {
  readonly kind: 'added' | 'removed' | 'changed'
  readonly component: string
  readonly key: string
  readonly before?: unknown
  readonly after?: unknown
}

function changes<T>(component: string, before: readonly T[], after: readonly T[], key: (value: T) => string): Change[] {
  const old = new Map(before.map(value => [key(value), value]))
  const next = new Map(after.map(value => [key(value), value]))
  const result: Change[] = []
  for (const [name, value] of old) {
    const other = next.get(name)
    if (other === undefined) result.push({ kind: 'removed', component, key: name, before: value })
    else if (JSON.stringify(value) !== JSON.stringify(other)) result.push({ kind: 'changed', component, key: name, before: value, after: other })
  }
  for (const [name, value] of next) if (!old.has(name)) result.push({ kind: 'added', component, key: name, after: value })
  return result
}
function allRoutines(document: L5xDocument): readonly L5xRoutine[] {
  return [...document.routines, ...document.aois.flatMap(aoi => aoi.routines.map(routine => ({ ...routine, program: `AOI::${aoi.name}` })))]
}

/** Compare parsed engineering content; timestamps and XML presentation never enter the comparison. */
export function compareProjects(before: ProjectSnapshot, after: ProjectSnapshot): object {
  const a = before.document
  const b = after.document
  const oldRoutines = allRoutines(a)
  const newRoutines = allRoutines(b)
  const result = [
    ...changes('program', a.programs, b.programs, v => v.name),
    ...changes('task', a.tasks, b.tasks, v => v.name),
    ...changes('tag', engineeringTags(a), engineeringTags(b), v => `${v.scope}::${v.name}`),
    ...changes('udt', a.udts, b.udts, v => v.name),
    ...changes('aoi', a.aois.map(({ routines: _routines, ...rest }) => rest), b.aois.map(({ routines: _routines, ...rest }) => rest), v => v.name),
    ...changes('module', moduleConfigurations(a), moduleConfigurations(b), v => v.name),
    ...changes('alarm', a.alarms, b.alarms, v => v.name),
    ...changes('routine', oldRoutines.map(({ body: _body, ...rest }) => rest), newRoutines.map(({ body: _body, ...rest }) => rest), v => `${v.program}::${v.name}`),
  ]
  const oldRungs = oldRoutines.flatMap(r => r.body.type === 'RLL' ? r.body.rungs.map(v => ({ program: r.program, routine: r.name, ...v })) : [])
  const newRungs = newRoutines.flatMap(r => r.body.type === 'RLL' ? r.body.rungs.map(v => ({ program: r.program, routine: r.name, ...v })) : [])
  result.push(...changes('rung', oldRungs, newRungs, v => `${v.program}::${v.routine}::${v.number}`))
  const oldSt = oldRoutines.filter(r => r.body.type === 'ST').map(r => ({ program: r.program, routine: r.name, code: r.body.type === 'ST' ? r.body.code : '' }))
  const newSt = newRoutines.filter(r => r.body.type === 'ST').map(r => ({ program: r.program, routine: r.name, code: r.body.type === 'ST' ? r.body.code : '' }))
  result.push(...changes('structured_text', oldSt, newSt, v => `${v.program}::${v.routine}`))
  const oldDiagrams = oldRoutines.filter(r => r.body.type === 'FBD' || r.body.type === 'SFC').map(r => ({ program: r.program, routine: r.name, type: r.type, nodes: r.body.type === 'FBD' || r.body.type === 'SFC' ? r.body.nodes : [] }))
  const newDiagrams = newRoutines.filter(r => r.body.type === 'FBD' || r.body.type === 'SFC').map(r => ({ program: r.program, routine: r.name, type: r.type, nodes: r.body.type === 'FBD' || r.body.type === 'SFC' ? r.body.nodes : [] }))
  result.push(...changes('diagram', oldDiagrams, newDiagrams, v => `${v.program}::${v.routine}`))
  return { before: before.sha256, after: after.sha256, changes: result, count: result.length, coverage: { before: before.features, after: after.features } }
}

export interface Finding {
  readonly rule: string
  readonly severity: 'info' | 'warning' | 'critical'
  readonly message: string
  readonly evidence: unknown
  readonly confidence: 'high' | 'medium' | 'low'
}

export function runChecks(project: ProjectSnapshot, baseline?: ProjectSnapshot): object {
  const doc = project.document
  const references = evidenceOf(project)
  const findings: Finding[] = []
  const report = (rule: string, severity: Finding['severity'], message: string, evidence: unknown, confidence: Finding['confidence'] = 'high'): void => { findings.push({ rule, severity, message, evidence, confidence }) }
  const used = new Set<string>()
  for (const ref of references) {
    if (ref.resolved !== undefined) {
      const resolved = ref.resolved.toLowerCase()
      used.add(resolved)
      used.add(resolved.split('.')[0] ?? resolved)
    }
    const rawBase = ref.symbol.split('.')[0] ?? ref.symbol
    used.add(`${ref.scope}::${rawBase}`.toLowerCase())
    used.add(`controller::${rawBase}`.toLowerCase())
  }
  for (const tag of doc.tags) {
    // A module-defined tag such as `Local:1:C` or `TopCutter_MP2600iec:I` is
    // wired by the module, not by indexed logic, so "no reference" proves nothing
    // and buried the real findings: 20 such rows on one export.
    if (/:[A-Z]+$/u.test(tag.name)) continue
    const key = `${tag.scope}::${tag.name}`.toLowerCase()
    if (!used.has(key)) report('UNUSED_TAG', 'info', `No indexed logic reference to ${tag.scope}::${tag.name}`, { scope: tag.scope, tag: tag.name }, 'low')
  }
  const unresolved = new Map<string, Evidence[]>()
  for (const ref of references) {
    if (ref.resolved !== undefined || ref.access === 'call' || ref.access === 'unknown') continue
    // A member of a module-defined or otherwise opaque type (`Drive_MCFG.CommFLT`,
    // `Axis_MAH.PC`) is not in the export's DataTypes, so this model cannot prove
    // it. The base tag is declared, the member is not decodable: that is a coverage
    // limit, not an unresolved reference, and reporting it drowned the real findings
    // — 315 of them on one project that compiles. `S:`/`R:` system flags are the
    // same case: defined by the controller, absent from the export.
    const base = ref.symbol.split('.')[0] ?? ref.symbol
    const systemFlag = /^[SR]:/iu.test(ref.symbol)
    // `S:` and `R:` are defined by the controller, not by the export, so their
    // absence from the declaration table proves nothing about the logic.
    if (systemFlag) continue
    const baseDeclared = resolveSymbol(doc, ref.scope, base)
    if (baseDeclared !== undefined) continue
    const key = `${ref.scope}::${ref.symbol}`
    unresolved.set(key, [...unresolved.get(key) ?? [], ref])
  }
  for (const [symbol, locations] of unresolved) report('UNRESOLVED_REFERENCE', 'info', `Symbol ${symbol} could not be resolved in this export`, { occurrences: locations.length, examples: locations.slice(0, 3) }, 'low')
  const scheduled = new Map<string, string[]>()
  for (const task of doc.tasks) for (const program of task.programs) scheduled.set(program, [...scheduled.get(program) ?? [], task.name])
  for (const program of doc.programs) {
    const tasks = scheduled.get(program.name) ?? []
    if (tasks.length === 0) report('UNSCHEDULED_PROGRAM', 'warning', `Program ${program.name} is not scheduled`, { program: program.name })
    if (tasks.length > 1) report('MULTIPLE_SCHEDULES', 'warning', `Program ${program.name} is scheduled more than once`, { program: program.name, tasks })
    if (program.description.trim() === '') report('UNDOCUMENTED_PROGRAM', 'info', `Program ${program.name} has no description`, { program: program.name })
  }
  for (const routine of doc.routines) {
    if (routine.description.trim() === '') report('UNDOCUMENTED_ROUTINE', 'info', `Routine ${routine.name} has no description`, { program: routine.program, routine: routine.name })
    if (routine.body.type === 'RLL') {
      // One finding per routine, not per rung: a large export otherwise buries
      // every substantive finding under thousands of documentation rows.
      const undocumented = routine.body.rungs.filter(rung => (rung.comment ?? '').trim() === '')
      if (undocumented.length > 0) report('UNDOCUMENTED_RUNG', 'info',
        `${undocumented.length} rung(s) in ${routine.program}::${routine.name} have no comment`,
        { program: routine.program, routine: routine.name, count: undocumented.length, rungs: undocumented.slice(0, 20).map(rung => rung.number), truncated: undocumented.length > 20 }, 'high')
    }
  }
  // Standards pass: a latch nothing resets, and one output driven from two rungs.
  // Basis: CRAFT-FAULT-02 (a latch needs a reset that only succeeds when the cause is
  // gone) and the one-driver-per-output guidance in the craft pages.
  const latched = new Map<string, { program: string; routine: string; rungs: number[] }>()
  const reset = new Set<string>()
  const driven = new Map<string, { program: string; routine: string; tag: string; rungs: number[] }>()
  for (const routine of doc.routines) {
    if (routine.body.type !== 'RLL') continue
    for (const rung of routine.body.rungs) {
      for (const match of rung.text.matchAll(/(OTL|OTU|OTE)\(([^)]*)\)/gu)) {
        const kind = match[1]
        const text = (match[2] ?? '').trim()
        const tag = text.split(/[.\s]/u)[0] ?? ''
        if (tag === '') continue
        if (kind === 'OTU') { reset.add(tag.toLowerCase()); continue }
        const latch = kind === 'OTL' ? latched.get(tag.toLowerCase()) ?? { program: routine.program, routine: routine.name, rungs: [] } : undefined
        if (latch !== undefined) {
          latch.rungs.push(rung.number)
          latched.set(tag.toLowerCase(), latch)
        }
        const key = `${routine.program}::${routine.name}::${tag.toLowerCase()}`
        const driver = driven.get(key) ?? { program: routine.program, routine: routine.name, tag, rungs: [] }
        driver.rungs.push(rung.number)
        driven.set(key, driver)
      }
    }
  }
  for (const [tag, entry] of latched) {
    if (reset.has(tag)) continue
    report('LATCH_WITHOUT_RESET', 'warning', `${entry.program}::${entry.routine} latches ${tag}, and nothing in this export resets it`, { program: entry.program, routine: entry.routine, tag, rungs: entry.rungs.slice(0, 20), basis: 'CRAFT-FAULT-02' }, 'high')
  }
  for (const entry of driven.values()) {
    if (entry.rungs.length < 2) continue
    report('DUPLICATE_OUTPUT', 'warning', `${entry.program}::${entry.routine} drives ${entry.tag} from ${entry.rungs.length} rungs`, { program: entry.program, routine: entry.routine, tag: entry.tag, rungs: entry.rungs.slice(0, 20), basis: 'CRAFT-FAULT-02' }, 'high')
  }
  const writers = new Map<string, Evidence[]>()
  for (const ref of references) if (ref.resolved !== undefined && (ref.access === 'write' || ref.access === 'read_write')) writers.set(ref.resolved, [...writers.get(ref.resolved) ?? [], ref])
  for (const [symbol, locations] of writers) if (locations.length > 1 && /(?:^|::|\.)[^.]*:(?:O|Output)|_Output|\.O\./iu.test(symbol)) report('MULTIPLE_OUTPUT_WRITES', 'warning', `Multiple indexed writes to output-like symbol ${symbol}`, locations, 'medium')
  if (baseline !== undefined) {
    const difference = compareProjects(baseline, project) as { changes: Change[] }
    for (const change of difference.changes) if (change.component === 'module') report('IO_MODULE_CHANGED', 'warning', `I/O module ${change.key} ${change.kind}`, change)
  }
  const byRule: Record<string, number> = {}
  const bySeverity: Record<string, number> = {}
  for (const finding of findings) {
    byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1
  }
  return { project_id: project.id, baseline_id: baseline?.id, findings, count: findings.length, summary: { byRule, bySeverity }, coverage: project.features, note: 'Heuristic findings require engineering review; absence of findings does not prove controller safety.' }
}
