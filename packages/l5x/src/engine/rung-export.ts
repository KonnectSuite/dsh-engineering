/**
 * Write the rung-target L5X that Studio's Import Rungs accepts.
 *
 * A routine-target export (`TargetType="Routine"`) is what `l5x_draft_apply`
 * writes and what Import Routine accepts. Import Rungs is a different shape:
 * the document target is a count of rungs, the routine and its container are
 * context, and each imported rung carries `Use="Target"` on the rung element.
 * Studio refuses a routine export with "The specified L5X file does not contain
 * a Rung export." (error 5078-0), so this module builds the rung shape from an
 * already prepared export without touching its logic.
 *
 * @module dsh-engineering-l5x/engine/rung-export
 */

import { loadL5x } from '../model/index.ts'
import { EngineeringError, type ProjectSnapshot } from '../session.ts'
import { uniqueRegion, xmlRegions, type XmlRegion } from './xml-regions.ts'

/** Which rungs to put in the file, and where to find them. */
export interface RungTargetOptions {
  /** Program holding the routine; omit when the export has exactly one. */
  readonly program?: string
  /** Ladder routine to read; omit when the program has exactly one routine. */
  readonly routine?: string
  /** Rung numbers to export in document order; omit for every rung. */
  readonly rungs?: readonly number[]
}

/** The rung-target document and the choice it records. */
export interface RungTargetExport {
  /** XML text for Studio's Import Rungs file picker. */
  readonly xml: string
  /** Program the rungs belong to. */
  readonly program: string
  /** Routine the rungs belong to. */
  readonly routine: string
  /** Rung numbers in the source routine, in the order exported. */
  readonly rung_numbers: readonly number[]
}

/** Escape one XML attribute value. */
function attribute(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;')
}

/** Render one element's opening tag, replacing overridden attribute values. */
function openTag(region: XmlRegion, overrides: Readonly<Record<string, string>>, drop: readonly string[] = []): string {
  const attributes: string[] = []
  const seen = new Set<string>(['Use'])
  const use = overrides.Use
  if (use !== undefined) attributes.push(`Use="${attribute(use)}"`)
  for (const [name, value] of Object.entries(region.attributes)) {
    if (drop.includes(name) || name === 'Use') continue
    const override = overrides[name]
    attributes.push(`${name}="${attribute(override ?? value)}"`)
    seen.add(name)
  }
  for (const [name, value] of Object.entries(overrides)) {
    if (seen.has(name) || name === 'Use') continue
    attributes.push(`${name}="${attribute(value)}"`)
    seen.add(name)
  }
  return `<${region.kind}${attributes.length === 0 ? '' : ' ' + attributes.join(' ')}>`
}

/** Match a region by its Name attribute, case-insensitively. */
function named(parents: readonly XmlRegion[], kind: string, name: string): XmlRegion {
  const matches = parents.filter(region => region.kind === kind && region.attributes.Name?.toLowerCase() === name.toLowerCase())
  if (matches.length === 0) {
    const known = parents.filter(region => region.kind === kind).map(region => region.attributes.Name ?? '(unnamed)')
    throw new EngineeringError('COMPONENT_NOT_FOUND', `No ${kind} named ${name} in this scope.`, `Pass one of: ${known.join(', ')}.`)
  }
  if (matches.length > 1) throw new EngineeringError('AMBIGUOUS_TARGET', `Expected one ${kind} named ${name}; found ${matches.length}`, 'Narrow the scope: more than one match carries this name.')
  return matches[0]!
}

/** Give one opening tag's attribute list the context use, replacing any existing Use. */
function contextUse(attributes: string): string {
  if (/\bUse="[^"]*"/u.test(attributes)) return attributes.replace(/\bUse="[^"]*"/u, 'Use="Context"')
  return ` Use="Context"${attributes}`
}

/**
 * Mark every owner between the root and the exported routine as context.
 *
 * Studio's own rung export carries `Use="Context"` on Controller, Tags, Programs,
 * Program, Routines and RLLContent. The rung itself is the only target.
 */
