/**
 * The FTView editing tools: stage, validate, apply.
 *
 * One operation per call, accumulated per chat and export, validated against a
 * re-parsed copy, then written to a new export folder. The source is never
 * modified.
 *
 * @module dsh-engineering-ftview/edit/tools
 */

import { createHash } from 'node:crypto'
import { EngineeringError, choice, integer, object, optionalInteger, optionalString, requiredString, string, success, tool, type Coverage, type ExecContext, type FsService, type NextStep, type ToolDefinition } from '../core.ts'
import type { ViewSession } from '../session.ts'
import type { EditDrafts } from './drafts.ts'
import { EDIT_COVERAGE, prepareEdit } from './prepare.ts'
import type { EditOperation } from './operations.ts'

/** The view handle parameter, described once. */
const VIEW_ID = string('View handle returned by ftview_open. Omit when exactly one export is open in this chat.')

/** The draft handle parameter, described once. */
const DRAFT_ID = string('Draft handle returned by an ftview_draft_* tool. Omit when exactly one draft exists in this chat.')

/** Coverage for apply, which writes text exports only. */
const APPLY_COVERAGE: Coverage = {
  ...EDIT_COVERAGE,
  unverified: [...EDIT_COVERAGE.unverified, 'files that are not display XML or tag CSV are not copied'],
}

/** The next step after staging an operation. */
function nextValidate(draftId: string): readonly NextStep[] {
  return [{ tool: 'ftview_validate', args: { draft_id: draftId }, why: 'Prepare the changed export and read the findings before writing anything.' }]
}

/** Count duplicate named objects in one display. */
function objectCount(display: { objects: readonly { name?: string }[] }, name: string): number {
  return display.objects.filter(object => object.name === name).length
}

/**
 * The editing tools.
 *
 * @param session - View handles from the read entry.
 * @param drafts - Draft store for the calling chat.
 * @param fs - Filesystem provider used to read sources and write the result.
 * @param maxOperations - Inclusive operations per draft.
 * @returns Tool definitions in registration order.
 */
