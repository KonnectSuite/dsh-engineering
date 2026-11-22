/**
 * The FactoryTalk View knowledge surface.
 *
 * One read-only tool, `ftview_docs`, serves three collections:
 *
 * - `ftview-me` — our own FactoryTalk View ME operator knowledge (workflows,
 *   the export/import handoff, tags, errors and the limits of an XML export);
 * - `ftview-me-help` — a structural index of the installed FactoryTalk View ME
 *   Help (topic ids, titles, TOC sections and relative help paths);
 * - `ftview-se-help` — the same structural index for the installed FactoryTalk
 *   View SE Help.
 *
 * The authored pages ship with the package. The installed-help collections ship
 * only their indexes: a `read` against them opens the locally installed OEM Help
 * at call time, and when the Help is absent the tool reports SOURCE_NOT_INSTALLED
 * with the roots it searched instead of inventing page text.
 *
 * @module dsh-engineering-ftview/docs
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ToolDefinition } from './core.ts'
import {
  createDocsTool,
  type DocsCollectionSpec,
  type DocsToolDefinition,
  type InstalledPageRequest,
  type InstalledRootRequest,
  type InstalledRootResult,
} from './knowledge/core.js'

/** The collections this tool serves, in the order answers list them. */
const COLLECTIONS: readonly DocsCollectionSpec[] = [
  { id: 'ftview-me' },
  { id: 'ftview-me-help' },
  { id: 'ftview-se-help' },
]

/** The installed-help collection ids and the help family each one maps to. */
const HELP_COLLECTIONS: Readonly<Record<string, 'me' | 'se'>> = {
  'ftview-me-help': 'me',
  'ftview-se-help': 'se',
}

/** The files that must exist for a directory to be treated as an installed Help root. */
const HELP_MARKERS: readonly string[] = [
  'sitemap.xml',
  'index.xml',
  'context-help-map.xml',
  join('oxygen-webhelp', 'app', 'search', 'index', 'htmlFileInfoList.js'),
]

/** Overrides used by tests and by a deployment that keeps the Help elsewhere. */
export interface FtviewDocsOptions {
  /** The package knowledge directory. Defaults to `knowledge/` beside this module. */
  readonly knowledgeRoot?: string
  /**
   * Installed-help roots per family. A string is used as-is (and must carry the
   * Help markers); `null` declares the install absent. Omitted entries fall back
   * to discovery under the standard Rockwell Help directories.
   */
  readonly helpRoots?: { readonly me?: string | null; readonly se?: string | null }
}

/**
 * The directory the committed corpora live in.
 *
 * From the built `lib/docs.js` this is `packages/ftview/knowledge`; from the
 * TypeScript source it is the same directory beside `src/`.
 */
function knowledgeDirectory(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'knowledge')
}

/** Candidate install roots for one Help family, in a stable search order. */
function defaultHelpRoots(family: 'me' | 'se'): string[] {
  const product = family === 'me' ? 'FTViewME' : 'FTViewSE'
  const bases = [
    process.env['ProgramFiles(x86)'],
    process.env.ProgramFiles,
    process.env.ProgramData,
    process.env.LOCALAPPDATA,
  ]
  const roots: string[] = []
  for (const base of bases) {
    if (typeof base !== 'string' || base === '') continue
    const candidate = join(base, 'Common Files', 'Rockwell', 'Help', product, 'Help')
    if (!roots.includes(candidate)) roots.push(candidate)
  }
  return roots
}

/** True when a directory carries the WebHelp files this tool reads pages from. */
function isHelpRoot(root: string): boolean {
  try {
    if (!statSync(root).isDirectory()) return false
  } catch {
    return false
  }
  return HELP_MARKERS.every((marker) => existsSync(join(root, marker)))
}

/** The revision strings a committed installed-help index records. */
function indexRevisions(directory: string): string[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(directory, 'index.json'), 'utf8'))
    if (parsed === null || typeof parsed !== 'object') return []
    const revisions = (parsed as { revisions?: unknown }).revisions
    if (!Array.isArray(revisions)) return []
    return revisions.filter((revision): revision is string => typeof revision === 'string' && revision.length > 0)
  } catch {
    return []
  }
}

/**
 * Create the `ftview_docs` tool.
 *
 * Exported separately from {@link docsTools} so a test can point the tool at a
 * knowledge directory or declare the OEM Help absent without touching the host.
 *
 * @param options - Knowledge directory and installed-help root overrides.
 * @returns The tool definition the package's registry accepts.
 */
export function createFtviewDocsTool(options: FtviewDocsOptions = {}): DocsToolDefinition {
  const knowledgeRoot = options.knowledgeRoot ?? knowledgeDirectory()
  const helpRoots = options.helpRoots ?? {}

  const resolveInstalledRoot = (request: InstalledRootRequest): InstalledRootResult => {
    const family = HELP_COLLECTIONS[request.collection]
    if (family === undefined) return { root: null, searched: [] }
    const override = helpRoots[family]
    const candidates = override === undefined ? defaultHelpRoots(family) : override === null ? [] : [override]
    const searched: string[] = []
    for (const candidate of candidates) {
      searched.push(candidate)
      if (isHelpRoot(candidate)) return { root: candidate, searched }
    }
    return { root: null, searched }
  }

  const readInstalledPage = (request: InstalledPageRequest): string | null => {
    const root = resolve(request.root)
    const absolute = resolve(root, request.path)
    if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
      throw new Error(`help page path escapes the resolved help root: ${request.path}`)
    }
    try {
      return readFileSync(absolute, 'utf8')
    } catch (error) {
      const code = (error as { code?: unknown }).code
      if (code === 'ENOENT') return null
      throw error
    }
  }

  const currentRevision = (): string | null => {
    const revisions: string[] = []
    for (const collection of COLLECTIONS) {
      for (const revision of indexRevisions(join(knowledgeRoot, collection.root ?? collection.id))) {
        if (!revisions.includes(revision)) revisions.push(revision)
      }
    }
    // One installed help version on this host answers for both families. When
    // the committed indexes disagree the adapter must not pick one silently.
    return revisions.length === 1 ? revisions[0] : null
  }

  return createDocsTool({
    name: 'ftview_docs',
    description:
      'Search and read the FactoryTalk View knowledge shipped with this bundle: operator guidance for ' +
      'FactoryTalk View ME (project and display workflow, global objects, tags, the display XML ' +
      'export/import handoff, runtime files and transfer, error codes and fixes, and what an XML export ' +
      'cannot prove), plus a structural index of the installed FactoryTalk View ME and SE Help (topic ' +
      'titles, TOC sections and relative help paths). Read-only: five actions — contents lists the ' +
      'collections or one collection\'s sections; search ranks topics for a query; read returns one ' +
      'page (installed-help pages are read from the local Help install and report SOURCE_NOT_INSTALLED ' +
      'when it is absent); status reports each collection\'s posture and the installed root it found; ' +
      'lookup matches an exact identifier such as a help topic id or a term from the authored pages. ' +
      'Authored pages are our own words; installed Help page text is never stored in this bundle.',
    knowledgeRoot,
    collections: COLLECTIONS,
    installedResolver: resolveInstalledRoot,
    readInstalledPage,
    currentRevision,
  })
}

/**
 * Register the FactoryTalk View knowledge tool.
 *
 * @param _context - The plugin context; the tool needs no host services.
 * @returns Exactly one tool definition, `ftview_docs`.
 */
export function docsTools(_context?: unknown): ToolDefinition[] {
  return [createFtviewDocsTool()]
}
