/**
 * The documentation tool for offline L5X work.
 *
 * One tool, `l5x_docs`, exposes the five contract actions over two sources:
 *
 * - the authored collections this package writes in its own words and ships
 *   (instruction families, revision deltas, offline edit/compare/verify
 *   workflows, error codes and fixes, ladder and rung idioms), and
 * - structural indexes of the Studio 5000 Logix Designer help installed on the
 *   host. Those indexes carry identifiers, titles, sections and relative help
 *   paths only; a page is read from the local installation at call time and is
 *   never copied into this repository.
 *
 * The adapter owns the revision guard. A read of an authored instruction page
 * (`instruction-<mnemonic>`) that names a revision is checked against the
 * committed `knowledge/instruction-versions.json`. A page documented outside
 * that revision is refused with `INSTRUCTION_NOT_IN_REVISION`. When the guard
 * artifact is missing or unreadable the adapter warns once and serves the page
 * anyway: a revision guard must never block a valid offline edit.
 *
 * @module dsh-engineering-l5x/docs
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDocsTool, type DocsToolConfig, type DocsToolDefinition, type InstalledPageRequest } from './knowledge/core.js'
import type { ToolDefinition } from './core/tool.ts'

/** Name the documentation tool registers under. */
export const L5X_DOCS_TOOL_NAME = 'l5x_docs'

/**
 * Description shown to the caller.
 *
 * Deliberately states the two sources and the failure posture: the authored
 * corpus always answers, while the installed-help collections answer only when
 * the Studio 5000 help for the requested revision is installed on this host.
 */
export const L5X_DOCS_DESCRIPTION =
  'Search the L5X knowledge this product ships offline: authored instruction-family, revision-delta, offline-workflow, error and ladder-idiom pages, plus structural indexes of the Studio 5000 Logix Designer help installed on this host. l5x_docs has five actions: contents lists the collections and a collection section table of contents; search ranks pages for a query and always returns hits with a total; read returns one page as readable text; status reports which collections are readable on this host and which installed help root was found; lookup resolves an exact instruction mnemonic, identifier or alias. Installed-help pages are read from the local Studio 5000 help at call time and are not shipped; a page from a revision other than the requested one is refused with INSTRUCTION_NOT_IN_REVISION, while a missing revision index only warns and never blocks an offline edit. Answers are JSON envelopes with a stable code, message and fix on failure.'

/** One authored collection this adapter registers, in contents order. */
export const AUTHORED_COLLECTIONS = [
  'l5x-instruction-families',
  'l5x-revision-deltas',
  'l5x-offline-workflows',
  'l5x-errors',
  'l5x-ladder-idioms',
] as const

/** One installed-help collection and where its help tree lives on Windows. */
export interface HelpCollectionInstall {
  /** Collection id committed under `knowledge/`. */
  readonly collection: string
  /** Help revision the collection indexes. */
  readonly revision: string
  /** Major version in the install path (`...\ENU\v37\Bin\Help...`). */
  readonly major: number
  /** Environment override naming the help root instead of the default path. */
  readonly env: string
}

/** The installed-help collections this adapter can locate. */
export const HELP_INSTALLS: readonly HelpCollectionInstall[] = [
  { collection: 'l5x-help-37-05', revision: '37.05.00', major: 37, env: 'L5X_HELP_ROOT_V37_05' },
  { collection: 'l5x-help-36-00', revision: '36.00.00', major: 36, env: 'L5X_HELP_ROOT_V36_00' },
]

/** Where the compiled adapter finds the committed corpus. */
export const DEFAULT_KNOWLEDGE_ROOT = fileURLToPath(new URL('../knowledge/', import.meta.url))

/** A warning sink; the composition's plugin logger provides one. */
export interface DocsLogger {
  warn(message: string): void
}

/** The context the composition may pass to {@link docsTools}. */
export interface L5xDocsContext {
  /** Knowledge directory override; tests use it. Defaults to the package `knowledge/`. */
  readonly knowledgeRoot?: string | URL
  /** Warning sink for the revision guard and unreadable collections. */
  readonly logger?: DocsLogger
  /** Revision of the project this chat has open, when one is open. */
  readonly currentRevision?: () => string | null | Promise<string | null>
}

