/**
 * Build the handover documentation bundle for one export.
 *
 * Everything here is derived from the parsed project: the generator provides the
 * structure and the citations, and the narrative prose stays the caller's job.
 * That split is deliberate - a generated narrative would be an unsourced claim,
 * while a rung with its number, comment, text and referenced tags is evidence a
 * reviewer can check in one click.
 *
 * The builder is pure: it returns a map of relative path to text and writes
 * nothing. The tool decides where the folder goes.
 *
 * @module dsh-engineering-l5x/engine/documentation
 */

import { L5xError } from '../core/errors.ts'
import type { ProjectSnapshot } from '../session.ts'
import { getRoutine, listRoutines } from '../model/routines.ts'
import type { L5xDocument, L5xRoutine, L5xRung, L5xTag } from '../model/types.ts'
import { aliasesOf } from './configuration.ts'
import { parseLadder, type LadderNode } from './logic-syntax.ts'
import { resolveTag } from './tag-resolution.ts'
import { remedyFor, runChecks } from './review.ts'

/** One documentation part a caller can ask for. */
export type DocumentPart = 'project' | 'io' | 'tags' | 'rungs'

/** Every part, in the order the files are produced. */
export const DOCUMENT_PARTS: readonly DocumentPart[] = ['project', 'io', 'tags', 'rungs']

/** What one generation produced. */
export interface DocumentBundle {
  /** Relative path to file text. */
  readonly files: ReadonlyMap<string, string>
  /** Counts a caller can compare with project_overview. */
  counts: {
    programs: number
    /** AOI routines documented alongside the program routines. */
    aoiRoutines: number
    /** Ladder rungs inside those AOI routines. */
    aoiRungs: number
    /** User-defined data types the export declares. */
    udts: number
    /** Add-on instruction definitions the export declares. */
    aois: number
    /** Alarm definitions the export declares. */
    alarms: number
    /** Vendor and product-defined data types, counted but not documented. */
    vendorTypes: number
    tasks: number
    routines: number
    rungs: number
    comments: number
    tags: number
    modules: number
  }
  /** Programs and routines the filters excluded. */
  readonly excluded: { readonly programs: readonly string[]; readonly routines: readonly string[] }
}

/** Options for one generation. */
export interface DocumentOptions {
  /** Parts to produce; defaults to all. */
  readonly include?: readonly DocumentPart[]
  /** Restrict to these programs. */
  readonly programs?: readonly string[]
  /** Restrict to these routine names. */
  readonly routines?: readonly string[]
  /** Most rungs per generated file before a continuation file is written. */
  readonly rungsPerFile?: number
}

/** CSV cell with quoting when the value needs it. */
function cell(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value)
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** One CSV line. */
function line(...values: readonly unknown[]): string {
  return `${values.map(cell).join(',')}\n`
}

/** A markdown table row. */
function mdRow(...values: readonly unknown[]): string {
  return `| ${values.map(value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')).join(' | ')} |\n`
}

/** Every instruction name in one rung, branches included. */
function instructionsOf(nodes: readonly LadderNode[], out = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.kind === 'instruction') out.add(node.name.toUpperCase())
    else for (const path of node.paths) instructionsOf(path, out)
  }
  return out
}

/** Tags a rung mentions, resolved through the export; instruction names excluded. */
function tagsOf(document: L5xDocument, rung: L5xRung): readonly string[] {
  const parsed = parseLadder(rung.text)
  const instructions = instructionsOf(parsed.nodes)
  for (const aoi of document.aois) instructions.add(aoi.name.toUpperCase())
  const found = new Set<string>()
  for (const match of rung.text.matchAll(/[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+|\[[^\]]*\])*/gu)) {
    const text = match[0]
    if (instructions.has(text.toUpperCase())) continue
    const resolution = resolveTag(document, 'controller', text)
    if (resolution.resolved) found.add(resolution.canonical ?? text)
  }
  return [...found]
}

/** A tag's alias target, for the CSV only. */
function aliasTarget(document: L5xDocument, tag: L5xTag): string {
  return aliasesOf(document).get(`${tag.scope}::${tag.name}`) ?? ''
}

/** The tags CSV every declared tag appears in. */
function tagsCsv(document: L5xDocument): string {
  // A tag declared in a safety program is part of the safety function; the CSV must say so.
  const safetyScopes = new Set(document.programs.filter(program => program.safety).map(program => program.name.toUpperCase()))
  let text = line('scope', 'name', 'data_type', 'description', 'alias_for', 'dimensions', 'external_access', 'safety')
  for (const tag of document.tags) {
    const record = tag as unknown as Record<string, unknown>
    text += line(tag.scope, tag.name, tag.dataType, tag.description ?? '', aliasTarget(document, tag), record.dimensions ?? '', tag.externalAccess ?? '', tag.safety === true || safetyScopes.has(tag.scope.toUpperCase()))
  }
  return text
}

