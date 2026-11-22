import type { ProjectSnapshot } from '../session.ts'
import { evidenceOf, resolveSymbol, type Evidence } from './analysis.ts'
import type { L5xDocument, L5xRoutine, L5xTag, L5xTask, L5xUdt } from '../model/types.ts'
import { engineeringTags, moduleConfigurations } from './configuration.ts'
import { MNEMONIC_RENAME_MAJOR, mnemonicMismatchesIn, mnemonicsIn } from './mnemonics.ts'
import { INSTRUCTIONS, instructionByName } from './instructions.ts'
import { validateDiagram, validateSfcDiagram } from './fbd.ts'
import { rungFindings } from './rung-rules.ts'

export interface Change {
  readonly kind: 'added' | 'removed' | 'changed'
  readonly component: string
  readonly key: string
  readonly before?: unknown
  readonly after?: unknown
}

/** JSON with object keys in a fixed order: two records with the same fields are equal. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return inner
    const record = inner as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, record[key]]))
  })
}

function changes<T>(component: string, before: readonly T[], after: readonly T[], key: (value: T) => string): Change[] {
  const old = new Map(before.map(value => [key(value), value]))
  const next = new Map(after.map(value => [key(value), value]))
  const result: Change[] = []
  for (const [name, value] of old) {
    const other = next.get(name)
    if (other === undefined) result.push({ kind: 'removed', component, key: name, before: value })
    else if (stableStringify(value) !== stableStringify(other)) result.push({ kind: 'changed', component, key: name, before: value, after: other })
  }
  for (const [name, value] of next) if (!old.has(name)) result.push({ kind: 'added', component, key: name, after: value })
  return result
}
function allRoutines(document: L5xDocument): readonly L5xRoutine[] {
  return [...document.routines, ...document.aois.flatMap(aoi => aoi.routines.map(routine => ({ ...routine, program: `AOI::${aoi.name}` })))]
}

/**
 * Studio rewrites the node ids of a diagram on save and rewires them consistently, and it
 * surrounds an ST body with blank lines. Both are presentation: comparing them as engineering
 * changes made a round trip through Studio report a changed diagram and body that a user then
 * has to explain. Label nodes by their order instead, and trim ST, on both sides.
 */
function canonicalDiagram(nodes: readonly unknown[]): unknown[] {
  // Condition and STContent are the XML wrappers Studio puts around a transition's line; the
  // Line node already carries the text, and the padding it adds is presentation.
  const wrappers = new Set(['Condition', 'STContent'])
  const records: unknown[] = nodes
    .filter(node => !(typeof node === 'object' && node !== null && wrappers.has(String((node as Record<string, unknown>).kind))))
    .map(node => typeof node === 'object' && node !== null ? { ...(node as Record<string, unknown>) } : node)
  const labels = new Map<string, string>()
  let next = 0
  for (const record of records) {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) continue
    const fields = record as Record<string, unknown>
    if (fields.fromId !== undefined || fields.toId !== undefined) continue
    if (fields.id !== undefined) {
      labels.set(String(fields.id), String(next))
      next += 1
    }
  }
  return records.map(record => {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) return record
    const fields = record as Record<string, unknown>
    let normalized = fields
    if (typeof fields.text === 'string') {
      const text = fields.text.replace(/\r\n/gu, '\n').trim()
      if (text === '') {
        const { text: _padding, ...rest } = fields
        normalized = rest
      } else {
        normalized = { ...fields, text }
      }
    }
    if (normalized.fromId !== undefined || normalized.toId !== undefined) {
      return {
        ...normalized,
        ...(normalized.fromId === undefined ? {} : { fromId: labels.get(String(normalized.fromId)) ?? normalized.fromId }),
        ...(normalized.toId === undefined ? {} : { toId: labels.get(String(normalized.toId)) ?? normalized.toId }),
      }
    }
    return normalized.id === undefined ? normalized : { ...normalized, id: labels.get(String(normalized.id)) ?? normalized.id }
  })
}

