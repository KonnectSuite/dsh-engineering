/**
 * Resolve the project a read applies to.
 *
 * A read never stages or opens anything: it uses an explicit project inside the
 * workspace, or the single staged project when no project is named.
 *
 * @module dsh-engineering-mwi/session/project
 */

import { existsSync, readdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { MwiError } from '../core/errors.ts'
import { isInside, stageRootOf } from './workspace.ts'

/** One project a read can address. */
export interface ProjectRef {
  /** Project name. */
  readonly name: string
  /** Expanded project directory. */
  readonly directory: string
  /** The `.mwt` wrapper. */
  readonly mwt: string
  /** Whether the project is a staged copy. */
  readonly staged: boolean
}

/**
 * Resolve one project path.
 *
 * @param workspace - Absolute workspace root.
 * @param requested - Project directory `.mwt` or name, relative to the workspace.
 * @returns The resolved project.
 */
export function resolveProject(workspace: string, requested: string): ProjectRef {
  const asked = resolve(workspace, requested)
  const isMwt = asked.toLowerCase().endsWith('.mwt')
  const mwt = isMwt ? asked : `${asked}.mwt`
  const directory = isMwt ? asked.slice(0, -4) : asked
  if (!isInside(workspace, directory)) {
    throw new MwiError('OUTSIDE_WORKSPACE', `${directory} is outside the workspace ${workspace}.`, 'Read a project inside the workspace.')
  }
  if (!existsSync(directory) || !existsSync(mwt)) {
    throw new MwiError('PROJECT_NOT_FOUND', `No project exists at ${directory}.`, 'Call mw_project_find for the workspace projects.')
  }
  return { name: basename(directory), directory, mwt, staged: isInside(stageRootOf(workspace), directory) }
}

/**
 * Resolve the project a call means when it names none.
 *
 * @param workspace - Absolute workspace root.
 * @returns The single staged project.
 */
export function defaultProject(workspace: string): ProjectRef {
  let names: string[] = []
  try {
    names = readdirSync(stageRootOf(workspace)).filter(name => name.toLowerCase().endsWith('.mwt'))
  } catch {
    names = []
  }
  if (names.length === 0) {
    throw new MwiError('NO_PROJECT', 'No project is staged in this workspace.', 'Call mw_project_find, then mw_project_stage, or pass project explicitly.')
  }
  if (names.length > 1) {
    throw new MwiError('AMBIGUOUS_PROJECT', `${names.length} projects are staged.`, 'Pass project: the project directory or .mwt.', names.map(name => name.replace(/\.mwt$/iu, '')))
  }
  return resolveProject(workspace, join(stageRootOf(workspace), names[0] as string))
}
