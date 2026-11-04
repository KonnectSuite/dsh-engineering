/**
 * Draft tools: stage operations, apply them to a new drawing, discard a draft,
 * and prove a written file against the staged intent.
 *
 * A draft is a JSON document under `.ecad/drafts/` naming the source path, the
 * SHA-256 it was staged against and the operations in order. `draft_apply` never
 * overwrites: the pipeline is `open → validate/apply ops → dxfBytes → write new
 * file → writeAndVerify → preview`, and the final write goes through the
 * drawings module's `writeDrawing` hook so a DWG destination can be added
 * without touching this tool.
 *
 * @module dsh-engineering-ecad/tools/drafts
 */

import type { EcadDraft, EcadOp } from '../engine/index.ts'
import { EngineeringError, boolean, list, object, objectItem, optionalBoolean, optionalObjectList, optionalString, requiredString, string, success, tool } from '../core.ts'
import type { NextStep, ToolDefinition } from '../core.ts'
import { EcadSession, engine, newDraftId, parentOf, sha256, stemOf } from '../session.ts'
import { isSupportedDrawingPath } from '../drawings.ts'
import { coverageOf, workspaceRelative } from './shared.ts'

/**
 * The draft tools this module contributes.
 *
 * @param session - the row session.
 */
export function draftTools(session: EcadSession): ToolDefinition[] {
  return [draftOps(session), draftApply(session), draftDiscard(session), verify(session)]
}

/**
 * `ecad_draft_ops`: validate and stage operations against the current drawing.
 *
 * @param session - the row session.
 */
function draftOps(session: EcadSession): ToolDefinition {
  return tool({
    name: 'ecad_draft_ops',
    description:
      'Validate a list of edit operations against the current drawing and, when every operation is valid, stage them in .ecad/drafts/<draft_id>.json against the source version. Operations edit text, attributes, layers and geometry, or add text, lines, polylines, rectangles, revision clouds, leaders and existing library blocks; ids are the ids the sheet model carries. Invalid operations are refused with a fix, and nothing is applied — draft_apply writes a new file.',
    parameters: object(
      {
        path: string('Source drawing the operations apply to.'),
        ops: list(
          'Operations in application order.',
          objectItem('One EcadOp: `op` plus the fields that operation needs.', {}, [], true),
          { minItems: 1, maxItems: 2000 }
        ),
        draft_id: string('Optional draft id; defaults to a timestamped id. Reuse it only after discarding the previous draft.'),
        expect_version: string('SHA-256 the operations were prepared against; refuses when the file changed.')
      },
      ['path', 'ops']
    ),
    async run(args, exec) {
      const path = requiredString(args, 'path')
      const rawOps = optionalObjectList(args, 'ops')
      if (rawOps === undefined || rawOps.length === 0) {
        throw new EngineeringError('INVALID_ARGUMENT', 'ops is required and must be a non-empty array of operations.', 'Pass the operations to stage, for example [{"op":"addText","layout":"Model","p":[1,1],"text":"REVIEWED","height":0.2}].')
      }
      const expectVersion = optionalString(args, 'expect_version')
      const engineModule = await engine()
      const view = await session.open(path, exec, { reload: true })
      if (expectVersion !== undefined && expectVersion !== view.sha256) {
        throw new EngineeringError(
          'ECAD_STALE_DOCUMENT',
          `${path} changed since the operations were prepared (expected ${expectVersion}, file is ${view.sha256}).`,
          'Re-read the drawing with ecad_open and re-stage the operations; nothing was staged.'
        )
      }
      const ops = rawOps as unknown as readonly EcadOp[]
      const validation = engineModule.validateOps(view.opened, ops)
      const drawingPath = workspaceRelative(session, exec, view.path)
      const changes = countOps(ops)
      if (!validation.ok) {
        return success(
          `Draft not staged: ${validation.errors.length} of ${ops.length} operation(s) are invalid.`,
          { staged: false, path: drawingPath, baseVersion: view.sha256, validation: { ok: false, errors: validation.errors, notes: validation.notes }, changes },
          [{ tool: 'ecad_draft_ops', why: 'Fix the listed operations and stage again; each error carries the fix.' }],
          { complete: false, unverified: validation.errors.map(error => `#${error.opIndex} ${error.message}`) }
        )
      }
      const draftId = optionalString(args, 'draft_id') ?? newDraftId()
      const draft: EcadDraft = { schema: 1, id: draftId, path: drawingPath, baseVersion: view.sha256, createdAt: new Date().toISOString(), ops }
      const staged = await session.stageDraft(draft, exec)
      const next: NextStep[] = session.writes
        ? [{ tool: 'ecad_draft_apply', args: { draft_id: draftId }, why: 'Write the validated draft to a new drawing and verify the write.' }]
        : [{ tool: 'ecad_capabilities', why: 'Writes are off, so the draft cannot be applied yet; confirm the row switch before promising an edit.' }]
      return success(
        `Staged draft ${draftId}: ${ops.length} operation(s) validated against ${drawingPath}${session.writes ? '' : ' (writes are off, so it cannot be applied yet)'}.`,
        {
          staged: true,
          draftId,
          draftPath: staged.draftPath,
          path: drawingPath,
          baseVersion: view.sha256,
          validation: { ok: true, errors: [], notes: validation.notes },
          changes,
          writes: session.writes
        },
        next,
        { complete: true, unverified: session.writes ? [] : ['writes are switched off for this row'] }
      )
    }
  })
}

