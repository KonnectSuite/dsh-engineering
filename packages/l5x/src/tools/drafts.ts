/**
 * The draft family: one operation per call, accumulated, validated, applied.
 *
 * Replaces a single tool that took a JSON string of every operation. Each tool
 * here is flat, names its own intent, and returns the growing operation count,
 * so a small model can see the draft take shape without holding a nested
 * document in its head.
 *
 * @module dsh-engineering-l5x/tools/drafts
 */

import { prepareChangeSet, checkRungText, fbdSheetXml, sfcChartXml } from '../engine/change-set.ts'
import { composePattern, composeRung, PATTERNS, validateRungTags, type ComposedRung, type LadderNodeSpec, type PatternName } from '../engine/ladder.ts'
import { parseLadder } from '../engine/logic-syntax.ts'
import { previewDocument, previewDocumentOf, previewSlug, type PreviewBody } from '../engine/preview-document.ts'
import { L5xError } from '../core/errors.ts'
import { stagedTags as stagedFromDraft, withStagedTags } from '../engine/staged-tags.ts'
import { getRoutine } from '../model/routines.ts'
import { instructionByName } from '../engine/instructions.ts'
import { resolveSymbol } from '../engine/analysis.ts'
import { safetyProgramNames } from '../engine/project-analysis.ts'

/**
 * Refuse a draft that edits a vendor-owned data type.
 *
 * @param project - The open project.
 * @param udt - Data type the operation targets.
 * @returns The type name.
 */
function vendorTypeGuard(project: ProjectSnapshot, udt: string): string {
  if (project.document.vendorTypes.some(name => name.toUpperCase() === udt.toUpperCase())) {
    throw new L5xError('PROTECTED_TARGET', `Data type ${udt} is vendor-owned, and vendor types cannot be changed.`, 'Add a user-defined type instead; Studio owns the built-in families.')
  }
  return udt
}

/**
 * Refuse a draft that names safety logic.
 *
 * @param project - The open project.
 * @param program - Program the operation targets.
 * @returns The program name, so call sites can wrap an expression.
 */
function safetyGuard(project: ProjectSnapshot, program: string): string {
  if (safetyProgramNames(project.document).has(program.toUpperCase())) {
    throw new L5xError('PROTECTED_TARGET', `Program ${program} runs in a safety task, and safety logic cannot be changed.`, 'Edit the safety task in Studio with a safety signature update; this service refuses safety edits.')
  }
  return program
}
import { success, type Coverage } from '../core/result.ts'
import { choice, integer, object, string } from '../core/params.ts'
import type { ToolDefinition } from '../core/tool.ts'
import type { ProjectSession, ProjectSnapshot } from '../session.ts'
import type { Draft, DraftOperation, DraftStore } from '../drafts.ts'
import { PROJECT_ID, optionalInteger, optionalNumber, optionalString, requiredString, tool } from './common.ts'

/** A prepared draft is not a Studio acceptance. */
const DRAFT_COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'Studio 5000 import and build are not performed by this surface',
    'runtime behavior',
    'the source export is never modified',
  ],
}

/** The version-1 request the change-set engine accepts. */
function requestOf(draft: Draft): string {
  return JSON.stringify({ version: 1, operations: draft.operations })
}

/** What a composed rung does not prove. */
const COMPOSED_COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'compiled behaviour: the composer validates instruction names, operand counts and operand types only',
    'Studio 5000 import and build are not performed by this surface',
    'runtime behavior',
  ],
}

/** Parse one JSON-object argument, refusing anything else. */
/** Parse a JSON array, refusing anything else with a repairable message. */
function jsonArray(value: string, name: string): readonly unknown[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw invalid(name, `${name} is not valid JSON.`, `Pass a JSON array of rung descriptions.`)
  }
  if (!Array.isArray(parsed)) throw invalid(name, `${name} must be a JSON array.`, 'Wrap the descriptions in [ ] .')
  return parsed
}
function jsonObject(value: string | undefined, name: string): Record<string, unknown> {
  if (value === undefined) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw invalid(name, `${name} is not valid JSON.`, `Pass a JSON object, for example {"start":"Start"}.`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw invalid(name, `${name} must be a JSON object.`, 'Pass a JSON object.')
  return parsed as Record<string, unknown>
}

/** The success document every append answers with, plus a preview when one could be written. */
function appended(draft: Draft, operation: DraftOperation, preview?: { path: string; title: string }): unknown {
  return success(
    `Draft ${draft.id}: ${draft.operations.length} ${draft.operations.length === 1 ? 'operation' : 'operations'}.${preview === undefined ? '' : ` Preview at ${preview.path}.`}`,
    { draft_id: draft.id, operation_count: draft.operations.length, last_operation: operation, ...(preview === undefined ? {} : { preview_path: preview.path }) },
    [
      ...(preview === undefined ? [] : [{ tool: 'present', args: { files: [{ path: preview.path, description: `Preview of ${preview.title}` }] }, why: 'Show the composed logic as a document in the chat.' }]),
      { tool: 'draft_validate', args: { draft_id: draft.id }, why: 'Validate the whole draft before writing anything.' },
    ],
  )
}

/**
 * Write the renderable preview for one staged operation.
 *
 * A staged draft is not a file yet, so the preview is the only thing the viewer can draw before
 * `draft_apply`. It is scratch output in `.l5x-preview/`; a read-only workspace, or a body the
 * builders refuse, returns undefined and the append still succeeds - staging is deliberately more
 * permissive than applying, and the refusal belongs to `draft_validate` and `draft_apply`.
 *
 * @param write - Workspace writer bound to this call.
 * @param title - Program-routine name the document is titled with.
 * @param body - Builds the routine to draw, in the language that was staged.
 * @returns The path and title, or undefined when the preview could not be produced.
 */
async function previewFor(
  write: (path: string, text: string) => Promise<unknown>,
  title: string,
  body: () => PreviewBody,
): Promise<{ path: string; title: string } | undefined> {
  const slug = previewSlug(title)
  const path = `.l5x-preview/${slug}.L5X`
  try {
    await write(path, previewDocumentOf(slug, body()))
    return { path, title }
  } catch {
    return undefined
  }
}

/** The fields worth showing for one staged operation. */
function describeOperation(index: number, operation: DraftOperation): Record<string, unknown> {
  const pick = ['operation', 'program', 'routine', 'rung', 'name', 'scope', 'tag', 'udt', 'member', 'mode', 'comment'] as const
  const described: Record<string, unknown> = { index }
  for (const key of pick) {
    const value = operation[key]
    if (value !== undefined) described[key] = value
  }
  return described
}

/** Name and scope of every tag the draft adds, so a composed rung may reference it. */
function stagedTags(draft: Draft): { name: string; scope: string; dataType: string }[] {
  const tags: { name: string; scope: string; dataType: string }[] = []
  for (const operation of draft.operations) {
    if (operation.operation !== 'add_tag') continue
    const name = typeof operation.name === 'string' ? operation.name : undefined
    if (name === undefined) continue
    tags.push({
      name,
      scope: typeof operation.scope === 'string' ? operation.scope : 'controller',
      dataType: typeof operation.data_type === 'string' ? operation.data_type : 'DINT',
    })
  }
  return tags
}

/**
 * The draft tools, bound to one chat's project and draft stores.
 *
 * @param session - Project handles for the calling chat.
 * @param drafts - Drafts for the calling chat.
 * @param maxOperations - Inclusive operations per draft.
 * @param maxFileBytes - Byte budget the preparation may read.
 * @returns Tool definitions in registration order.
 */
/** One JSON array parameter, refused with a repairable message when it is not an array. */
function jsonArrayArg(args: Record<string, unknown>, field: string): readonly Record<string, unknown>[] {
  const raw = args[field]
  if (typeof raw !== 'string' || raw.trim() === '') throw new L5xError('INVALID_ARGUMENT', `${field} must be a JSON array.`, `Pass ${field} as JSON, for example [] or [{"id":1}].`)
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new L5xError('INVALID_ARGUMENT', `${field} is not valid JSON.`, 'Fix the JSON syntax and retry.') }
  if (!Array.isArray(parsed)) throw new L5xError('INVALID_ARGUMENT', `${field} must be a JSON array.`, 'Wrap the value in [ ].')
  return parsed as readonly Record<string, unknown>[]
}

