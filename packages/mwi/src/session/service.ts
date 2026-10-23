/**
 * One workspace's MotionWorks runtime: bridge, code engine, stage and the rows
 * that need them.
 *
 * Runtimes are cached per workspace so one chat reuses the bridge it started and
 * one workspace's mailbox never answers another's request.
 *
 * @module dsh-engineering-mwi/session/service
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Bridge } from '../core/bridge.ts'
import { CodeEngine } from '../core/code-engine.ts'
import { MwiError } from '../core/errors.ts'
import { PowerShellBridgeTransport } from '../core/ps-bridge.ts'
import { StageService, type StageOptions, type StageRecord } from './stage.ts'
import { ReadService } from '../read/service.ts'
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
  /** Saved-project reads over the code engine. */
  readonly reads: ReadService
  /** Run Make, Build or read compile state for the open staged project. */
  compile(mode: 'make' | 'build' | 'state'): Promise<Record<string, unknown>>
  /** Read one IDE output pane, with the compile verdict when available. */
  diagnostics(pane: string, limit: number): Promise<Record<string, unknown>>
  /** Capture or compare one saved-source baseline. */
  verify(mode: 'baseline' | 'compare', baselineId?: string): Promise<Record<string, unknown>>
}

/** A workspace runtime over the real bridge and engine. */
export class PowerShellSessionRuntime implements SessionRuntime {
  private readonly bridge: Bridge
  private readonly engine: CodeEngine
  private readonly stages: StageService
  /** Saved-project reads. */
  readonly reads: ReadService

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
    this.reads = new ReadService(this.engine)
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

  /** @returns The bridge's compile result. */
  async compile(mode: 'make' | 'build' | 'state'): Promise<Record<string, unknown>> {
    await this.openStagedRecord()
    if (mode === 'state') return await this.bridge.run('compile_state', {}) as Record<string, unknown>
    try {
      return await this.bridge.run(mode, {}, 400_000) as Record<string, unknown>
    } catch (error) {
      if (error instanceof MwiError && error.code === 'BRIDGE_FAILED') {
        throw new MwiError('COMPILE_FAILED', error.message, 'Read mw_diagnostics for the exact message, fix the reported task or source, then compile again.')
      }
      throw error
    }
  }

  /** @returns The output pane and the compile verdict when readable. */
  async diagnostics(pane: string, limit: number): Promise<Record<string, unknown>> {
    const read = await this.bridge.run('read_output', { pane, limit }, 60_000) as Record<string, unknown>
    const state = await this.bridge.run('compile_state', {}, 30_000).catch(() => null) as Record<string, unknown> | null
    return { ...read, compile_state: state }
  }

  /** @returns A baseline receipt or a comparison against one. */
  async verify(mode: 'baseline' | 'compare', baselineId?: string): Promise<Record<string, unknown>> {
    const record = await this.openStagedRecord()
    const manifest = await this.engine.run('source_manifest', { project: record.staged_directory }) as {
      source_digest?: string
      files?: Record<string, string>
    }
    const state = await this.bridge.run('compile_state', {}, 30_000).catch(() => null) as Record<string, unknown> | null
    const directory = join(this.workspace, '.motionworks', 'verification')
    if (mode === 'baseline') {
      const id = randomUUID()
      mkdirSync(directory, { recursive: true })
      const baseline = {
        id,
        project: record.staged_directory,
        source_digest: manifest.source_digest,
        files: manifest.files,
        compile_state: state,
        captured_at: new Date().toISOString(),
      }
      writeFileSync(join(directory, `${id}.json`), JSON.stringify(baseline, null, 2))
      return { baseline_id: id, project: record.staged_directory, source_digest: manifest.source_digest, compile_state: state, baseline_path: join(directory, `${id}.json`) }
    }
    if (baselineId === undefined || baselineId === '') {
      throw new MwiError('BASELINE_REQUIRED', 'Comparing needs the baseline_id returned by a baseline capture.', 'Call mw_verify mode baseline, then compare with that id.')
    }
    let baseline: { project?: string; source_digest?: string; files?: Record<string, string>; compile_state?: unknown }
    try {
      baseline = JSON.parse(readFileSync(join(directory, `${baselineId}.json`), 'utf8')) as typeof baseline
    } catch {
      throw new MwiError('BASELINE_NOT_FOUND', `No baseline ${baselineId} exists in this workspace.`, 'Capture a new baseline and compare against that id.')
    }
    if (baseline.project === undefined || resolve(baseline.project) !== resolve(record.staged_directory)) {
      throw new MwiError('BASELINE_PROJECT_MISMATCH', 'The baseline belongs to another project.', 'Capture a baseline for the open project and compare that id.')
    }
    const before = baseline.files ?? {}
    const after = manifest.files ?? {}
    const added = Object.keys(after).filter(file => before[file] === undefined)
    const removed = Object.keys(before).filter(file => after[file] === undefined)
    const changed = Object.keys(after).filter(file => before[file] !== undefined && before[file] !== after[file])
    return {
      baseline_id: baselineId,
      project: record.staged_directory,
      matched: baseline.source_digest === manifest.source_digest,
      source_digest: manifest.source_digest,
      baseline_source_digest: baseline.source_digest,
      added,
      removed,
      changed,
      compile_state: state,
      baseline_compile_state: baseline.compile_state,
    }
  }

  /** The open project must be a proven stage; every compile and verify depends on it. */
  private async openStagedRecord(): Promise<StageRecord> {
    const status = await this.status()
    if (status.is_project_open !== true || typeof status.active_project !== 'string') {
      throw new MwiError('NO_PROJECT', 'No project is open in the IDE.', 'Open a staged project with mw_project_open before compiling.')
    }
    const record = this.stages.stagedAt(status.active_project)
    if (record === undefined) {
      throw new MwiError('NOT_STAGED', `The open project is not a proven stage: ${status.active_project}.`, 'Open a staged project; the verify row never compiles a workspace original.')
    }
    return record
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