/**
 * The Studio import shape: `Tag Name,Description`.
 *
 * A program-scoped tag is written `Program:Name` so a duplicate name across two
 * programs cannot silently overwrite one of them on import. Verify the template
 * against the installed Studio help before relying on it for a bulk import.
 */
function tagsStudioCsv(document: L5xDocument): string {
  let text = line('Tag Name', 'Description')
  for (const tag of document.tags) {
    const name = tag.scope === 'controller' ? tag.name : `${tag.scope}:${tag.name}`
    text += line(name, tag.description ?? '')
  }
  return text
}

/** The I/O list: modules and the tags that look like module data. */
function ioFiles(document: L5xDocument): { markdown: string; csv: string } {
  const io = document.tags.filter(tag => tag.name.includes(':'))
  let markdown = '# I/O list\n\n'
  markdown += `${document.modules.length} module(s); ${io.length} tag(s) look like module data (a colon in the name).\n\n`
  // An electrician needs to know which I/O is safety-rated and on which safety network.
  markdown += '| Module | Catalog | Slot | Parent | Inhibited | Safety | Safety network | Description |\n|---|---|---|---|---|---|---|---|\n'
  for (const module of document.modules) {
    markdown += mdRow(module.name, module.catalogNumber, module.slot ?? '', module.parentModule, module.inhibited === true, module.safetyEnabled === true, module.safetyNetwork ?? '', module.description ?? '')
  }
  markdown += `\nModule-data tags: ${io.map(tag => tag.name).join(', ') || 'none'}.\n`
  let csv = line('name', 'catalog_number', 'slot', 'parent_module', 'inhibited', 'safety', 'safety_network', 'description')
  for (const module of document.modules) csv += line(module.name, module.catalogNumber, module.slot ?? '', module.parentModule, module.inhibited === true, module.safetyEnabled === true, module.safetyNetwork ?? '', module.description ?? '')
  return { markdown, csv }
}

