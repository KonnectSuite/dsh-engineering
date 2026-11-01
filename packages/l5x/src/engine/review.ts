import type { ProjectSnapshot } from '../session.ts'
import { evidenceOf, resolveSymbol, type Evidence } from './analysis.ts'
import type { L5xDocument, L5xRoutine } from '../model/types.ts'
import { engineeringTags, moduleConfigurations } from './configuration.ts'
import { MNEMONIC_RENAME_MAJOR, mnemonicMismatchesIn, mnemonicsIn } from './mnemonics.ts'
import { INSTRUCTIONS, instructionByName } from './instructions.ts'
import { validateDiagram } from './fbd.ts'
import { rungFindings } from './rung-rules.ts'

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

/** A short list of rung numbers, counting the rest. */
function rungList(rungs: readonly number[], limit = 5): string {
  return rungs.length <= limit ? rungs.join(', ') : `${rungs.slice(0, limit).join(', ')} and ${rungs.length - limit} more`
}

/** The places a symbol is touched, as "program::routine rung N" when known. */
function siteList(locations: readonly Evidence[], limit = 3): string {
  const sites = locations.map(location => {
    const at = location.rung !== undefined
      ? ` rung ${location.rung}`
      : location.line !== undefined
        ? ` line ${location.line}`
        : location.sheet !== undefined
          ? ` sheet ${location.sheet}`
          : ''
    return `${location.scope}::${location.routine}${at}`
  })
  const unique = [...new Set(sites)]
  return unique.length <= limit ? unique.join(', ') : `${unique.slice(0, limit).join(', ')} and ${unique.length - limit} more`
}

