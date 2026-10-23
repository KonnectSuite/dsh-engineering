/**
 * The edit row: replace code, edit declarations, change structure and apply.
 *
 * Editing is off by default. Every tool writes only the staged project, and the
 * proven native helpers verify that unrelated saved and native state did not
 * change.
 *
 * @module dsh-engineering-mwi/tools/edit
 */

import { integer, list, object, objectItem, string } from '../core/params.ts'
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
