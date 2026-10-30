/**
 * Ladder preview: the rungs a chat answer proposes, written as a viewer document.
 *
 * A proposed rung is normally pasted into the reply as NeutralText, which the
 * reader has to assemble in their head. This tool writes the same rungs as a
 * minimal, schema-shaped L5X export in the workspace, so the project viewer draws
 * them as ladder logic. It validates every rung with the same parser `draft_rung`
 * uses and refuses to write a rung that does not parse; it never touches a real
 * project and never imports into Studio.
 *
 * @module dsh-engineering-l5x/tools/preview
 */

import { L5xError } from '../core/errors.ts'
import { success, type Coverage } from '../core/result.ts'
import { choice, integer, object, string } from '../core/params.ts'
import type { ToolDefinition } from '../core/tool.ts'
import { parseLadder } from '../engine/logic-syntax.ts'
import { getRoutine, listRoutines } from '../model/routines.ts'
import { renderLadderSvg, writeLadderRaster } from '../engine/render-ladder.ts'
import { dirname, isAbsolute } from 'node:path'
import type { ProjectSession } from '../session.ts'
import { optionalNumber, optionalString, tool } from './common.ts'

/** What a rendered preview cannot establish. */
const PREVIEW_COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'controller-compile acceptance of an unfamiliar instruction mnemonic',
    'the instruction catalog: previews are not validated against a project',
    'exact Studio rendering: the diagram is a schematic drawn from the parsed rungs',
    'runtime behavior',
  ],
}

/** One rung the preview carries. */
interface PreviewRung {
  readonly number: number
  readonly text: string
  readonly comment?: string
  readonly instructions: readonly string[]
}

/** Escape text for XML element content. */
function escapeXml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
}