/** Field-level summary of one change, when both sides are records. */
function changedFields(change: Change, limit = 4): string[] {
  const before = change.before
  const after = change.after
  if (typeof before !== 'object' || before === null || typeof after !== 'object' || after === null) return []
  const left = before as Record<string, unknown>
  const right = after as Record<string, unknown>
  const changed: string[] = []
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const was = JSON.stringify(left[key]) ?? String(left[key])
    const now = JSON.stringify(right[key]) ?? String(right[key])
    if (was !== now) changed.push(`${key} ${String(left[key])} to ${String(right[key])}`)
  }
  return changed.length <= limit ? changed : [...changed.slice(0, limit), `and ${changed.length - limit} more`]
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
    if (tasks.length > 1) report('MULTIPLE_SCHEDULES', 'warning', `Program ${program.name} is scheduled in ${tasks.length} tasks: ${tasks.join(', ')}`, { program: program.name, tasks })
    if (program.description.trim() === '') report('UNDOCUMENTED_PROGRAM', 'info', `Program ${program.name} has no description`, { program: program.name })
  }
  // Binding pass: a program's main routine and a task's scheduled programs are named, so a
  // reference to something the export does not declare is provable without a vendor table.
  const programNames = new Set(doc.programs.map(program => program.name.toUpperCase()))
  for (const program of doc.programs) {
    const own = doc.routines.filter(routine => routine.program === program.name)
    if (program.mainRoutine !== '') {
      const declared = own.some(routine => routine.name.toUpperCase() === program.mainRoutine.toUpperCase())
      if (!declared) {
        report('MAIN_ROUTINE_MISSING', 'warning',
          `${program.name} names ${program.mainRoutine} as its main routine, and declares no routine of that name`,
          { program: program.name, mainRoutine: program.mainRoutine, routines: own.map(routine => routine.name).slice(0, 10) })
      }
    }
    const firstSpelling = new Map<string, string>()
    const duplicates = new Map<string, string>()
    for (const routine of own) {
      const key = routine.name.toUpperCase()
      const first = firstSpelling.get(key)
      // Report the spelling declared first: naming the later one points a reader at the copy.
      if (first === undefined) firstSpelling.set(key, routine.name)
      else duplicates.set(key, first)
    }
    for (const name of duplicates.values()) {
      report('DUPLICATE_ROUTINE_NAME', 'warning', `${program.name} declares more than one routine named ${name}`, { program: program.name, routine: name })
    }
  }
  for (const task of doc.tasks) {
    for (const name of task.programs) {
      if (programNames.has(name.toUpperCase())) continue
      report('SCHEDULED_PROGRAM_MISSING', 'warning', `Task ${task.name} schedules ${name}, and this export declares no program of that name`, { task: task.name, program: name })
    }
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
  const latched = new Map<string, { program: string; routine: string; tag: string; rungs: number[] }>()
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
        // Keep the tag's own casing: a finding that lowercases it reports a name the project does not use.
        const latch = kind === 'OTL' ? latched.get(tag.toLowerCase()) ?? { program: routine.program, routine: routine.name, tag, rungs: [] } : undefined
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
    report('LATCH_WITHOUT_RESET', 'warning', `${entry.program}::${entry.routine} latches ${entry.tag} at rung ${rungList(entry.rungs)}, and nothing in this export resets it`, { program: entry.program, routine: entry.routine, tag, rungs: entry.rungs.slice(0, 20), basis: 'CRAFT-FAULT-02' }, 'high')
  }
  for (const entry of driven.values()) {
    if (entry.rungs.length < 2) continue
    report('DUPLICATE_OUTPUT', 'warning', `${entry.program}::${entry.routine} drives ${entry.tag} from ${entry.rungs.length} rungs: ${rungList(entry.rungs)}`, { program: entry.program, routine: entry.routine, tag: entry.tag, rungs: entry.rungs.slice(0, 20), basis: 'CRAFT-FAULT-02' }, 'high')
  }
  const writers = new Map<string, Evidence[]>()
  for (const ref of references) if (ref.resolved !== undefined && (ref.access === 'write' || ref.access === 'read_write')) writers.set(ref.resolved, [...writers.get(ref.resolved) ?? [], ref])
  for (const [symbol, locations] of writers) {
    if (locations.length <= 1) continue
    if (!/(?:^|::|\.)[^.]*:(?:O|Output)|_Output|\.O\./iu.test(symbol)) continue
    report('MULTIPLE_OUTPUT_WRITES', 'warning', `Output-like symbol ${symbol} is written from ${locations.length} sites: ${siteList(locations)}`, locations, 'medium')
  }
  if (baseline !== undefined) {
    const difference = compareProjects(baseline, project) as { changes: Change[] }
    for (const change of difference.changes) {
    if (change.component !== 'module') continue
    // "changed" alone sends a reader to diff the file by hand. The record already carries both
    // sides, so name the fields that differ.
    const fields = changedFields(change)
    report('IO_MODULE_CHANGED', 'warning', `I/O module ${change.key} ${change.kind}${fields.length === 0 ? '' : ': ' + fields.join(', ')}`, change)
  }
  }
  // Revision pass: one finding per mnemonic, not per rung. Logix Designer 36 renamed
  // sixteen ladder instructions (EQU to EQ, SQR to SQRT, …). A project that carries
  // the other revision's spelling still builds, so this is a warning rather than a
  // refusal: it tells the reader which spelling a rung composed into this project
  // should use. An export that does not state its revision proves nothing, so the
  // pass is skipped rather than guessing.
  const majorRev = doc.controller.majorRev
  if (Number.isFinite(Number.parseInt(majorRev, 10))) {
    const mismatched = new Map<string, { used: string; preferred: string; rungs: string[] }>()
    for (const routine of doc.routines) {
      if (routine.body.type !== 'RLL') continue
      for (const rung of routine.body.rungs) {
        for (const mismatch of mnemonicMismatchesIn(rung.text, majorRev)) {
          const entry = mismatched.get(mismatch.used) ?? { used: mismatch.used, preferred: mismatch.preferred, rungs: [] }
          if (entry.rungs.length < 20) entry.rungs.push(`${routine.program}::${routine.name}#${rung.number}`)
          mismatched.set(mismatch.used, entry)
        }
      }
    }
    for (const entry of mismatched.values()) {
      report('MNEMONIC_VERSION_MISMATCH', 'warning',
        `${entry.used} is the pre-v${MNEMONIC_RENAME_MAJOR} spelling; this project is v${majorRev} and publishes ${entry.preferred}`,
        { used: entry.used, preferred: entry.preferred, majorVersion: majorRev, rungs: entry.rungs, truncated: entry.rungs.length >= 20 }, 'high')
    }
  }
  // Coverage pass: a rung may name an instruction this catalogue does not carry. That is not an
  // error — about a hundred of the vendor's are not modelled — but the reader is entitled to know
  // which logic went unchecked, rather than reading "no findings" as "everything was verified".
  const catalogued = new Set(INSTRUCTIONS.map(instruction => instruction.name.toUpperCase()))
  const aoiNames = new Set(doc.aois.map(aoi => aoi.name.toUpperCase()))
  const uncatalogued = new Map<string, number>()
  for (const routine of doc.routines) {
    if (routine.body.type !== 'RLL') continue
    for (const rung of routine.body.rungs) {
      for (const name of mnemonicsIn(rung.text)) {
        if (catalogued.has(name) || aoiNames.has(name) || instructionByName(name) !== undefined) continue
        uncatalogued.set(name, (uncatalogued.get(name) ?? 0) + 1)
      }
    }
  }
  if (uncatalogued.size > 0) {
    const rows = [...uncatalogued].sort((left, right) => right[1] - left[1])
    const listed = rows.slice(0, 8).map(([name, rungs]) => `${name} (${rungs} rung${rungs === 1 ? '' : 's'})`).join(', ')
    report('UNCATALOGUED_INSTRUCTION', 'info',
      `${uncatalogued.size} instruction(s) in this export are not in the catalogue, so their operands were not checked: ${listed}${rows.length > 8 ? `, and ${rows.length - 8} more` : ''}`,
      { instructions: rows.slice(0, 20).map(([name, rungs]) => ({ name, rungs })), catalogue_size: catalogued.size, note: 'The catalogue models 128 of the vendor instructions; an uncatalogued name may still be valid, and Studio remains the arity gate.' })
  }
  // Control-transfer pass: a JSR naming a routine that is not in its own program, or a JMP with
  // no LBL of that name in its own routine, cannot build. Both targets are written in the rung,
  // so the export states them and no vendor table is needed.
  const routinesByProgram = new Map<string, Set<string>>()
  const programsByRoutine = new Map<string, string[]>()
  for (const routine of doc.routines) {
    const names = routinesByProgram.get(routine.program) ?? new Set<string>()
    names.add(routine.name.toUpperCase())
    routinesByProgram.set(routine.program, names)
    const key = routine.name.toUpperCase()
    programsByRoutine.set(key, [...programsByRoutine.get(key) ?? [], routine.program])
  }
  for (const routine of doc.routines) {
    if (routine.body.type !== 'RLL') continue
    const labels = new Set<string>()
    for (const rung of routine.body.rungs) {
      for (const match of rung.text.matchAll(/(?:^|[^A-Za-z0-9_])LBL\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*[),]/gu)) {
        const label = match[1]
        if (label !== undefined) labels.add(label.toUpperCase())
      }
    }
    const missingLabels = new Map<string, number[]>()
    const missingRoutines = new Map<string, number[]>()
    for (const rung of routine.body.rungs) {
      for (const match of rung.text.matchAll(/(?:^|[^A-Za-z0-9_])JMP\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*[),]/gu)) {
        const label = match[1]
        if (label === undefined || labels.has(label.toUpperCase())) continue
        missingLabels.set(label, [...missingLabels.get(label) ?? [], rung.number])
      }
      for (const match of rung.text.matchAll(/(?:^|[^A-Za-z0-9_])JSR\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*[),]/gu)) {
        const target = match[1]
        if (target === undefined || routinesByProgram.get(routine.program)?.has(target.toUpperCase()) === true) continue
        missingRoutines.set(target, [...missingRoutines.get(target) ?? [], rung.number])
      }
    }
    for (const [label, rungs] of missingLabels) {
      report('LABEL_NOT_FOUND', 'warning',
        `${routine.program}::${routine.name} jumps to ${label} at rung ${rungList(rungs)}, and no LBL in this routine uses that name`,
        { program: routine.program, routine: routine.name, label, rungs })
    }
    for (const [target, rungs] of missingRoutines) {
      const elsewhere = programsByRoutine.get(target.toUpperCase())
      const hint = elsewhere === undefined ? '' : `; a routine of that name exists in ${elsewhere.join(', ')}, and a JSR can only call a routine in its own program`
      report('UNRESOLVED_ROUTINE', 'warning',
        `${routine.program}::${routine.name} jumps to ${target} at rung ${rungList(rungs)}, and ${routine.program} declares no routine of that name${hint}`,
        { program: routine.program, routine: routine.name, target, rungs })
    }
  }
  // Structure pass: an export states no rule for a diagram's wire graph or a rung's
  // shape, so a document Studio refuses looks exactly like one it accepts.
  for (const routine of doc.routines) {
    if (routine.body.type === 'FBD') findings.push(...validateDiagram(routine))
    else if (routine.body.type === 'RLL') findings.push(...rungFindings(routine))
  }
  const byRule: Record<string, number> = {}
  const bySeverity: Record<string, number> = {}
  for (const finding of findings) {
    byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1
  }
  return { project_id: project.id, baseline_id: baseline?.id, findings, count: findings.length, summary: { byRule, bySeverity }, coverage: project.features, note: 'Heuristic findings require engineering review; absence of findings does not prove controller safety.' }
}
