/**
 * Staging: copy one workspace project into `.motionworks/stage` and bind its wrapper.
 *
 * The source is never modified. A stage is refused when it already exists unless
 * the caller explicitly replaces it after review; the previous stage is moved to
 * `backups/stage-<id>` rather than discarded.
 *
 * @module dsh-engineering-mwi/session/stage
 */

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, copyFileSync, lstatSync, writeFileSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, join, resolve, sep } from 'node:path'
import { MwiError } from '../core/errors.ts'
import type { CodeEngine } from '../core/code-engine.ts'
import { isInside, stageRootOf } from './workspace.ts'

/** Identity suffix, matching the legacy stage record. */
export const IDENTITY_SUFFIX = '.identity.json'

/** One staged project. */
export interface StageRecord {
  /** Project name (the `.mwt` basename). */
  readonly name: string
  /** Original workspace `.mwt`. */
  readonly source: string
  /** Original expanded project directory. */
  readonly source_directory: string
  /** Workspace that owns the stage. */
  readonly workspace: string
  /** Staged `.mwt`. */
  readonly staged_mwt: string
  /** Staged expanded directory. */
  readonly staged_directory: string
  /** Directory the wrapper was bound to. */
  readonly bound_to: string
  /** The wrapper's previous embedded directory, when it named one. */
  readonly previous_embedded_path: string | null
  /** When the stage was written. */
  readonly staged_at: string
}

/** Options for one staging request. */
export interface StageOptions {
  /** Replace an existing stage after review; the previous stage is retained. */
  readonly replace?: boolean
  /** Refuse when the current IDE project is inside the target stage. */
  readonly assertClosed?: () => Promise<void>
}

/** Count and copy one directory tree, refusing links. */
function copyTree(from: string, to: string, count: { files: number }): void {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name)
    const destination = join(to, entry.name)
    if (entry.isSymbolicLink()) throw new MwiError('LINKED_PROJECT', `The project contains a link: ${source}.`, 'Stage a project whose files are all local; links are refused.')
    if (entry.isDirectory()) {
      copyTree(source, destination, count)
      continue
    }
    copyFileSync(source, destination)
    count.files += 1
  }
}

/** Copy one file and count it. */
function copyFile(from: string, to: string, count: { files: number }): void {
  copyFileSync(from, to)
  count.files += 1
}

/** The service that stages projects for one workspace. */
export class StageService {
  /**
   * @param engine - Code engine that binds the wrapper.
   * @param workspace - Absolute workspace root.
   */
  constructor(
    private readonly engine: CodeEngine,
    private readonly workspace: string,
  ) {}

  /** The stage root of this workspace. */
  get stageRoot(): string {
    return stageRootOf(this.workspace)
  }