/** An ST body without the blank lines or line-ending style Studio adds when it saves. */
function trimmedCode(code: string): string {
  return code.replace(/\r\n/gu, '\n').trim()
}

/** Tasks with the default priority Studio writes when the export omits one. */
function effectiveTasks(tasks: readonly L5xTask[]): readonly L5xTask[] {
  return tasks.map(task => task.priority === '' ? { ...task, priority: '10' } : task)
}

/** Declared types only: built-in and module-defined types appear merely by importing a project. */
function userTypes(document: L5xDocument): readonly L5xUdt[] {
  const vendor = new Set(document.vendorUdts.map(type => type.name.toLowerCase()))
  return document.udts.filter(type => !vendor.has(type.name.toLowerCase()))
}

/** A controller record without the release patch stamp or an all-zero project serial. */
function effectiveController(controller: L5xDocument['controller']): Record<string, unknown> {
  const { minorRev: _minor, projectSerialNumber, ...rest } = controller
  return {
    ...rest,
    ...(projectSerialNumber === undefined || projectSerialNumber === '16#0000_0000' ? {} : { projectSerialNumber }),
  }
}

/** Compare parsed engineering content; timestamps and XML presentation never enter the comparison. */
export function compareProjects(before: ProjectSnapshot, after: ProjectSnapshot): object {
  const a = before.document
  const b = after.document
  const oldModules = moduleConfigurations(a)
  const newModules = moduleConfigurations(b)
  // Studio adds the controller's embedded Local module when it imports and saves a project, and
  // it stamps the release's patch revision. Neither is an engineering change.
  const hasLocal = (rows: readonly { readonly name: string }[]): boolean => rows.some(row => row.name === 'Local')
  const modulesBefore = oldModules
  const modulesAfter = hasLocal(oldModules) ? newModules : newModules.filter(row => row.name !== 'Local')
  const controllerBefore = effectiveController(a.controller)
  const controllerAfter = effectiveController(b.controller)
  const oldRoutines = allRoutines(a)
  const newRoutines = allRoutines(b)
  const result = [
    ...changes('program', a.programs, b.programs, v => v.name),
    ...changes('task', effectiveTasks(a.tasks), effectiveTasks(b.tasks), v => v.name),
    ...changes('tag', engineeringTags(a), engineeringTags(b), v => `${v.scope}::${v.name}`),
    ...changes('udt', userTypes(a), userTypes(b), v => v.name),
    ...changes('aoi', a.aois.map(({ routines: _routines, ...rest }) => rest), b.aois.map(({ routines: _routines, ...rest }) => rest), v => v.name),
    ...changes('module', modulesBefore, modulesAfter, v => v.name),
    ...changes('alarm', a.alarms, b.alarms, v => v.name),
    ...changes('routine', oldRoutines.map(({ body: _body, ...rest }) => rest), newRoutines.map(({ body: _body, ...rest }) => rest), v => `${v.program}::${v.name}`),
  ]
  const oldRungs = oldRoutines.flatMap(r => r.body.type === 'RLL' ? r.body.rungs.map(v => ({ program: r.program, routine: r.name, ...v })) : [])
  const newRungs = newRoutines.flatMap(r => r.body.type === 'RLL' ? r.body.rungs.map(v => ({ program: r.program, routine: r.name, ...v })) : [])
  result.push(...changes('rung', oldRungs, newRungs, v => `${v.program}::${v.routine}::${v.number}`))
  const oldSt = oldRoutines.filter(r => r.body.type === 'ST').map(r => ({ program: r.program, routine: r.name, code: trimmedCode(r.body.type === 'ST' ? r.body.code : '') }))
  const newSt = newRoutines.filter(r => r.body.type === 'ST').map(r => ({ program: r.program, routine: r.name, code: trimmedCode(r.body.type === 'ST' ? r.body.code : '') }))
  result.push(...changes('structured_text', oldSt, newSt, v => `${v.program}::${v.routine}`))
  const oldDiagrams = oldRoutines.filter(r => r.body.type === 'FBD' || r.body.type === 'SFC').map(r => ({ program: r.program, routine: r.name, type: r.type, nodes: canonicalDiagram(r.body.type === 'FBD' || r.body.type === 'SFC' ? r.body.nodes : []) }))
  const newDiagrams = newRoutines.filter(r => r.body.type === 'FBD' || r.body.type === 'SFC').map(r => ({ program: r.program, routine: r.name, type: r.type, nodes: canonicalDiagram(r.body.type === 'FBD' || r.body.type === 'SFC' ? r.body.nodes : []) }))
  result.push(...changes('diagram', oldDiagrams, newDiagrams, v => `${v.program}::${v.routine}`))
  // A processor change or a new saved route is a real change; comparing only components said "no changes".
  result.push(...changes('controller', [controllerBefore], [controllerAfter], () => 'controller'))
  return { before: before.sha256, after: after.sha256, changes: result, count: result.length, coverage: { before: before.features, after: after.features } }
}

