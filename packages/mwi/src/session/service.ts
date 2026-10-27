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
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Bridge } from '../core/bridge.ts'
import { CodeEngine } from '../core/code-engine.ts'
import { MwiError } from '../core/errors.ts'
import { PowerShellBridgeTransport } from '../core/ps-bridge.ts'
import { StageService, type StageOptions, type StageRecord } from './stage.ts'
import { ensureBackup, findBackup, listBackups, type BackupRecord } from './backup.ts'
import { compareVariables } from '../edit/compare.ts'
import { ReadService } from '../read/service.ts'
import { stageRootOf, workspaceOf, isInside } from './workspace.ts'

/** The bridge directory shipped with this package. */
export const BRIDGE_DIR = fileURLToPath(new URL('../../bridge/', import.meta.url))
/** The code engine directory shipped with this package. */
export const CODE_DIR = fileURLToPath(new URL('../../code/', import.meta.url))
/** Vendored proven mutation helpers. */
export const LEGACY_DIR = fileURLToPath(new URL('../../legacy/', import.meta.url))

/** A stage-shaped view of a real, backed-up project. */
function directRecord(backup: BackupRecord): StageRecord {
  return {
    name: backup.name,
    source: backup.mwt,
    source_directory: backup.directory,
    workspace: backup.workspace,
    staged_mwt: backup.mwt,
    staged_directory: backup.directory,
    bound_to: backup.directory,
    previous_embedded_path: null,
    staged_at: backup.created_at,
  }
}

