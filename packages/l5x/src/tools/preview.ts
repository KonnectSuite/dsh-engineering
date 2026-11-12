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
import { previewDocument, previewSlug } from '../engine/preview-document.ts'
import { neutralText, parseRung, studioForm, type LadderNode } from '../engine/logic-syntax.ts'
import { instructionByName } from '../engine/instructions.ts'
import { PATTERNS, type PatternName } from '../engine/ladder.ts'
import { getRoutine, listRoutines } from '../model/routines.ts'
import { renderLadderSvg, writeLadderRaster } from '../engine/render-ladder.ts'
import { dirname, isAbsolute , resolve } from 'node:path'
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
  /** The same rung in Studio 5000's own ladder copy format (`BST`/`NXB`/`BND`, no parentheses). */
  readonly studio_text?: string
  readonly comment?: string
  readonly instructions: readonly string[]
}

/** Instruction mnemonics in one rung, in written order. */
function instructionsOf(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(/([A-Z][A-Z0-9_]{1,15})\s*\(/gu)) found.add(match[1] as string)
  return [...found]
}

/** A tag operand the workspace-free composer may write. */
const TAG_TEXT = /^[A-Za-z_][A-Za-z0-9_:.,[\]]*$/u

/** Reject an instruction mnemonic the catalog does not know. */
function assertKnownInstructions(nodes: readonly LadderNode[], line: string): void {
  for (const node of nodes) {
    if (node.kind === 'branch') {
      for (const path of node.paths) assertKnownInstructions(path, line)
      continue
    }
    const info = instructionByName(node.name)
    if (info === undefined) {
      throw new L5xError(
        'INVALID_RUNG',
        `Unknown ladder instruction ${node.name} in "${line}".`,
        'Use a catalogued mnemonic: call list_instructions for the exact names and slots; parallel branches are written [path1,path2].',
      )
    }
    if (info.notModelled === true) continue
    const required = info.operands.filter(operand => operand.optional !== true && operand.rest !== true).length
    const rest = info.operands.find(operand => operand.rest === true)
    if (node.operands.length < required || (rest === undefined && node.operands.length > info.operands.length)) {
      throw new L5xError(
        'INVALID_RUNG',
        `${info.name} takes ${required}-${info.operands.length} operand(s), but ${node.operands.length} were written in "${line}".`,
        `Call list_instructions with filter "${info.name}" for the operand order, then fix the rung.`,
      )
    }
  }
}

/** Read one pattern argument as a safe tag name. */
function patternTag(pattern: string, args: Readonly<Record<string, unknown>>, name: string): string {
  const value = args[name]
  if (typeof value !== 'string' || value.trim() === '' || !TAG_TEXT.test(value.trim())) {
    throw new L5xError(
      'INVALID_ARGUMENT',
      `${pattern} needs ${name} as a tag name, got ${JSON.stringify(value)}.`,
      `Pass a tag such as {"${name}":"${name === 'timer' ? 'Timer1' : 'Start'}"}; the string may not contain spaces, parentheses or a semicolon.`,
    )
  }
  return value.trim()
}

/** Read one pattern argument as a finite number. */
function patternNumber(pattern: string, args: Readonly<Record<string, unknown>>, name: string, fallback?: number): number {
  const value = args[name] ?? fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new L5xError(
      'INVALID_ARGUMENT',
      `${pattern} needs ${name} as a number, got ${JSON.stringify(args[name])}.`,
      `Pass ${name} as a finite number, for example ${name === 'preset_ms' ? '1500' : '0'}.`,
    )
  }
  return value
}

/** One generated rung and the tags it expects the reader to declare. */
interface ComposedLogic {
  readonly pattern?: PatternName
  readonly rungs: readonly { readonly text: string; readonly comment?: string }[]
  readonly tags: readonly { readonly name: string; readonly data_type: string }[]
  readonly notes: readonly string[]
}