function contextPrefix(prefix: string): string {
  return prefix
    .replace(/<Controller\b([^>]*)>/u, (_match, attributes: string) => `<Controller${contextUse(attributes)}>`)
    .replace(/<(Programs|Routines|Tags|Program)\b([^>]*)>/gu, (match, tag: string, attributes: string) => {
      if (/\bUse="/u.test(attributes)) return match
      return `<${tag} Use="Context"${attributes}>`
    })
}

/**
 * Build a rung-target export from a parsed project.
 *
 * @param project - Open export (a controller project or a component with context).
 * @param options - Program, routine and optional rung selection.
 * @returns Rung-target XML, validated by the L5X parser before it is written.
 */
export function buildRungTargetExport(project: ProjectSnapshot, options: RungTargetOptions = {}): RungTargetExport {
  const root = uniqueRegion(xmlRegions(project.xml), 'RSLogix5000Content')
  const controller = uniqueRegion(root.children, 'Controller')
  const programs = uniqueRegion(controller.children, 'Programs')
  const programRegions = programs.children.filter(region => region.kind === 'Program')
  const program = options.program === undefined
    ? (programRegions.length === 1 ? programRegions[0]! : (() => { throw new EngineeringError('AMBIGUOUS_TARGET', 'The export holds more than one program; which one holds the rungs?', `Pass program as one of: ${programRegions.map(region => region.attributes.Name ?? '(unnamed)').join(', ')}.`) })())
    : named(programRegions, 'Program', options.program)
  const routines = uniqueRegion(program.children, 'Routines')
  const routineRegions = routines.children.filter(region => region.kind === 'Routine')
  const routine = options.routine === undefined
    ? (routineRegions.length === 1 ? routineRegions[0]! : (() => { throw new EngineeringError('AMBIGUOUS_TARGET', 'The program holds more than one routine; which one holds the rungs?', `Pass routine as one of: ${routineRegions.map(region => region.attributes.Name ?? '(unnamed)').join(', ')}.`) })())
    : named(routineRegions, 'Routine', options.routine)
  const routineName = routine.attributes.Name ?? ''
  const ladder = routine.children.filter(region => region.kind === 'RLLContent')
  if (ladder.length !== 1) throw new EngineeringError('UNSUPPORTED_ROUTINE', `Routine ${routineName} is not a ladder routine.`, 'Import Rungs accepts only ladder rungs; use Import Routine for structured text, FBD or SFC exports.')
  const allRungs = ladder[0]!.children.filter(region => region.kind === 'Rung')
  if (allRungs.length === 0) throw new EngineeringError('NOTHING_TO_EXPORT', `Routine ${routineName} has no rungs.`, 'Add or draft a rung first, then export it.')

  const byNumber = new Map<number, { region: XmlRegion; number: number }>()
  for (const [position, region] of allRungs.entries()) {
    const parsed = Number.parseInt(region.attributes.Number ?? String(position), 10)
    byNumber.set(Number.isInteger(parsed) ? parsed : position, { region, number: Number.isInteger(parsed) ? parsed : position })
  }
  const chosen = options.rungs === undefined
    ? allRungs.map((region, position) => byNumber.get(position) ?? { region, number: position })
    : options.rungs.map(number => {
        const found = byNumber.get(number)
        if (found === undefined) throw new EngineeringError('COMPONENT_NOT_FOUND', `No rung ${number} in ${routineName}.`, `Pass rung numbers from: ${[...byNumber.keys()].sort((a, b) => a - b).join(', ')}.`)
        return found
      })

  const body = chosen.map(({ region, number }, index) => {
    const tag = openTag(region, { Use: 'Target', Number: String(index) }, [])
    return `${tag}${project.xml.slice(region.contentStart, region.contentEnd)}</${region.kind}>`
  }).join('\n')

  const exportOptions = new Set((root.attributes.ExportOptions ?? '').split(/\s+/u).filter(Boolean))
  for (const option of ['References', 'NoRawData', 'L5KData', 'DecoratedData', 'Context', 'RoutineLabels', 'AliasExtras', 'IOTags', 'ForceProtectedEncoding', 'AllProjDocTrans']) exportOptions.add(option)
  const rootAttributes: Record<string, string> = {
    SchemaRevision: root.attributes.SchemaRevision ?? '1.0',
    SoftwareRevision: root.attributes.SoftwareRevision ?? project.softwareRevision,
    TargetType: 'Rung',
    TargetCount: String(chosen.length),
    ContainsContext: 'true',
    ...(root.attributes.ExportDate === undefined ? {} : { ExportDate: root.attributes.ExportDate }),
    ExportOptions: [...exportOptions].join(' '),
  }
  const rootTag = `<RSLogix5000Content${Object.entries(rootAttributes).map(([name, value]) => ` ${name}="${attribute(value)}"`).join('')}>`
  const routineTag = `<Routine Use="Context" Name="${attribute(routineName)}">`
  const contentTag = '<RLLContent Use="Context">'

  const xml = `${project.xml.slice(0, root.start)}${rootTag}${contextPrefix(project.xml.slice(root.contentStart, routine.start))}${routineTag}\n${contentTag}\n${body}\n</RLLContent>\n</Routine>${project.xml.slice(routine.end, root.contentEnd)}</RSLogix5000Content>\n`
  loadL5x(xml)
  return { xml, program: program.attributes.Name ?? '', routine: routineName, rung_numbers: chosen.map(({ number }) => number) }
}