/** The project summary: identity, tasks, programs, counts, coverage. */
function projectMarkdown(project: ProjectSnapshot, counts: DocumentBundle['counts']): string {
  const document = project.document
  const { controller } = document
  let text = `# ${controller.name} project documentation\n\n`
  text += `Generated from \`${project.path}\` (sha256 \`${project.sha256.slice(0, 16)}...\`) at ${new Date().toISOString()}.\n\n`
  text += `- Processor: ${controller.processorType}\n- Revision: ${document.controller.majorRev}.${document.controller.minorRev}\n`
  text += `- Export: ${project.exportKind}; parser verification: ${project.verification}\n`
  // The saved route and project serial are what a handover reader needs to reach and identify the machine.
  text += `- Project serial: ${controller.projectSerialNumber ?? 'not declared'}; saved path: ${controller.commPath ?? 'not declared'}\n`
  text += `- Programs: ${counts.programs}; tasks: ${counts.tasks}; routines: ${counts.routines}; AOI routines: ${counts.aoiRoutines} (${counts.aoiRungs} rungs); rungs: ${counts.rungs} (${counts.comments} with comments); tags: ${counts.tags}; modules: ${counts.modules}; data types: ${counts.udts}; vendor/product-defined data types: ${counts.vendorTypes} (not listed); add-on instructions: ${counts.aois}; alarms: ${counts.alarms}\n\n`
  if ((project.protectedRoutines ?? 0) > 0) text += `- Source-protected routines: ${project.protectedRoutines}. Their bodies are encrypted in this export and were not documented.\n`
  text += '## Tasks\n\n| Task | Type | Rate (ms) | Priority | Safety | Programs |\n|---|---|---|---|---|---|\n'
  for (const task of document.tasks) text += mdRow(task.name, task.type, task.rate, task.priority, task.safety === true, task.programs.join(', '))
  text += '\n## Programs\n\n| Program | Main routine | Routines | Safety | Description |\n|---|---|---|---|---|\n'
  for (const program of document.programs) {
    const routines = listRoutines(document, program.name)
    text += mdRow(program.name, program.mainRoutine, routines.length, program.safety === true, program.description)
  }
  // Data types are what the tags are made of; the section belongs to every project, not only AOI projects.
  if (document.udts.length > 0) {
    text += '\n## Data Types\n\n| Data type | Members | Description |\n|---|---|---|\n'
    for (const udt of document.udts) text += mdRow(udt.name, udt.members.length, udt.description)
  }
  // AOIs are where much of a real project's behaviour lives; the bundle named none of them.
  if (document.aois.length > 0) {
    text += '\n## Add-On Instructions\n\n| Instruction | Revision | Safety | Parameters | Routines | Description |\n|---|---|---|---|---|---|\n'
    for (const aoi of document.aois) {
      // An encrypted instruction has routines we cannot see; 0 would claim it has none.
      text += mdRow(aoi.name, aoi.revision, aoi.safety === true ? 'yes' : 'no', aoi.parameters.length, aoi.protected === true ? 'encrypted' : aoi.routines.length, aoi.description)
    }
  }
  // Alarms are configuration a handover reader needs: name, element kind and description.
  if (document.alarms.length > 0) {
    text += '\n## Alarms\n\n| Alarm | Kind | Description |\n|---|---|---|\n'
    for (const alarm of document.alarms) text += mdRow(alarm.name, alarm.kind, alarm.description)
  }
  // A handover reader must know which parts of the project are safety before touching anything.
  const safetyTasks = document.tasks.filter(task => task.safety)
  const safetyPrograms = document.programs.filter(program => program.safety)
  const safetyModules = document.modules.filter(module => module.safetyEnabled === true)
  const safetyAois = document.aois.filter(aoi => aoi.safety === true)
  if (safetyTasks.length + safetyPrograms.length + safetyModules.length + safetyAois.length > 0) {
    text += '\n## Safety\n\n| Kind | Names |\n|---|---|\n'
    if (safetyTasks.length > 0) text += mdRow('Safety task', safetyTasks.map(task => task.name).join(', '))
    if (safetyPrograms.length > 0) text += mdRow('Safety program', safetyPrograms.map(program => program.name).join(', '))
    if (safetyModules.length > 0) text += mdRow('Safety I/O module', `${safetyModules.length}: ${safetyModules.slice(0, 20).map(module => module.name).join(', ')}${safetyModules.length > 20 ? ', ...' : ''}`)
    if (safetyAois.length > 0) text += mdRow('Safety AOI', safetyAois.map(aoi => aoi.name).join(', '))
  }
  if (project.document.protectedRoutines.length > 0) {
    text += '\n## Source-protected routines\n\nTheir bodies are encrypted in this export and are not documented here.\n\n| Program | Routine |\n|---|---|\n'
    for (const entry of project.document.protectedRoutines.slice(0, 200)) text += mdRow(entry.program, entry.name)
    if (project.document.protectedRoutines.length > 200) text += `\n${project.document.protectedRoutines.length - 200} more are not listed.\n`
  }
  // The bundle should not read clean while the checks already know something is wrong.
  const checks = runChecks(project) as { findings?: readonly { rule: string; severity: string }[] }
  const findings = checks.findings ?? []
  if (findings.length > 0) {
    const bySeverity = new Map<string, number>()
    const byRule = new Map<string, number>()
    for (const finding of findings) {
      bySeverity.set(finding.severity, (bySeverity.get(finding.severity) ?? 0) + 1)
      byRule.set(finding.rule, (byRule.get(finding.rule) ?? 0) + 1)
    }
    const severityRow = [...bySeverity].sort().map(([severity, count]) => mdRow(severity, count)).join('')
    const rules = [...byRule].sort((left, right) => right[1] - left[1]).slice(0, 8).map(([rule, count]) => `${rule} (${count})`).join(', ')
    text += '\n## Review findings\n\nHeuristic; absence of findings does not prove controller safety. Run run_checks for sites.\n\n| Severity | Count |\n|---|---|\n'
    text += severityRow
    text += `\nTop rules: ${rules}.${byRule.size > 8 ? ` And ${byRule.size - 8} more rule(s).` : ''}\n`
    const topRule = [...byRule].sort((left, right) => right[1] - left[1])[0]?.[0]
    const topRemedy = topRule === undefined ? undefined : remedyFor(topRule)
    if (topRemedy !== undefined) text += `\nMost common rule, ${topRule}: ${topRemedy}\n`
  }
  text += '\n## Coverage\n\nThis document is generated from the saved export. It does not prove construction of the program,'
  text += ' compiled behaviour, runtime behaviour, or anything outside the export (HMI, produced/consumed tags, driver consumers).\n'
  return text
}