/** What to change for rules whose remedy is short enough to state here. */
const REMEDIES: Record<string, string> = {
  UNUSED_TAG: 'Use the tag in logic or delete it in Studio; an exported tag with no reader may be HMI-only, so check the HMI first.',
  UNRESOLVED_REFERENCE: 'Declare the tag or correct the spelling; l5x_find_references lists every site of the symbol.',
  UNDOCUMENTED_RUNG: 'Add a rung comment stating what the rung does and why it exists.',
  UNDOCUMENTED_ROUTINE: 'Add a routine description saying what it does and when it runs.',
  UNDOCUMENTED_PROGRAM: 'Add a program description naming the equipment and mode it controls.',
  UNSCHEDULED_PROGRAM: 'Add the program to a task that runs it, or delete the unused program.',
  LATCH_WITHOUT_RESET: 'Add a reset path (XIO condition driving OTU) or confirm the latch is reset outside this export.',
  MULTIPLE_OUTPUT_WRITES: 'Confirm one writer is intended; merge the writers or move the second to another tag.',
  DUPLICATE_OUTPUT: 'Confirm intent and keep a single writer per tag, or split the tag.',
  MNEMONIC_VERSION_MISMATCH: 'Use the instruction spelling this project revision builds; l5x_list_instructions gives both spellings.',
  RUNG_NO_OUTPUT: 'Give the rung an output instruction, or delete it.',
  SAFETY_TAG_WRITTEN_FROM_STANDARD_LOGIC: 'Move the write into a safety program, or have standard logic write a standard tag that safety logic consumes.',
  DUPLICATE_ROUTINE_NAME: 'Two routines share a name in one scope; rename one in Studio - the draft tools do not rename.',
  IO_MODULE_CHANGED: 'This is a baseline difference, not a defect; confirm the module change was intended before applying it.',
  JSR_ROUTINE_MISSING: 'Declare the routine the JSR names, or correct the target; l5x_list_components kind "routine" shows the declared names.',
  LABEL_NOT_FOUND: 'Declare the label with LBL, or correct the jump target.',
  MAIN_ROUTINE_MISSING: 'Set the program main routine to a routine that exists, or create that routine.',
  MULTIPLE_SCHEDULES: 'Remove the program from all but one task; a program scheduled twice runs twice per scan.',
  SAFETY_INSTRUCTION_OUTSIDE_SAFETY_PROGRAM: 'Move the safety instruction into a safety program; it cannot run from standard logic.',
  SAFETY_MODULE_WITHOUT_SAFETY_NETWORK: 'Set a unique SafetyNetwork on the module, or correct the module type.',
  SAFETY_PROGRAM_NOT_IN_SAFETY_TASK: 'Schedule the safety program in a safety task.',
  SCHEDULED_PROGRAM_MISSING: 'Correct the scheduled name or create that program; a task cannot schedule a missing program.',
  UNCATALOGUED_INSTRUCTION: 'Check the abbreviation against the installed help for this revision; the tool will not guess operands.',
  UNRESOLVED_ROUTINE: 'Declare the routine in the program, or correct the spelling; the reference row names it.',
  FBD_WIRE_PIN_NOT_VISIBLE: 'Connect the wire to a pin the block declares, or show that pin on the block in Studio; a pin the block does not show cannot be wired.',
  SFC_LINK_TARGET_MISSING: 'Add the missing step or transition, or correct the link; a link to an element the chart does not contain cannot be followed.',
  SFC_NO_INITIAL_STEP: 'Mark exactly one step as the initial step in Studio; a chart needs a step to start at.',
  SFC_MULTIPLE_INITIAL_STEPS: 'Keep exactly one initial step and clear InitialStep on the others in Studio.',
  MODULE_NAME_ILLEGAL: 'Rewrite the module Name with letters, digits and underscores only (letter or underscore first); put the label with its punctuation in the module Description. Studio refuses to import an export carrying this defect.',
}

