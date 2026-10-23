/**
 * The edit row: replace code, edit declarations, change structure and apply.
 *
 * Editing is off by default. Every tool writes only the staged project, and the
 * proven native helpers verify that unrelated saved and native state did not
 * change.
 *
 * @module dsh-engineering-mwi/tools/edit
 */

import { boolean, choice, integer, list, object, objectItem, record, string } from '../core/params.ts'
import { success } from '../core/result.ts'
import { MwiError } from '../core/errors.ts'
import { tool, type ToolDefinition } from '../core/tool.ts'
import { workspaceOf } from '../session/workspace.ts'
import { runtimeFor, type SessionRuntime } from '../session/service.ts'

/** How the tools reach a workspace runtime; injectable for tests. */
export type EditRuntimeFactory = (workspace: string) => SessionRuntime

/** What a native edit cannot establish. */
const EDIT_COVERAGE = {
  complete: false,
  unverified: [
    'compilation and controller acceptance; the edit verifies saved/native state only',
    'runtime behavior of the edited code',
    'graphical bodies; only ST and IL text bodies are editable',
  ],
} as const

/**
 * The edit tools.
 *
 * @param runtimeOf - Workspace runtime factory; defaults to the PowerShell bridge.
 * @returns Tool definitions in registration order.
 */