/** Rung skeletons, one markdown file per program (and continuation). */
/** One-line description of a diagram language. */
const DIAGRAM_LANGUAGE: Readonly<Record<string, string>> = {
  FBD: 'Function block diagram',
  SFC: 'Sequential function chart',
}

/**
 * Document one non-ladder routine from the elements the reader decoded.
 *
 * Execution semantics remain unverified, so this lists what the export records - an element,
 * the reference it carries and the wires between ids - and never claims what runs.
 *
 * @param info - The routine's listing entry.
 * @param routine - The routine whose body is not ladder.
 * @returns A markdown section for the routine.
 */
function diagramSection(info: { readonly name: string; readonly description: string }, routine: L5xRoutine): string {
  const body = routine.body
  const heading = `\n## ${info.name}\n\n${info.description || 'No routine description.'}\n`
  // Structured Text documents itself: the source is the logic, one <Line> per source line.
  if (body.type === 'ST') return `${heading}\n\`\`\`\n${body.code}\n\`\`\`\n`
  if (body.type === 'other') return `${heading}\nNot decomposed: ${body.note}.\n`
  // Ladder is documented by the rung path, so it never reaches here.
  if (body.type !== 'FBD' && body.type !== 'SFC') return ''
  const nodes = body.nodes
  const language = DIAGRAM_LANGUAGE[body.type] ?? body.type
  const sheets = [...new Set(nodes.map(node => node.sheet))].sort((left, right) => left - right)
  let text = `\n## ${info.name}\n\n${info.description || 'No routine description.'}\n\n${language}; ${nodes.length} element(s) on ${sheets.length} sheet(s).\n`
  for (const sheet of sheets) {
    text += `\n### Sheet ${sheet}\n\n| Element | Reference | From | From pin | To | To pin |\n|---|---|---|---|---|---|\n`
    for (const node of nodes.filter(entry => entry.sheet === sheet)) {
      text += mdRow(node.kind, node.operand ?? node.name ?? node.text ?? '', node.fromId ?? '', node.fromParam ?? '', node.toId ?? '', node.toParam ?? '')
    }
  }
  return text
}

function rungFiles(project: ProjectSnapshot, options: { programs: readonly string[] | undefined; routines: readonly string[] | undefined; perFile: number }): Map<string, string> {
  const files = new Map<string, string>()
  const document = project.document
  const programs = options.programs ?? document.programs.map(program => program.name)
  for (const programName of programs) {
    const program = document.programs.find(entry => entry.name === programName)
    if (program === undefined) continue
    let section = `# ${programName} - rung documentation${program.safety === true ? ' (SAFETY program)' : ''}\n\nProgram main routine: ${program.mainRoutine || 'not declared'}. ${program.description || 'No program description.'}\n`
    let part = 1
    let inFile = 0
    let headingWritten = false
    for (const info of listRoutines(document, programName)) {
      if (options.routines !== undefined && !options.routines.includes(info.name)) continue
      const routine = getRoutine(document, programName, info.name)
      if (routine === undefined) continue
      // A project's logic is not always ladder. Dropping the other languages made a bundle
      // that said "3 routines" document one of them, which reads as if the program were
      // one rung long.
      if (routine.body.type !== 'RLL') {
        section += diagramSection(info, routine)
        continue
      }
      section += `\n## ${info.name}\n\n${info.description || 'No routine description.'}\n`
      for (const rung of routine.body.rungs) {
        const instructions = [...instructionsOf(parseLadder(rung.text).nodes)].join(', ')
        const tags = tagsOf(document, rung)
        section += `\n### Rung ${rung.number}\n\n`
        if (rung.comment !== undefined) section += `**Comment:** ${rung.comment.replaceAll('\n', '\n> ')}\n\n`
        section += `\`\`\`\n${rung.text}\n\`\`\`\n\n`
        section += `Instructions: ${instructions || 'none parsed'}.\n`
        if (tags.length > 0) section += `Tags: ${tags.join(', ')}.\n`
        inFile += 1
        if (inFile >= options.perFile) {
          files.set(part === 1 ? `rungs/${programName}.md` : `rungs/${programName}-${part}.md`, section)
          part += 1
          inFile = 0
          headingWritten = true
          section = `# ${programName} - rung documentation (continued)\n`
        }
      }
    }
    if (inFile > 0 || !headingWritten) files.set(part === 1 ? `rungs/${programName}.md` : `rungs/${programName}-${part}.md`, section)
  }
  // An AOI's logic is where safety instructions often live; documenting programs only hid it.
  if (options.programs === undefined) {
    for (const aoi of document.aois) {
      let section = `# ${aoi.name} - AOI routine documentation${aoi.safety === true ? ' (SAFETY instruction)' : ''}\n\n${aoi.description || 'No AOI description.'}\n`
      let documented = 0
      for (const routine of aoi.routines) {
        if (routine.body.type !== 'RLL') {
          section += `\n## ${routine.name}\n\nLanguage: ${routine.body.type}; read it with get_component kind="routine", scope="${aoi.name}".\n`
          continue
        }
        section += `\n## ${routine.name}\n\n${routine.description || 'No routine description.'}\n`
        for (const rung of routine.body.rungs) {
          const instructions = [...instructionsOf(parseLadder(rung.text).nodes)].join(', ')
          const tags = tagsOf(document, rung)
          section += `\n### Rung ${rung.number}\n\n`
          if (rung.comment !== undefined) section += `**Comment:** ${rung.comment.replaceAll('\n', '\n> ')}\n\n`
          section += '\u0060\u0060\u0060\n' + rung.text + '\n\u0060\u0060\u0060\n\n'
          section += `Instructions: ${instructions || 'none parsed'}.\n`
          if (tags.length > 0) section += `Tags: ${tags.join(', ')}.\n`
          documented += 1
        }
      }
      if (documented > 0) files.set(`rungs/AOI-${aoi.name}.md`, section)
    }
  }
  return files
}

