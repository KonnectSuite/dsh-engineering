/**
 * Whole-project ladder diagram: every rung of a controller on one page.
 *
 * `l5x_routine_diagram` draws one routine; a review of an unfamiliar project
 * needs the whole scan, and twenty calls is why the field session looked at
 * text instead. This tool draws every RLL routine into a single SVG (and a PNG
 * when a browser is available), so one file answers "what does this program
 * do?". It reads the open project and writes only the image.
 *
 * @module dsh-engineering-l5x/tools/diagram
 */

import { isAbsolute , resolve } from 'node:path'
import { L5xError } from '../core/errors.ts'
import { success, type Coverage } from '../core/result.ts'
import { integer, object, string } from '../core/params.ts'
import type { ToolDefinition } from '../core/tool.ts'
import type { ProjectSession } from '../session.ts'
import { getRoutine, listRoutines } from '../model/routines.ts'
import { splitLabel, writeLadderRaster, type LadderRaster } from '../engine/render-ladder.ts'
import { optionalNumber, optionalString, tool } from './common.ts'

/** What a whole-project diagram cannot establish. */
const DIAGRAM_COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'exact Studio rendering: the diagram is a schematic drawn from parsed NeutralText',
    'branch structure: rungs are drawn as an instruction chain, parallel branches flattened',
    'controller-compile acceptance of instructions the viewer does not model',
    'runtime behavior',
  ],
}

/** One instruction on a rung. */
interface Device {
  readonly op: string
  readonly operand: string
}

/** One rung somewhere in the project. */
interface Row {
  readonly program: string
  readonly routine: string
  readonly number: number
  readonly comment: string
  readonly devices: readonly Device[]
}

/** Instructions in NeutralText order. */
function devicesOf(text: string): Device[] {
  const found: Device[] = []
  for (const match of text.matchAll(/([A-Z][A-Z0-9_]*)\s*\(([^)]*)\)/gu)) {
    const op = match[1] ?? ''
    if (op === '') continue
    found.push({ op, operand: (match[2] ?? '').trim() })
  }
  return found
}

/** Escape text for an SVG document. */
function escape(text: string): string {
  return text.replace(/[&<>"']/gu, character => {
    switch (character) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&apos;'
    }
  })
}

/** Rough width of a device box, in pixels. */
function widthOf(device: Device): number {
  const label = `${device.op}(${device.operand})`
  return Math.min(330, Math.max(120, 22 + label.length * 8))
}

/** Trim a label to the characters its box can hold. */
function fitLabel(label: string, width: number): string {
  const capacity = Math.max(4, Math.floor(width / 7.6))
  return label.length <= capacity ? label : `${label.slice(0, capacity - 1)}…`
}