/** Build the named pattern as NeutralText, without a project or tag lookup. */
function composePatternText(pattern: PatternName, args: Readonly<Record<string, unknown>>): ComposedLogic {
  if (pattern === 'start_stop_latch') {
    const start = patternTag(pattern, args, 'start')
    const stop = patternTag(pattern, args, 'stop')
    const run = patternTag(pattern, args, 'run')
    return {
      pattern,
      rungs: [{ text: `[XIC(${start}),XIC(${run})]XIO(${stop})OTE(${run});`, comment: 'Start/stop seal-in: Stop opens the latch.' }],
      tags: [{ name: start, data_type: 'BOOL' }, { name: stop, data_type: 'BOOL' }, { name: run, data_type: 'BOOL' }],
      notes: ['Run seals itself in parallel with Start; Stop breaks the rung.', 'Declare Start, Stop and Run as BOOL tags in the target program, or replace the names with tags that already exist.'],
    }
  }
  if (pattern === 'fault_latch') {
    const fault = patternTag(pattern, args, 'fault')
    const reset = patternTag(pattern, args, 'reset')
    const latched = patternTag(pattern, args, 'latched')
    return {
      pattern,
      rungs: [
        { text: `XIC(${fault})OTL(${latched});`, comment: 'Set the fault latch.' },
        { text: `XIC(${reset})OTU(${latched});`, comment: 'Reset the fault latch.' },
      ],
      tags: [{ name: fault, data_type: 'BOOL' }, { name: reset, data_type: 'BOOL' }, { name: latched, data_type: 'BOOL' }],
      notes: ['A fault latch needs both the set and the reset rung; keep them together.'],
    }
  }
  if (pattern === 'ton_delay') {
    const enable = patternTag(pattern, args, 'enable')
    const timer = patternTag(pattern, args, 'timer')
    const preset = patternNumber(pattern, args, 'preset_ms', 1000)
    return {
      pattern,
      rungs: [{ text: `XIC(${enable})TON(${timer},${preset},0);`, comment: `Delay ${timer}.DN by ${preset} ms.` }],
      tags: [{ name: enable, data_type: 'BOOL' }, { name: timer, data_type: 'TIMER' }],
      notes: ['The timer instruction needs a TIMER tag; its .DN bit is the delayed enable.'],
    }
  }
  if (pattern === 'interlock') {
    const conditions = args.conditions
    if (!Array.isArray(conditions) || conditions.length === 0) {
      throw new L5xError('INVALID_ARGUMENT', 'interlock needs conditions: at least one tag.', 'Pass conditions as an array of BOOL tag names, for example ["GuardClosed","AirOk"].')
    }
    const tags = conditions.map((condition, index) => {
      if (typeof condition !== 'string' || !TAG_TEXT.test(condition.trim())) {
        throw new L5xError('INVALID_ARGUMENT', `interlock condition ${index + 1} is not a tag name.`, 'Pass conditions as an array of BOOL tag names.')
      }
      return { name: condition.trim(), data_type: 'BOOL' }
    })
    const output = patternTag(pattern, args, 'output')
    return {
      pattern,
      rungs: [{ text: `${tags.map(tag => `XIC(${tag.name})`).join('')}OTE(${output});`, comment: 'All interlocks must be made to energize the output.' }],
      tags: [...tags, { name: output, data_type: 'BOOL' }],
      notes: ['Every condition is in series: any false condition drops the output.'],
    }
  }
  if (pattern === 'analog_scale') {
    const source = patternTag(pattern, args, 'source')
    const destination = patternTag(pattern, args, 'destination')
    const inMin = patternNumber(pattern, args, 'in_min')
    const inMax = patternNumber(pattern, args, 'in_max')
    const outMin = patternNumber(pattern, args, 'out_min')
    const outMax = patternNumber(pattern, args, 'out_max')
    const literal = (value: number): string => (Number.isInteger(value) ? `${value}.0` : String(value))
    return {
      pattern,
      rungs: [{ text: `CPT(${destination},(${source} - ${literal(inMin)}) / (${literal(inMax)} - ${literal(inMin)}) * (${literal(outMax)} - ${literal(outMin)}) + ${literal(outMin)});`, comment: 'Scale an analog input into engineering units.' }],
      tags: [{ name: source, data_type: 'REAL' }, { name: destination, data_type: 'REAL' }],
      notes: ['CPT takes the destination first, then the expression.', 'Declare source and destination as REAL for a fractional result.'],
    }
  }
  if (pattern === 'totalizer') {
    const enable = patternTag(pattern, args, 'enable')
    const rate = patternTag(pattern, args, 'rate')
    const total = patternTag(pattern, args, 'total')
    return {
      pattern,
      rungs: [{ text: `XIC(${enable})ADD(${total},${rate},${total});`, comment: 'Accumulate rate into total while enabled.' }],
      tags: [{ name: enable, data_type: 'BOOL' }, { name: rate, data_type: 'REAL' }, { name: total, data_type: 'REAL' }],
      notes: ['ADD adds rate to total in place; a REAL tag keeps fractional rates.'],
    }
  }
  const run = patternTag(pattern, args, 'run')
  const timer = patternTag(pattern, args, 'timer')
  const hours = patternTag(pattern, args, 'hours')
  const preset = patternNumber(pattern, args, 'preset_ms', 3_600_000)
  if (preset <= 0) throw new L5xError('INVALID_ARGUMENT', 'run_hour_meter needs preset_ms as a positive number.', 'Pass the interval in milliseconds; the default is one hour (3600000).')
  return {
    pattern,
    rungs: [
      { text: `XIO(${timer}.DN)XIC(${run})TON(${timer},${preset},0);`, comment: 'Run the interval timer only while running.' },
      { text: `XIC(${timer}.DN)ADD(${hours},1,${hours});`, comment: 'Count one hour per timer interval.' },
    ],
    tags: [{ name: run, data_type: 'BOOL' }, { name: timer, data_type: 'TIMER' }, { name: hours, data_type: 'DINT' }],
    notes: ['The timer .DN bit resets the timer in the same scan that counts the interval.', 'Use DINT for a whole-hour count, or REAL if you change the increment.'],
  }
}