/** Whether two paths name the same project, with or without the `.mwt` suffix. */
function sameProject(left: string, right: string): boolean {
  const bare = (path: string): string => resolve(path).toLowerCase().replace(/\.mwt$/u, '')
  return bare(left) === bare(right)
}

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
  /** Back up a real workspace project before the first write, or reuse its verified backup. */
  attach(path: string): BackupRecord
  /** Open a staged or a real (backed-up) project. */
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
  /** Replace one ST/IL body through the native ChangeCodeWS path. */
  editCode(input: { pou: string; changes?: readonly Record<string, unknown>[]; body?: string; expectedBody?: string; expectedHash?: string }): Promise<Record<string, unknown>>
  /** Validate the current saved project before or after an edit. */
  validate(options: { pou?: string; body?: string }): Promise<Record<string, unknown>>
  /** Save the open staged project through the IDE. */
  apply(): Promise<Record<string, unknown>>
  /** Insert one FB instance and its ST call into a POU. */
  insertBlock(input: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>>
  /** Export one POU to a workspace package, or import it into this project. */
  transferPou(input: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>>

  /** Add, edit or delete one native declaration. */
  editVariable(input: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>>
  /** Create, copy, rename, delete or assign one POU or task. */
  editStructure(input: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>>
  /** Insert one FB instance and its ST call into a POU. */
  insertBlock(input: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>>
}

/** One file in a native POU package. */
interface PackageFile { readonly path: string; readonly bytes: number; readonly sha256: string }

/** One export receipt, bound to this runtime and project. */
interface PackageReceipt {
  readonly saved: Record<string, unknown>
  readonly native: Record<string, unknown>
  readonly pou: Record<string, unknown>
  readonly meta: Record<string, unknown>
  readonly manifest: readonly PackageFile[]
  readonly result: Record<string, unknown>
  readonly directory: string
  readonly project: string
  readonly workspace: string
  readonly evidence_path: string
  used: boolean
}

/** Hash every file in a native package, refusing links and oversized trees. */
function nativePackageManifest(directory: string, workspace: string): readonly PackageFile[] {
  const files: PackageFile[] = []
  let bytes = 0
  const visit = (folder: string): void => {
    if (!isInside(workspace, folder)) throw new MwiError('REFUSED', 'The package directory escapes the workspace.', 'Export into the workspace stage.')
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name)
      if (entry.isSymbolicLink() || !isInside(workspace, path)) throw new MwiError('REFUSED', 'The package contains a link.', 'Re-export the package; links are refused.')
      if (entry.isDirectory()) {
        visit(path)
        continue
      }
      if (!entry.isFile()) throw new MwiError('REFUSED', 'The package contains an unsupported item.', 'Re-export the package.')
      const content = readFileSync(path)
      bytes += content.length
      if (files.length >= 100 || bytes > 64 * 1024 * 1024) throw new MwiError('REFUSED', 'The package exceeds the supported size.', 'Export a smaller POU.')
      files.push({ path: path.slice(directory.length + 1).replaceAll('\\', '/'), bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') })
    }
  }
  visit(directory)
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}

/** A workspace runtime over the real bridge and engine. */
export class PowerShellSessionRuntime implements SessionRuntime {
  private readonly bridge: Bridge
  private readonly engine: CodeEngine
  private readonly stages: StageService
  /** Saved-project reads. */
  readonly reads: ReadService
  /** Live POU-package receipts, bound to this runtime. */
  private readonly packages = new Map<string, PackageReceipt>()

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

  /** @returns The open project path, or undefined when no IDE or no project is open. */
  private async activeProject(): Promise<string | undefined> {
    let status: Record<string, unknown>
    try {
      status = await this.status()
    } catch (error) {
      if (error instanceof MwiError && error.code === 'IDE_NOT_RUNNING') return undefined
      throw error
    }
    return status.is_project_open === true && typeof status.active_project === 'string' ? status.active_project : undefined
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

  /** @returns The verified pre-edit backup record. */
  attach(path: string): BackupRecord {
    return ensureBackup(this.workspace, path)
  }

  /** @returns The bridge's open result. */
  async open(path: string, options: { userApproved?: boolean; expectedProject?: string }): Promise<Record<string, unknown>> {
    const resolved = resolve(this.workspace, path)
    if (!isInside(stageRootOf(this.workspace), resolved)) {
      const record = this.attach(resolved)
      // An already-open project is attached, not reopened: OpenProject reloads the
      // files, and a reload over unsaved editor changes is data loss the backup
      // cannot undo. The verified identity is the whole job in that case.
      const active = await this.activeProject()
      if (active !== undefined && sameProject(active, record.mwt)) {
        return {
          requested: record.mwt,
          is_project_open: true,
          active_project: active,
          matches_request: true,
          already_open: true,
          backup: record.backup,
          backup_manifest: record.manifest,
        }
      }
      const binding = await this.engine.run('check_mwt', { project: record.mwt }) as { wrapper_sha256?: string }
      return await this.bridge.run('open', {
        path: record.mwt,
        wrapper_sha256: binding.wrapper_sha256,
        user_approved: options.userApproved === true,
        ...(options.expectedProject === undefined ? {} : { expected_project: options.expectedProject }),
      }) as Record<string, unknown>
    }
    if (!existsSync(resolved)) {
      throw new MwiError('NOT_STAGED', `${resolved} is not a staged project.`, 'Pass a workspace .mwt, or stage the workspace project with mw_project_stage.')
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
    const target = project === undefined ? this.singleStage() : this.projectMwt(project)
    const binding = await this.engine.run('check_mwt', { project: target }) as { wrapper_sha256?: string }
    return await this.bridge.run('start_ide', {
      include_trial_method: true,
      path: target,
      wrapper_sha256: binding.wrapper_sha256,
    }) as Record<string, unknown>
  }

  /** @returns The bridge's worksheet result. */
  async worksheet(request: WorksheetRequest): Promise<Record<string, unknown>> {
    const status = await this.status()
    if (status.is_project_open !== true || typeof status.active_project !== 'string') {
      throw new MwiError('NO_PROJECT', 'No project is open in the IDE.', 'Open a staged project first with mw_project_open.')
    }
    const record = this.stagedAt(status.active_project)
    if (record === undefined) {
      throw new MwiError('NOT_ATTACHED', `The open project is not proven: ${status.active_project}.`, 'Open the workspace project with mw_project_open first.')
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

  /** @returns The stage record for a path, when it is staged or directly backed up. */
  stagedAt(path: string): StageRecord | undefined {
    const staged = this.stages.stagedAt(path)
    if (staged !== undefined) return staged
    const backup = findBackup(this.workspace, path)
    return backup === undefined ? undefined : directRecord(backup)
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


  /** Export one POU to a workspace package, or import it into this project. */
  async transferPou(input: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const record = await this.openStagedRecord()
    const helpers = await import(pathToFileURL(join(LEGACY_DIR, 'pou-package.js')).href) as {
      exportPouPackage: (args: Record<string, unknown>, deps: Record<string, unknown>) => Promise<Record<string, unknown>>
      importPouPackage: (args: Record<string, unknown>, receipt: PackageReceipt, deps: Record<string, unknown>) => Promise<Record<string, unknown>>
    }
    const workspace = this.workspace
    const project = record.staged_directory
    const evidenceDirectory = join(workspace, '.motionworks', 'verification')
    mkdirSync(evidenceDirectory, { recursive: true })
    const evidence = join(evidenceDirectory, `pou-package-${randomUUID()}.json`)
    if (input.operation === 'export') {
      const directory = join(workspace, '.motionworks', `pk-${randomUUID().slice(0, 8)}`)
      mkdirSync(directory)
      const deps = {
        status: async () => await this.bridge.run('compile_state'),
        saved: async () => await this.engine.run('structure_snapshot', { project }),
        snapshot: async () => await this.bridge.run('pou_package_snapshot', {}, 120_000),
        manifest: async () => nativePackageManifest(directory, workspace),
        consume: async () => undefined,
        mutate: async (request: Record<string, unknown>) => await this.bridge.run('pou_package_mutate', { ...request, project, package_directory: directory }, 120_000),
      }
      try {
        const exported = await helpers.exportPouPackage({ project, pou: input.pou, baseline_saved: true }, deps) as {
          saved: Record<string, unknown>
          native: Record<string, unknown>
          pou: Record<string, unknown>
          meta: Record<string, unknown>
          manifest: readonly PackageFile[]
          result: Record<string, unknown>
        }
        const token = randomUUID()
        const receipt: PackageReceipt = {
          ...exported, directory, project, workspace, evidence_path: evidence, used: false,
        }
        this.packages.set(token, receipt)
        writeFileSync(evidence, JSON.stringify({ operation: 'export', token, receipt }, null, 2), 'utf8')
        return {
          accepted: true,
          operation: 'export',
          package_token: token,
          package_directory: directory,
          file_count: exported.manifest.length,
          evidence_path: evidence,
        }
      } catch (error) {
        throw new MwiError('EDIT_REFUSED', `${(error as Error).message}; evidence at ${evidence}`, 'Inspect the partial package before another attempt.')
      }
    }
    const token = typeof input.package_token === 'string' ? input.package_token : ''
    const receipt = this.packages.get(token)
    if (receipt === undefined || receipt.workspace !== workspace || receipt.project !== project) {
      throw new MwiError('PACKAGE_TOKEN_UNKNOWN', 'No live export receipt matches this token, workspace and project.', 'Export the POU again; tokens do not survive a plugin reload.')
    }
    if (input.dependencies_reviewed !== true) {
      throw new MwiError('APPROVAL_REQUIRED', 'Importing needs dependencies_reviewed:true.', 'Review the package externals, then retry with the flag.')
    }
    const deps = {
      status: async () => await this.bridge.run('compile_state'),
      saved: async () => await this.engine.run('structure_snapshot', { project }),
      snapshot: async () => await this.bridge.run('pou_package_snapshot', {}, 120_000),
      manifest: async () => nativePackageManifest(receipt.directory, workspace),
      consume: async () => {
        receipt.used = true
        writeFileSync(evidence, JSON.stringify({ operation: 'import', token, phase: 'token_consumed', receipt }, null, 2), 'utf8')
      },
      mutate: async (request: Record<string, unknown>) => await this.bridge.run('pou_package_mutate', { ...request, project, package_directory: receipt.directory }, 120_000),
    }
    try {
      const imported = await helpers.importPouPackage({ project, baseline_saved: true, dependencies_reviewed: true }, receipt, deps)
      writeFileSync(evidence, JSON.stringify({ operation: 'import', token, ...imported }, null, 2), 'utf8')
      return { ...imported, evidence_path: evidence }
    } catch (error) {
      throw new MwiError('EDIT_REFUSED', `${(error as Error).message}; evidence at ${evidence}`, 'Inspect the retained receipt and current project; do not retry a consumed token.')
    }
  }

  /** Insert one FB instance and its ST call into a POU. */
  async insertBlock(input: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const record = await this.openStagedRecord()
    const helpers = await import(pathToFileURL(join(LEGACY_DIR, 'fb-insertion.js')).href) as {
      fbInsertionPlan: (args: Record<string, unknown>, block: Record<string, unknown>, read: Record<string, unknown>) => {
        declaration: Record<string, unknown>
        code: string
        call: string
        warnings: string[]
      }
    }
    const project = record.staged_directory
    const state = await this.bridge.run('compile_state') as { is_modified?: boolean }
    if (state.is_modified !== false) {
      throw new MwiError('EDIT_REFUSED', 'The native project has unsaved changes.', 'Save or reconcile the IDE, then retry.')
    }
    const libraries = await this.bridge.run('library_snapshot') as { libraries?: readonly Record<string, unknown>[] }
    const block = await this.engine.run('block_interface', {
      project,
      native_libraries: libraries.libraries ?? [],
      name: input.block,
      ...(typeof input.library === 'string' ? { library: input.library } : {}),
    }, 120_000) as Record<string, unknown>
    const read = await this.engine.run('read_st', { project, pou: input.pou }, 60_000) as Record<string, unknown>
    const plan = helpers.fbInsertionPlan({ ...input, project, baseline_saved: true }, block, read)
    const variable = await this.editVariable({
      pou: input.pou,
      operation: 'add',
      declaration: plan.declaration,
      ...(typeof input.group === 'string' ? {} : { group: 'Default' }),
    }) as { verification?: { accepted?: boolean; errors?: readonly string[] } }
    if (variable.verification?.accepted !== true) {
      throw new MwiError('EDIT_REFUSED', `The instance declaration did not verify: ${variable.verification?.errors?.join('; ') ?? 'unknown'}.`, 'Inspect the declaration evidence before another attempt.')
    }
    const code = await this.editCode({
      pou: String(input.pou),
      expectedBody: typeof read.body === 'string' ? read.body : '',
      body: plan.code,
    }) as { verification?: { accepted?: boolean; errors?: readonly string[] }; body?: string }
    const accepted = code.verification?.accepted === true
    return {
      verification: { accepted, errors: code.verification?.errors ?? [], warnings: plan.warnings },
      instance: input.instance,
      call: plan.call,
      completed_phases: accepted ? ['instance_declared', 'call_inserted'] : ['instance_declared'],
      body: code.body,
      evidence: { variable, block },
    }
  }

  /** Add, edit or delete one native declaration. */
  async editVariable(input: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const record = await this.openStagedRecord()
    const helpers = await import(pathToFileURL(join(LEGACY_DIR, 'native-variables.js')).href) as {
      nativeVariableChange: (args: Record<string, unknown>, deps: Record<string, unknown>) => Promise<Record<string, unknown>>
    }
    const project = record.staged_directory
    const pou = typeof input.pou === 'string' ? input.pou : undefined
    const evidenceDirectory = join(this.workspace, '.motionworks', 'verification')
    mkdirSync(evidenceDirectory, { recursive: true })
    const evidence = join(evidenceDirectory, `native-variable-${randomUUID()}.json`)
    const args = { ...input, project, baseline_saved: true }
    try {
      const result = await helpers.nativeVariableChange(args, {
        status: async () => await this.bridge.run('compile_state'),
        saved: async () => await this.engine.run(pou === undefined ? 'globals' : 'read_st', { project, ...(pou === undefined ? {} : { pou }) }),
        snapshotSaved: async () => await this.bridge.run('variable_snapshot', { ...(pou === undefined ? {} : { pou }), require_saved: true }),
        mutate: async (request: Record<string, unknown>) => await this.bridge.run('variable_mutate', { ...request, project }, 60_000),
        compare: compareVariables,
        globals: async () => await this.engine.run('globals', { project }),
      })
      writeFileSync(evidence, JSON.stringify({ args, ...result }, null, 2), { encoding: 'utf8', flag: 'wx' })
      return { ...result, evidence_path: evidence }
    } catch (error) {
      throw new MwiError('EDIT_REFUSED', `${(error as Error).message}; evidence at ${evidence}`, 'Read the refusal, correct the request, and retry. Do not repeat an unverified edit.')
    }
  }

  /** Create, copy, rename, delete or assign one POU or task. */
  async editStructure(input: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const record = await this.openStagedRecord()
    const helpers = await import(pathToFileURL(join(LEGACY_DIR, 'native-structure.js')).href) as {
      nativeStructureChange: (scope: string, args: Record<string, unknown>, deps: Record<string, unknown>) => Promise<Record<string, unknown>>
    }
    const project = record.staged_directory
    const scope = input.scope === 'task' ? 'task' : 'pou'
    const args = { ...input, project, baseline_saved: true }
    delete (args as Record<string, unknown>).scope
    const evidenceDirectory = join(this.workspace, '.motionworks', 'verification')
    const inputDirectory = join(this.workspace, '.motionworks', 'native-input')
    mkdirSync(evidenceDirectory, { recursive: true })
    const evidence = join(evidenceDirectory, `native-structure-${randomUUID()}.json`)
    try {
      const result = await helpers.nativeStructureChange(scope, args, {
        status: async () => await this.bridge.run('compile_state'),
        saved: async () => await this.engine.run('structure_snapshot', { project }),
        snapshot: async () => await this.bridge.run('structure_snapshot'),
        mutate: async (request: Record<string, unknown>) => await this.bridge.run('structure_mutate', { ...request, project }, 60_000),
        retainPlan: async (plan: unknown) => {
          writeFileSync(evidence, JSON.stringify({ phase: 'plan_retained', ...(plan as Record<string, unknown>) }, null, 2), { encoding: 'utf8', flag: 'wx' })
        },
        prepareSettings: async (settingsText: string) => {
          mkdirSync(inputDirectory, { recursive: true })
          const path = join(inputDirectory, `${randomUUID()}.SET`)
          writeFileSync(path, settingsText, { encoding: 'ascii', flag: 'wx' })
          return { settings_import_path: path }
        },
      })
      writeFileSync(evidence, JSON.stringify({ phase: 'result', ...result }, null, 2), 'utf8')
      return { ...result, evidence_path: evidence }
    } catch (error) {
      throw new MwiError('EDIT_REFUSED', `${(error as Error).message}; evidence at ${evidence}`, 'Read the refusal, correct the request, and retry. Do not repeat an unverified edit.')
    }
  }

  /** Validate the current saved project. */
  async validate(options: { pou?: string; body?: string }): Promise<Record<string, unknown>> {
    const record = await this.openStagedRecord()
    const workflow = await this.engine.run('workflow_check', { project: record.staged_directory }, 120_000)
    const validate = await this.engine.run('validate', { project: record.staged_directory }, 120_000)
    const review = options.pou === undefined && options.body === undefined
      ? undefined
      : await this.engine.run('check_program', {
        project: record.staged_directory,
        ...(options.pou === undefined ? {} : { pou: options.pou }),
        ...(options.body === undefined ? {} : { body: options.body }),
      }, 180_000)
    const state = await this.bridge.run('compile_state', {}, 30_000).catch(() => null)
    const blockers = (workflow.blockers as readonly unknown[] | undefined) ?? []
    const validation = validate.result as { errors?: readonly unknown[] } | undefined
    return {
      project: record.staged_directory,
      blockers,
      validation_errors: validation?.errors ?? [],
      workflow,
      validate,
      ...(review === undefined ? {} : { review }),
      compile_state: state,
      ready: blockers.length === 0 && (validation?.errors?.length ?? 0) === 0,
    }
  }

  /** Save the open staged project through the IDE. */
  async apply(): Promise<Record<string, unknown>> {
    const record = await this.openStagedRecord()
    const saved = await this.bridge.run('save', {}, 60_000) as Record<string, unknown>
    const state = await this.bridge.run('compile_state', {}, 30_000).catch(() => null)
    return { project: record.staged_directory, saved, compile_state: state }
  }

  /** Replace one ST/IL body through the proven native ChangeCodeWS path. */
  async editCode(input: { pou: string; changes?: readonly Record<string, unknown>[]; body?: string; expectedBody?: string; expectedHash?: string }): Promise<Record<string, unknown>> {
    const record = await this.openStagedRecord()
    const helpers = await import(pathToFileURL(join(LEGACY_DIR, 'native-code.js')).href) as {
      nativeCodeChange: (args: Record<string, unknown>, deps: Record<string, unknown>) => Promise<Record<string, unknown>>
    }
    const project = record.staged_directory
    const evidenceDirectory = join(this.workspace, '.motionworks', 'verification')
    const inputDirectory = join(this.workspace, '.motionworks', 'native-input')
    mkdirSync(evidenceDirectory, { recursive: true })
    const evidence = join(evidenceDirectory, `native-code-${randomUUID()}.json`)
    const args: Record<string, unknown> = { project, pou: input.pou, baseline_saved: true }
    let expectedHash = input.expectedHash
    if (input.changes !== undefined && expectedHash === undefined) {
      // The hash guards the exact find/replace against a stale body. The caller no
      // longer has to carry it: hash the body this edit is about to patch.
      const read = await this.engine.run('read_text', { project, pou: input.pou }) as { body?: unknown; body_error?: unknown }
      if (typeof read.body !== 'string' || read.body.length === 0) {
        throw new MwiError('EDIT_REFUSED', `Cannot read ${input.pou} to hash it: ${String(read.body_error ?? 'empty body')}.`, 'Read the POU with mw_get, then retry the edit.')
      }
      expectedHash = createHash('sha256').update(read.body).digest('hex')
    }
    if (input.changes !== undefined) {
      args.changes = input.changes
      if (expectedHash !== undefined) args.expected_body_sha256 = expectedHash
    } else {
      args.code = input.body
      args.expected_body = input.expectedBody
    }
    try {
      const result = await helpers.nativeCodeChange(args, {
        status: async () => await this.bridge.run('compile_state'),
        saved: async () => await this.engine.run('structure_snapshot', { project }),
        snapshot: async () => await this.bridge.run('structure_snapshot'),
        read: async () => await this.engine.run('read_text', { project, pou: input.pou }),
        document: async () => {
          const code = await this.engine.run('worksheet_target', { project, pou: input.pou, kind: 'code' })
          const variables = await this.engine.run('worksheet_target', { project, pou: input.pou, kind: 'variables' })
          const urn = String(variables.urn ?? '')
          return { ...code, variable_worksheet: urn.split('.').at(-1) }
        },
        declarations: async () => await this.bridge.run('variable_snapshot', { pou: input.pou }),
        prepare: async (text: string, language: string) => {
          mkdirSync(inputDirectory, { recursive: true })
          const path = join(inputDirectory, `${randomUUID()}.${language}`)
          writeFileSync(path, text, { encoding: 'ascii', flag: 'wx' })
          return { code_import_path: path }
        },
        retain: async (plan: unknown) => {
          writeFileSync(evidence, JSON.stringify({ phase: 'plan_retained', ...(plan as Record<string, unknown>) }, null, 2), { encoding: 'utf8', flag: 'wx' })
        },
        mutate: async (request: Record<string, unknown>) => await this.bridge.run('code_mutate', { ...request, project }, 60_000),
      })
      writeFileSync(evidence, JSON.stringify({ phase: 'result', ...result }, null, 2), 'utf8')
      return result
    } catch (error) {
      throw new MwiError(
        'EDIT_REFUSED',
        `${(error as Error).message}; evidence at ${evidence}`,
        'Read the refusal, correct the request, and retry. Do not repeat an unverified edit.',
      )
    }
  }

  /** The open project must be a proven stage or a verified direct backup; every compile and verify depends on it. */
  private async openStagedRecord(): Promise<StageRecord> {
    const active = await this.activeProject()
    if (active === undefined) {
      throw new MwiError('NO_PROJECT', 'No project is open in the IDE.', 'Open a project with mw_project_open before compiling.')
    }
    const record = this.stagedAt(active)
    if (record !== undefined) return record
    // The IDE already has a workspace project open that this bundle did not open.
    // Take the verified backup now rather than refuse: the edit still needs the
    // same rollback evidence, and the guarded edit itself still refuses an
    // unsaved project before it writes.
    if (!isInside(this.workspace, active) || isInside(join(this.workspace, '.motionworks'), active)) {
      throw new MwiError('NOT_ATTACHED', `The open project has no proven backup: ${active}.`, 'Open a workspace project with mw_project_open so a verified backup is taken first.')
    }
    return directRecord(this.attach(active))
  }

  /** The only openable project, staged or backed up, or a refusal that explains the choice. */
  private singleStage(): string {
    const stages: string[] = []
    try {
      for (const name of readdirSync(stageRootOf(this.workspace))) {
        if (name.toLowerCase().endsWith('.mwt')) stages.push(join(stageRootOf(this.workspace), name))
      }
    } catch {
      // No stage directory.
    }
    const attached = listBackups(this.workspace).map(record => record.mwt)
    // Direct editing is the default: a proven backup wins over a stale stage copy.
    const candidates = attached.length > 0 ? attached : stages
    if (candidates.length === 0) {
      throw new MwiError('NO_PROJECT', 'No project is staged or backed up in this workspace.', 'Call mw_project_find, then mw_project_open with the workspace .mwt.')
    }
    if (candidates.length > 1) {
      throw new MwiError('AMBIGUOUS_PROJECT', `${candidates.length} projects are openable.`, 'Pass project: the exact .mwt to start.', candidates)
    }
    return candidates[0] as string
  }

  /** Resolve a requested project, taking a backup for a real workspace project. */
  private projectMwt(project: string): string {
    const resolved = resolve(this.workspace, project)
    const mwt = resolved.toLowerCase().endsWith('.mwt') ? resolved : `${resolved}.mwt`
    if (isInside(stageRootOf(this.workspace), mwt)) {
      if (!existsSync(mwt)) throw new MwiError('NOT_STAGED', `${mwt} is not a staged project.`, 'Stage the workspace project first, or open the workspace .mwt directly.')
      return mwt
    }
    return ensureBackup(this.workspace, mwt).mwt
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
