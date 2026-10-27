/**
 * The session row: find, stage, open and close the project; report IDE state.
 *
 * An IDE that is not running is a state, not a failure: the tools report it and
 * point at the start tool. Every mutation that touches the IDE names the consent
 * it needs in its parameters.
 *
 * @module dsh-engineering-mwi/tools/session
 */

import { boolean, choice, integer, object, string } from '../core/params.ts'
import { success } from '../core/result.ts'
import { MwiError } from '../core/errors.ts'
import { tool, type ToolDefinition } from '../core/tool.ts'
import { findProjects, stageRootOf, workspaceOf } from '../session/workspace.ts'
import { listBackups } from '../session/backup.ts'
import { runtimeFor, type SessionRuntime } from '../session/service.ts'

/** How the tools reach a workspace runtime; injectable for tests. */
export type RuntimeFactory = (workspace: string) => SessionRuntime

/** What every IDE answer cannot establish. */
const IDE_COVERAGE = {
  complete: false,
  unverified: [
    'runtime behavior of the loaded project',
    'graphical placement and wiring of saved code',
    'whether the loaded project matches the saved project after external changes',
  ],
} as const

/** Run a bridge operation, return undefined when the IDE is simply not running. */
async function optional(call: () => Promise<Record<string, unknown>>): Promise<Record<string, unknown> | undefined> {
  try {
    return await call()
  } catch (error) {
    if (error instanceof MwiError && error.code === 'IDE_NOT_RUNNING') return undefined
    throw error
  }
}

/**
 * The session tools.
 *
 * @param runtimeOf - Workspace runtime factory; defaults to the PowerShell bridge.
 * @returns Tool definitions in registration order.
 */