/** Escape text for an XML attribute value. */
function escapeAttribute(value: string): string {
  return escapeXml(value).replace(/"/gu, '&quot;')
}

/** Instruction mnemonics in one rung, in written order. */
function instructionsOf(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(/([A-Z][A-Z0-9_]{1,15})\s*\(/gu)) found.add(match[1] as string)
  return [...found]
}

/** Split the caller's block into rungs, dropping blank lines. */
function rungsOf(text: string, comments: string | undefined): string[] {
  const lines = text.split(/\r?\n/u).map(line => line.trim()).filter(line => line !== '' && !line.startsWith('//') && !line.startsWith('#'))
  if (lines.length === 0) {
    throw new L5xError('INVALID_ARGUMENT', 'rungs is empty.', 'Pass one NeutralText rung per line, for example "XIC(Start)OTE(Run);".')
  }
  if (comments !== undefined && comments.split(/\r?\n/u).length > lines.length) {
    throw new L5xError('INVALID_ARGUMENT', 'comments has more lines than rungs.', 'Pass one comment line per rung, using a blank line for a rung without a comment.')
  }
  return lines
}

/**
 * Build the minimal L5X document the viewer draws.
 *
 * @param title - Document and controller name.
 * @param rungs - Validated rungs.
 * @returns L5X text.
 */
function documentOf(title: string, rungs: readonly PreviewRung[]): string {
  const name = escapeAttribute(title)
  const body = rungs.map(rung => {
    const comment = rung.comment === undefined || rung.comment === ''
      ? ''
      : `\n          <Comment>${escapeXml(rung.comment)}</Comment>`
    return `        <Rung Number="${rung.number}" Type="N">${comment}\n          <Text>${escapeXml(rung.text)}</Text>\n        </Rung>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetName="${name}" TargetType="Controller" ContainsContext="true" Owner="AryaCode" ExportDate="Preview">
  <Controller Use="Target" Name="${name}" ProcessorType="1756-L83E" MajorRev="37" MinorRev="11" TimeSlice="20" ProjectCreationDate="Preview">
    <Programs>
      <Program Use="Target" Name="Preview" MainRoutineName="MainRoutine" Description="Rungs proposed in chat">
        <Tags/>
        <Routines>
          <Routine Use="Target" Name="MainRoutine" Type="RLL" Description="Preview rungs">
            <RLLContent>
${body}
            </RLLContent>
          </Routine>
        </Routines>
      </Program>
    </Programs>
    <Tasks/>
    <Modules/>
    <DataTypes/>
    <AddOnInstructionDefinitions/>
  </Controller>
</RSLogix5000Content>
`
}

/**
 * The preview tool.
 *
 * @param session - Project handles and the workspace writer.
 * @returns One tool definition.
 */
export function previewTools(session: ProjectSession): readonly ToolDefinition[] {
  return [
    tool({
      name: 'l5x_rung_preview',
      description: 'Return proposed ladder rungs as paste-ready Studio neutral text, and write one minimal L5X preview document so the project viewer can show them. Validates every rung with the same parser draft_rung uses and refuses a rung that does not parse. The answer carries the exact block to paste into a ladder routine (`paste_text`); the diagram is drawn only when asked for. Nothing is imported and no project is modified.',
      parameters: object({
        rungs: string('NeutralText rungs, one per line, for example "XIC(Start)OTE(Run);". Pass this or rungs_file.'),
        rungs_file: string('Optional text file whose lines are the NeutralText rungs, one per line. Use it when the rungs are already written to disk.'),
        comments: string('Optional rung comments, one per line, blank for a rung without a comment.'),
        title: string('Optional document and controller name, for example "PumpStart".'),
        output: string('Optional .L5X path to write, relative to the workspace. Defaults to ".l5x-preview/<title>.L5X".'),
        diagram: choice('Draw the rungs as an SVG, plus a PNG when Chrome or Edge is installed. Defaults to no: the answer carries the paste-ready text, and a picture is only for review.', ['yes', 'no']),
      }, []),
      async run(args, exec) {
        const inline = optionalString(args, 'rungs')
        const fromFile = optionalString(args, 'rungs_file')
        if (inline === undefined && fromFile === undefined) {
          throw new L5xError('INVALID_ARGUMENT', 'Pass rungs or rungs_file.', 'Pass the NeutralText lines directly, or a path to a file that holds them.')
        }
        const comments = optionalString(args, 'comments')
        const title = optionalString(args, 'title') ?? 'Preview'
        const source = inline ?? await session.readTextAt(fromFile as string, exec)
        const lines = rungsOf(source, comments)
        const commentLines = comments?.split(/\r?\n/u) ?? []
        const rungs: PreviewRung[] = lines.map((line, index) => {
          const parsed = parseLadder(line)
          if (parsed.issues.length > 0) {
            throw new L5xError(
              'INVALID_RUNG',
              `Rung ${index + 1} does not parse: ${parsed.issues[0]?.message ?? 'unknown syntax issue'}.`,
              'Fix the NeutralText and retry; compose_rung produces text this parser accepts.',
              [`Rung ${index + 1}: ${line}`],
            )
          }
          const comment = commentLines[index]?.trim()
          return {
            number: index,
            text: line,
            ...(comment === undefined || comment === '' ? {} : { comment }),
            instructions: instructionsOf(line),
          }
        })
        const slug = title.replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'Preview'
        const path = optionalString(args, 'output') ?? `.l5x-preview/${slug}.L5X`
        const written = await session.writeTextAt(path, documentOf(slug, rungs), exec)
        const pasteText = rungs.map(rung => rung.text).join('\n')
        let image: { svg: string; png?: string } = { svg: '' }
        let rasterError: string | undefined
        let skipped = false
        if (optionalString(args, 'diagram') === 'yes') {
          const raster = renderLadderSvg(rungs.map(rung => ({ number: rung.number, text: rung.text, ...(rung.comment === undefined ? {} : { comment: rung.comment }) })), slug)
          try {
            const absolute = await session.resolvePath(path, exec)
            if (!isAbsolute(absolute)) {
              rasterError = `the workspace path ${absolute} is not absolute, so no image was written`
            } else {
              image = await writeLadderRaster(dirname(absolute), slug, raster)
            }
          } catch (error) {
            rasterError = error instanceof Error ? error.message : String(error)
          }
        } else {
          skipped = true
        }
        const png = rasterError === undefined ? image.png : undefined
        const drawing = skipped
          ? 'No diagram was requested.'
          : png === undefined
            ? rasterError === undefined
              ? `No PNG diagram: no Chrome or Edge was found on this host, so only ${image.svg} was written.`
              : `No PNG diagram: ${rasterError}.`
            : `Drew the rungs as ${png}.`
        return success(
          `Wrote ${rungs.length} rung(s) to ${written}. paste_text carries the block to paste into a ladder routine. ${drawing}`,
          {
            path: written,
            rungs: rungs.length,
            instructions: [...new Set(rungs.flatMap(rung => rung.instructions))],
            paste_text: pasteText,
            rung_list: rungs.map(rung => ({ number: rung.number, comment: rung.comment ?? '', text: rung.text, instructions: rung.instructions })),
            ...(image.svg === '' ? {} : { diagram_svg: image.svg }),
            ...(png === undefined ? {} : { diagram_png: png }),
            note: 'paste_text is the block to paste into a ladder routine; the diagram is a schematic drawn from the parsed rungs, and the L5X preview document is what the sidebar viewer draws. Neither is an importable project.',
          },
          png === undefined
            ? [{ tool: 'present', why: 'Open the preview document so the answer shows ladder, not NeutralText.', args: { files: [{ path: written, description: 'Ladder preview of the proposed rungs' }] } }]
            : [{ tool: 'present', why: 'Attach the PNG so the answer shows the ladder diagram itself.', args: { files: [{ path: png, description: 'Ladder diagram of the proposed rungs' }] } }],
          PREVIEW_COVERAGE,
        )
      },
    }),
    tool({
      name: 'l5x_routine_diagram',
      description: 'Draw a routine that already exists in the project as a ladder diagram, so an answer about live logic can show the rungs instead of NeutralText. Returns the SVG and, when Chrome or Edge is installed, a PNG. Reads the project; writes no project file and imports nothing.',
      parameters: object({
        project_id: string('Optional project handle. Omit when exactly one project is open.'),
        program: string('Program that owns the routine. Example: "MainProgram".'),
        routine: string('Routine to draw. Example: "MainRoutine".'),
        output: string('Optional folder for the diagram, relative to the workspace. Defaults to ".l5x-preview".'),
        start_rung: integer('Optional rung number to start drawing at, for a second page of a long routine.', { minimum: 0 }),
        max_rungs: integer('Most rungs to draw on one page. Defaults to 40.', { minimum: 1, maximum: 200 }),
      }, ['program', 'routine']),
      async run(args, exec) {
        const program = optionalString(args, 'program')
        const routineName = optionalString(args, 'routine')
        if (program === undefined || routineName === undefined) {
          throw new L5xError('INVALID_ARGUMENT', 'Pass program and routine.', 'Name the program and the routine it owns, for example "MainProgram" and "MainRoutine".')
        }
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const routine = getRoutine(project.document, program, routineName)
        if (routine === undefined) {
          throw new L5xError(
            'NOT_FOUND',
            `No routine is named "${routineName}" in ${program}.`,
            'List the routines of that program with list_components, then pass one of those names.',
            listRoutines(project.document, program).map(info => `${info.program}/${info.name} (${info.type})`),
          )
        }
        if (routine.body.type !== 'RLL') {
          throw new L5xError('INVALID_ARGUMENT', `Routine ${program}/${routineName} is ${routine.body.type}, not ladder, so there are no rungs to draw.`, 'Read it with get_component; only RLL routines have a ladder diagram.')
        }
        const rungs: PreviewRung[] = routine.body.rungs.map(rung => ({
          number: rung.number,
          text: rung.text,
          ...(rung.comment === undefined || rung.comment === '' ? {} : { comment: rung.comment }),
          instructions: instructionsOf(rung.text),
        }))
        if (rungs.length === 0) {
          throw new L5xError('NOT_FOUND', `Routine ${program}/${routineName} has no rungs.`, 'Pick a routine that carries logic.')
        }
        const cap = Math.max(1, Math.trunc(optionalNumber(args, 'max_rungs') ?? 40))
        const from = Math.max(0, Math.trunc(optionalNumber(args, 'start_rung') ?? 0))
        const first = rungs.findIndex(rung => rung.number >= from)
        const start = first === -1 ? rungs.length : first
        const page = rungs.slice(start, start + cap)
        const nextStart = start + page.length < rungs.length ? rungs[start + page.length]?.number : undefined
        if (page.length === 0) {
          throw new L5xError('INVALID_ARGUMENT', `No rung at or after ${from} in ${program}/${routineName}, whose rungs run ${rungs[0]?.number} to ${rungs.at(-1)?.number}.`, 'Pass start_rung within that range.')
        }

        const slug = `${program}-${routineName}`.replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'Routine'
        const folder = optionalString(args, 'output') ?? '.l5x-preview'
        const probe = await session.resolvePath(`${folder}/${slug}.svg`, exec)
        const raster = renderLadderSvg(page.map(rung => ({ number: rung.number, text: rung.text, ...(rung.comment === undefined ? {} : { comment: rung.comment }) })), slug)
        let image: { svg: string; png?: string } = { svg: '' }
        let rasterError: string | undefined
        if (!isAbsolute(probe)) {
          rasterError = `the workspace path ${probe} is not absolute, so no image was written`
        } else {
          try {
            image = await writeLadderRaster(dirname(probe), slug, raster)
          } catch (error) {
            rasterError = error instanceof Error ? error.message : String(error)
          }
        }
        const png = rasterError === undefined ? image.png : undefined
        const drawing = png === undefined
          ? rasterError === undefined
            ? `No PNG diagram: only the SVG was kept because no rasteriser ran.`
            : `No PNG diagram: ${rasterError}.`
          : `Drew the rungs as ${png}.`
        return success(
          `Drew ${page.length} rung(s) of ${program}/${routineName} (${page[0]?.number}-${page.at(-1)?.number} of ${rungs.length}) as ${png ?? (image.svg === '' ? 'the rung list' : image.svg)}.${nextStart === undefined ? '' : ` Next page start_rung ${nextStart}.`} ${drawing}`,
          {
            program,
            routine: routineName,
            rungs: page.length,
            start_rung: page[0]?.number,
            ...(nextStart === undefined ? {} : { next_start: nextStart }),
            instructions: [...new Set(page.flatMap(rung => rung.instructions))],
            rung_list: page.map(rung => ({ number: rung.number, comment: rung.comment ?? '', text: rung.text, instructions: rung.instructions })),
            diagram_svg: image.svg,
            ...(png === undefined ? {} : { diagram_png: png }),
            note: 'The diagram is a schematic drawn from the parsed rungs, not a Studio screenshot.',
          },
          png === undefined
            ? []
            : [{ tool: 'present', why: 'Attach the PNG so the answer shows the ladder diagram itself.', args: { files: [{ path: png, description: `Ladder diagram of ${program}/${routineName}` }] } }],
          PREVIEW_COVERAGE,
        )
      },
    }),
  ]
}
