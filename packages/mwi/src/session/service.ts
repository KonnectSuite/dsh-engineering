/**
 * One workspace's MotionWorks runtime: bridge, code engine, stage and the rows
 * that need them.
 *
 * Runtimes are cached per workspace so one chat reuses the bridge it started and
 * one workspace's mailbox never answers another's request.
 *
 * @module dsh-engineering-mwi/session/service
 */

import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Bridge } from '../core/bridge.ts'
import { CodeEngine } from '../core/code-engine.ts'
import { MwiError } from '../core/errors.ts'
import { PowerShellBridgeTransport } from '../core/ps-bridge.ts'
import { StageService, type StageOptions, type StageRecord } from './stage.ts'
import { stageRootOf, workspaceOf, isInside } from './workspace.ts'

/** The bridge directory shipped with this package. */
export const BRIDGE_DIR = fileURLToPath(new URL('../../bridge/', import.meta.url))
/** The code engine directory shipped with this package. */
export const CODE_DIR = fileURLToPath(new URL('../../code/', import.meta.url))

/** One open worksheet request. */
export interface WorksheetRequest {
  /** `code` or `variables`. */
  readonly kind: 'code' | 'variables'
  /** POU name for a code worksheet; omit for globals. */
  readonly pou?: string
  /** Inspect the current editor instead of opening one. */
  readonly inspectOnly?: boolean
}

/** What the session tools need from a workspace runtime. */
export interface SessionRuntime {
  /** IDE status from the bridge. */
  status(): Promise<Record<string, unknown>>
  /** Live IDE state, including window and dialog state. */
  ideState(): Promise<Record<string, unknown>>
  /** Stage one workspace project. */
  stage(source: string, options?: StageOptions): Promise<StageRecord>
  /** Open a staged project. */
  open(path: string, options: { userApproved?: boolean; expectedProject?: string }): Promise<Record<string, unknown>>
  /** Start the IDE with a staged project. */
  start(project?: string): Promise<Record<string, unknown>>
  /** Open one worksheet in the open project. */
  worksheet(request: WorksheetRequest): Promise<Record<string, unknown>>
  /** Close the IDE project with consent. */
  close(options: { userApproved: boolean; expectedProject?: string }): Promise<Record<string, unknown>>
  /** The stage record for a path, when it is staged. */
  stagedAt(path: string): StageRecord | undefined
}

/** A workspace runtime over the real bridge and engine. */
export class PowerShellSessionRuntime implements SessionRuntime {
  private readonly bridge: Bridge
  private readonly engine: CodeEngine
  private readonly stages: StageService

  /**
   * @param workspace - Absolute workspace root.
   */
  constructor(readonly workspace: string) {
    this.bridge = new Bridge(new PowerShellBridgeTransport({
      bridgeDir: BRIDGE_DIR,
      workspace,
      stageRoot: stageRootOf(workspace),
    }))
    this.engine = new CodeEngine({ workspace, stageRoot: stageRootOf(workspace), codeDir: CODE_DIR })
    this.stages = new StageService(this.engine, workspace)
  }

  /** @returns The bridge's status document. */
  async status(): Promise<Record<string, unknown>> {
    return await this.bridge.run('status') as Record<string, unknown>
  }

  /** @returns The bridge's live state document. */
  async ideState(): Promise<Record<string, unknown>> {
    return await this.bridge.run('ide_state', { include_window_state: true }) as Record<string, unknown>
  }

  /** @returns The written stage record. */
  async stage(source: string, options: StageOptions = {}): Promise<StageRecord> {
    return await this.stages.stage(source, {
      ...options,
      assertClosed: async () => {
        let status: Record<string, unknown>
        try {
          status = await this.status()
        } catch (error) {
          if (error instanceof MwiError && error.code === 'IDE_NOT_RUNNING') return
          throw error
        }
        const active = typeof status.active_project === 'string' ? status.active_project : undefined
        if (active === undefined) return
        const requested = resolve(this.workspace, source)
        const name = requested.replace(/\\/gu, '/').split('/').pop()?.replace(/\.mwt$/iu, '') ?? ''
        if (name !== '') StageService.assertClosed(join(stageRootOf(this.workspace), name), { is_project_open: true, active_project: active })
      },
    })
  }