export function sessionTools(runtimeOf: RuntimeFactory = runtimeFor): readonly ToolDefinition[] {
  return [
    tool({
      name: 'mw_project_find',
      description: 'Find MotionWorks IEC projects inside the calling workspace. Returns each .mwt, its expanded directory, whether a staged copy exists and whether a pre-edit backup exists. Call this before opening anything.',
      parameters: object({
        filter: string('Optional case-insensitive substring matched against the project name or path.'),
        limit: integer('Most projects to return. Defaults to 20.', { minimum: 1, maximum: 100 }),
      }),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const projects = findProjects(workspace, {
          filter: typeof args.filter === 'string' ? args.filter : undefined,
          limit: typeof args.limit === 'number' ? args.limit : 20,
        })
        const staged = projects.filter(project => project.staged !== null).length
        const backups = listBackups(workspace)
        return success(
          projects.length === 0
            ? `No MotionWorks project was found inside ${workspace}.`
            : `Found ${projects.length} MotionWorks project(s) in ${workspace}; ${staged} staged, ${backups.length} with a pre-edit backup.`,
          { workspace, stage_root: stageRootOf(workspace), backups, projects },
          projects.length === 0
            ? []
            : [{ tool: 'mw_project_open', why: 'Open the workspace project; a verified backup is taken first.', args: { path: projects[0]?.mwt } }],
          { complete: false, unverified: ['projects outside the workspace are never listed or staged'] },
        )
      },
    }),
    tool({
      name: 'mw_ide_status',
      description: 'Report whether MotionWorks IEC is running, which project is open, the automation version, the active view, the compile state and any blocking dialog. Call it before and after operations that change the IDE.',
      parameters: object({}),
      async run(_args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const status = await optional(async () => await runtimeOf(workspace).status())
        if (status === undefined) {
          return success(
            'MotionWorks IEC is not running.',
            { ide_running: false, workspace, stage_root: stageRootOf(workspace) },
            [{ tool: 'mw_ide_start', why: 'Start the IDE with a staged workspace project.' }],
            IDE_COVERAGE,
          )
        }
        const state = await optional(async () => await runtimeOf(workspace).ideState())
        const blocked = state?.blocked === true
        return success(
          blocked
            ? 'MotionWorks IEC is running and blocked by a dialog.'
            : status.is_project_open === true
              ? `MotionWorks IEC is running with ${String(status.active_project ?? 'a project')} open.`
              : 'MotionWorks IEC is running with no project open.',
          { workspace, stage_root: stageRootOf(workspace), ...status, ...(state === undefined ? {} : { ide_state: state }) },
          blocked
            ? [{ tool: 'mw_ide_status', why: 'Re-read after the dialog is resolved.' }]
            : [{ tool: 'mw_project_find', why: 'Confirm the project is the one in the workspace.' }],
          IDE_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_project_stage',
      description: 'Optional sandbox: copy one workspace project into .motionworks/stage so the IDE opens a copy instead of the real files. Normal editing opens the workspace project directly.',
      parameters: object({
        source: string('Workspace project folder or its .mwt. Must be inside the workspace.'),
        replace_existing: boolean('Replace an existing stage after review; defaults false. The previous stage is retained under backups/.'),
      }, ['source']),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const record = await runtimeOf(workspace).stage(String(args.source), { replace: args.replace_existing === true })
        return success(
          `Staged ${record.name} from ${record.source}.`,
          record,
          [{ tool: 'mw_project_open', why: 'Open the staged project in the IDE.', args: { path: record.staged_mwt } }],
          { complete: false, unverified: ['the staged copy is byte-identical to the source; the source itself is untouched'] },
        )
      },
    }),
    tool({
      name: 'mw_project_open',
      description: 'Open a workspace project directly, or a staged copy. A direct open first writes and verifies one complete backup under <workspace>/backups/. Refuses to replace another open project without the exact approved path.',
      parameters: object({
        path: string('Workspace .mwt (edits the real project, backup taken first) or a staged .mwt from mw_project_stage.'),
        user_approved: boolean('True only after the user approved saving and closing another open project.'),
        expected_project: string('Exact open project path named in that approval.'),
      }, ['path']),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const opened = await runtimeOf(workspace).open(String(args.path), {
          userApproved: args.user_approved === true,
          expectedProject: typeof args.expected_project === 'string' ? args.expected_project : undefined,
        })
        return success(
          opened.matches_request === false
            ? 'The open call returned, but the IDE has a different project open.'
            : `Opened ${String(opened.active_project ?? args.path)}.`,
          opened,
          [{ tool: 'mw_ide_status', why: 'Confirm the active project and compile state.' }],
          IDE_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_ide_start',
      description: 'Start MotionWorks IEC with one workspace project (backup first) or a staged copy, or attach to the IDE that is already running. Refuses when several projects are openable without a project argument.',
      parameters: object({
        project: string('Workspace or staged .mwt to start with. Omit when exactly one project is openable.'),
      }),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const started = await runtimeOf(workspace).start(typeof args.project === 'string' ? args.project : undefined)
        return success(
          started.already_running === true ? 'MotionWorks IEC was already running.' : 'MotionWorks IEC started.',
          started,
          [{ tool: 'mw_ide_status', why: 'Confirm the project and compile state after startup.' }],
          IDE_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_worksheet_open',
      description: 'Open one code or variable worksheet, or resource globals, in the open staged project and verify the active view. Read-only: no edit, save, compile or download.',
      parameters: object({
        kind: choice('Worksheet kind: code or variables.', ['code', 'variables']),
        pou: string('POU name for a code worksheet. Omit for globals.'),
        inspect_only: boolean('Check the current editor instead of opening one; defaults false.'),
      }, ['kind']),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const kind = args.kind === 'code' ? 'code' : 'variables'
        const opened = await runtimeOf(workspace).worksheet({
          kind,
          ...(typeof args.pou === 'string' ? { pou: args.pou } : {}),
          inspectOnly: args.inspect_only === true,
        })
        return success(
          `Opened the ${kind} worksheet${typeof args.pou === 'string' ? ` for ${args.pou}` : ''}.`,
          opened,
          [{ tool: 'mw_ide_status', why: 'Confirm the active view before editing.' }],
          IDE_COVERAGE,
        )
      },
    }),
    tool({
      name: 'mw_project_close',
      description: 'Close MotionWorks IEC, saving the open project, after explicit user approval for that exact project.',
      parameters: object({
        user_approved: boolean('True only after the user approved saving and closing MotionWorks.'),
        expected_project: string('Exact open project path named in the approval.'),
      }, ['user_approved']),
      async run(args, exec) {
        const workspace = workspaceOf(exec.cwd)
        const closed = await runtimeOf(workspace).close({
          userApproved: args.user_approved === true,
          expectedProject: typeof args.expected_project === 'string' ? args.expected_project : undefined,
        })
        return success(
          closed.closed === true ? 'MotionWorks IEC closed.' : 'MotionWorks IEC is still running.',
          closed,
          closed.closed === true ? [] : [{ tool: 'mw_ide_status', why: 'Inspect why the IDE did not close.' }],
          { complete: false, unverified: ['unsaved state after close'] },
        )
      },
    }),
  ]
}