/** One instruction mnemonic in the committed revision map. */
export interface InstructionVersionEntry {
  /** Canonical (uppercase) mnemonic. */
  readonly mnemonic: string
  /** Instruction family name from the installed help. */
  readonly family: string
  /** Help revisions that document the mnemonic, oldest first. */
  readonly revisions: readonly string[]
}

/** The committed `knowledge/instruction-versions.json` document. */
export interface InstructionVersions {
  /** Document schema version; only 1 is accepted. */
  readonly schema: 1
  /** How the map was produced. */
  readonly provenance: Readonly<Record<string, unknown>>
  /** One entry per mnemonic, sorted by mnemonic. */
  readonly instructions: readonly InstructionVersionEntry[]
}

/** The outcome of checking one mnemonic against one requested revision. */
export interface RevisionCheck {
  /** False when the check could not run; the page is then served unblocked. */
  readonly verified: boolean
  /** Stable code, or null when the revision matches. */
  readonly code: 'REVISION_UNVERIFIED' | 'INSTRUCTION_NOT_IN_REVISION' | null
  /** What the check found, in one sentence. */
  readonly message: string
  /** How to repair or proceed. */
  readonly fix: string
  /** Revisions the committed map records for the mnemonic. */
  readonly revisions: readonly string[]
}

/** The page-id form the revision guard understands. */
const INSTRUCTION_PAGE_ID = /^instruction-([a-z0-9_]+)$/u

interface InstructionVersionState {
  readonly versions: InstructionVersions | null
  readonly warning: string | null
}

const instructionVersionCache = new Map<string, InstructionVersionState>()

/**
 * Register the L5X documentation tool.
 *
 * @param context - Optional knowledge root, logger and open-project revision.
 * @returns Exactly one tool, named {@link L5X_DOCS_TOOL_NAME}.
 */
export function docsTools(context: unknown = {}): readonly ToolDefinition[] {
  const options = docsContext(context)
  const knowledgeRoot = knowledgeRootOf(options)
  const logger = options.logger
  const config: DocsToolConfig = {
    name: L5X_DOCS_TOOL_NAME,
    description: L5X_DOCS_DESCRIPTION,
    knowledgeRoot,
    collections: [
      ...AUTHORED_COLLECTIONS.map((id) => ({ id })),
      ...HELP_INSTALLS.map((install) => ({ id: install.collection })),
    ],
    installedResolver: (request) => resolveInstalledHelp(request.collection),
    readInstalledPage: readInstalledHelpPage,
    ...(options.currentRevision === undefined ? {} : { currentRevision: options.currentRevision }),
    ...(logger === undefined ? {} : { logger }),
  }
  const coreTool: DocsToolDefinition = createDocsTool(config)
  const guarded: ToolDefinition = {
    name: coreTool.name,
    description: coreTool.description,
    parameters: coreTool.parameters,
    output: coreTool.output,
    async execute(args, exec) {
      const value = await coreTool.execute(args, exec)
      return guardReadRevision(value, args, knowledgeRoot, logger)
    },
  }
  return [guarded]
}

/**
 * Load the committed instruction revision map.
 *
 * @param knowledgeRoot - Directory holding `instruction-versions.json`.
 * @param logger - Warning sink used once per unreadable artifact.
 * @returns The parsed map, or null when the artifact is missing or malformed.
 */
export function loadInstructionVersions(knowledgeRoot: string, logger?: DocsLogger): InstructionVersions | null {
  return instructionVersionState(knowledgeRoot, logger).versions
}

/**
 * Check whether the installed help documents a mnemonic at a revision.
 *
 * This is the adapter's explicit revision-check entry point. It is also what
 * the wrapper applies to `read` calls that name a revision.
 *
 * @param mnemonic - Instruction mnemonic, any case.
 * @param revision - Revision the caller asked for, for example `37.05.00`.
 * @param versions - Parsed revision map, or null when the artifact is unavailable.
 * @returns The check outcome. `verified: false` means the caller must not block.
 */