/**
 * `ecad_draft_apply`: write the draft to a new drawing and verify it.
 *
 * @param session - the row session.
 */
function draftApply(session: EcadSession): ToolDefinition {
  return tool({
    name: 'ecad_draft_apply',
    description:
      'Apply a staged draft to a NEW drawing file beside the source (never overwriting it), re-read the written bytes, rebuild the model and verify the write against the staged operations and the base model. Requires the row writes switch. The pipeline is open → validate/apply ops → serialise → write new file → re-read and verify → preview; a .dwg source is written back as DWG through the embedded converter and a .dxf source as DXF. Returns the new path, its version and format, per-operation counters, the verification and any problem that keeps the write unproven — quote those problems instead of calling the output equivalent to the source.',
    parameters: object(
      {
        draft_id: string('Draft id returned by ecad_draft_ops.'),
        output_path: string('New drawing path for the edited file; defaults to <source>-ecad-<UTC stamp> beside the source. Must not exist.'),
        overwrite: boolean('Never honoured: this tool always writes a new file.', { default: false })
      },
      ['draft_id']
    ),
    async run(args, exec) {
      const draftId = requiredString(args, 'draft_id')
      if (optionalBoolean(args, 'overwrite', false)) {
        throw new EngineeringError('ECAD_OVERWRITE_REFUSED', 'ecad_draft_apply never overwrites an existing drawing.', 'Omit overwrite and pass a new output_path; the source is never modified.')
      }
      session.requireWrites('the edited drawing')
      const engineModule = await engine()
      const draft = await session.readDraft(draftId, exec)
      const source = await session.load(draft.path, exec)
      if (source.sha256 !== draft.baseVersion) {
        throw new EngineeringError(
          'ECAD_STALE_SOURCE',
          `${draft.path} changed after draft ${draftId} was staged.`,
          'Discard the draft, re-open the drawing and stage the operations again; the source was not touched.'
        )
      }
      const validation = engineModule.validateOps(source.opened, draft.ops)
      if (!validation.ok) {
        throw new EngineeringError(
          'ECAD_INVALID_DRAFT',
          `Draft ${draftId} no longer validates against ${draft.path}: ${validation.errors.map(error => `#${error.opIndex} ${error.message}`).join('; ')}`,
          'Discard the draft and stage the operations again against the current drawing.'
        )
      }
      const result = engineModule.applyOps(source.opened, draft.ops)
      const bytes = engineModule.dxfBytes(source.opened)
      const output = await uniqueOutputPath(session, draft.path, optionalString(args, 'output_path'), exec)
      // The only write of a drawing in this tool: the drawings module owns the format.
      const published = await session.publishDrawing(output, { bytes, format: source.format, targetVersion: source.model.dxfVersion }, exec)
      const verification = await engineModule.verifyWritten(source.opened, published.readBack.dxfBytes, { changes: result.changes, baseModel: source.model })
      const outputRelative = workspaceRelative(session, exec, published.written.displayPath)
      const appliedAt = new Date().toISOString()
      await session.saveApplied(
        {
          draftId,
          sourcePath: workspaceRelative(session, exec, source.path),
          sourceVersion: source.sha256,
          sourceFormat: source.format,
          outputPath: outputRelative,
          outputVersion: published.version,
          outputFormat: published.written.format,
          ...(published.written.conversion === undefined ? {} : { conversion: published.written.conversion }),
          changes: result.changes,
          verification,
          appliedAt
        },
        exec
      )
      const problems = verification.problems
      const formatFields = source.format === 'dxf' && published.written.format === 'dxf'
        ? {}
        : { sourceFormat: source.format, outputFormat: published.written.format, ...(published.written.conversion === undefined ? {} : { converted: published.written.conversion }) }
      return success(
        verification.ok
          ? `Applied draft ${draftId} to ${outputRelative} and verified the write (${verification.notes.length} note(s)).`
          : `Wrote ${outputRelative} but verification reported ${problems.length} problem(s); the write is not proven.`,
        {
          draftId,
          sourcePath: workspaceRelative(session, exec, source.path),
          sourceVersion: source.sha256,
          outputPath: outputRelative,
          outputVersion: published.version,
          outputBytes: published.written.bytes.byteLength,
          ...formatFields,
          changes: result.changes,
          touched: result.touchedIds.length,
          verification,
          notes: validation.notes,
          modelPath: published.modelPath,
          writes: true
        },
        [
          { tool: 'ecad_verify', args: { draft_id: draftId }, why: 'Re-prove the written file against the same staged intent in a later call.' },
          { tool: 'ecad_compare', args: { a: workspaceRelative(session, exec, source.path), b: outputRelative }, why: 'Inspect exactly which primitives the write added, removed or changed.' },
          { tool: 'ecad_render', args: { path: outputRelative }, why: 'Render the written sheet when a person must judge the result.' }
        ],
        { complete: verification.ok && problems.length === 0, unverified: problems }
      )
    }
  })
}