/** Validate and normalise the caller's raw NeutralText block. */
function composeRungsFromText(text: string, comments: string | undefined): ComposedLogic {
  const lines = rungsOf(text, comments)
  const commentLines = comments?.split(/\r?\n/u) ?? []
  const rungs = lines.map((line, index) => {
    const parsed = parseRung(line)
    if (parsed.issues.length > 0) {
      throw new L5xError(
        'INVALID_RUNG',
        `Rung ${index + 1} does not parse: ${parsed.issues[0]?.message ?? 'unknown syntax issue'}.`,
        'Write one rung per line. Either format works: NeutralText "XIC(Start)OTE(Run);" with branches as [path1,path2], or text copied out of a Studio routine "XIC Start XIO Stop OTE Run" with branches as BST … NXB … BND.',
        [`Rung ${index + 1}: ${line}`],
      )
    }
    assertKnownInstructions(parsed.nodes, line)
    const comment = commentLines[index]?.trim()
    const neutral = neutralText(parsed.text, parsed.nodes)
    return comment === undefined || comment === '' ? { text: neutral } : { text: neutral, comment }
  })
  return { rungs, tags: [], notes: ['Tag existence and data types were not checked because no project is open.'] }
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
      description: 'Return proposed ladder rungs as Studio 5000 ladder copy text (`paste_text`: mnemonics and operands space separated, parallel branches as BST/NXB/BND — the format Studio writes when you copy a routine), and write one minimal L5X preview document so the project viewer can show them. Accepts either format on input: this plugin\'s bracket NeutralText or text pasted out of Studio. Validates every rung with the same parser draft_rung uses and refuses a rung that does not parse. Nothing is imported and no project is modified.',
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
          const parsed = parseRung(line)
          if (parsed.issues.length > 0) {
            throw new L5xError(
              'INVALID_RUNG',
              `Rung ${index + 1} does not parse: ${parsed.issues[0]?.message ?? 'unknown syntax issue'}.`,
              'Fix the rung and retry; either format is accepted — NeutralText, or text copied out of a Studio routine.',
              [`Rung ${index + 1}: ${line}`],
            )
          }
          assertKnownInstructions(parsed.nodes, line)
          const comment = commentLines[index]?.trim()
          return {
            number: index,
            text: neutralText(parsed.text, parsed.nodes),
            studio_text: studioForm(line) ?? neutralText(parsed.text, parsed.nodes),
            ...(comment === undefined || comment === '' ? {} : { comment }),
            instructions: instructionsOf(line),
          }
        })
        const slug = previewSlug(title)
        const path = optionalString(args, 'output') ?? `.l5x-preview/${slug}.L5X`
        const written = await session.writeTextAt(path, previewDocument(slug, rungs), exec)
        const pasteText = rungs.map(rung => rung.studio_text ?? rung.text).join('\n')
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
            rung_list: rungs.map(rung => ({ number: rung.number, comment: rung.comment ?? '', text: rung.studio_text ?? rung.text, neutral_text: rung.text, instructions: rung.instructions })),
            ...(image.svg === '' ? {} : { diagram_svg: image.svg }),
            ...(png === undefined ? {} : { diagram_png: png }),
            note: 'paste_text is Studio 5000 ladder copy format (mnemonics and operands space separated, branches as BST/NXB/BND), so it pastes into a routine in the ladder editor. rung_list text is the same rung in that format and neutral_text is this plugin\'s bracket form, which parses here but is not what a Studio paste expects. The diagram is a schematic drawn from the parsed rungs, and the L5X preview document is what the sidebar viewer draws. Neither is an importable project.',
          },
          png === undefined
            ? [{ tool: 'present', why: 'Open the preview document so the answer shows ladder, not NeutralText.', args: { files: [{ path: written, description: 'Ladder preview of the proposed rungs' }] } }]
            : [{ tool: 'present', why: 'Attach the PNG so the answer shows the ladder diagram itself.', args: { files: [{ path: png, description: 'Ladder diagram of the proposed rungs' }] } }],
          PREVIEW_COVERAGE,
        )
      },
    }),
    tool({
      name: 'l5x_compose_logic',
      description: 'Compose ladder logic in the chat when no project is open and no workspace file is wanted. Returns `paste_text` in Studio 5000 ladder copy format — mnemonics and operands space separated, parallel branches as BST/NXB/BND, no parentheses — which is what a Studio 5000 ladder-editor paste expects, plus the tag declarations it expects. Writes no file and needs no L5X/ACD. Use a named pattern (start_stop_latch, fault_latch, ton_delay, interlock, analog_scale, totalizer, run_hour_meter) or pass the rung text yourself in either format: this plugin\'s NeutralText (one rung per line ending in ";", parallel branches [path1,path2], such as [XIC(Start),XIC(Run)]XIO(Stop)OTE(Run);) or text copied out of Studio. Syntax and catalogued instruction mnemonics are validated; tag existence/types and Studio compilation are not. In your answer, put paste_text in a fenced code block so the reader can copy it into Studio.',
      parameters: object({
        pattern: choice('Named pattern to compose without a project.', PATTERNS),
        arguments_json: string('Pattern arguments as JSON, for example {"start":"Start","stop":"Stop","run":"Run"}. See the pattern list in the tool description.'),
        rungs: string('Alternatively, the NeutralText rungs to validate and return, one per line ending in ";". Parallel branches are [path1,path2].'),
        comments: string('Optional rung comments for rungs, one per line, blank for a rung without a comment.'),
      }, []),
      async run(args) {
        const pattern = optionalString(args, 'pattern')
        const raw = optionalString(args, 'rungs')
        if ((pattern === undefined) === (raw === undefined)) {
          throw new L5xError('INVALID_ARGUMENT', 'Pass exactly one of pattern or rungs.', 'Use a named pattern with arguments_json, or paste the NeutralText rungs directly.')
        }
        let composed: ComposedLogic
        if (pattern !== undefined) {
          if (!(PATTERNS as readonly string[]).includes(pattern)) {
            throw new L5xError('INVALID_ARGUMENT', `Unknown pattern ${JSON.stringify(pattern)}.`, `Pass one of: ${PATTERNS.join(', ')}.`)
          }
          const json = optionalString(args, 'arguments_json') ?? '{}'
          let parsed: unknown
          try {
            parsed = JSON.parse(json)
          } catch (error) {
            throw new L5xError('INVALID_ARGUMENT', `arguments_json is not JSON: ${error instanceof Error ? error.message : String(error)}.`, 'Pass a JSON object such as {"start":"Start","stop":"Stop","run":"Run"}.')
          }
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new L5xError('INVALID_ARGUMENT', 'arguments_json must be a JSON object.', 'Pass tag names and numbers as an object, for example {"start":"Start","stop":"Stop","run":"Run"}.')
          }
          composed = composePatternText(pattern as PatternName, parsed as Readonly<Record<string, unknown>>)
        } else {
          composed = composeRungsFromText(raw as string, optionalString(args, 'comments'))
        }
        const pasteText = composed.rungs.map(rung => studioForm(rung.text) ?? rung.text).join('\n')
        const instructions = [...new Set(composed.rungs.flatMap(rung => rung.text.match(/[A-Z][A-Z0-9_]*(?=\()/gu) ?? []))]
        const tagList = composed.tags.map(tag => `${tag.name} (${tag.data_type})`).join(', ')
        return success(
          `Composed ${composed.rungs.length} rung(s)${composed.pattern === undefined ? '' : ` with ${composed.pattern}`}; paste_text is Studio 5000 ladder copy format, ready for a ladder-editor paste. No project or file was touched.`,
          {
            ...(composed.pattern === undefined ? {} : { pattern: composed.pattern }),
            rungs: composed.rungs.length,
            paste_text: pasteText,
            rung_list: composed.rungs.map((rung, index) => ({ number: index, text: studioForm(rung.text) ?? rung.text, neutral_text: rung.text, ...(rung.comment === undefined ? {} : { comment: rung.comment }) })),
            instructions,
            ...(composed.tags.length === 0 ? {} : { tags: composed.tags }),
            notes: composed.notes,
            ...(composed.tags.length === 0 ? {} : { tag_hint: `Declare or confirm these tags in the target program: ${tagList}.` }),
          },
          [{ tool: 'list_instructions', why: 'Check an instruction’s operand order before changing the returned rung.' }],
          {
            complete: false,
            unverified: [
              'tag existence and data types in the target project (no project is open)',
              'Studio compile acceptance of the composed block',
              'runtime behavior',
            ],
          },
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
        // A missing program and a missing routine inside an existing program are different
        // conditions; one NOT_FOUND for both sent the reader to the wrong list.
        if (!project.document.programs.some(entry => entry.name === program)) {
          throw new L5xError('NOT_FOUND', `No program named "${program}".`, 'Call list_components kind="program" for the declared programs.', project.document.programs.map(entry => entry.name))
        }
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
          // The routine exists and is ladder; it is simply empty, which is not "not found".
          throw new L5xError('NO_RUNGS', `Routine ${program}/${routineName} exists but has no rungs.`, 'Write a rung first, or pick a routine that carries logic.')
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

        const baseSlug = `${program}-${routineName}`.replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'Routine'
        // A second page must not overwrite the first, and a relative path leaves no image on disk.
        const slug = page.length < rungs.length ? `${baseSlug}-r${page[0]?.number ?? start}-${page.at(-1)?.number ?? start}` : baseSlug
        const folder = optionalString(args, 'output') ?? '.l5x-preview'
        const resolvedProbe = await session.resolvePath(`${folder}/${slug}.svg`, exec)
        const probe = isAbsolute(resolvedProbe) ? resolvedProbe : resolve(resolvedProbe)
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