export function checkInstructionRevision(mnemonic: string, revision: string, versions: InstructionVersions | null): RevisionCheck {
  const wanted = revision.trim()
  const wantedMnemonic = mnemonic.trim().toUpperCase()
  if (wantedMnemonic === '') {
    return {
      verified: false,
      code: 'REVISION_UNVERIFIED',
      message: 'The revision check needs an instruction mnemonic.',
      fix: 'Pass the instruction page id (instruction-<mnemonic>) or call lookup to find the mnemonic first.',
      revisions: [],
    }
  }
  if (wanted === '') {
    return {
      verified: false,
      code: 'REVISION_UNVERIFIED',
      message: 'The revision check needs a requested revision.',
      fix: 'Pass the project revision, for example 37.05.00, or read the page without a revision for the plain text.',
      revisions: [],
    }
  }
  if (versions === null) {
    return {
      verified: false,
      code: 'REVISION_UNVERIFIED',
      message: `The committed revision map is unavailable, so the check for instruction ${wantedMnemonic} could not run.`,
      fix: 'Regenerate the committed corpus so knowledge/instruction-versions.json exists, then retry; the page is served without a revision check meanwhile.',
      revisions: [],
    }
  }
  const recorded = versions.instructions.find((entry) => entry.mnemonic === wantedMnemonic)
  if (recorded === undefined) {
    return {
      verified: false,
      code: 'REVISION_UNVERIFIED',
      message: `The committed revision map records no instruction ${wantedMnemonic}, so the revision check could not run.`,
      fix: `Check the mnemonic with lookup; if ${wantedMnemonic} is a project add-on instruction it has no help revision and the page is served without a revision check.`,
      revisions: [],
    }
  }
  if (recorded.revisions.includes(wanted)) {
    return {
      verified: true,
      code: null,
      message: `Instruction ${wantedMnemonic} is documented in revision ${wanted}.`,
      fix: '',
      revisions: recorded.revisions,
    }
  }
  return {
    verified: true,
    code: 'INSTRUCTION_NOT_IN_REVISION',
    message: `Instruction ${wantedMnemonic} is documented for revision ${recorded.revisions.join(', ')}, but this call asked for "${wanted}".`,
    fix: `Read the page without a revision for the plain text, request one of the recorded revisions (${recorded.revisions.join(', ')}), or confirm the project was exported by a Studio 5000 Logix Designer release that documents this instruction.`,
    revisions: recorded.revisions,
  }
}

/**
 * Parse the committed instruction revision map.
 *
 * @param text - Raw `instruction-versions.json` contents.
 * @returns The validated document.
 * @throws Error when the document is malformed; the caller warns and fails open.
 */
export function parseInstructionVersions(text: string): InstructionVersions {
  const document: unknown = JSON.parse(text)
  if (!isRecord(document)) throw new Error('the file is not a JSON object')
  if (document.schema !== 1) throw new Error('the file does not declare schema 1')
  if (!Array.isArray(document.instructions)) throw new Error('the file has no instructions array')
  const seen = new Set<string>()
  const instructions: InstructionVersionEntry[] = []
  for (const raw of document.instructions) {
    if (!isRecord(raw)) throw new Error('an instruction entry is not an object')
    if (typeof raw.mnemonic !== 'string' || raw.mnemonic.trim() === '') throw new Error('an instruction entry has no mnemonic')
    const mnemonic = raw.mnemonic.trim().toUpperCase()
    if (seen.has(mnemonic)) throw new Error(`instruction ${mnemonic} is listed twice`)
    if (typeof raw.family !== 'string' || raw.family.trim() === '') throw new Error(`instruction ${mnemonic} has no family`)
    if (!Array.isArray(raw.revisions) || raw.revisions.length === 0) throw new Error(`instruction ${mnemonic} has no revisions`)
    const revisions = raw.revisions.map((revision) => {
      if (typeof revision !== 'string' || revision.trim() === '') throw new Error(`instruction ${mnemonic} has a malformed revision`)
      return revision.trim()
    })
    seen.add(mnemonic)
    instructions.push({ mnemonic, family: raw.family.trim(), revisions })
  }
  return { schema: 1, provenance: isRecord(document.provenance) ? document.provenance : {}, instructions }
}