/** Draw the rows as a ladder page. */
export function renderProjectDiagram(rows: readonly Row[], title: string, note?: string): LadderRaster {
  const width = 1500
  const header = 108
  const shapes: string[] = []
  shapes.push(`<text x="28" y="46" fill="#E2E8F0" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="600">${escape(title)}</text>`)
  shapes.push(`<text x="28" y="76" fill="#94A3B8" font-family="Segoe UI, Arial, sans-serif" font-size="16">${rows.length} rung(s) drawn as instruction chains${note === undefined ? "" : ` · ${escape(note)}`}</text>`)
  let top = header
  let routine = ''
  for (const row of rows) {
    const label = `${row.program}/${row.routine}`
    if (label !== routine) {
      routine = label
      shapes.push(`<text x="120" y="${top + 18}" fill="#FBBF24" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="600">${escape(label)}</text>`)
      top += 30
    }
    if (row.comment !== '') {
      shapes.push(`<text x="120" y="${top + 16}" fill="#94A3B8" font-family="Segoe UI, Arial, sans-serif" font-size="14">${escape(row.comment.slice(0, 110))}</text>`)
    }
    const middle = top + 52
    shapes.push(`<line x1="90" y1="${middle}" x2="${width - 28}" y2="${middle}" stroke="#475569" stroke-width="2"/>`)
    shapes.push(`<text x="28" y="${middle + 6}" fill="#7DD3FC" font-family="Segoe UI, Arial, sans-serif" font-size="15">${row.number}</text>`)
    let x = 120
    let rowTop = middle - 20
    let rowHeight = 30
    let bottom = rowTop + 30
    for (const device of row.devices) {
      const boxWidth = widthOf(device)
      const label = `${device.op}(${device.operand})`
      const lines = splitLabel(label)
      // A wrapped label needs a taller box, and the next row has to clear that height.
      const boxHeight = lines.length > 1 ? 34 : 30
      if (x + boxWidth > width - 40) {
        x = 120
        rowTop += rowHeight + 6
        rowHeight = 30
      }
      shapes.push(`<rect x="${x}" y="${rowTop}" width="${boxWidth}" height="${boxHeight}" rx="6" fill="#1E293B" stroke="#60A5FA" stroke-width="1.5"/>`)
      if (lines.length > 1) {
        shapes.push(`<text x="${x + 10}" y="${rowTop + 14}" fill="#E2E8F0" font-family="Consolas, monospace" font-size="12">${escape(fitLabel(lines[0] ?? '', boxWidth - 20))}</text>`)
        shapes.push(`<text x="${x + 10}" y="${rowTop + 28}" fill="#E2E8F0" font-family="Consolas, monospace" font-size="12">${escape(fitLabel(lines[1] ?? '', boxWidth - 20))}</text>`)
      } else {
        shapes.push(`<text x="${x + 10}" y="${rowTop + 21}" fill="#E2E8F0" font-family="Consolas, monospace" font-size="14">${escape(fitLabel(label, boxWidth - 20))}</text>`)
      }
      x += boxWidth + 16
      rowHeight = Math.max(rowHeight, boxHeight)
      bottom = Math.max(bottom, rowTop + boxHeight)
    }
    top = bottom + 22
  }
  const height = top + 30
  shapes.unshift(`<line x1="90" y1="${header - 22}" x2="90" y2="${height - 26}" stroke="#94A3B8" stroke-width="2"/>`)
  shapes.unshift(`<rect x="0" y="0" width="${width}" height="${height}" fill="#0F172A"/>`)
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ...shapes,
    '</svg>',
    '',
  ].join('\n')
  return { svg, width, height, rungs: rows.length, flattened: [] }
}

