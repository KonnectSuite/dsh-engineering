/**
 * Workspace-level ECAD tools: capabilities, profile and scan.
 *
 * These three answer "what can this row do", "what conventions does this set
 * follow" and "what drawings are here" without opening one sheet in the chat.
 * The artifacts they write live under `.ecad/` — the row's own workspace state —
 * so a review works before writes are switched on.
 *
 * @module dsh-engineering-ecad/tools/workspace
 */

import type { EcadSheetSummary, EcadWorkspaceIndex } from '../engine/index.ts'
import { EngineeringError, boolean, choice, integer, list, object, string, success, tool } from '../core.ts'
import type { NextStep, ToolDefinition } from '../core.ts'
import { EcadSession, INDEX_FILE, PROFILE_FILE, engine, sha256 } from '../session.ts'
import { RECOGNISED_EXTENSIONS, SUPPORTED_EXTENSIONS, formatOfPath, isRecognisedDrawingPath } from '../drawings.ts'
import {
  APPROXIMATE_KINDS,
  ECAD_RULES,
  EXACT_KINDS,
  LIMITATIONS,
  UNSUPPORTED_TYPES,
  assertReadable,
  buildSheets,
  coverageOf,
  discoverDrawings,
  indexOf,
  resolveSheets,
  setOfPath,
  summaryOf,
  titleBlockOf,
  unsupportedTotal
} from './shared.ts'

/** The pinned drawing-engine version this build was measured against. */
const ENGINE_VERSION = '1.15.21'

/** The tool names the row registers; reported by `ecad_capabilities`. */
export const ECAD_TOOL_NAMES: readonly string[] = [
  'ecad_capabilities',
  'ecad_profile',
  'ecad_scan',
  'ecad_open',
  'ecad_overview',
  'ecad_find',
  'ecad_cross_reference',
  'ecad_checks',
  'ecad_render',
  'ecad_compare',
  'ecad_draft_ops',
  'ecad_draft_apply',
  'ecad_draft_discard',
  'ecad_verify',
  'ecad_document',
  'ecad_backup'
]

/** The Remote methods the panel service exposes beside these tools. */
const REMOTE_METHODS = ['open', 'apply', 'sheets', 'capabilities'] as const

/**
 * The workspace tools this module contributes.
 *
 * @param session - the row session.
 */
export function workspaceTools(session: EcadSession): ToolDefinition[] {
  return [capabilities(session), profile(session), scan(session)]
}

/**
 * The capabilities tool.
 *
 * @param session - the row session.
 */
function capabilities(session: EcadSession): ToolDefinition {
  return tool({
    name: 'ecad_capabilities',
    description:
      'Report the ECAD surface before anything else: the drawing engine and its pinned version, which formats are supported (DXF today; DWG support is landing in this batch), the workspace root, whether a saved profile and a workspace index exist, whether writes are enabled, the row limits, the registered tools and rule ids, and the list of things this build cannot establish.',
    parameters: object({}),
    async run(_args, exec) {
      const workspace = session.workspace(exec)
      let profileState: Record<string, unknown>
      try {
        const loaded = await session.profile(exec)
        profileState = { present: loaded.source === 'workspace', source: loaded.source, ...(loaded.path === undefined ? {} : { path: loaded.path }) }
      } catch (error) {
        profileState = { present: true, source: 'invalid', problem: error instanceof Error ? error.message : String(error) }
      }
      const index = await session.readIndex(exec)
      const next: NextStep[] = []
      if (profileState.present !== true) next.push({ tool: 'ecad_profile', args: { action: 'infer' }, why: 'The set’s own title-block, layer and tag conventions have not been confirmed; infer them, then confirm with the user.' })
      next.push({ tool: 'ecad_scan', why: 'Index the workspace drawings so the set tools know which sheets exist.' })
      return success(
        `DXF engine ${ENGINE_VERSION} ready; writes are ${session.writes ? 'on' : 'off'}; DWG support is landing in this batch.`,
        {
          engine: { id: 'dxf', version: ENGINE_VERSION, reader: '@mlightcad/data-model', writes: true },
          formats: { supported: SUPPORTED_EXTENSIONS, recognised: RECOGNISED_EXTENSIONS, dwg: false },
          contract: { namespace: 'ecad', version: 1, methods: REMOTE_METHODS },
          workspace: {
            root: workspace,
            profile: profileState,
            index: index === undefined ? { present: false } : { present: true, path: index.path, scannedAt: index.index.scannedAt, sheets: index.index.sheets.length }
          },
          writes: session.writes,
          limits: { maxFileBytes: session.maxFileBytes, maxFiles: session.maxFiles, maxEntitiesPerLayout: session.maxEntities },
          tools: ECAD_TOOL_NAMES,
          rules: ECAD_RULES,
          supported: { exactKinds: EXACT_KINDS, approximateKinds: APPROXIMATE_KINDS, unsupportedTypes: UNSUPPORTED_TYPES },
          limitations: LIMITATIONS
        },
        next,
        { complete: true, unverified: LIMITATIONS.slice(0, 4) }
      )
    }
  })
}