/**
 * `ecad_draft_discard`: throw a staged draft away.
 *
 * @param session - the row session.
 */
function draftDiscard(session: EcadSession): ToolDefinition {
  return tool({
    name: 'ecad_draft_discard',
    description: 'Discard a staged draft so it cannot be applied. Deletes .ecad/drafts/<draft_id>.json when the filesystem provider can delete; otherwise it refuses the draft for the rest of the chat and says the file stays on disk. The source drawing is never touched.',
    parameters: object({ draft_id: string('Draft id to discard.') }, ['draft_id']),
    async run(args, exec) {
      const draftId = requiredString(args, 'draft_id')
      const result = await session.discardDraft(draftId, exec)
      return success(
        result.deleted ? `Discarded draft ${draftId}.` : `Draft ${draftId} is refused for this chat; the provider cannot delete files, so ${result.path} stays on disk.`,
        { draftId, discarded: true, deleted: result.deleted, path: result.path },
        [{ tool: 'ecad_draft_ops', why: 'Stage a replacement draft when the change is still wanted.' }],
        { complete: true, unverified: result.deleted ? [] : ['the draft file remains on disk'] }
      )
    }
  })
}

/**
 * `ecad_verify`: prove a written file, or re-read one.
 *
 * @param session - the row session.
 */
