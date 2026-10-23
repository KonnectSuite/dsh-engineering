/**
 * Workspace and stage paths.
 *
 * MotionWorks work happens on a project inside the calling workspace. The stage
 * is the one writable location: `<workspace>/.motionworks/stage`.
 *
 * @module dsh-engineering-mwi/session/workspace
 */

import { existsSync, readdirSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

/** Directories never scanned for projects. */
const SKIP = new Set(['node_modules', '.git', 'stage', 'backups', '_backups', '__pycache__', 'chm_out', 'help_extract', '.dsh'])

/** One MotionWorks project found in the workspace. */
export interface FoundProject {
  /** Project name: the `.mwt` basename. */
  readonly name: string
  /** Absolute path of the wrapper. */
  readonly mwt: string
  /** Absolute path of the expanded project directory. */
  readonly directory: string
  /** Absolute path of the staged copy, when one exists. */
  readonly staged: string | null
}

/**
 * Resolve the caller's workspace.
 *
 * @param cwd - Working directory from the tool call.
 * @returns The absolute workspace root.
 */
export function workspaceOf(cwd: string | undefined): string {
  return resolve(cwd ?? process.cwd())
}

/**
 * The stage root of one workspace.
 *
 * @param workspace - Absolute workspace root.
 * @returns `<workspace>/.motionworks/stage`.
 */
export function stageRootOf(workspace: string): string {
  return join(workspace, '.motionworks', 'stage')
}

/**
 * Whether a path lies inside a directory.
 *
 * @param parent - Directory that must contain the path.
 * @param child - Path to test.
 * @returns True when `child` equals or lies below `parent`.
 */
export function isInside(parent: string, child: string): boolean {
  const base = resolve(parent).toLowerCase()
  const target = resolve(child).toLowerCase()
  return target === base || target.startsWith(base + sep)
}

/**
 * Find MotionWorks projects under a workspace.
 *
 * @param workspace - Absolute workspace root.
 * @param options - Optional name filter and result cap.
 * @returns Projects in stable path order.
 */
export function findProjects(workspace: string, options: { filter?: string; limit?: number } = {}): FoundProject[] {
  const limit = options.limit ?? 20
  const filter = options.filter?.toLowerCase()
  const stage = stageRootOf(workspace)
  const found: FoundProject[] = []
  const walk = (directory: string, depth: number): void => {
    if (found.length >= limit || depth > 6) return
    let entries
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (found.length >= limit) return
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name) || isInside(stage, absolute)) continue
        walk(absolute, depth + 1)
        continue
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.mwt')) continue
      const name = entry.name.slice(0, -4)
      if (filter !== undefined && !name.toLowerCase().includes(filter) && !absolute.toLowerCase().includes(filter)) continue
      found.push({
        name,
        mwt: absolute,
        directory: absolute.slice(0, -4),
        staged: existsSync(join(stage, `${name}.mwt`)) ? join(stage, `${name}.mwt`) : null,
      })
    }
  }
  walk(workspace, 0)
  return found
}