/**
 * The profile tool.
 *
 * @param session - the row session.
 */
function profile(session: EcadSession): ToolDefinition {
  return tool({
    name: 'ecad_profile',
    description:
      'Read or infer the convention profile of the drawing set: title-block layer and labels, wire/tag/xref/loc layers, and the device-tag, wire-label and sheet-reference patterns. `action: "read"` returns the saved profile or the defaults; `"infer"` measures the drawings (ACADE WD_M first, then layers and labels) and returns the evidence and confidence; `"save"` infers and writes .ecad/profile.json. The file is written only when `confirm: true`, because the profile drives checks and cross-reference — confirm its conventions with the user first.',
    parameters: object(
      {
        action: choice('read the saved profile, infer one, or infer and save it.', ['read', 'infer', 'save'], { default: 'read' }),
        confirm: boolean('Write .ecad/profile.json with the inferred profile. Required for action "save".', { default: false }),
        path: string('One drawing to infer from; when omitted the sheets in .ecad/index.json are used.'),
        paths: list('Drawings to infer from; takes precedence over `path`.', string('workspace-relative or absolute drawing path')),
        limit: integer('Most drawings to infer from.', { minimum: 1, maximum: 2000 })
      },
      []
    ),
    async run(args, exec) {
      const action = typeof args.action === 'string' ? args.action : 'read'
      const confirm = args.confirm === true
      if (action === 'read') {
        const loaded = await session.profile(exec)
        return success(
          loaded.source === 'workspace' ? `Read the saved profile ${loaded.path}.` : 'No saved profile; the ACADE IEC defaults are in force.',
          { action, source: loaded.source, ...(loaded.path === undefined ? {} : { path: loaded.path }), profile: loaded.profile },
          [{ tool: 'ecad_profile', args: { action: 'infer' }, why: 'Infer the set’s own conventions and confirm them with the user.' }],
          { complete: loaded.source === 'workspace', unverified: loaded.source === 'workspace' ? [] : ['the profile is the ACADE default, not this set’s measured convention'] }
        )
      }
      if (action !== 'infer' && action !== 'save') {
        throw new EngineeringError('INVALID_ARGUMENT', `Unknown profile action ${JSON.stringify(action)}.`, 'Use action "read", "infer" or "save".')
      }
      if (action === 'save' && !confirm) {
        throw new EngineeringError(
          'ECAD_CONFIRMATION_REQUIRED',
          'action "save" writes .ecad/profile.json, which then drives every check and cross-reference in this workspace.',
          'Re-run with confirm:true after checking the inferred evidence with the user, or use action "infer" to review it first.'
        )
      }
      const limit = session.cap(integerOf(args.limit), 50)
      const resolved = await resolveSheets(session, args, exec, { limit })
      const built = await buildSheets(session, resolved.paths, exec)
      if (built.views.length === 0) {
        throw new EngineeringError(
          'ECAD_NO_READABLE_SHEETS',
          `None of the ${resolved.paths.length} drawing(s) could be read for profile inference.`,
          'Run ecad_scan and check the skipped list, or pass readable drawing paths explicitly.'
        )
      }
      const engineModule = await engine()
      const profileState = await session.profile(exec)
      const sheets = []
      for (const view of built.views) {
        sheets.push({ model: view.model, titleBlock: await titleBlockOf(view, profileState.profile), inserts: engineModule.extractInsertAttributes(view.opened) })
      }
      const inference = engineModule.inferProfile(sheets)
      let savedPath: string | undefined
      if (confirm) savedPath = await session.saveProfile(inference.profile, exec)
      const next: NextStep[] = []
      if (!confirm) next.push({ tool: 'ecad_profile', args: { action: 'infer', confirm: true }, why: 'Save the profile once the user has confirmed the conventions and evidence.' })
      next.push({ tool: 'ecad_scan', why: 'Index the workspace with the confirmed profile so later reads agree.' })
      const skipped = built.skipped
      return success(
        `Inferred the profile from ${built.views.length} drawing(s) at confidence ${inference.confidence}${savedPath === undefined ? '; not saved (confirm:true saves it)' : `; saved ${savedPath}`}.`,
        {
          action,
          confidence: inference.confidence,
          evidence: inference.evidence,
          profile: inference.profile,
          sheets: built.views.length,
          sheetsSource: resolved.source,
          saved: savedPath !== undefined,
          ...(savedPath === undefined ? {} : { profilePath: savedPath }),
          skipped
        },
        next,
        coverageOf(skipped, resolved.truncated, ['the profile is inferred from text and layer evidence; anything the drawings do not show stays at its default'])
      )
    }
  })
}

/**
 * The scan tool.
 *
 * @param session - the row session.
 */