export function editTools(runtimeOf: EditRuntimeFactory = runtimeFor): readonly ToolDefinition[] {
  return [
    tool({
      name: 'mw_edit_code',
      description: 'Replace one ST or IL body in the open staged project through the native ChangeCodeWS path. Supply exact find/replace changes with the body hash, or a complete body with the current body. Verifies saved and native state, then leaves compilation to mw_compile.',
      parameters: object({
        pou: string('Exact POU name.'),
        changes: list('Exact find/replace changes; each must match its expected count.', objectItem('One exact change.', {
          find: string('Exact text to find.'),
          replace: string('Replacement text.'),
          count: integer('Expected non-overlapping occurrences; defaults 1.', { minimum: 1, maximum: 100 }),
        }, ['find', 'replace'])),
        expected_body_sha256: string('Exact 64-character text_body_sha256 from mw_get for kind pou, when using changes.'),
        body: string('Complete replacement body, when not using changes.'),
        expected_body: string('Current body that the complete replacement expects, when using body.'),
      }, ['pou']),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const pou = String(args.pou)
        const changes = Array.isArray(args.changes) ? args.changes as Record<string, unknown>[] : undefined
        const hasChanges = changes !== undefined && changes.length > 0
        const hasBody = typeof args.body === 'string'
        if (hasChanges === hasBody) {
          throw new MwiError(
            'INVALID_ARGUMENT',
            'Supply either changes with expected_body_sha256, or body with expected_body.',
            'Use changes for a small exact patch, or body for a full replacement; do not mix them.',
          )
        }
        if (hasChanges && typeof args.expected_body_sha256 !== 'string') {
          throw new MwiError('INVALID_ARGUMENT', 'Changes need expected_body_sha256.', 'Read the POU with mw_get and pass its text_body_sha256.')
        }
        if (hasBody && typeof args.expected_body !== 'string') {
          throw new MwiError('INVALID_ARGUMENT', 'A complete body needs expected_body.', 'Read the POU with mw_get and pass its current body.')
        }
        const result = await runtimeOf(workspace).editCode({
          pou,
          ...(hasChanges ? { changes, expectedHash: String(args.expected_body_sha256) } : { body: String(args.body), expectedBody: String(args.expected_body) }),
        })
        const verification = result.verification as { accepted?: boolean; errors?: readonly string[] } | undefined
        const accepted = verification?.accepted === true
        return success(
          accepted ? `Edited ${pou} and verified the saved and native state.` : `Edited ${pou}, but verification reported: ${verification?.errors?.join('; ') ?? 'unknown'}.`,
          result,
          accepted
            ? [{ tool: 'mw_compile', why: 'Compile the edited project.' }]
            : [{ tool: 'mw_verify', why: 'Capture a baseline and inspect the mismatch before another edit.' }],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_edit_variables',
      description: 'Add, edit or delete one declaration in the open staged project through the native IDE API. Edit replaces the complete seven-field declaration and optional boolean flags; delete needs approval and reference review.',
      parameters: object({
        operation: choice('Variable operation.', ['add', 'edit', 'delete']),
        pou: string('POU for a local declaration; omit for resource globals.'),
        name: string('Existing exact name for edit or delete.'),
        declaration: record('Complete replacement declaration.', {
          name: string('Declaration name.'),
          type: string('Data type.'),
          section: string('Declaration section, for example VAR, VAR_GLOBAL or VAR_EXTERNAL.'),
          group: string('Declaration group.'),
          address: string('Direct address, or omit for none.'),
          initial_value: string('Initial value, or omit for none.'),
          description: string('Description, or omit for none.'),
        }, ['name', 'type', 'section']),
        flags: record('Explicit boolean native variable flags; omitted flags stay unchanged.', {
          retain: boolean('Retain flag.'),
          pdd: boolean('Persistent data flag.'),
          opc: boolean('OPC flag.'),
          disabled: boolean('Disabled flag.'),
          not_on_plc: boolean('Not-on-PLC flag.'),
          redundant: boolean('Redundant flag.'),
        }),
        user_approved: boolean('Approval for a deletion.'),
        references_reviewed: boolean('Set after reviewing code and external references.'),
        rename_reviewed: boolean('Set after reviewing references for a rename.'),
      }, ['operation']),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const operation = String(args.operation)
        const raw = args.declaration as Record<string, unknown> | undefined
        let declaration: Record<string, unknown> | undefined
        if (operation !== 'delete') {
          if (raw === undefined) throw new MwiError('INVALID_ARGUMENT', 'An add or edit needs a declaration.', 'Pass name, type and section at minimum; every other field is explicit.')
          const text = (value: unknown): string | null => typeof value === 'string' && value !== '' ? value : null
          declaration = {
            name: String(raw.name),
            type: String(raw.type),
            section: String(raw.section),
            group: text(raw.group),
            address: text(raw.address),
            initial_value: text(raw.initial_value),
            description: text(raw.description),
          }
        }
        const result = await runtimeOf(workspace).editVariable({
          operation,
          ...(typeof args.pou === 'string' ? { pou: args.pou } : {}),
          ...(typeof args.name === 'string' ? { name: args.name } : {}),
          ...(declaration === undefined ? {} : { declaration }),
          ...(args.flags === undefined ? {} : { flags: args.flags }),
          ...(args.user_approved === true ? { user_approved: true } : {}),
          ...(args.references_reviewed === true ? { references_reviewed: true } : {}),
          ...(args.rename_reviewed === true ? { rename_reviewed: true } : {}),
        })
        const verification = result.verification as { accepted?: boolean; errors?: readonly string[] } | undefined
        const accepted = verification?.accepted === true
        return success(
          accepted ? `${operation} verified against the saved declarations.` : `${operation} did not verify: ${verification?.errors?.join('; ') ?? 'unknown'}.`,
          result,
          accepted ? [{ tool: 'mw_compile', why: 'Compile after the intended changes are complete.' }] : [{ tool: 'mw_verify', why: 'Inspect the mismatch before another edit.' }],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_edit_structure',
      description: 'Create, copy, rename, delete, convert or assign one POU, or create, edit, delete, assign or unassign one task, through the native IDE API. Deletion and unassignment need approval; rename needs reference review.',
      parameters: object({
        scope: choice('Structure kind.', ['pou', 'task']),
        operation: choice('Operation.', ['create', 'copy', 'rename', 'delete', 'edit', 'assign', 'unassign']),
        name: string('Existing name for edit/delete/assign, or the new name for create.'),
        new_name: string('New name for copy or rename.'),
        language: choice('POU language for creation.', ['ST', 'IL', 'FBD', 'LD']),
        pou_type: choice('POU type for creation.', ['PROGRAM', 'FUNCTION_BLOCK', 'FUNCTION']),
        return_type: string('Function return type.'),
        kind: choice('Task kind for creation.', ['CYCLIC', 'DEFAULT', 'SYSTEM']),
        pou: string('Program to assign to a task.'),
        instance: string('Instance name for assign or unassign.'),
        settings: record('Task settings to change; each value is a string.', {
          TYPE: string('Task type.'),
          INTERVAL: string('Cyclic interval, for example T#8ms.'),
          PRIORITY: string('Task priority.'),
          WATCHDOG: string('Watchdog value.'),
          WATCHDOG_ENABLED: string('YES or NO.'),
        }),
        user_approved: boolean('Approval for deletion or unassignment.'),
        references_reviewed: boolean('Set after reviewing references for rename or delete.'),
      }, ['scope', 'operation', 'name']),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const result = await runtimeOf(workspace).editStructure({
          scope: args.scope,
          operation: args.operation,
          name: args.name,
          ...(typeof args.new_name === 'string' ? { new_name: args.new_name } : {}),
          ...(typeof args.language === 'string' ? { language: args.language } : {}),
          ...(typeof args.pou_type === 'string' ? { pou_type: args.pou_type } : {}),
          ...(typeof args.return_type === 'string' ? { return_type: args.return_type } : {}),
          ...(typeof args.kind === 'string' ? { kind: args.kind } : {}),
          ...(typeof args.pou === 'string' ? { pou: args.pou } : {}),
          ...(typeof args.instance === 'string' ? { instance: args.instance } : {}),
          ...(args.settings === undefined ? {} : { settings_changes: args.settings }),
          ...(args.user_approved === true ? { user_approved: true } : {}),
          ...(args.references_reviewed === true ? { references_reviewed: true } : {}),
        })
        const verification = result.verification as { accepted?: boolean; errors?: readonly string[] } | undefined
        const accepted = verification?.accepted === true
        return success(
          accepted ? `${String(args.operation)} verified against the saved and native structure.` : `${String(args.operation)} did not verify: ${verification?.errors?.join('; ') ?? 'unknown'}.`,
          result,
          accepted ? [{ tool: 'mw_compile', why: 'Compile after the intended changes are complete.' }] : [{ tool: 'mw_verify', why: 'Inspect the mismatch before another edit.' }],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_insert_block',
      description: 'Insert one FB instance declaration and its ST call into a POU through the native APIs. Bindings are pin/value pairs; outputs and in-outs need existing direct variables. Requires the exact current body hash.',
      parameters: object({
        pou: string('Target ST POU.'),
        block: string('Function-block name to instantiate.'),
        instance: string('New instance name.'),
        bindings: list('Pin bindings; every in-out pin must be present.', objectItem('One pin binding.', {
          pin: string('Pin name.'),
          value: string('Exact expression or existing direct variable.'),
        }, ['pin', 'value'])),
        expected_body_sha256: string('Exact 64-character hash of the current POU body, or use expected_body.'),
        expected_body: string('Current POU body, or use expected_body_sha256.'),
        library: string('Library that resolves a duplicate block name.'),
        group: string('Declaration group for the instance; defaults to Default.'),
        before: string('Unique exact text to insert before; mutually exclusive with offset.'),
        offset: integer('Zero-based character offset at a line boundary; defaults to append.', { minimum: 0 }),
      }, ['pou', 'block', 'instance', 'bindings']),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        if ((typeof args.expected_body_sha256 === 'string') === (typeof args.expected_body === 'string')) {
          throw new MwiError('INVALID_ARGUMENT', 'Supply exactly one of expected_body_sha256 or expected_body.', 'Read the POU with mw_get and pass its body or its hash.')
        }
        const bindings: Record<string, string> = {}
        for (const entry of args.bindings as readonly { pin: string; value: string }[]) {
          if (bindings[entry.pin] !== undefined) throw new MwiError('INVALID_ARGUMENT', `Pin ${entry.pin} is bound twice.`, 'Bind each pin once.')
          bindings[entry.pin] = entry.value
        }
        const result = await runtimeOf(workspace).insertBlock({
          pou: args.pou,
          block: args.block,
          instance: args.instance,
          bindings,
          ...(typeof args.expected_body_sha256 === 'string' ? { expected_body_sha256: args.expected_body_sha256 } : { expected_body: args.expected_body }),
          ...(typeof args.library === 'string' ? { library: args.library } : {}),
          ...(typeof args.group === 'string' ? { group: args.group } : {}),
          ...(typeof args.before === 'string' ? { before: args.before } : {}),
          ...(typeof args.offset === 'number' ? { offset: args.offset } : {}),
        })
        const verification = result.verification as { accepted?: boolean; errors?: readonly string[] } | undefined
        const accepted = verification?.accepted === true
        return success(
          accepted ? `Inserted ${String(args.instance)} and its call into ${String(args.pou)}.` : `Insertion did not verify: ${verification?.errors?.join('; ') ?? 'unknown'}.`,
          result,
          accepted ? [{ tool: 'mw_compile', why: 'Compile the inserted call.' }] : [{ tool: 'mw_verify', why: 'Inspect the partial phase evidence before another attempt.' }],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_transfer_pou',
      description: 'Export one writable POU to a private workspace package, or import that untouched package into this staged project. Import needs the export token and a dependency review; a token is consumed by one attempt.',
      parameters: object({
        operation: choice('Package operation.', ['export', 'import']),
        pou: string('Exact POU to export.'),
        package_token: string('Token returned by the export.'),
        dependencies_reviewed: boolean('Set after reviewing the package externals before import.'),
      }, ['operation']),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const operation = String(args.operation)
        if (operation === 'export' && typeof args.pou !== 'string') {
          throw new MwiError('INVALID_ARGUMENT', 'Export needs the exact POU name.', 'Pass pou; import takes no POU name.')
        }
        if (operation === 'import' && typeof args.package_token !== 'string') {
          throw new MwiError('INVALID_ARGUMENT', 'Import needs package_token.', 'Export first, then import with its token.')
        }
        const result = await runtimeOf(workspace).transferPou({
          operation,
          ...(typeof args.pou === 'string' ? { pou: args.pou } : {}),
          ...(typeof args.package_token === 'string' ? { package_token: args.package_token } : {}),
          ...(args.dependencies_reviewed === true ? { dependencies_reviewed: true } : {}),
        })
        const accepted = result.accepted === true
        return success(
          accepted
            ? operation === 'export' ? `Exported ${String(args.pou)}.` : 'Imported the POU package.'
            : `Package ${operation} did not verify: ${(result.errors as readonly string[] | undefined)?.join('; ') ?? 'unknown'}.`,
          result,
          accepted ? [{ tool: 'mw_compile', why: 'Compile after the intended changes are complete.' }] : [{ tool: 'mw_verify', why: 'Inspect the retained package evidence.' }],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_validate',
      description: 'Validate the open staged project before applying: workflow blockers, native validation and an optional program review for one POU or proposed body. Read the findings before saving or compiling.',
      parameters: object({
        pou: string('POU to review.'),
        body: string('Proposed replacement body to review without writing it.'),
      }),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const result = await runtimeOf(workspace).validate({
          ...(typeof args.pou === 'string' ? { pou: args.pou } : {}),
          ...(typeof args.body === 'string' ? { body: args.body } : {}),
        })
        const ready = result.ready === true
        return success(
          ready ? 'Validation found no blocker.' : `Validation found ${String((result.blockers as unknown[] | undefined)?.length ?? 0)} blocker(s) and ${String((result.validation_errors as unknown[] | undefined)?.length ?? 0)} validation error(s).`,
          result,
          ready
            ? [{ tool: 'mw_apply', why: 'Save the validated staged project.' }]
            : [{ tool: 'mw_review', why: 'Inspect the components named by the findings.' }],
          EDIT_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_apply',
      description: 'Save the open staged project through the IDE. This writes only the staged copy; promoting source back to the workspace remains a separate, explicit step.',
      parameters: object({}),
      async run(_args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const result = await runtimeOf(workspace).apply()
        return success(
          'Saved the staged project through the IDE.',
          result,
          [{ tool: 'mw_compile', why: 'Compile the saved project.' }],
          EDIT_COVERAGE,
        )
      },
    }),
  ]
}
