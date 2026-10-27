/**
 * Workspace and stage paths.
 *
 * MotionWorks work happens on a project inside the calling workspace. The stage
 * is the one writable location: `<workspace>/.motionworks/stage`.
 *
 * @module dsh-engineering-mwi/session/workspace
 */

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

/** Directories never scanned for projects. */
const SKIP = new Set(['node_modules', '.git', 'stage', 'backups', '_backups', '__pycache__', 'chm_out', 'help_extract', '.dsh'])

/** Workspace root set from the row's config, when one is configured. */
let configured: string | undefined

/**
 * Set the workspace root from the product row's config.
 *
 * The host does not always pass the session cwd to tool calls (it is undefined
 * in the current desktop build), so the row carries the workspace explicitly.
 * An empty string clears it and falls back to the marker / process directory.
 *
 * @param root - Absolute workspace root, or an empty string.
 */
export function configureWorkspace(root: string | undefined): void {
  const value = typeof root === 'string' ? root.trim() : ''
  configured = value === '' ? undefined : resolve(value)
}

/** Read the documented `mwi.workspace` marker from the profile directory. */
function recordedWorkspace(): string | undefined {
  try {
    const marker = join(process.env.DSH_PROFILE_DIR ?? '', 'mwi.workspace')
    if (!existsSync(marker)) return undefined
    const recorded = readFileSync(marker, 'utf8').replace(/^\uFEFF/u, '').trim()
    return recorded === '' ? undefined : resolve(recorded)
  } catch {
    return undefined
  }
}

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
  if (typeof cwd === 'string' && cwd.trim() !== '') return resolve(cwd)
  return configured ?? recordedWorkspace() ?? resolve(process.cwd())
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
  const seen = new Set<string>()
  const walk = (directory: string, depth: number): void => {
    if (found.length >= limit || depth > 6) return
    let real: string
    try {
      real = realpathSync(directory)
    } catch {
      return
    }
    if (seen.has(real)) return
    seen.add(real)
    let entries
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (found.length >= limit) return
      const absolute = join(directory, entry.name)
      let isDirectory = entry.isDirectory()
      if (!isDirectory && entry.isSymbolicLink()) {
        try {
          isDirectory = statSync(absolute).isDirectory()
        } catch {
          isDirectory = false
        }
      }
      if (isDirectory) {
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