/** Every rule the checks can emit; a filter outside this set would silently return nothing. */
export const FINDING_RULES: readonly string[] = [
  'DUPLICATE_OUTPUT',
  'DUPLICATE_ROUTINE_NAME',
  'FBD_DANGLING_WIRE',
  'FBD_FEEDBACK_CYCLE',
  'FBD_WIRE_PIN_NOT_VISIBLE',
  'ICON_NO_MATCHING_OCON',
  'ICON_NAME_NOT_PROVIDED',
  'ICON_NO_OUTBOUND_WIRE',
  'IO_MODULE_CHANGED',
  'IREF_TAG_NOT_PROVIDED',
  'JSR_ROUTINE_MISSING',
  'JSR_WITHOUT_RETURN',
  'LABEL_NOT_FOUND',
  'LATCH_WITHOUT_RESET',
  'MAIN_ROUTINE_MISSING',
  'MNEMONIC_VERSION_MISMATCH',
  'MODULE_NAME_ILLEGAL',
  'MULTIPLE_OUTPUT_WRITES',
  'MULTIPLE_SCHEDULES',
  'OCON_DUPLICATE_NAME',
  'OCON_NAME_NOT_PROVIDED',
  'OCON_NO_INBOUND_WIRE',
  'OREF_DUPLICATE_DESTINATION',
  'OREF_TAG_NOT_PROVIDED',
  'RUNG_NO_OUTPUT',
  'SAFETY_INSTRUCTION_OUTSIDE_SAFETY_PROGRAM',
  'SAFETY_MODULE_WITHOUT_SAFETY_NETWORK',
  'SAFETY_PROGRAM_NOT_IN_SAFETY_TASK',
  'SAFETY_TAG_WRITTEN_FROM_STANDARD_LOGIC',
  'SBR_NOT_FIRST',
  'SCHEDULED_PROGRAM_MISSING',
  'SERIAL_PORT_INSTRUCTION_UNSUPPORTED',
  'SFC_LINK_TARGET_MISSING',
  'SFC_MULTIPLE_INITIAL_STEPS',
  'SFC_NO_INITIAL_STEP',
  'UNCATALOGUED_INSTRUCTION',
  'UNDOCUMENTED_PROGRAM',
  'UNDOCUMENTED_ROUTINE',
  'UNDOCUMENTED_RUNG',
  'UNRESOLVED_REFERENCE',
  'UNRESOLVED_ROUTINE',
  'UNSCHEDULED_PROGRAM',
  'UNUSED_TAG',
]