  /**
   * Stage one project.
   *
   * @param sourceArg - `.mwt` or project directory inside the workspace.
   * @param options - Replacement and closed-project checks.
   * @returns The written stage record.
   */
  async stage(sourceArg: string, options: StageOptions = {}): Promise<StageRecord> {
    const asked = resolve(this.workspace, sourceArg)
    if (!isInside(this.workspace, asked)) {
      throw new MwiError(
        'OUTSIDE_WORKSPACE',
        `${asked} is outside the workspace ${this.workspace}.`,
        'Call mw_project_find and stage a project from the workspace; outside projects are never opened.',
      )
    }
    const isMwt = asked.toLowerCase().endsWith('.mwt')
    const mwt = isMwt ? asked : `${asked}.mwt`
    const directory = isMwt ? asked.slice(0, -4) : asked
    if (!existsSync(mwt)) throw new MwiError('PROJECT_NOT_FOUND', `No .mwt exists at ${mwt}.`, 'Pass the project folder or its .mwt, both inside the workspace.')
    if (!existsSync(directory) || !statSync(directory).isDirectory()) {
      throw new MwiError('PROJECT_INCOMPLETE', `${mwt} has no expanded project directory beside it.`, 'Stage a complete project: the .mwt and its sibling folder.')
    }
    if (isInside(this.stageRoot, mwt) || isInside(this.stageRoot, directory)) {
      throw new MwiError('ALREADY_STAGED', `${mwt} is already inside the stage.`, 'Stage the original workspace project, not an existing staged copy.')
    }
    const name = basename(mwt, '.mwt')
    const targetMwt = join(this.stageRoot, `${name}.mwt`)
    const targetDir = join(this.stageRoot, name)
    const identity = join(this.stageRoot, `${name}${IDENTITY_SUFFIX}`)
    const previous = [targetMwt, targetDir, identity].filter(path => existsSync(path))
    if (previous.length > 0 && options.replace !== true) {
      throw new MwiError(
        'STAGE_EXISTS',
        `A staged copy named ${name} already exists.`,
        'Continue the existing stage, or pass replace_existing:true after reviewing it; the previous stage is retained under backups/.',
      )
    }
    if (existsSync(targetDir)) {
      for (const entry of readdirSync(targetDir)) {
        if (lstatSync(join(targetDir, entry)).isSymbolicLink()) {
          throw new MwiError('LINKED_STAGE', 'The existing stage contains a link.', 'Remove the stage only after review; links are refused.')
        }
      }
    }
    await options.assertClosed?.()
    mkdirSync(this.stageRoot, { recursive: true })
    const pending = join(this.stageRoot, `.pending-${randomUUID()}`)
    mkdirSync(pending)
    const count = { files: 0 }
    let backup: string | null = null
    try {
      const incomingMwt = join(pending, `${name}.mwt`)
      const incomingDir = join(pending, name)
      copyFile(mwt, incomingMwt, count)
      copyTree(directory, incomingDir, count)
      const bound = await this.engine.run('bind_mwt', { mwt: incomingMwt, directory: targetDir }) as {
        bound_to?: string
        paths?: readonly { from?: string }[]
      }
      const record: StageRecord = {
        name,
        source: mwt,
        source_directory: directory,
        workspace: this.workspace,
        staged_mwt: targetMwt,
        staged_directory: targetDir,
        bound_to: bound.bound_to ?? targetDir,
        previous_embedded_path: bound.paths?.[0]?.from ?? null,
        staged_at: new Date().toISOString(),
      }
      if (previous.length > 0) {
        backup = join(this.stageRoot, 'backups', `stage-${randomUUID()}`)
        mkdirSync(backup, { recursive: true })
        for (const path of previous) renameSync(path, join(backup, basename(path)))
      }
      renameSync(incomingMwt, targetMwt)
      renameSync(incomingDir, targetDir)
      writeFileSync(identity, JSON.stringify(record, null, 2))
      rmSync(pending, { recursive: true, force: true })
      return record
    } catch (error) {
      rmSync(pending, { recursive: true, force: true })
      const message = error instanceof Error ? error.message : String(error)
      throw new MwiError('STAGE_FAILED', message, backup === null
        ? 'Nothing was written to the stage. Correct the project and retry.'
        : `The previous stage is retained at ${backup}; inspect it before retrying.`)
    }
  }

  /**
   * Read one identity record.
   *
   * @param name - Project name.
   * @returns The record, or undefined when the name was not staged.
   */
  identityOf(name: string): StageRecord | undefined {
    try {
      return JSON.parse(readFileSync(join(this.stageRoot, `${name}${IDENTITY_SUFFIX}`), 'utf8')) as StageRecord
    } catch {
      return undefined
    }
  }

  /**
   * The staged project whose `.mwt` or directory is `path`.
   *
   * @param path - Active or requested project path.
   * @returns Its identity record, or undefined.
   */
  stagedAt(path: string): StageRecord | undefined {
    const target = resolve(path).toLowerCase().replace(/\.mwt$/u, '')
    let names: string[] = []
    try {
      names = readdirSync(this.stageRoot).filter(name => name.endsWith(IDENTITY_SUFFIX))
    } catch {
      return undefined
    }
    for (const file of names) {
      const record = this.identityOf(file.slice(0, -IDENTITY_SUFFIX.length))
      if (record === undefined) continue
      if (resolve(record.staged_directory).toLowerCase() === target) return record
    }
    return undefined
  }

  /**
   * Refuse when the active IDE project is this stage.
   *
   * @param targetDir - Stage directory about to be replaced.
   * @param status - Bridge status document.
   */
  static assertClosed(targetDir: string, status: { is_project_open?: boolean; active_project?: string }): void {
    if (status.is_project_open !== true || typeof status.active_project !== 'string') return
    const active = resolve(status.active_project).toLowerCase().replace(/\.mwt$/u, '')
    if (active === resolve(targetDir).toLowerCase() || active.startsWith(resolve(targetDir).toLowerCase() + sep)) {
      throw new MwiError('STAGE_OPEN', `The staged project is open in the IDE: ${status.active_project}.`, 'Save or close the open project with consent before replacing its stage.')
    }
  }
}