export function editTools(session: ViewSession, drafts: EditDrafts, fs: FsService, maxOperations: number): readonly ToolDefinition[] {
  /** Resolve the view and append one operation. */
  const stage = (exec: ExecContext | undefined, viewId: string | undefined, operation: EditOperation) => {
    const view = session.require(viewId, exec)
    return { view, draft: drafts.append(exec, view.id, operation, maxOperations) }
  }
  const staged = (draft: { readonly id: string; readonly operations: readonly unknown[] }, operation: EditOperation) => success(
    `Draft ${draft.id}: ${draft.operations.length} ${draft.operations.length === 1 ? 'operation' : 'operations'}.`,
    { draft_id: draft.id, operation_count: draft.operations.length, last_operation: operation },
    nextValidate(draft.id),
    EDIT_COVERAGE,
  )
  return [
    tool({
      name: 'ftview_draft_display_set',
      description: 'Stage one attribute change on a display or on one of its named objects. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        display: string('Display name as listed by ftview_list. Example: "Main".'),
        object: string('Object name inside the display. Omit to change the display root. Example: "StartPB".'),
        attribute: string('Attribute to set. Example: "visible" or "caption".'),
        value: string('New attribute value. Example: "0".'),
      }, ['display', 'attribute', 'value']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const displayName = requiredString(args, 'display')
        const display = view.app.displays.find(candidate => candidate.name === displayName)
        if (display === undefined) {
          throw new EngineeringError('COMPONENT_NOT_FOUND', `No display is named ${JSON.stringify(displayName)} in this export.`, 'Call ftview_list with kind "display" to see the display names.', view.app.displays.slice(0, 5).map(candidate => candidate.name))
        }
        const objectName = optionalString(args, 'object')
        if (objectName !== undefined) {
          const count = objectCount(display, objectName)
          if (count === 0) {
            throw new EngineeringError('COMPONENT_NOT_FOUND', `No object in ${JSON.stringify(display.name)} is named ${JSON.stringify(objectName)}.`, 'Call ftview_get with kind "display" to see the object names.', display.objects.flatMap(candidate => candidate.name === undefined ? [] : [candidate.name]).slice(0, 5))
          }
          if (count > 1) {
            throw new EngineeringError('AMBIGUOUS_OBJECT', `${display.name} has ${count} objects named ${JSON.stringify(objectName)}, so the edit target is ambiguous.`, 'This export cannot be edited by name alone; use Studio for that display.')
          }
        }
        const { draft } = stage(exec, optionalString(args, 'view_id'), {
          kind: 'display_set',
          file: display.file,
          ...(objectName === undefined ? {} : { object: objectName }),
          attribute: requiredString(args, 'attribute'),
          value: requiredString(args, 'value'),
        })
        return staged(draft, draft.operations[draft.operations.length - 1] as EditOperation)
      },
    }),
    tool({
      name: 'ftview_draft_display_add',
      description: 'Stage a new display by copying an existing display file under a new name. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        copy_from: string('Display name to copy. Example: "Main".'),
        name: string('New display name, unique in the export. Example: "MainCopy".'),
      }, ['copy_from', 'name']),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const copyFrom = requiredString(args, 'copy_from')
        const name = requiredString(args, 'name')
        if (!view.app.displays.some(display => display.name === copyFrom)) {
          throw new EngineeringError('COMPONENT_NOT_FOUND', `No display is named ${JSON.stringify(copyFrom)} to copy.`, 'Call ftview_list with kind "display" to see the display names.', view.app.displays.slice(0, 5).map(display => display.name))
        }
        if (view.app.displays.some(display => display.name === name)) {
          throw new EngineeringError('COMPONENT_EXISTS', `A display named ${JSON.stringify(name)} already exists in this export.`, 'Pass a new display name, for example "LineOverview2".')
        }
        const { draft } = stage(exec, optionalString(args, 'view_id'), {
          kind: 'display_add',
          copyFrom,
          name,
        })
        return staged(draft, draft.operations[draft.operations.length - 1] as EditOperation)
      },
    }),
    tool({
      name: 'ftview_draft_tag_upsert',
      description: 'Stage one HMI tag update: change an existing row\'s description or type, or append a new tag row. Nothing is written until ftview_apply.',
      parameters: object({
        view_id: VIEW_ID,
        name: string('Tag name. Example: "StartPB".'),
        description: string('New tag description. Example: "Start pushbutton".'),
        type: string('New tag type. Example: "A" for analog or "D" for digital.'),
      }, ['name']),
      async run(args, exec) {
        const description = optionalString(args, 'description')
        const type = optionalString(args, 'type')
        if (description === undefined && type === undefined) {
          throw new EngineeringError('INVALID_ARGUMENT', 'A tag upsert needs a description, a type, or both.', 'Pass description, type, or both; for example "Start pushbutton".')
        }
        const { draft } = stage(exec, optionalString(args, 'view_id'), {
          kind: 'tag_upsert',
          name: requiredString(args, 'name'),
          ...(description === undefined ? {} : { description }),
          ...(type === undefined ? {} : { type }),
        })
        return staged(draft, draft.operations[draft.operations.length - 1] as EditOperation)
      },
    }),
    tool({
      name: 'ftview_validate',
      description: 'Prepare the staged edits: apply them to a re-parsed copy, report the changed files and the new structural findings. Writes nothing.',
      parameters: object({ draft_id: DRAFT_ID }, []),
      async run(args, exec) {
        const draft = drafts.get(exec, optionalString(args, 'draft_id'))
        const view = session.require(draft.viewId, exec)
        const prepared = await prepareEdit(fs, view.app, draft.operations, exec.signal)
        const byRule: Record<string, number> = {}
        for (const finding of prepared.findings) byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1
        return success(
          `${draft.operations.length} operation(s); ${prepared.texts.size} file(s) change; ${prepared.findings.length} finding(s).`,
          {
            draft_id: draft.id,
            draft_sha256: prepared.hash,
            changed_files: [...prepared.texts.keys()],
            added: prepared.added,
            findings: prepared.findings,
            by_rule: byRule,
          },
          [{ tool: 'ftview_apply', args: { draft_id: draft.id }, why: 'Write the prepared export to a new folder.' }],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_apply',
      description: 'Write the prepared edits to a NEW export folder: changed files get the edits, other text exports are copied verbatim. The source folder is never modified.',
      parameters: object({
        draft_id: DRAFT_ID,
        output_root: string('New folder for the edited export. It must not exist. Example: "C:/Projects/Line/ME Export Edited".'),
      }, ['output_root']),
      async run(args, exec) {
        const draft = drafts.get(exec, optionalString(args, 'draft_id'))
        const view = session.require(draft.viewId, exec)
        const prepared = await prepareEdit(fs, view.app, draft.operations, exec.signal)
        const outputRoot = await fs.resolve(requiredString(args, 'output_root'), {
          ...(exec.cwd === undefined ? {} : { cwd: exec.cwd }),
          ...(exec.signal === undefined ? {} : { signal: exec.signal }),
        })
        const existing = await fs.stat(outputRoot, exec.signal)
        if (existing !== undefined) {
          throw new EngineeringError('OUTPUT_EXISTS', `A file or folder already exists at ${requiredString(args, 'output_root')}.`, 'Pass a new output_root; apply never merges into an existing folder.')
        }
        if (fs.writeText === undefined) {
          throw new EngineeringError('OUTPUT_UNAVAILABLE', 'The filesystem provider in this profile cannot write files.', 'Use a profile whose filesystem provider allows writes.')
        }
        const hashes = new Map(view.app.files.map(file => [file.file, file.sha256]))
        let written = 0
        for (const file of view.app.files) {
          const bytes = await fs.readBytes(`${view.app.root}/${file.file}`, exec.signal, 64 * 1024 * 1024)
          if (createHash('sha256').update(bytes).digest('hex') !== hashes.get(file.file)) {
            throw new EngineeringError('STALE_EXPORT', `The export changed on disk since it was opened: ${file.file}.`, 'Reopen the export with ftview_open, stage the edits again, then apply.')
          }
          const text = prepared.texts.get(file.file) ?? new TextDecoder('utf-8').decode(bytes)
          await fs.writeText(`${outputRoot}/${file.file}`, text, { kind: 'createIfAbsent' }, exec.signal)
          written += 1
        }
        for (const file of prepared.added) {
          const text = prepared.texts.get(file) as string
          await fs.writeText(`${outputRoot}/${file}`, text, { kind: 'createIfAbsent' }, exec.signal)
          written += 1
        }
        drafts.remove(exec, draft.id)
        return success(
          `Wrote ${written} file(s) to ${outputRoot}.`,
          { output_root: outputRoot, draft_id: draft.id, files_written: written, changed_files: [...prepared.texts.keys()] },
          [{ tool: 'ftview_open', args: { root: outputRoot }, why: 'Reopen the written export and check it.' }],
          APPLY_COVERAGE,
        )
      },
    }),
  ]
}

/** A helper kept for callers that want the operation count type. */
export type { EditOperation }