/**
 * Build the documentation bundle.
 *
 * @param project - Open export snapshot.
 * @param options - Parts, filters and file split.
 * @returns Files to write, counts, and what the filters excluded.
 */
export function buildDocumentation(project: ProjectSnapshot, options: DocumentOptions = {}): DocumentBundle {
  const document = project.document
  const include = new Set<DocumentPart>(options.include ?? DOCUMENT_PARTS)
  const programs = options.programs === undefined ? undefined : [...options.programs]
  const routines = options.routines === undefined ? undefined : [...options.routines]
  if (programs !== undefined) {
    const unknown = programs.filter(name => !document.programs.some(program => program.name === name))
    if (unknown.length > 0) throw new L5xError('COMPONENT_NOT_FOUND', `No program named ${unknown.join(', ')}.`, 'Call list_components kind="program" for the declared names.', document.programs.map(program => program.name).slice(0, 5))
  }
  const counts: DocumentBundle['counts'] = {
    programs: programs?.length ?? document.programs.length,
    tasks: document.tasks.length,
    aoiRoutines: programs === undefined ? document.aois.reduce((total, aoi) => total + aoi.routines.length, 0) : 0,
    aoiRungs: programs === undefined
      ? document.aois.reduce((total, aoi) => total + aoi.routines.reduce((inner, routine) => inner + (routine.body.type === 'RLL' ? routine.body.rungs.length : 0), 0), 0)
      : 0,
    udts: document.udts.length,
    aois: document.aois.length,
    alarms: document.alarms.length,
    vendorTypes: document.vendorUdts.length,
    routines: 0,
    rungs: 0,
    comments: 0,
    tags: document.tags.length,
    modules: document.modules.length,
  }
  for (const program of document.programs) {
    if (programs !== undefined && !programs.includes(program.name)) continue
    for (const routine of listRoutines(document, program.name)) {
      if (routines !== undefined && !routines.includes(routine.name)) continue
      counts.routines += 1
      const body = getRoutine(document, program.name, routine.name)
      if (body !== undefined && body.body.type === 'RLL') {
        counts.rungs += body.body.rungs.length
        counts.comments += body.body.rungs.filter(rung => rung.comment !== undefined).length
      }
    }
  }
  const files = new Map<string, string>()
  if (include.has('project')) files.set('PROJECT.md', projectMarkdown(project, counts))
  if (include.has('io')) {
    const io = ioFiles(document)
    files.set('io.md', io.markdown)
    files.set('io.csv', io.csv)
  }
  if (include.has('tags')) {
    files.set('tags.csv', tagsCsv(document))
    files.set('tags-studio.csv', tagsStudioCsv(document))
  }
  if (include.has('rungs')) {
    const perFile = Math.max(1, options.rungsPerFile ?? 200)
    for (const [path, text] of rungFiles(project, { programs, routines, perFile })) files.set(path, text)
  }
  return {
    files,
    counts,
    excluded: {
      programs: programs === undefined ? [] : document.programs.map(program => program.name).filter(name => !programs.includes(name)),
      routines: document.routines.map(routine => routine.name).filter(name => routines !== undefined && !routines.includes(name)),
    },
  }
}
