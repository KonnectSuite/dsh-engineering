/**
 * The verify row: compile, diagnostics and saved-source verification.
 *
 * Every tool here requires the open project to be a proven stage; the runtime
 * refuses a workspace original.
 *
 * @module dsh-engineering-mwi/tools/verify
 */

import { choice, integer, object, string } from '../core/params.ts'
import { MwiHostAdapter } from '../core/host.ts'
import { success } from '../core/result.ts'
import { tool, type ToolDefinition } from '../core/tool.ts'
import { workspaceOf } from '../session/workspace.ts'
import { runtimeFor } from '../session/service.ts'
import type { SessionRuntime } from '../session/service.ts'

/** How the tools reach a workspace runtime; injectable for tests. */
export type VerifyRuntimeFactory = (workspace: string) => SessionRuntime

/** What a compile verdict cannot establish. */
const VERIFY_COVERAGE = {
  complete: false,
  unverified: [
    'runtime behavior of the compiled project',
    'controller state and online logic',
    'graphical placement and wiring',
  ],
} as const

/**
 * The verify tools.
 *
 * @param runtimeOf - Workspace runtime factory; defaults to the PowerShell bridge.
 * @param adapter - Host capability adapter; defaults to the real installation probe.
 * @returns Tool definitions in registration order.
 */
export function verifyTools(runtimeOf: VerifyRuntimeFactory = runtimeFor, adapter: MwiHostAdapter = new MwiHostAdapter()): readonly ToolDefinition[] {
  return [
    tool({
      name: 'mw_compile',
      description: 'Run Make (link changed sources), Build (full compile), or read the compile state of the open staged project. A verdict is the vendor engine\'s, not proof of runtime behavior.',
      parameters: object({
        mode: choice('Compile operation: make, build or state.', ['make', 'build', 'state']),
      }),
      async run(args, exec) {
        const blocked = adapter.notRunnable('compile')
        if (blocked !== undefined) return blocked
        const workspace = workspaceOf(exec.cwd)
        const mode = (args.mode === 'make' || args.mode === 'build' ? args.mode : 'state') as 'make' | 'build' | 'state'
        const result = await runtimeOf(workspace).compile(mode)
        const state = mode === 'state'
          ? `compiled=${String(result.is_compiled ?? 'unknown')}, modified=${String(result.is_modified ?? 'unknown')}`
          : `verdict ${String(result.verdict ?? result.status ?? 'reported')}`
        return success(
          `${mode === 'state' ? 'Compile state' : mode}: ${state}.`,
          result,
          [{ tool: 'mw_diagnostics', why: 'Read the IDE messages the verdict does not include.' }],
          VERIFY_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_diagnostics',
      description: 'Read one IDE output pane (Errors, Warnings or Build) as text, with the compile state attached. The API returns a verdict but not the messages, so this is the only source for exact text.',
      parameters: object({
        pane: string('Output pane name. Defaults to Errors.'),
        limit: integer('Most messages. Defaults to 200, maximum 500.', { minimum: 1, maximum: 500 }),
      }),
      async run(args, exec) {
        const blocked = adapter.notRunnable('live')
        if (blocked !== undefined) return blocked
        const workspace = workspaceOf(exec.cwd)
        const pane = typeof args.pane === 'string' && args.pane !== '' ? args.pane : 'Errors'
        const result = await runtimeOf(workspace).diagnostics(pane, typeof args.limit === 'number' ? args.limit : 200)
        const count = typeof result.count === 'number' ? result.count : 0
        return success(
          count === 0
            ? `${pane} has no messages; compile state is reported separately.`
            : `${pane}: ${count} message(s).`,
          result,
          [{ tool: 'mw_compile', why: 'Read the verdict behind these messages.' }],
          VERIFY_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_verify',
      description: 'Capture a baseline of the saved project source and compile state, or compare the open project against a captured baseline. Reports added, removed and changed source files.',
      parameters: object({
        mode: choice('Capture a baseline or compare against one.', ['baseline', 'compare']),
        baseline_id: string('Baseline id returned by a capture. Required when mode is compare.'),
      }),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const mode = args.mode === 'compare' ? 'compare' : 'baseline'
        const result = await runtimeOf(workspace).verify(mode, typeof args.baseline_id === 'string' ? args.baseline_id : undefined)
        if (mode === 'baseline') {
          return success(
            `Captured baseline ${String(result.baseline_id)} for ${String(result.project)}.`,
            result,
            [{ tool: 'mw_verify', why: 'Compare against this baseline after a change.', args: { mode: 'compare', baseline_id: result.baseline_id } }],
            VERIFY_COVERAGE,
          )
        }
        const matched = result.matched === true
        return success(
          matched ? 'The saved source matches the baseline.' : `The saved source changed since the baseline: ${String((result.changed as unknown[] | undefined)?.length ?? 0)} changed file(s).`,
          result,
          matched
            ? [{ tool: 'mw_compile', why: 'Compile the verified source.' }]
            : [{ tool: 'mw_review', why: 'Review the changed project before compiling.' }],
          VERIFY_COVERAGE,
        )
      },
    }),
  ]
}