function scan(session: EcadSession): ToolDefinition {
  return tool({
    name: 'ecad_scan',
    description:
      'Walk the workspace for drawing files (DXF today; DWG support is landing in this batch), bounded in depth and count and skipping hidden folders, node_modules, backups and .ecad, read each one, and write .ecad/index.json with a summary per sheet: title block, layers, entity and unsupported counts, the set it belongs to, the sheet index when one drawing carries it, and anything skipped (including drawings whose format this build cannot convert yet). Returns a bounded summary, not the whole index.',
    parameters: object({
      root: string('Folder to scan, relative to the workspace or absolute. Defaults to the workspace root.'),
      limit: integer('Most drawings to index.', { minimum: 1, maximum: 2000 }),
      max_depth: integer('How deep to walk below the root.', { minimum: 0, maximum: 12, default: 6 })
    }),
    async run(args, exec) {
      const engineModule = await engine()
      const limit = session.cap(integerOf(args.limit), Math.min(200, session.maxFiles))
      const maxDepth = Math.max(0, Math.min(12, integerOf(args.max_depth) ?? 6))
      const rootLabel = typeof args.root === 'string' && args.root.trim() !== '' ? args.root : undefined
      const discovery = await discoverDrawings(session, rootLabel, exec, { limit, maxDepth })
      const profileState = await session.profile(exec)
      const sheets: EcadSheetSummary[] = []
      const skipped: Array<{ path: string; reason: string }> = []
      const sets: Record<string, string[]> = {}
      let indexSheet: { path: string; layout: string; heading: string; entries: number } | undefined
      for (const path of discovery.paths) {
        if (exec?.signal?.aborted === true) {
          skipped.push({ path, reason: 'cancelled before this drawing was read' })
          continue
        }
        try {
          const view = await session.load(path, exec)
          const titleBlock = await titleBlockOf(view, profileState.profile)
          const index = await indexOf(view, profileState.profile)
          const summary = summaryOf(session, exec, view, titleBlock)
          if (index !== undefined) {
            sheets.push({ ...summary, index })
            if (indexSheet === undefined) indexSheet = { path, layout: index.layout, heading: index.heading, entries: index.entries.length }
          } else {
            sheets.push(summary)
          }
          const set = setOfPath(path)
          ;(sets[set] ??= []).push(path)
        } catch (error) {
          skipped.push({ path, reason: error instanceof Error ? error.message : String(error) })
        }
      }
      sheets.sort((a, b) => a.path.localeCompare(b.path))
      for (const set of Object.keys(sets)) sets[set]!.sort((a, b) => a.localeCompare(b))
      const scannedAt = new Date().toISOString()
      const indexDocument: EcadWorkspaceIndex = { schema: 1, scannedAt, sheets, sets, skipped }
      const indexPath = await session.saveIndex(indexDocument, exec)
      const unsupported = sheets.reduce((sum, sheet) => sum + unsupportedTotal(sheet.unsupported), 0)
      const truncated = discovery.truncated || discovery.depthTruncated
      const relativeIndex = session.relativePath(exec, indexPath)
      const formats: Record<string, number> = {}
      for (const path of discovery.paths) {
        const format = formatOfPath(path)
        if (format !== undefined) formats[format] = (formats[format] ?? 0) + 1
      }
      const next: NextStep[] = []
      if (indexSheet !== undefined) next.push({ tool: 'ecad_open', args: { path: indexSheet.path }, why: 'Read the sheet index drawing to compare its rows with the files that exist.' })
      next.push({ tool: 'ecad_checks', why: 'Run the static review rules over the indexed set.' })
      return success(
        `Indexed ${sheets.length} drawing(s) in ${Object.keys(sets).length} set(s)${skipped.length > 0 ? `, ${skipped.length} skipped` : ''}; index written to ${relativeIndex}.`,
        {
          indexPath: relativeIndex,
          scannedAt,
          root: rootLabel ?? session.workspace(exec),
          sheets: sheets.length,
          sets: Object.fromEntries(Object.entries(sets).map(([set, paths]) => [set, paths.length])),
          formats,
          indexSheet,
          unsupported,
          skipped,
          truncated,
          sample: sheets.slice(0, 10).map(sheet => ({
            path: sheet.path,
            sheetNumber: sheet.sheetNumber,
            title: sheet.title,
            entities: sheet.entityCount,
            unsupported: unsupportedTotal(sheet.unsupported)
          }))
        },
        next,
        coverageOf(skipped, truncated, truncated ? ['the walk stopped at its limit or depth, so some folders were not scanned'] : [])
      )
    }
  })
}

/**
 * Read an optional integer argument.
 *
 * @param value - raw argument.
 */
function integerOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

/** The artifact paths this module may name in its answers. */
export const WORKSPACE_ARTIFACTS = { profile: PROFILE_FILE, index: INDEX_FILE } as const

/** Re-exported so a test can hash a fixture the same way the tools do. */
export { sha256 }

/** True when a path names a drawing file discovery should report. */
export function isDrawingFileName(name: string): boolean {
  return isRecognisedDrawingPath(name)
}