export interface Finding {
  readonly rule: string
  readonly severity: 'info' | 'warning' | 'critical'
  readonly message: string
  readonly evidence: unknown
  readonly confidence: 'high' | 'medium' | 'low'
  /** One line saying what to change, when the rule has a known remedy. */
  readonly fix?: string
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

/** One diagram node or plain value, rendered compactly for a change summary. */
function renderChangeValue(value: unknown): string {
  if (Array.isArray(value)) {
    const brief = value.slice(0, 6).map(renderChangeValue)
    return value.length <= 6 ? `[${brief.join('; ')}]` : `[${brief.join('; ')}; +${value.length - 6} more]`
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    if (typeof record.kind === 'string') {
      const id = record.id !== undefined ? `#${String(record.id)}` : record.fromId !== undefined ? `#${String(record.fromId)}->${String(record.toId)}` : ''
      const pins = `${record.fromParam === undefined ? '' : ` from ${String(record.fromParam)}`}${record.toParam === undefined ? '' : ` to ${String(record.toParam)}`}`
      const operand = record.operand !== undefined ? ` ${String(record.operand)}` : ''
      const content = record.text !== undefined ? ` ${String(record.text)}` : ''
      return `${record.kind}${id}${pins}${operand}${content}`
    }
    return JSON.stringify(record)
  }
  return String(value)
}

/** Field-level summary of one change, when both sides are records. */
export function changedFields(change: { readonly before?: unknown; readonly after?: unknown }, limit = 4): string[] {
  const before = change.before
  const after = change.after
  if (typeof before !== 'object' || before === null || typeof after !== 'object' || after === null) return []
  const left = before as Record<string, unknown>
  const right = after as Record<string, unknown>
  const changed: string[] = []
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const was = stableStringify(left[key])
    const now = stableStringify(right[key])
    if (was === now) continue
    // A diagram is a node list: name the nodes that appeared or vanished, not two object dumps.
    if (key === 'nodes' && Array.isArray(left[key]) && Array.isArray(right[key])) {
      const leftNodes = new Set((left[key] as unknown[]).map(renderChangeValue))
      const rightNodes = new Set((right[key] as unknown[]).map(renderChangeValue))
      const added = [...rightNodes].filter(node => !leftNodes.has(node))
      const removed = [...leftNodes].filter(node => !rightNodes.has(node))
      changed.push(`${key} +${JSON.stringify(added)} -${JSON.stringify(removed)}`)
      continue
    }
    changed.push(`${key} ${renderChangeValue(left[key])} to ${renderChangeValue(right[key])}`)
  }
  return changed.length <= limit ? changed : [...changed.slice(0, limit), `and ${changed.length - limit} more`]
}