function docsOption<T>(candidate: object, key: string): T | undefined {
  // A plugin context is a proxy that refuses reads of undeclared services
  // ("cannot get property X without inject"). The docs options are optional
  // overrides, not required services: an unavailable field means "use the
  // default", so a refused read must not take the whole L5X surface down.
  try {
    return (candidate as Record<string, unknown>)[key] as T | undefined
  } catch {
    return undefined
  }
}

function docsContext(context: unknown): L5xDocsContext {
  if (!isRecord(context)) return {}
  const candidate = context as object
  const knowledgeRoot = docsOption<L5xDocsContext['knowledgeRoot']>(candidate, 'knowledgeRoot')
  const logger = docsOption<L5xDocsContext['logger']>(candidate, 'logger')
  const currentRevision = docsOption<L5xDocsContext['currentRevision']>(candidate, 'currentRevision')
  return {
    ...(knowledgeRoot === undefined ? {} : { knowledgeRoot }),
    ...(logger === undefined ? {} : { logger }),
    ...(currentRevision === undefined ? {} : { currentRevision }),
  }
}

function knowledgeRootOf(context: L5xDocsContext): string {
  const configured = context.knowledgeRoot
  if (configured === undefined) return DEFAULT_KNOWLEDGE_ROOT
  return configured instanceof URL ? fileURLToPath(configured) : configured
}

function resolveInstalledHelp(collection: string): { root: string | null; searched: readonly string[] } {
  const install = HELP_INSTALLS.find((entry) => entry.collection === collection)
  if (install === undefined) return { root: null, searched: [] }
  const searched = helpRootCandidates(install)
  for (const candidate of searched) {
    if (isDirectory(candidate)) return { root: candidate, searched }
  }
  return { root: null, searched }
}

function helpRootCandidates(install: HelpCollectionInstall): string[] {
  const override = process.env[install.env]
  if (override !== undefined && override.trim() !== '') return [resolve(override.trim())]
  const candidates: string[] = []
  for (const base of [process.env['ProgramFiles(x86)'], process.env.ProgramFiles]) {
    if (base === undefined || base.trim() === '') continue
    candidates.push(join(base, 'Rockwell Software', 'Studio 5000', 'Logix Designer', 'ENU', `v${install.major}`, 'Bin', 'Help', 'ENU', 'rs5000'))
  }
  return candidates
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function readInstalledHelpPage(request: InstalledPageRequest): string | null {
  try {
    const file = join(request.root, request.path)
    if (!existsSync(file)) return null
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function instructionVersionState(knowledgeRoot: string, logger?: DocsLogger): InstructionVersionState {
  const cached = instructionVersionCache.get(knowledgeRoot)
  if (cached !== undefined) return cached
  const file = join(knowledgeRoot, 'instruction-versions.json')
  let state: InstructionVersionState
  try {
    state = { versions: parseInstructionVersions(readFileSync(file, 'utf8')), warning: null }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    state = {
      versions: null,
      warning: `The instruction revision guard cannot read the committed instruction-versions.json (${detail}). Instruction pages are served without a revision check, so an offline edit is never blocked. Run: node scripts/gen-l5x-knowledge.mjs --check`,
    }
  }
  instructionVersionCache.set(knowledgeRoot, state)
  if (state.warning !== null) logger?.warn(state.warning)
  return state
}

function guardReadRevision(value: unknown, args: Readonly<Record<string, unknown>>, knowledgeRoot: string, logger?: DocsLogger): unknown {
  if (!isRecord(value)) return value
  if (value.ok !== true || value.action !== 'read') return value
  const revision = requestedRevision(args)
  if (revision === null) return value
  const id = typeof value.id === 'string' ? value.id : ''
  const match = INSTRUCTION_PAGE_ID.exec(id)
  if (match === null) return value
  const versions = instructionVersionState(knowledgeRoot, logger).versions
  const check = checkInstructionRevision(match[1] ?? '', revision, versions)
  if (check.code !== 'INSTRUCTION_NOT_IN_REVISION') return value
  return {
    ok: false,
    action: 'read',
    error: {
      code: check.code,
      message: check.message,
      fix: check.fix,
      revisions: [...check.revisions],
    },
  }
}

function requestedRevision(args: Readonly<Record<string, unknown>>): string | null {
  const value = args.revision
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === 'object' && value !== null
}