export function draftTools(session: ProjectSession, drafts: DraftStore, maxOperations: number, maxFileBytes: number): readonly ToolDefinition[] {
  return [
    tool({
      name: 'draft_rung',
      description: 'Append one ladder rung operation to the chat draft: replace, insert or delete. An insert puts the rung at the number it is given and renumbers the rungs below it, so a rung can go in at the top. The NeutralText is refused when it is malformed, when its right power rail is not driven by an output instruction, when a catalogued instruction supplies the wrong number of operands or a tag of the wrong type, or when it names a tag that does not resolve in this program (controller tags and this draft\'s staged tags are visible; another program\'s local tag is not). Optionally carries the rung comment. Nothing is written until draft_apply.',
      parameters: object({
        program: string('Program that owns the routine. Example: "MainProgram".'),
        routine: string('Routine the rung belongs to. Example: "MainRoutine".'),
        mode: choice('replace rewrites an existing rung, insert adds one, delete removes one.', ['replace', 'insert', 'delete']),
        rung: integer('Rung number the operation targets. Required for replace and delete; for insert it is the position the new rung takes, 0..the current rung count.', { minimum: 0 }),
        text: string('NeutralText for replace or insert. Omit for delete. Example: "XIC(Start)OTE(Run);"'),
        before_rung: integer('For insert only: put the new rung immediately before this rung; it must equal rung.', { minimum: 0 }),
        comment: string('Optional rung comment, written above the rung in Studio. Omit to leave an existing comment unchanged.'),
        project_id: PROJECT_ID,
      }, ['program', 'routine', 'mode']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const program = safetyGuard(project, requiredString(args, 'program'))
        const routine = requiredString(args, 'routine')
        // A routine the export carries only as an encrypted body cannot be edited; "no such routine"
        // would send a reader looking for a name that is right there in the export.
        if (!project.document.routines.some(entry => entry.program === program && entry.name.toLowerCase() === routine.toLowerCase())
          && project.document.protectedRoutines.some(entry => entry.program === program && entry.name.toLowerCase() === routine.toLowerCase())) {
          throw new L5xError('PROTECTED_TARGET', `Routine ${routine} in ${program} is source-protected in this export; its body cannot be read or changed.`, 'Obtain an unprotected export or the source project from the vendor.')
        }
        const mode = requiredString(args, 'mode')
        const text = optionalString(args, 'text')
        const rung = optionalInteger(args, 'rung')
        const before = optionalInteger(args, 'before_rung')
        const comment = args.comment === undefined ? undefined : String(args.comment)
        let operation: DraftOperation
        if (mode === 'delete') {
          if (rung === undefined) throw invalid('rung', 'Required when mode is delete.', 'Pass the rung number to remove.')
          operation = { operation: 'delete_rung', program, routine, rung }
        } else if (mode === 'replace') {
          if (rung === undefined || text === undefined) throw invalid('rung and text', 'Required when mode is replace.', 'Pass the rung number and its new NeutralText.')
          operation = { operation: 'replace_rung', program, routine, rung, text, ...(comment === undefined ? {} : { comment }) }
        } else if (mode === 'insert') {
          if (rung === undefined || text === undefined) throw invalid('rung and text', 'Required when mode is insert.', 'Pass the new rung number and its NeutralText.')
          operation = { operation: 'insert_rung', program, routine, rung, text, ...(before === undefined ? {} : { before_rung: before }), ...(comment === undefined ? {} : { comment }) }
        } else {
          throw invalid('mode', `Unknown mode ${JSON.stringify(mode)}.`, 'Pass one of: replace, insert, delete.')
        }
        // Refuse malformed rungs and rungs that never reach the right rail now,
        // rather than carrying them in the draft until Studio's build rejects them.
        if (mode !== 'delete' && text !== undefined) {
          checkRungText(text)
          // A raw rung is still composed against one program: its tags resolve only there and in
          // the controller, plus tags this draft stages for that program.
          const stagedNow = drafts.existing(exec, project.id)
          const view = withStagedTags(project, stagedFromDraft(stagedNow?.operations ?? [], project))
          const parsed = parseLadder(text)
          if (parsed.issues.length === 0) validateRungTags({ ...view, programScope: program }, parsed.nodes)
        }
        return appended(drafts.append(exec, project.id, operation, maxOperations), operation)
      },
    }),
    tool({
      name: 'draft_rung_comment',
      description: 'Append one rung-comment change to the chat draft. Sets or clears the comment Studio shows above a rung; the logic is untouched. Nothing is written until draft_apply.',
      parameters: object({
        program: string('Program that owns the routine. Example: "MainProgram".'),
        routine: string('Ladder routine the rung belongs to. Example: "MainRoutine".'),
        rung: integer('Rung number whose comment changes.', { minimum: 0 }),
        comment: string('New comment text. Pass an empty string to clear an existing comment.'),
        project_id: PROJECT_ID,
      }, ['program', 'routine', 'rung', 'comment']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const operation: DraftOperation = {
          operation: 'set_rung_comment',
          program: safetyGuard(project, requiredString(args, 'program')),
          routine: requiredString(args, 'routine'),
          rung: optionalInteger(args, 'rung') ?? 0,
          comment: typeof args.comment === 'string' ? args.comment : '',
        }
        return appended(drafts.append(exec, project.id, operation, maxOperations), operation)
      },
    }),
    tool({
      name: 'compose_rung',
      description: 'Compose one validated ladder rung from a structure or a named pattern, checking every instruction and operand against the export and against tags the same draft stages, and optionally stage it in the draft. Writes the rung as a ladder preview document in .l5x-preview/ so the answer can draw it without a second call; the project itself is untouched until draft_apply. Never emits text that fails the ladder parser or leaves the right power rail undriven.',
      parameters: object({
        pattern: choice('Named pattern to expand. fault_latch produces two rungs.', PATTERNS),
        spec_json: string('Composition tree as JSON, for example {"series":[{"instr":"XIC","args":["Start"]},{"instr":"OTE","args":["Run"]}]}. An add-on instruction call passes its instance tag first, then only the parameters marked Required in the AOI definition.'),
        arguments_json: string('Pattern arguments as JSON, for example {"start":"Start","stop":"Stop","run":"Run"}.'),
        program: string('Program to stage into. Omit to return the composed text only.'),
        routine: string('Routine to stage into. Required with program.'),
        mode: choice('insert adds a rung; replace rewrites one.', ['insert', 'replace']),
        rung: integer('Rung number for a staged operation. For a two-rung pattern, the second uses rung + 1.', { minimum: 0 }),
        before_rung: integer('For insert: insert before this rung number instead of after rung.', { minimum: 0 }),
        comment: string('Optional rung comment for the staged rung.'),
        draft_id: string('Draft handle to append to. Omit when exactly one draft exists in this chat.'),
        project_id: PROJECT_ID,
      }, []),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        // A rung may be written against a tag this same draft declares.
        const stagedNow = drafts.existing(exec, project.id)
        const visible = withStagedTags(project, stagedFromDraft(stagedNow?.operations ?? [], project))
        const program = optionalString(args, 'program')
        const scoped = program === undefined ? visible : { ...visible, programScope: program }
        const pattern = optionalString(args, 'pattern')
        const specJson = optionalString(args, 'spec_json')
        if ((pattern === undefined) === (specJson === undefined)) {
          throw invalid('pattern or spec_json', 'Pass exactly one of a named pattern or a composition tree.', 'Use pattern + arguments_json for a common shape, or spec_json for explicit logic.')
        }
        let composed: { rungs: readonly ComposedRung[]; pattern?: string }
        if (pattern !== undefined) {
          if (!(PATTERNS as readonly string[]).includes(pattern)) throw invalid('pattern', `Unknown pattern ${JSON.stringify(pattern)}.`, `Pass one of: ${PATTERNS.join(', ')}.`)
          composed = composePattern(scoped, pattern as PatternName, jsonObject(typeof args.arguments_json === 'string' ? args.arguments_json : undefined, 'arguments_json'))
        } else {
          const spec = jsonObject(specJson, 'spec_json')
          composed = { rungs: [composeRung(scoped, spec as unknown as LadderNodeSpec)] }
        }
        const routine = optionalString(args, 'routine')
        const mode = optionalString(args, 'mode')
        const rung = optionalInteger(args, 'rung')
        const staged = program !== undefined || routine !== undefined || mode !== undefined || rung !== undefined
        if (!staged) {
          return success(
            `Composed ${composed.rungs.length} rung(s)${composed.pattern === undefined ? '' : ` from ${composed.pattern}`}; pass program and routine to stage it.`,
            { ...(composed.pattern === undefined ? {} : { pattern: composed.pattern }), rungs: composed.rungs },
            [{ tool: 'compose_rung', args: { spec_json: '{"series":[]}' }, why: 'Adjust the structure, or stage this text with draft_rung.' }],
            COMPOSED_COVERAGE,
          )
        }
        if (program === undefined || routine === undefined || mode === undefined || rung === undefined) {
          throw invalid('program, routine, mode and rung', 'Staging needs all four.', 'Pass program, routine, mode and rung together, or none of them.')
        }
        // The same safety refusal as draft_rung, draft_st and the rest: the composer is a staging tool.
        safetyGuard(project, program)
        if (composed.rungs.length > 1 && mode === 'replace') throw invalid('mode', 'A two-rung pattern cannot replace one rung.', 'Use mode insert, or compose a single rung.')
        let draft: Draft | undefined
        for (const [index, composedRung] of composed.rungs.entries()) {
          const operation: DraftOperation = mode === 'replace'
            ? { operation: 'replace_rung', program, routine, rung, text: composedRung.neutral_text, ...(typeof args.comment === 'string' ? { comment: args.comment } : {}) }
            : { operation: 'insert_rung', program, routine, rung: rung + index, text: composedRung.neutral_text, ...(index === 0 && args.before_rung !== undefined ? { before_rung: optionalInteger(args, 'before_rung') } : {}), ...(typeof args.comment === 'string' ? { comment: args.comment } : {}) }
          draft = drafts.append(exec, project.id, operation, maxOperations)
        }
        const stagedDraft = draft as Draft
        // The composed rungs are what the answer has to show, so the renderable document is produced here
        // rather than left to a second call. It is scratch output in `.l5x-preview/`, not a project file:
        // draft_apply is still the only thing that writes one.
        const previewTitle = previewSlug(`${program}-${routine}`)
        const previewPath = `.l5x-preview/${previewTitle}.L5X`
        let previewWritten: string | undefined
        try {
          previewWritten = await session.writeTextAt(previewPath, previewDocument(previewTitle, composed.rungs.map((item, index) => ({ number: rung + index, text: item.neutral_text }))), exec)
        } catch {
          // A read-only workspace must not turn a successful composition into a failure; `preview_written` stays absent.
        }
        return success(
          `Composed and staged ${composed.rungs.length} rung(s)${composed.pattern === undefined ? '' : ` from ${composed.pattern}`}. Draft ${stagedDraft.id}: ${stagedDraft.operations.length} operation(s).${previewWritten === undefined ? '' : ` Ladder preview at ${previewWritten}.`}`,
          { draft_id: stagedDraft.id, operation_count: stagedDraft.operations.length, ...(composed.pattern === undefined ? {} : { pattern: composed.pattern }), rungs: composed.rungs, ...(previewWritten === undefined ? {} : { preview_path: previewWritten }) },
          [
            ...(previewWritten === undefined ? [] : [{ tool: 'present', args: { files: [{ path: previewWritten, description: 'Ladder preview of the composed rungs' }] }, why: 'Show the composed rungs as ladder in the chat, with the NeutralText ready to copy.' }]),
            { tool: 'draft_validate', args: { draft_id: stagedDraft.id }, why: 'Validate the whole draft before writing anything.' },
          ],
          COMPOSED_COVERAGE,
        )
      },
    }),
    tool({
      name: 'compose_batch',
      description: 'Compose and stage many validated ladder rungs in one call: every rung is checked against the export and against tags the same draft stages, and the whole batch is refused if any rung is invalid. Writes the batch as one ladder preview document in .l5x-preview/ so the answer can draw it; the project itself is untouched until draft_apply.',
      parameters: object({
        rungs_json: string('Rungs as JSON, e.g. [{"spec":{"series":[{"instr":"XIC","args":["Start"]},{"instr":"OTE","args":["Run"]}]}},{"pattern":"ton_delay","arguments":{"tag":"Timer","seconds":5}}].'),
        program: string('Program to stage into. Example: "MainProgram".'),
        routine: string('Routine to stage into. Example: "MainRoutine".'),
        rung: integer('First rung number for the batch; each later rung uses the next number.', { minimum: 0 }),
        draft_id: string('Draft handle to append to. Omit when exactly one draft exists in this chat.'),
        project_id: PROJECT_ID,
      }, ['rungs_json', 'program', 'routine', 'rung']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const stagedNow = drafts.existing(exec, project.id)
        const visible = withStagedTags(project, stagedFromDraft(stagedNow?.operations ?? [], project))
        const program = safetyGuard(project, requiredString(args, 'program'))
        const routine = requiredString(args, 'routine')
        const scoped = { ...visible, programScope: program }
        const entries = jsonArray(requiredString(args, 'rungs_json'), 'rungs_json')
        if (entries.length === 0) throw invalid('rungs_json', 'rungs_json is empty.', 'Pass at least one rung description.')
        if (entries.length > 200) throw invalid('rungs_json', 'rungs_json holds more than 200 rungs.', 'Split the batch; 200 is the limit for one call.')
        const composed: ComposedRung[] = []
        for (const [index, entry] of entries.entries()) {
          if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw invalid('rungs_json', `Entry ${index} is not a JSON object.`, 'Pass {"spec": {...}} or {"pattern": "start_stop_latch", "arguments": {...}}.')
          const record = entry as Record<string, unknown>
          const pattern = record.pattern
          const spec = record.spec
          if ((pattern === undefined) === (spec === undefined)) throw invalid('rungs_json', `Entry ${index} needs exactly one of pattern or spec.`, 'Pass {"pattern":"ton_delay","arguments":{...}} or {"spec":{"series":[...]}}.')
          if (pattern !== undefined) {
            if (typeof pattern !== 'string' || !(PATTERNS as readonly string[]).includes(pattern)) throw invalid('rungs_json', `Entry ${index} names an unknown pattern.`, `Pass one of: ${PATTERNS.join(', ')}.`)
            const argsObject = record.arguments === undefined ? {} : record.arguments
            if (argsObject === null || typeof argsObject !== 'object' || Array.isArray(argsObject)) throw invalid('rungs_json', `Entry ${index} arguments must be a JSON object.`, 'Pass the pattern arguments, e.g. {"start":"Start","stop":"Stop","run":"Run"}.')
            composed.push(...composePattern(scoped, pattern as PatternName, argsObject as Record<string, unknown>).rungs)
          } else {
            composed.push(composeRung(scoped, spec as unknown as LadderNodeSpec))
          }
        }
        const requested = optionalInteger(args, 'rung')
        const body = getRoutine(project.document, program, routine)?.body
        const known = body?.type === 'RLL' ? body.rungs.map(rung => rung.number) : []
        const stagedInserts = (stagedNow?.operations ?? []).filter(operation => operation.operation === 'insert_rung' && operation.program === program && operation.routine === routine).length
        const first = requested ?? (known.length === 0 ? 0 : Math.max(...known) + 1 + stagedInserts)
        const comments = entries.map((entry, index) => {
          const comment = (entry as Record<string, unknown>).comment
          if (comment !== undefined && typeof comment !== 'string') throw invalid('rungs_json', `Entry ${index} comment must be text.`, 'Pass the rung comment as a string.')
          return comment
        })
        if (composed.length !== entries.length) throw invalid('rungs_json', 'A pattern expanded to more than one rung; the batch would shift the rung numbers you asked for.', 'Stage that pattern with compose_rung, or place it last.')
        let draft: Draft | undefined
        for (const [index, rung] of composed.entries()) {
          try {
            draft = drafts.append(exec, project.id, {
              operation: 'insert_rung',
              program,
              routine,
              rung: first + index,
              text: rung.neutral_text,
              ...(comments[index] === undefined ? {} : { comment: comments[index] as string }),
            }, maxOperations)
          } catch (error) {
            if (error instanceof L5xError && error.code === 'NAME_COLLISION') {
              throw invalid('rung', `Rung ${first + index} already exists in ${program}/${routine}, so the batch cannot be staged there.`, `Pass a start rung past the last rung of the routine, or stage this rung on its own with compose_rung. Nothing was staged.`)
            }
            throw error
          }
        }
        const stagedDraft = draft as Draft
        // Same rule as compose_rung: the batch just composed is what the answer has to show.
        const previewTitle = previewSlug(`${program}-${routine}`)
        const previewPath = `.l5x-preview/${previewTitle}.L5X`
        let previewWritten: string | undefined
        try {
          previewWritten = await session.writeTextAt(previewPath, previewDocument(previewTitle, composed.map((rung, index) => ({ number: first + index, text: rung.neutral_text }))), exec)
        } catch {
          // Read-only workspace: keep the composition, drop only the render.
        }
        return success(
          `Composed and staged ${composed.length} rung(s) at ${routine} rung ${first}. Draft ${stagedDraft.id}: ${stagedDraft.operations.length} operation(s).${previewWritten === undefined ? '' : ` Ladder preview at ${previewWritten}.`}`,
          {
            draft_id: stagedDraft.id,
            operation_count: stagedDraft.operations.length,
            rungs: composed.map((rung, index) => ({ rung: first + index, neutral_text: rung.neutral_text })),
            ...(previewWritten === undefined ? {} : { preview_path: previewWritten }),
          },
          [
            ...(previewWritten === undefined ? [] : [{ tool: 'present', args: { files: [{ path: previewWritten, description: 'Ladder preview of the composed batch' }] }, why: 'Show the batch as ladder in the chat, with the NeutralText ready to copy.' }]),
            { tool: 'draft_validate', args: { draft_id: stagedDraft.id }, why: 'Validate every staged rung before writing anything.' },
          ],
          COMPOSED_COVERAGE,
        )
      },
    }),    tool({
      name: 'draft_st',
      description: 'Append one Structured Text body replacement to the chat draft. Writes an ST preview document in .l5x-preview/ so the answer can draw it; the project is untouched until draft_apply.',
      parameters: object({
        program: string('Program that owns the routine. Example: "MainProgram".'),
        routine: string('Structured Text routine to replace. Example: "Calc".'),
        code: string('Full replacement body, one statement per line. Example: "Counter := Counter + 1;\\nIF Counter > 10 THEN Counter := 0; END_IF;"'),
        project_id: PROJECT_ID,
      }, ['program', 'routine', 'code']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const operation: DraftOperation = {
          operation: 'replace_st',
          program: safetyGuard(project, requiredString(args, 'program')),
          routine: requiredString(args, 'routine'),
          code: requiredString(args, 'code'),
        }
        const appendedDraft = drafts.append(exec, project.id, operation, maxOperations)
        const preview = await previewFor((path, text) => session.writeTextAt(path, text, exec), `${String(operation.program)}-${String(operation.routine)}`, () => ({ language: 'ST', code: String(operation.code) }))
        return appended(appendedDraft, operation, preview)
      },
    }),
    tool({
      name: 'draft_fbd',
      description: 'Append one function block diagram sheet to the chat draft: blocks, references and wires. A block is an instance, so its tag must already be declared with the structure type Studio expects (FBD_MATH for ADD). Writes an FBD preview document in .l5x-preview/ carrying the same sheet XML the apply path writes; the project is untouched until draft_apply.',
      parameters: object({
        program: string('Program that owns the FBD routine. Example: "MainProgram".'),
        routine: string('Function block diagram routine to extend. Example: "LevelLoop".'),
        sheet: integer('Sheet number to create. Defaults to 0.', { minimum: 0 }),
        blocks: string('Blocks as JSON: [{"id":1,"type":"ADD","tag":"add1","structure":"FBD_MATH","pins":["SourceA","SourceB","Dest"]}].'),
        refs: string('References as JSON: [{"id":2,"direction":"in","tag":"Level"},{"id":3,"direction":"out","tag":"Flow"}].'),
        wires: string('Wires as JSON: [{"from":2,"to":1,"to_pin":"SourceA"},{"from":1,"to":3,"from_pin":"Dest"}].'),
        project_id: PROJECT_ID,
      }, ['program', 'routine', 'blocks']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const program = safetyGuard(project, requiredString(args, 'program'))
        const routineName = requiredString(args, 'routine')

        // The routine may be staged in this same draft, before it exists in the document.
        const draft = drafts.forProject(exec, project.id)
        const view = withStagedTags(project, stagedFromDraft(draft.operations, project))
        const stagedRoutine = draft.operations.some(operation => operation.operation === 'add_routine'
          && String(operation.program) === program
          && String(operation.name).toLowerCase() === routineName.toLowerCase()
          && String(operation.language) === 'FBD')
        const routine = view.document.routines.find(entry => entry.program === program && entry.name.toLowerCase() === routineName.toLowerCase())
        if (routine === undefined && !stagedRoutine) throw new L5xError('COMPONENT_NOT_FOUND', `Program ${program} declares no routine named ${routineName}.`, 'Call list_components with kind "routine" and program to see the declared names, or stage the routine first with draft_routine language "FBD".')
        if (routine !== undefined && routine.type !== 'FBD') throw new L5xError('UNSUPPORTED_TARGET', `Routine ${routineName} is ${routine.type}, not a function block diagram.`, 'Extend a routine that is already FBD, or create one with draft_routine language "FBD".')

        const blocks = jsonArrayArg(args, 'blocks')
        const refs = args.refs === undefined ? [] : jsonArrayArg(args, 'refs')
        const wires = args.wires === undefined ? [] : jsonArrayArg(args, 'wires')

        // A block is an instance: its tag must exist in this scope and carry the structure type.
        for (const block of blocks) {
          const type = String((block as Record<string, unknown>).type ?? '').toUpperCase()
          if (instructionByName(type) === undefined) throw new L5xError('UNKNOWN_INSTRUCTION', `Block type "${type}" is not a catalogued instruction.`, 'Call list_instructions to see the catalogued names.')
          const tag = String((block as Record<string, unknown>).tag ?? '')
          const structure = String((block as Record<string, unknown>).structure ?? '')
          // withStagedTags puts staged declarations on project.stagedTags, not on document.tags; a
          // draft_tag followed by draft_fbd in one chat must still resolve.
          const declared = [...view.document.tags, ...(view.stagedTags ?? [])]
            .find(entry => entry.name.toLowerCase() === tag.toLowerCase() && (entry.scope === program || entry.scope === 'controller'))
          if (declared === undefined) throw new L5xError('COMPONENT_NOT_FOUND', `The block's tag ${tag} is not declared in ${program} or controller scope.`, `Declare it first: draft_tag scope "${program}" name "${tag}" data_type "${structure}" — a block is an instance of its structure.`)
          if (declared.dataType.toUpperCase() !== structure.toUpperCase()) throw new L5xError('TYPE_MISMATCH', `Tag ${tag} is ${declared.dataType}, but the block needs a ${structure} instance.`, 'Declare a tag whose data type is the block structure, for example FBD_MATH for ADD.')
        }
        for (const [index, ref] of refs.entries()) {
          const tag = String((ref as Record<string, unknown>).tag ?? '')
          if (resolveSymbol(view.document, program, tag) === undefined) throw new L5xError('TAG_NOT_FOUND', `refs[${index}] names ${tag}, which does not resolve in scope ${program}.`, 'Reference a declared tag, or declare it with draft_tag first.')
        }

        const operation: DraftOperation = {
          operation: 'insert_fbd_sheet',
          program,
          routine: routineName,
          sheet: optionalInteger(args, 'sheet') ?? 0,
          blocks,
          refs,
          wires,
        }
        const appendedDraft = drafts.append(exec, project.id, operation, maxOperations)
        const preview = await previewFor((path, text) => session.writeTextAt(path, text, exec), `${program}-${routineName}`,
          () => ({ language: 'FBD', content: fbdSheetXml(operation as Extract<DraftOperation, { operation: 'insert_fbd_sheet' }>) }))
        return appended(appendedDraft, operation, preview)
      },
    }),
    tool({
      name: 'draft_sfc',
      description: 'Append one sequential function chart to the chat draft: steps, transitions and directed links. Exactly one step is initial, and each transition carries a Structured Text condition. Missing step tags (SFC_STEP), transition tags (BOOL) and action tags (SFC_ACTION) are created with the structure Studio writes. Writes an SFC preview document in .l5x-preview/ carrying the same chart XML the apply path writes; the project is untouched until draft_apply.',
      parameters: object({
        program: string('Program that owns the SFC routine. Example: "MainProgram".'),
        routine: string('Sequential function chart routine to extend. Example: "Chart".'),
        steps: string('Steps as JSON: [{"id":0,"name":"Step_1","initial":true},{"id":1,"name":"Step_2"}].'),
        transitions: string('Transitions as JSON: [{"id":2,"name":"Tran_1","condition":"Step_1.DN"}].'),
        links: string('Links as JSON: [{"from":0,"to":2},{"from":2,"to":1}].'),
        project_id: PROJECT_ID,
      }, ['program', 'routine', 'steps', 'transitions', 'links']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const program = safetyGuard(project, requiredString(args, 'program'))
        const routineName = requiredString(args, 'routine')
        const draft = drafts.forProject(exec, project.id)
        const view = withStagedTags(project, stagedFromDraft(draft.operations, project))
        const stagedRoutine = draft.operations.some(operation => operation.operation === 'add_routine'
          && String(operation.program) === program
          && String(operation.name).toLowerCase() === routineName.toLowerCase()
          && String(operation.language) === 'SFC')
        const routine = project.document.routines.find(entry => entry.program === program && entry.name.toLowerCase() === routineName.toLowerCase())
        if (routine === undefined && !stagedRoutine) throw new L5xError('COMPONENT_NOT_FOUND', `Program ${program} declares no routine named ${routineName}.`, 'Call list_components with kind "routine", or stage the routine first with draft_routine language "SFC".')
        if (routine !== undefined && routine.type !== 'SFC') throw new L5xError('UNSUPPORTED_TARGET', `Routine ${routineName} is ${routine.type}, not a sequential function chart.`, 'Extend a routine that is already SFC, or create one with draft_routine language "SFC".')
        const steps = jsonArrayArg(args, 'steps')
        const transitions = jsonArrayArg(args, 'transitions')
        const links = jsonArrayArg(args, 'links')

        // A chart's steps, transitions and actions are tags. Create the missing ones in this draft,
        // with the structure Studio writes, so a chart can start in a project that has none.
        const staged = new Set(draft.operations
          .filter(entry => entry.operation === 'add_tag' || entry.operation === 'add_sfc_tag')
          .map(entry => String(entry.name).toLowerCase()))
        const declaredType = (name: string): string | undefined => {
          const stagedTag = draft.operations
            .filter(entry => entry.operation === 'add_sfc_tag' && String(entry.name).toLowerCase() === name.toLowerCase())
            .map(entry => String(entry.kind))
          if (stagedTag.length > 0) {
            const kind = stagedTag[stagedTag.length - 1]
            return kind === 'step' ? 'SFC_STEP' : kind === 'transition' ? 'BOOL' : 'SFC_ACTION'
          }
          return view.document.tags.find(entry => entry.name.toLowerCase() === name.toLowerCase())?.dataType
        }
        const has = (name: string): boolean => staged.has(name.toLowerCase())
          || view.document.tags.some(entry => entry.name.toLowerCase() === name.toLowerCase())
        const tagOperations: DraftOperation[] = []
        const ensure = (name: string, kind: 'step' | 'transition' | 'action', initial: boolean): void => {
          const wanted = kind === 'step' ? 'SFC_STEP' : kind === 'transition' ? 'BOOL' : 'SFC_ACTION'
          if (has(name)) {
            // Reusing a tag of another type produced RxSFC_E_SPECIFIER_INVALID_TYPE on a chart whose
            // action name collided with an existing BOOL tag. Refuse it and say why.
            const found = declaredType(name)
            if (found !== undefined && found.toUpperCase() !== wanted) {
              throw new L5xError(
                'TYPE_MISMATCH',
                `The chart names ${name} as a ${kind}, and ${name} is declared ${found}; Studio needs ${wanted}.`,
                'Use another name for the chart element, or declare it with draft_tag using the needed type.',
              )
            }
            return
          }
          tagOperations.push({ operation: 'add_sfc_tag', scope: program, name, kind, ...(initial ? { initial: true } : {}) })
        }
        const allActions: { name: string; qualifier: string }[] = []
        for (const step of steps) {
          const row = step as Record<string, unknown>
          ensure(String(row.name ?? ''), 'step', row.initial === true)
          const actions = Array.isArray(row.actions) ? row.actions : []
          for (const action of actions) {
            const entry = action as Record<string, unknown>
            const name = String(entry.name ?? '')
            allActions.push({ name, qualifier: String(entry.qualifier ?? 'NonStored') })
            ensure(name, 'action', false)
          }
        }
        // Studio refuses Reset without a Stored action on the same operand (RxSFC_E_RESET_WITHOUT_STORED).
        const stored = new Set(allActions
          .filter(action => action.qualifier.toLowerCase() === 'stored')
          .map(action => action.name.toLowerCase()))
        for (const action of allActions) {
          if (action.qualifier.toLowerCase() !== 'reset' || stored.has(action.name.toLowerCase())) continue
          throw new L5xError(
            'INVALID_ARGUMENT',
            `Action ${action.name} uses Reset, and no action on ${action.name} uses Stored. Studio refuses it with RxSFC_E_RESET_WITHOUT_STORED.`,
            'Add a Stored action on the same tag, or use NonStored instead.',
          )
        }
        for (const transition of transitions) ensure(String((transition as Record<string, unknown>).name ?? ''), 'transition', false)

        const operation: DraftOperation = {
          operation: 'insert_sfc_sheet',
          program,
          routine: routineName,
          steps,
          transitions,
          links,
        }
        let updated: Draft = draft
        for (const tagOperation of tagOperations) updated = drafts.append(exec, project.id, tagOperation, maxOperations)
        const stagedDraft = drafts.append(exec, project.id, operation, maxOperations)
        const preview = await previewFor((path, text) => session.writeTextAt(path, text, exec), `${program}-${routineName}`,
          () => ({ language: 'SFC', content: sfcChartXml(operation as Extract<DraftOperation, { operation: 'insert_sfc_sheet' }>) }))
        return appended(stagedDraft, operation, preview)
      },
    }),
    tool({
      name: 'draft_routine',
      description: 'Append one new routine to the chat draft. Nothing is written until draft_apply.',
      parameters: object({
        program: string('Program that will own the new routine. Example: "MainProgram".'),
        name: string('New routine name, a Logix identifier of at most 40 characters. Example: "Calc".'),
        language: choice('Language of the new routine: RLL for ladder, ST for Structured Text, FBD for a function block diagram, SFC for a sequential function chart.', ['RLL', 'ST', 'FBD', 'SFC']),
        code: string('Body: NeutralText rungs for RLL, statements for ST. An FBD routine takes no body; add sheets with draft_fbd.'),
        project_id: PROJECT_ID,
      }, ['program', 'name', 'language']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        // The safety refusal comes before body validation: a caller editing safety logic should hear that,
        // not an argument complaint about a routine that cannot be created anyway.
        safetyGuard(project, requiredString(args, 'program'))
        const language = requiredString(args, 'language')
        if (language !== 'RLL' && language !== 'ST' && language !== 'FBD' && language !== 'SFC') throw new L5xError('INVALID_ARGUMENT', 'language must be "RLL", "ST", "FBD" or "SFC"', 'Pass "RLL" for ladder, "ST" for Structured Text, "FBD" for a function block diagram, or "SFC" for a sequential function chart.')
        const code = optionalString(args, 'code') ?? ''
        if ((language === 'FBD' || language === 'SFC') && code.trim() !== '') throw new L5xError('INVALID_ARGUMENT', `An ${language} routine takes no body; create it and add the content with ${language === 'FBD' ? 'draft_fbd' : 'draft_sfc'}.`, 'Omit code and stage the content with the matching draft tool.')
        if (language !== 'FBD' && language !== 'SFC' && code.trim() === '') throw new L5xError('INVALID_ARGUMENT', 'RLL and ST routines need a body in code.', 'Pass the rungs or statements in code.')
        const operation: DraftOperation = {
          operation: 'add_routine',
          program: safetyGuard(project, requiredString(args, 'program')),
          name: requiredString(args, 'name'),
          language,
          code,
        }
        return appended(drafts.append(exec, project.id, operation, maxOperations), operation)
      },
    }),
    tool({
      name: 'draft_tag',
      description: 'Append one new tag to the chat draft. Nothing is written until draft_apply.',
      parameters: object({
        scope: string('Declaring scope: "controller" or a program name. Example: "controller".'),
        name: string('New tag name, a Logix identifier of at most 40 characters. Example: "SP_Start".'),
        data_type: string('Declared data type. Example: "REAL", a UDT name, or a built-in structure: TIMER, COUNTER, PID, STRING, MESSAGE, CONTROL, SERIAL_PORT_CONTROL, ALARM_DIGITAL, ALARM_ANALOG, FBD_MATH, FBD_TIMER, FBD_COUNTER, FBD_COMPARE, FBD_LOGICAL.'),
        description: string('Tag description shown in Studio. Example: "Start threshold".'),
        value: integer('Optional scalar initial value. Example: 80.'),
        dimensions: string('Optional array dimensions, space separated. Example: "4 2".'),
        external_access: choice('Optional external access.', ['Read/Write', 'Read Only', 'None']),
        project_id: PROJECT_ID,
      }, ['scope', 'name', 'data_type', 'description']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const value = optionalNumber(args, 'value')
        const dimensions = optionalString(args, 'dimensions')
        const externalAccess = optionalString(args, 'external_access')
        const operation: DraftOperation = {
          operation: 'add_tag',
          scope: safetyGuard(project, requiredString(args, 'scope')),
          name: requiredString(args, 'name'),
          data_type: requiredString(args, 'data_type'),
          description: requiredString(args, 'description'),
          ...(value === undefined ? {} : { value }),
          ...(dimensions === undefined ? {} : { dimensions }),
          ...(externalAccess === undefined ? {} : { external_access: externalAccess }),
        }
        return appended(drafts.append(exec, project.id, operation, maxOperations), operation)
      },
    }),
    tool({
      name: 'draft_tag_description',
      description: 'Append one existing tag description change to the chat draft. Nothing is written until draft_apply.',
      parameters: object({
        scope: string('Declaring scope: "controller" or a program name.'),
        name: string('Existing tag name. Example: "LineSpeed".'),
        description: string('New description text for the existing tag.'),
        project_id: PROJECT_ID,
      }, ['scope', 'name', 'description']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const operation: DraftOperation = {
          operation: 'set_tag_description',
          scope: safetyGuard(project, requiredString(args, 'scope')),
          name: requiredString(args, 'name'),
          description: requiredString(args, 'description'),
        }
        return appended(drafts.append(exec, project.id, operation, maxOperations), operation)
      },
    }),
    tool({
      name: 'draft_udt_member',
      description: 'Append one new member to a standard data type in the chat draft. Refused later if the type already has instances. Nothing is written until draft_apply.',
      parameters: object({
        udt: string('Existing standard data type name. Example: "Motor_UDT".'),
        name: string('New member name. Example: "Speed".'),
        data_type: string('Member data type. Example: "REAL".'),
        description: string('Description text for the new member.'),
        project_id: PROJECT_ID,
      }, ['udt', 'name', 'data_type', 'description']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const operation: DraftOperation = {
          operation: 'add_udt_member',
          udt: vendorTypeGuard(project, requiredString(args, 'udt')),
          name: requiredString(args, 'name'),
          data_type: requiredString(args, 'data_type'),
          description: requiredString(args, 'description'),
        }
        return appended(drafts.append(exec, project.id, operation, maxOperations), operation)
      },
    }),
    tool({
      name: 'draft_udt_description',
      description: 'Append one standard data type description change, or one member description change when member is supplied. Nothing is written until draft_apply.',
      parameters: object({
        udt: string('Existing standard data type name.'),
        member: string('Member name to change. Omit to change the type description itself.'),
        description: string('New description text for the type or the member.'),
        project_id: PROJECT_ID,
      }, ['udt', 'description']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const udt = vendorTypeGuard(project, requiredString(args, 'udt'))
        const description = requiredString(args, 'description')
        const member = optionalString(args, 'member')
        const operation: DraftOperation = member === undefined
          ? { operation: 'set_udt_description', udt, description }
          : { operation: 'set_udt_member_description', udt, member, description }
        return appended(drafts.append(exec, project.id, operation, maxOperations), operation)
      },
    }),
    tool({
      name: 'draft_discard',
      description: 'Throw away the staged draft, so edits that went the wrong way can be abandoned without writing a file. The project on disk is untouched.',
      parameters: object({
        draft_id: string('Draft handle returned by a draft_* tool. Omit when exactly one draft exists in this chat.'),
        project_id: PROJECT_ID,
      }, []),
      async run(args, exec) {
        const draft = drafts.get(exec, optionalString(args, 'draft_id'))
        const removed = drafts.discard(exec, draft.id)
        return success(
          removed ? `Discarded ${draft.operations.length} staged operation(s) from ${draft.id}.` : `No draft ${draft.id} was staged in this chat.`,
          { draft_id: draft.id, operations_dropped: removed ? draft.operations.length : 0, discarded: removed },
          [{ tool: 'draft_tag', args: {}, why: 'Stage the replacement edits, or stop here.' }],
          DRAFT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'draft_list',
      description: 'List the staged operations of the draft with the index each one occupies, so a wrong edit can be removed without discarding the rest. Writes nothing.',
      parameters: object({
        draft_id: string('Draft handle returned by a draft_* tool. Omit when exactly one draft exists in this chat.'),
        project_id: PROJECT_ID,
      }, []),
      async run(args, exec) {
        const draft = drafts.get(exec, optionalString(args, 'draft_id'))
        return success(
          `Draft ${draft.id}: ${draft.operations.length} staged operation(s).`,
          {
            draft_id: draft.id,
            project_id: draft.projectId,
            operation_count: draft.operations.length,
            operations: draft.operations.map((operation, index) => describeOperation(index, operation)),
          },
          [
            { tool: 'draft_remove_op', args: { draft_id: draft.id, index: 0 }, why: 'Remove one staged operation by its index.' },
            { tool: 'draft_validate', args: { draft_id: draft.id }, why: 'Validate the whole draft before writing anything.' },
          ],
          DRAFT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'draft_remove_op',
      description: 'Remove exactly one staged operation from the draft, keeping the others. Call draft_list first: the index is positional, not a rung number.',
      parameters: object({
        index: integer('Zero-based index as draft_list reports it.', { minimum: 0 }),
        draft_id: string('Draft handle returned by a draft_* tool. Omit when exactly one draft exists in this chat.'),
        project_id: PROJECT_ID,
      }, ['index']),
      async run(args, exec) {
        const index = optionalInteger(args, 'index')
        if (index === undefined) throw invalid('index', 'remove_op needs the index of the operation to drop.', 'Call draft_list and pass one of its indices.')
        const draft = drafts.removeAt(exec, drafts.get(exec, optionalString(args, 'draft_id')).id, index)
        return success(
          `Removed operation ${index}; draft ${draft.id} now holds ${draft.operations.length}.`,
          { draft_id: draft.id, operation_count: draft.operations.length, operations: draft.operations.map((operation, position) => describeOperation(position, operation)) },
          [{ tool: 'draft_validate', args: { draft_id: draft.id }, why: 'Validate the rest of the draft before writing anything.' }],
          DRAFT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'draft_validate',
      description: 'Validate the accumulated draft against the open project and return its hash, diff summary and check findings. Writes nothing.',
      parameters: object({
        draft_id: string('Draft handle returned by a draft_* tool. Omit when exactly one draft exists in this chat.'),
        project_id: PROJECT_ID,
      }, []),
      async run(args, exec) {
        const draft = drafts.get(exec, optionalString(args, 'draft_id'))
        const project = await session.require(draft.projectId, exec)
        const prepared = prepareChangeSet(project, requestOf(draft), { operations: maxOperations, bytes: maxFileBytes })
        return success(
          `${draft.operations.length} ${draft.operations.length === 1 ? 'operation' : 'operations'} prepared; draft hash ${prepared.draft_sha256.slice(0, 12)}.`,
          {
            draft_id: draft.id,
            operation_count: draft.operations.length,
            source_sha256: prepared.source_sha256,
            draft_sha256: prepared.draft_sha256,
            validation: prepared.validation,
            checks: prepared.checks,
            diff: prepared.diff,
          },
          [{ tool: 'draft_apply', args: { draft_id: draft.id }, why: 'Write the validated draft to a new L5X.' }],
          DRAFT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'draft_apply',
      description: 'Apply the validated draft to ONE new L5X file beside the source. Never overwrites, never imports into Studio, never contacts a controller.',
      parameters: object({
        draft_id: string('Draft handle returned by a draft_* tool. Omit when exactly one draft exists in this chat.'),
        output_path: string('New .L5X path to write. It must not exist.'),
        project_id: PROJECT_ID,
      }, ['output_path']),
      async run(args, exec) {
        const draft = drafts.get(exec, optionalString(args, 'draft_id'))
        const project = await session.require(draft.projectId, exec)
        const prepared = prepareChangeSet(project, requestOf(draft), { operations: maxOperations, bytes: maxFileBytes })
        const target = await session.writeNew(requiredString(args, 'output_path'), prepared.xml, exec)
        drafts.remove(exec, draft.id)
        return success(
          `Wrote ${draft.operations.length} ${draft.operations.length === 1 ? 'operation' : 'operations'} to ${target}.`,
          {
            output_path: target,
            draft_sha256: prepared.draft_sha256,
            operation_count: draft.operations.length,
            validation: prepared.validation,
          },
          [
            // The applied file is a real export, so the viewer draws all four languages from it. Showing it is
            // the point at which a composed draft stops being text and becomes something to look at.
            { tool: 'present', args: { files: [{ path: target, description: 'The applied draft, opened as logic' }] }, why: 'Show the written export so the composed logic can be read as ladder, ST, FBD or SFC.' },
            { tool: 'open_project', args: { path: target }, why: 'Reopen the written draft and review it.' },
          ],
          DRAFT_COVERAGE,
        )
      },
    }),
  ]
}

/** One argument failure with the fix. */
function invalid(field: string, message: string, fix: string): L5xError {
  return new L5xError('INVALID_ARGUMENT', `${field}: ${message}`, fix)
}