  /** @returns The bridge's open result. */
  async open(path: string, options: { userApproved?: boolean; expectedProject?: string }): Promise<Record<string, unknown>> {
    const resolved = resolve(path)
    if (!isInside(stageRootOf(this.workspace), resolved) || !existsSync(resolved)) {
      throw new MwiError('NOT_STAGED', `${resolved} is not a staged project.`, 'Stage the workspace project with mw_project_stage, then open the staged .mwt.')
    }
    const name = resolved.replace(/\\/gu, '/').split('/').pop()?.replace(/\.mwt$/iu, '') ?? ''
    if (this.stages.identityOf(name) === undefined) {
      throw new MwiError('STAGE_IDENTITY_MISSING', `The stage ${name} has no identity record.`, 'Stage the project again; an unproven stage is never opened.')
    }
    const binding = await this.engine.run('check_mwt', { project: resolved }) as { wrapper_sha256?: string }
    return await this.bridge.run('open', {
      path: resolved,
      wrapper_sha256: binding.wrapper_sha256,
      user_approved: options.userApproved === true,
      ...(options.expectedProject === undefined ? {} : { expected_project: options.expectedProject }),
    }) as Record<string, unknown>
  }

  /** @returns The bridge's start result. */
  async start(project?: string): Promise<Record<string, unknown>> {
    const staged = project === undefined ? this.singleStage() : this.stageMwt(project)
    const binding = await this.engine.run('check_mwt', { project: staged }) as { wrapper_sha256?: string }
    return await this.bridge.run('start_ide', {
      include_trial_method: true,
      path: staged,
      wrapper_sha256: binding.wrapper_sha256,
    }) as Record<string, unknown>
  }

  /** @returns The bridge's worksheet result. */
  async worksheet(request: WorksheetRequest): Promise<Record<string, unknown>> {
    const status = await this.status()
    if (status.is_project_open !== true || typeof status.active_project !== 'string') {
      throw new MwiError('NO_PROJECT', 'No project is open in the IDE.', 'Open a staged project first with mw_project_open.')
    }
    const record = this.stages.stagedAt(status.active_project)
    if (record === undefined) {
      throw new MwiError('NOT_STAGED', `The open project is not a proven stage: ${status.active_project}.`, 'Open a staged project before navigating worksheets.')
    }
    const target = await this.engine.run('worksheet_target', {
      project: record.staged_directory,
      kind: request.kind,
      ...(request.pou === undefined ? {} : { pou: request.pou }),
    }) as Record<string, unknown>
    return await this.bridge.run('open_worksheet', {
      project: record.staged_directory,
      ...target,
      inspect_only: request.inspectOnly === true,
    }) as Record<string, unknown>
  }

  /** @returns The bridge's close result. */
  async close(options: { userApproved: boolean; expectedProject?: string }): Promise<Record<string, unknown>> {
    if (options.userApproved !== true) {
      throw new MwiError('APPROVAL_REQUIRED', 'Closing the IDE requires explicit user approval.', 'Ask the user, then pass user_approved: true and the exact open project path.')
    }
    return await this.bridge.run('close_ide', {
      user_approved: true,
      ...(options.expectedProject === undefined ? {} : { expected_project: options.expectedProject }),
    }) as Record<string, unknown>
  }

  /** @returns The stage record for a path. */
  stagedAt(path: string): StageRecord | undefined {
    return this.stages.stagedAt(path)
  }

  /** The only staged project, or a refusal that explains the choice. */
  private singleStage(): string {
    let names: string[] = []
    try {
      names = readdirSync(stageRootOf(this.workspace)).filter(name => name.toLowerCase().endsWith('.mwt'))
    } catch {
      names = []
    }
    if (names.length === 0) throw new MwiError('NO_STAGE', 'No project is staged in this workspace.', 'Call mw_project_find, then mw_project_stage.')
    if (names.length > 1) {
      throw new MwiError('AMBIGUOUS_STAGE', `${names.length} projects are staged.`, 'Pass project: the staged .mwt to start.', names)
    }
    return join(stageRootOf(this.workspace), names[0] as string)
  }

  /** Resolve a requested staged project. */
  private stageMwt(project: string): string {
    const resolved = resolve(this.workspace, project)
    const mwt = resolved.toLowerCase().endsWith('.mwt') ? resolved : `${resolved}.mwt`
    if (!isInside(stageRootOf(this.workspace), mwt) || !existsSync(mwt)) {
      throw new MwiError('NOT_STAGED', `${mwt} is not a staged project.`, 'Stage the workspace project first, then pass the staged .mwt.')
    }
    return mwt
  }
}

const runtimes = new Map<string, PowerShellSessionRuntime>()

/**
 * Resolve the runtime for one workspace.
 *
 * @param workspace - Absolute workspace root.
 * @returns The cached runtime.
 */
export function runtimeFor(workspace: string): PowerShellSessionRuntime {
  const key = workspace.toLowerCase()
  const existing = runtimes.get(key)
  if (existing !== undefined) return existing
  const created = new PowerShellSessionRuntime(workspace)
  runtimes.set(key, created)
  return created
}

/** Resolve a tool call's workspace. */
export function workspaceFrom(exec: { cwd?: string }): string {
  return workspaceOf(exec.cwd)
}