export function runChecks(project: ProjectSnapshot, baseline?: ProjectSnapshot): object {
  const doc = project.document
  const references = evidenceOf(project)
  const findings: Finding[] = []
  const report = (rule: string, severity: Finding['severity'], message: string, evidence: unknown, confidence: Finding['confidence'] = 'high', fix?: string): void => {
    // Every finding a reader can act on should say what to do; rules without a remedy stay silent.
    const remedy = fix ?? REMEDIES[rule]
    findings.push({ rule, severity, message, evidence, confidence, ...(remedy === undefined ? {} : { fix: remedy }) })
  }
  // Studio 5000 help (page 130692): "A standard parameter cannot write to a safety tag or a safety parameter."
  const safetyTags = new Map<string, L5xTag>()
  const safetyTagsByName = new Map<string, L5xTag>()
  for (const tag of doc.tags) {
    const isSafety = tag.safety === true || doc.programs.some(program => program.safety && program.name.toUpperCase() === tag.scope.toUpperCase())
    if (!isSafety) continue
    safetyTags.set(`${tag.scope.toUpperCase()}::${tag.name.toUpperCase()}`, tag)
    safetyTagsByName.set(tag.name.toUpperCase(), tag)
  }
  for (const reference of references) {
    if (reference.access !== 'write' && reference.access !== 'read_write') continue
    if (reference.scope.startsWith('AOI::')) continue
    const writer = doc.programs.find(program => program.name.toUpperCase() === reference.scope.toUpperCase())
    if (writer === undefined || writer.safety === true) continue
    const declared = reference.resolved === undefined
      ? safetyTagsByName.get(reference.symbol.split('.')[0]?.toUpperCase() ?? '')
      : safetyTags.get(reference.resolved.toUpperCase())
    if (declared === undefined) continue
    report(
      'SAFETY_TAG_WRITTEN_FROM_STANDARD_LOGIC',
      'warning',
      `Safety tag ${declared.name} is written from standard program ${writer.name} (${reference.routine}${reference.rung === undefined ? '' : ` rung ${reference.rung}`}); Studio 5000 help states a standard parameter cannot write to a safety tag.`,
      { tag: declared.name, tagScope: declared.scope, program: writer.name, routine: reference.routine, ...(reference.rung === undefined ? {} : { rung: reference.rung }), access: reference.access, context: reference.context },
      'high',
    )
  }
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
  // On an export with encrypted routine bodies, a tag used only inside them has no readable
  // reference, so "unused" would be a guess dressed as a finding - 1277 of them on one export.
  const unreadableBodies = doc.protectedRoutines.length
  const skippedReadings: { rule: string; reason: string }[] = []
  if (unreadableBodies > 0) {
    skippedReadings.push({ rule: 'UNUSED_TAG', reason: `${unreadableBodies} routine body(ies) are encrypted, so a missing reference does not prove a tag unused` })
  } else {
    for (const tag of doc.tags) {
      // A module-defined tag such as `Local:1:C` or `TopCutter_MP2600iec:I` is
      // wired by the module, not by indexed logic, so "no reference" proves nothing
      // and buried the real findings: 20 such rows on one export.
      if (/:[A-Z]+$/u.test(tag.name)) continue
      const key = `${tag.scope}::${tag.name}`.toLowerCase()
      if (!used.has(key)) report('UNUSED_TAG', 'info', `No indexed logic reference to ${tag.scope}::${tag.name}`, { scope: tag.scope, tag: tag.name }, 'low')
    }
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
    // A module-defined tag — BottomKnife_MP2600iec:I.Data[0].3 — is declared by the module,
    // not in <Tags>, and the export lists the module. Reporting it as unresolved put 236
    // findings on one real project that compiles.
    const moduleName = /^([A-Za-z_][A-Za-z0-9_]*):/u.exec(ref.symbol)?.[1]
    if (moduleName !== undefined && doc.modules.some(module => module.name !== '' && module.name.toUpperCase() === moduleName.toUpperCase())) continue
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
    // A partial export lists programs but no routine bodies. Claiming the main routine is missing
    // then blames the project for what the export never carried.
    if (program.mainRoutine !== '' && doc.routines.length > 0) {
      const declared = own.some(routine => routine.name.toUpperCase() === program.mainRoutine.toUpperCase())
      if (!declared) {
        report('MAIN_ROUTINE_MISSING', 'warning',
          `${program.name} names ${program.mainRoutine} as its main routine, and declares no routine of that name`,
          { program: program.name, mainRoutine: program.mainRoutine, routines: own.map(routine => routine.name).slice(0, 10) })
      }
    }
    // A JSR names a routine in the same program. A name the program does not declare cannot build.
    for (const routine of own) {
      if (routine.body.type !== 'RLL') continue
      for (const rung of routine.body.rungs) {
        for (const called of rung.text.matchAll(/(?:^|[^A-Za-z0-9_])JSR[ \t]*\([ \t]*([A-Za-z_][A-Za-z0-9_]*)/gu)) {
          const target = called[1]
          if (own.some(entry => entry.name.toUpperCase() === target.toUpperCase())) continue
          report('JSR_ROUTINE_MISSING', 'critical',
            `${program.name}::${routine.name} rung ${rung.number} calls JSR(${target}) and ${program.name} declares no routine of that name`,
            { program: program.name, routine: routine.name, rung: rung.number, called: target, routines: own.map(entry => entry.name).slice(0, 10) })
        }
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
        const operand = (match[2] ?? '').trim()
        // The whole address identifies the output. Splitting at the first dot made every bit of
        // one I/O word look like the same output (BottomKnife_MP2600iec:O.Data[1].0 and .1 were
        // reported as one tag driven twice on a real project).
        const tag = operand
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
    report('LATCH_WITHOUT_RESET', 'info', `${entry.program}::${entry.routine} latches ${entry.tag} at rung ${rungList(entry.rungs)}, and no OTU in this export resets it; an HMI write, a produced tag or another controller can still clear it`, { program: entry.program, routine: entry.routine, tag, rungs: entry.rungs.slice(0, 20), basis: 'CRAFT-FAULT-02' }, 'high')
  }
  for (const entry of driven.values()) {
    if (entry.rungs.length < 2) continue
    report('DUPLICATE_OUTPUT', 'warning', `${entry.program}::${entry.routine} drives ${entry.tag} from ${entry.rungs.length} rungs: ${rungList(entry.rungs)}`, { program: entry.program, routine: entry.routine, tag: entry.tag, rungs: entry.rungs.slice(0, 20), basis: 'CRAFT-FAULT-02' }, 'high')
  }
  const writers = new Map<string, Evidence[]>()
  for (const ref of references) if (ref.resolved !== undefined && (ref.access === 'write' || ref.access === 'read_write')) writers.set(ref.resolved, [...writers.get(ref.resolved) ?? [], ref])
  // An AOI forces its output parameters in EnableInFalse and Prescan on purpose: a production project
  // produced five "multiple writers" findings that were exactly that documented pattern.
  const presetRoutine = /^(?:EnableInFalse|Prescan|Postscan)$/iu
  // An AOI's own body writes its output parameters as often as its algorithm needs; a production
  // project produced eight such findings, every one inside Logic.
  const aoiRoutines = new Set<string>()
  for (const aoi of doc.aois) for (const routine of aoi.routines) aoiRoutines.add(`${routine.program}::${routine.name}`.toUpperCase())
  for (const [symbol, allSites] of writers) {
    const locations = allSites.filter(site =>
      !presetRoutine.test(site.routine) && !aoiRoutines.has(`${site.scope}::${site.routine}`.toUpperCase()))
    if (locations.length <= 1) continue
    if (!/(?:^|::|\.)[^.]*:(?:O|Output)|_Output|\.O\./iu.test(symbol)) continue
    report('MULTIPLE_OUTPUT_WRITES', 'info', `Output-like symbol ${symbol} is written from ${locations.length} sites: ${siteList(locations)}; two rungs may drive one word by design, so read the rungs before changing either`, locations, 'medium')
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
  // A safety program must be scheduled by a safety task; one that runs in a standard task, or in
  // none, is not a safety program at run time. Both corpus projects are clean, so this is silent.
  for (const program of doc.programs) {
    if (!program.safety) continue
    const scheduledBySafety = doc.tasks.some(task => task.safety && task.programs.some(name => name.toUpperCase() === program.name.toUpperCase()))
    if (!scheduledBySafety) {
      const where = doc.tasks.filter(task => task.programs.some(name => name.toUpperCase() === program.name.toUpperCase())).map(task => task.name)
      report('SAFETY_PROGRAM_NOT_IN_SAFETY_TASK', 'warning',
        where.length === 0
          ? `${program.name} is declared Class="Safety" but no task schedules it; schedule it from a task with Class="Safety", or clear its safety class.`
          : `${program.name} is declared Class="Safety" but is scheduled by ${where.join(', ')}, not a safety task; move it to a safety task or clear its safety class.`,
        { program: program.name, scheduledBy: where }, 'high')
    }
  }
  // A safety-enabled module needs its safety network number; without one the connection cannot be verified.
  for (const module of doc.modules) {
    if (module.safetyEnabled !== true || module.safetyNetwork !== undefined) continue
    report('SAFETY_MODULE_WITHOUT_SAFETY_NETWORK', 'warning',
      `${module.name} is safety-enabled but declares no safety network number; set its SafetyNetwork in Studio before download.`,
      { module: module.name, catalogNumber: module.catalogNumber }, 'high')
  }
  // Module Name is an identifier, not a label. A migration export carrying Name="Local:1"
  // (a colon, from the label the wizard was asked to keep) aborted the Studio import with
  // XMLSrv_E_IMPORT_ABORTED_NO_CHANGES, and no rule saw it: 318 findings passed, the
  // importer refused. Studio refuses to import this export, so it is critical.
  for (const module of doc.modules) {
    if (module.name === '' || /^[A-Za-z_][A-Za-z0-9_]*$/u.test(module.name)) continue
    report('MODULE_NAME_ILLEGAL', 'critical',
      `Module Name "${module.name}" is not a legal Logix identifier; Studio refuses to import an export carrying this defect (the import aborts with XMLSrv_E_IMPORT_ABORTED_NO_CHANGES).`,
      { module: module.name, catalogNumber: module.catalogNumber }, 'high')
  }
  // A safety add-on instruction is declared Class="Safety"; calling it from standard logic puts
  // a certified instruction where no safety task scans it. The corpus is clean, so this is not noise.
  const safetyAoiNames = new Set(doc.aois.filter(aoi => aoi.safety === true).map(aoi => aoi.name.toUpperCase()))
  const safetyProgramNames = new Set(doc.programs.filter(program => program.safety).map(program => program.name.toUpperCase()))
  if (safetyAoiNames.size > 0) {
    for (const routine of doc.routines) {
      if (routine.body.type !== 'RLL') continue
      if (safetyProgramNames.has(routine.program.toUpperCase())) continue
      for (const rung of routine.body.rungs) {
        for (const instruction of mnemonicsIn(rung.text)) {
          if (!safetyAoiNames.has(instruction)) continue
          report('SAFETY_INSTRUCTION_OUTSIDE_SAFETY_PROGRAM', 'warning',
            `${instruction} is a safety instruction called in standard program ${routine.program} (${routine.name} rung ${rung.number}); call it from a routine scheduled by a safety task, or remove it.`,
            { program: routine.program, routine: routine.name, rung: rung.number, instruction }, 'high')
        }
      }
    }
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
    else if (routine.body.type === 'SFC') findings.push(...validateSfcDiagram(routine))
    else if (routine.body.type === 'RLL') findings.push(...rungFindings(routine, { processorType: doc.controller.processorType }))
  }
  // Migration triage: a wizard-imported project carries the wizard's own artifacts, and on
  // one migration they buried the real findings — 110 RUNG_NO_OUTPUT, 7 DUPLICATE_OUTPUT and
  // 50 UNUSED_TAG against 2 findings that mattered. When a baseline is supplied, the rules
  // the wizard is known to produce collapse into one summary row per rule, so the findings
  // a reader must act on stay readable. The collapse is explicit: the count and a sample
  // of sites remain, and a row is itemized again by dropping the baseline.
  if (baseline !== undefined) {
    const wizardRules = new Set(['RUNG_NO_OUTPUT', 'DUPLICATE_OUTPUT', 'UNUSED_TAG'])
    const grouped = new Map<string, Finding[]>()
    for (const finding of findings) {
      if (wizardRules.has(finding.rule)) grouped.set(finding.rule, [...grouped.get(finding.rule) ?? [], finding])
    }
    if (grouped.size > 0) {
      for (let index = findings.length - 1; index >= 0; index -= 1) {
        if (wizardRules.has(findings[index]!.rule)) findings.splice(index, 1)
      }
      for (const [rule, rows] of grouped) {
        findings.push({
          rule,
          severity: 'info',
          message: `${rows.length} ${rule} finding(s) collapsed as migration-expected against the baseline: ${rows.slice(0, 3).map(finding => finding.message).join('; ')}${rows.length > 3 ? `; and ${rows.length - 3} more` : ''}. The wizard import is known to produce these; read a row only when it names logic you changed.`,
          evidence: { collapsed_count: rows.length, migration_expected: true, sample: rows.slice(0, 10).map(finding => finding.evidence) },
          confidence: 'medium',
          ...(REMEDIES[rule] === undefined ? {} : { fix: REMEDIES[rule] }),
        })
      }
    }
  }
  const byRule: Record<string, number> = {}
  const bySeverity: Record<string, number> = {}
  for (const finding of findings) {
    byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1
  }
  return { project_id: project.id, baseline_id: baseline?.id, findings, count: findings.length, summary: { byRule, bySeverity }, coverage: project.features, ...(skippedReadings.length === 0 ? {} : { skipped_readings: skippedReadings }), note: 'Heuristic findings require engineering review; absence of findings does not prove controller safety.' }
}

/** The remedy for a rule, when the map has one. */
export function remedyFor(rule: string): string | undefined {
  return REMEDIES[rule]
}