function verify(session: EcadSession): ToolDefinition {
  return tool({
    name: 'ecad_verify',
    description:
      'Prove a written drawing. With `draft_id` it loads the record draft_apply left, re-reads the written file, rebuilds the base model from the unchanged source and runs the verification against the recorded operation counters — a failed verification keeps ok:false and lists its problems. With `path` it re-reads that drawing through the format reader and reports what it now contains, for a file someone else wrote.',
    parameters: object({
      draft_id: string('A draft that draft_apply has already written.'),
      path: string('A written drawing to re-read and report.')
    }),
    async run(args, exec) {
      const draftId = optionalString(args, 'draft_id')
      const path = optionalString(args, 'path')
      if (draftId !== undefined && path !== undefined) {
        throw new EngineeringError('INVALID_ARGUMENT', 'Pass either draft_id or path, not both.', 'Use draft_id to re-prove an applied draft, or path to re-read a drawing.')
      }
      if (draftId === undefined && path === undefined) {
        throw new EngineeringError('INVALID_ARGUMENT', 'Pass draft_id or path.', 'Use the draft_id draft_apply returned, or the path of a written drawing.')
      }
      const engineModule = await engine()
      if (draftId !== undefined) {
        const record = await session.readApplied(draftId, exec)
        if (record === undefined) {
          throw new EngineeringError('ECAD_NO_APPLIED_RECORD', `Draft ${JSON.stringify(draftId)} has no applied record in this workspace.`, 'Apply it with ecad_draft_apply first, or pass the written file as `path`.')
        }
        const source = await session.load(record.sourcePath, exec)
        if (source.sha256 !== record.sourceVersion) {
          throw new EngineeringError(
            'ECAD_SOURCE_CHANGED',
            `The source ${record.sourcePath} changed since draft ${draftId} was applied, so the base model cannot be rebuilt.`,
            'Apply the draft again against the current source, or verify the written file with `path` alone.'
          )
        }
        const readBack = await session.readDrawingAt(record.outputPath, exec)
        const currentVersion = sha256(readBack.bytes)
        const verification = await engineModule.verifyWritten(source.opened, readBack.dxfBytes, { changes: record.changes, baseModel: source.model })
        const formatFields = readBack.format === 'dxf' && (record.sourceFormat === undefined || record.sourceFormat === 'dxf')
          ? {}
          : { sourceFormat: record.sourceFormat ?? source.format, outputFormat: readBack.format, ...(readBack.conversion === undefined ? {} : { converted: readBack.conversion }) }
        return success(
          verification.ok
            ? `Verified ${record.outputPath} against draft ${draftId}: the re-read model matches the staged intent.`
            : `Verification of ${record.outputPath} reported ${verification.problems.length} problem(s); the write stays unproven.`,
          {
            mode: 'draft',
            draftId,
            sourcePath: record.sourcePath,
            sourceVersion: record.sourceVersion,
            outputPath: record.outputPath,
            recordedVersion: record.outputVersion,
            currentVersion,
            outputChanged: currentVersion !== record.outputVersion,
            ...formatFields,
            changes: record.changes,
            verification
          },
          [{ tool: 'ecad_compare', args: { a: record.sourcePath, b: record.outputPath }, why: 'Inspect the primitives the written file differs by.' }],
          { complete: verification.ok, unverified: verification.problems }
        )
      }
      const view = await session.load(path!, exec)
      const profileState = await session.profile(exec)
      const inserts = engineModule.extractInsertAttributes(view.opened)
      const titleBlock = engineModule.detectTitleBlock(view.model, profileState.profile, { inserts })
      const unsupported = Object.values(view.model.stats.unsupported).reduce((sum, count) => sum + count, 0)
      const unverified: string[] = []
      if (view.model.stats.truncated) unverified.push('the entity cap was reached, so the model is incomplete')
      if (unsupported > 0) unverified.push(`${unsupported} unsupported entit${unsupported === 1 ? 'y is' : 'ies are'} counted but not drawn`)
      const formatFields = view.format === 'dxf' ? {} : { format: view.format, ...(view.conversion === undefined ? {} : { converted: view.conversion }) }
      return success(
        `Re-read ${workspaceRelative(session, exec, view.path)}: ${view.model.stats.entities} primitives, ${titleBlock.fields.sheetNumber?.value ?? 'no sheet number'}, ${unsupported} unsupported.`,
        {
          mode: 'readback',
          path: workspaceRelative(session, exec, view.path),
          version: view.sha256,
          sourceBytes: view.sourceBytes,
          ...formatFields,
          dxfVersion: view.model.dxfVersion,
          units: view.model.units,
          entities: view.model.stats.entities,
          layouts: view.model.layouts.map(layout => ({ id: layout.id, kind: layout.kind, entities: layout.entities.length })),
          unsupported: view.model.stats.unsupported,
          approximate: view.model.stats.approximate,
          truncated: view.model.stats.truncated,
          titleBlock,
          writes: false
        },
        [{ tool: 'ecad_checks', args: { path }, why: 'Run the review rules over the re-read drawing.' }],
        { complete: !view.model.stats.truncated && unsupported === 0, unverified }
      )
    }
  })
}

/**
 * A new path beside the source that does not exist yet.
 *
 * @param session - the row session.
 * @param sourcePath - source drawing display path.
 * @param requested - caller-supplied output path, when given.
 * @param exec - calling context.
 * @returns a path that does not exist.
 */
async function uniqueOutputPath(session: EcadSession, sourcePath: string, requested: string | undefined, exec: Parameters<EcadSession['resolve']>[1]): Promise<string> {
  const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\..+$/u, '')
  const stem = stemOf(sourcePath)
  const parent = parentOf(sourcePath)
  const proposed = requested !== undefined && requested.trim() !== ''
    ? requested
    : `${parent === '.' || parent === '/' ? '' : `${parent}/`}${stem}-ecad-${stamp}.dxf`
  if (!isSupportedDrawingPath(proposed)) {
    throw new EngineeringError(
      'ECAD_OUTPUT_EXTENSION',
      `The output path ${JSON.stringify(proposed)} does not name a drawing format this build writes.`,
      'Pass output_path ending in .dxf or .dwg, or omit it to use the default new name beside the source.'
    )
  }
  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? proposed : proposed.replace(/(\.[^.]+)$/u, `-${index}$1`)
    if (!(await session.exists(candidate, exec))) return candidate
  }
  throw new EngineeringError('ECAD_OUTPUT_EXISTS', 'Every candidate output name already exists.', 'Pass an explicit output_path in a folder that has room, or move the existing outputs.')
}

/**
 * Count one operation per kind, for the staged draft answer.
 *
 * @param ops - operations.
 */
function countOps(ops: readonly EcadOp[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const op of ops) {
    const kind = typeof (op as { op?: unknown }).op === 'string' ? String((op as { op: string }).op) : 'unknown'
    counts[kind] = (counts[kind] ?? 0) + 1
  }
  return counts
}
