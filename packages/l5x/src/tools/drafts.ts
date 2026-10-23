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

import { prepareChangeSet } from '../engine/change-set.ts'
import { L5xError } from '../core/errors.ts'
import { success, type Coverage } from '../core/result.ts'
import { choice, integer, object, string } from '../core/params.ts'
import type { ToolDefinition } from '../core/tool.ts'
import type { ProjectSession } from '../session.ts'
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

/** The success document every append answers with. */
function appended(draft: Draft, operation: DraftOperation): unknown {
  return success(
    `Draft ${draft.id}: ${draft.operations.length} ${draft.operations.length === 1 ? 'operation' : 'operations'}.`,
    { draft_id: draft.id, operation_count: draft.operations.length, last_operation: operation },
    [{ tool: 'draft_validate', args: { draft_id: draft.id }, why: 'Validate the whole draft before writing anything.' }],
  )
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
export function draftTools(session: ProjectSession, drafts: DraftStore, maxOperations: number, maxFileBytes: number): readonly ToolDefinition[] {
  return [
    tool({
      name: 'draft_rung',
      description: 'Append one ladder rung operation to the chat draft: replace, insert or delete. Nothing is written until draft_apply.',
      parameters: object({
        program: string('Program that owns the routine. Example: "MainProgram".'),
        routine: string('Routine the rung belongs to. Example: "MainRoutine".'),
        mode: choice('replace rewrites an existing rung, insert adds one, delete removes one.', ['replace', 'insert', 'delete']),
        rung: integer('Rung number the operation targets. Required for replace and delete; for insert it is the new rung number.', { minimum: 0 }),
        text: string('NeutralText for replace or insert. Omit for delete. Example: "XIC(Start)OTE(Run);"'),
        before_rung: integer('For insert only: insert before this rung number instead of after rung.', { minimum: 0 }),
        project_id: PROJECT_ID,
      }, ['program', 'routine', 'mode']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const program = requiredString(args, 'program')
        const routine = requiredString(args, 'routine')
        const mode = requiredString(args, 'mode')
        const text = optionalString(args, 'text')
        const rung = optionalInteger(args, 'rung')
        const before = optionalInteger(args, 'before_rung')
        let operation: DraftOperation
        if (mode === 'delete') {
          if (rung === undefined) throw invalid('rung', 'Required when mode is delete.', 'Pass the rung number to remove.')
          operation = { operation: 'delete_rung', program, routine, rung }
        } else if (mode === 'replace') {
          if (rung === undefined || text === undefined) throw invalid('rung and text', 'Required when mode is replace.', 'Pass the rung number and its new NeutralText.')
          operation = { operation: 'replace_rung', program, routine, rung, text }
        } else if (mode === 'insert') {
          if (rung === undefined || text === undefined) throw invalid('rung and text', 'Required when mode is insert.', 'Pass the new rung number and its NeutralText.')
          operation = { operation: 'insert_rung', program, routine, rung, text, ...(before === undefined ? {} : { before_rung: before }) }
        } else {
          throw invalid('mode', `Unknown mode ${JSON.stringify(mode)}.`, 'Pass one of: replace, insert, delete.')
        }
        return appended(drafts.append(exec, project.id, operation, maxOperations), operation)
      },
    }),
    tool({
      name: 'draft_st',
      description: 'Append one Structured Text body replacement to the chat draft. Nothing is written until draft_apply.',
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
          program: requiredString(args, 'program'),
          routine: requiredString(args, 'routine'),
          code: requiredString(args, 'code'),
        }
        return appended(drafts.append(exec, project.id, operation, maxOperations), operation)
      },
    }),
    tool({
      name: 'draft_routine',
      description: 'Append one new routine to the chat draft. Nothing is written until draft_apply.',
      parameters: object({
        program: string('Program that will own the new routine. Example: "MainProgram".'),
        name: string('New routine name, a Logix identifier of at most 40 characters. Example: "Calc".'),
        language: choice('Language of the new routine: RLL for ladder, ST for Structured Text.', ['RLL', 'ST']),
        code: string('Body: NeutralText rungs for RLL, statements for ST.'),
        project_id: PROJECT_ID,
      }, ['program', 'name', 'language', 'code']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const operation: DraftOperation = {
          operation: 'add_routine',
          program: requiredString(args, 'program'),
          name: requiredString(args, 'name'),
          language: requiredString(args, 'language'),
          code: requiredString(args, 'code'),
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
        data_type: string('Declared data type. Example: "REAL" or a UDT name.'),
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
          scope: requiredString(args, 'scope'),
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
          scope: requiredString(args, 'scope'),
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
          udt: requiredString(args, 'udt'),
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
        const udt = requiredString(args, 'udt')
        const description = requiredString(args, 'description')
        const member = optionalString(args, 'member')
        const operation: DraftOperation = member === undefined
          ? { operation: 'set_udt_description', udt, description }
          : { operation: 'set_udt_member_description', udt, member, description }
        return appended(drafts.append(exec, project.id, operation, maxOperations), operation)
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
          [{ tool: 'open_project', args: { path: target }, why: 'Reopen the written draft and review it.' }],
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