/** The whole-project diagram tool. */
export function diagramTools(session: ProjectSession): readonly ToolDefinition[] {
  return [
    tool({
      name: 'l5x_diagram',
      description: 'Draw every ladder rung of the open project on one page as a schematic, so a review of unfamiliar logic can be answered with an image instead of NeutralText. Returns the SVG path and, when Chrome or Edge is installed, a PNG. Reads the project; writes only the image and imports nothing.',
      parameters: object({
        project_id: string('Optional project handle. Omit when exactly one project is open.'),
        program: string('Optional program name to restrict the page to one program.'),
        routine: string('Optional routine name to restrict the page to one routine.'),
        start_rung: integer('Rung offset to start the page at, for reading a large project in pages. Defaults to 0.', { minimum: 0 }),
        max_rungs: integer('Most rungs to draw. Defaults to 60, at most 200.', { minimum: 1, maximum: 200 }),
        output: string('Optional folder for the image, relative to the workspace. Defaults to ".l5x-diagram".'),
      }, []),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const program = optionalString(args, 'program')
        const routineName = optionalString(args, 'routine')
        const startRung = optionalNumber(args, 'start_rung') ?? 0
        const requested = optionalNumber(args, 'max_rungs') ?? 60
        if (requested < 1 || requested > 200) {
          throw new L5xError('INVALID_ARGUMENT', `max_rungs must be between 1 and 200, not ${requested}.`, 'Pass a smaller page, for example 40, or omit the argument for 60.')
        }
        const allRoutines = listRoutines(project.document)
        const routines = allRoutines.filter(info => info.type === 'RLL' && (program === undefined || info.program === program) && (routineName === undefined || info.name === routineName))
        if (routines.length === 0) {
          const candidates = allRoutines.map(info => `${info.program}/${info.name} (${info.type})`).slice(0, 12)
          // Three different conditions answered one NOT_FOUND: a missing program, a missing routine,
          // and a program that exists but has no ladder. A reader needs the one that is true.
          if (program !== undefined && !project.document.programs.some(entry => entry.name === program)) {
            throw new L5xError('NOT_FOUND', `No program named ${program}.`, 'Call l5x_list_components kind="program" for the declared programs.', project.document.programs.map(entry => entry.name))
          }
          if (routineName !== undefined && !allRoutines.some(info => info.name === routineName && (program === undefined || info.program === program))) {
            throw new L5xError('NOT_FOUND', `No routine named ${routineName}${program === undefined ? '' : ` in program ${program}`}.`, 'Call l5x_list_components kind="routine" for the declared routines and their languages.', candidates)
          }
          throw new L5xError(
            'NO_LADDER_ROUTINES',
            program === undefined ? 'The project has no ladder routines to draw.' : `Program ${program} exists but has no ladder routines.`,
            'Pass a program or routine that owns RLL content; l5x_list_components shows each routine language.',
            candidates,
          )
        }
        const rows: Row[] = []
        let omitted = 0
        let beyond = 0
        let seen = 0
        for (const info of routines) {
          const routine = getRoutine(project.document, info.program, info.name)
          if (routine === undefined || routine.body.type !== 'RLL') continue
          for (const rung of routine.body.rungs) {
            if (seen < startRung) {
              seen += 1
              continue
            }
            if (rows.length >= requested) {
              omitted += 1
              continue
            }
            const devices = devicesOf(rung.text)
            if (devices.length === 0) {
              beyond += 1
              continue
            }
            rows.push({
              program: info.program,
              routine: info.name,
              number: rung.number,
              comment: rung.comment ?? '',
              devices,
            })
          }
        }
        if (rows.length === 0) {
          throw new L5xError('NOT_FOUND', 'Every rung in range is empty, so there is nothing to draw.', 'Drop the program filter or raise max_rungs.')
        }
        const controller = project.document.controller.name
        const title = `${controller} · ${rows.length} rung(s) · ${routines.length} ladder routine(s)`
        const at = startRung + 1
        const through = startRung + rows.length
        // A page beyond the first carries its range, or each page overwrites the last image.
        const slug = startRung === 0 && omitted === 0 ? 'l5x-diagram' : `l5x-diagram-r${at}-${through}`
        const folder = optionalString(args, 'output') ?? '.l5x-diagram'
        const resolvedTarget = await session.resolvePath(`${folder}/${slug}.svg`, exec)
        const target = isAbsolute(resolvedTarget) ? resolvedTarget : resolve(resolvedTarget)
        // The output folder is defaulted by this tool, so a host that cannot make the path
        // absolute is not the caller's mistake, and the page has already rendered. Return it and
        // say why the image is missing, the way l5x_routine_diagram does, instead of failing the
        // call over an argument the caller never passed.
        const writable = isAbsolute(target)
        const pageNote = `${at}-${through} of ${at - 1 + rows.length + omitted} rung(s)` + (omitted === 0 ? '' : ` · next page start_rung ${through}`)
        const raster = writable ? await writeLadderRaster(folderOf(target), slug, renderProjectDiagram(rows, title, pageNote)) : undefined
        const drawn = raster === undefined ? '' : raster.png ?? raster.svg
        const words = raster === undefined
          ? `Drew ${rows.length} rung(s); no image was written because the workspace path ${target} is not absolute.`
          : omitted === 0
            ? `Drew ${rows.length} rung(s) as ${drawn}.`
            : `Drew ${rows.length} rung(s) as ${drawn} (from rung offset ${startRung}); ${omitted} more follow, so page on with start_rung ${startRung + rows.length}.`
        return success(
          `${words}${beyond === 0 ? '' : ` ${beyond} rung(s) carried no instructions.`}`,
          {
            controller,
            programs: [...new Set(rows.map(row => row.program))],
            routines: rows.length === 0 ? 0 : new Set(rows.map(row => `${row.program}/${row.routine}`)).size,
            rungs: rows.length,
            start_rung: startRung,
            next_start: omitted === 0 ? null : startRung + rows.length,
            omitted,
            empty: beyond,
            ...(raster === undefined
              ? { image_error: `The workspace path ${target} is not absolute, so no image was written.` }
              : { diagram_svg: raster.svg, ...(raster.png === undefined ? {} : { diagram_png: raster.png }) }),
            note: 'The diagram is a schematic drawn from parsed rungs, not a Studio screenshot; parallel branches are flattened.',
          },
          raster?.png === undefined
            ? []
            : [{ tool: 'present', why: 'Attach the PNG so the answer shows the project logic itself.', args: { files: [{ path: raster.png, description: `Ladder diagram of ${controller}` }] } }],
          DIAGRAM_COVERAGE,
        )
      },
    }),
  ]
}

/** Folder part of an absolute path. */
function folderOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return cut === -1 ? '.' : path.slice(0, cut)
}
