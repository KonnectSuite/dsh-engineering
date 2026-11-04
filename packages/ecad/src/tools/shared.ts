/**
 * Shared helpers for the ECAD tools: resolving which drawings a call covers,
 * building their models once, and turning a drawing into the bounded summary the
 * tool answers carry.
 *
 * Set-level tools resolve their sheets in one place so every tool has the same
 * rule: explicit `paths` win, a single `path` narrows to one sheet, otherwise the
 * `.ecad/index.json` written by `ecad_scan` is the set. A caller that names
 * nothing and has no index is refused with the fix that produces one.
 *
 * @module dsh-engineering-ecad/tools/shared
 */

import type { EcadFinding, EcadIndexSheet, EcadProfile, EcadSheetModel, EcadSheetSummary, EcadTitleBlock, EcadWorkspaceIndex } from '../engine/index.ts'
import { EngineeringError } from '../core.ts'
import type { Coverage, ExecContext } from '../core.ts'
import { EcadSession, engine, baseNameOf, joinPath, stemOf } from '../session.ts'
import type { SheetView } from '../session.ts'
import { isRecognisedDrawingPath } from '../drawings.ts'
import type { ConversionInfo, DrawingFormat } from '../drawings.ts'

/** Rule ids `ecad_checks` reports, in the engine's stable order. */
export const ECAD_RULES: readonly string[] = [
  'ECAD-TB-MISSING',
  'ECAD-TB-BLANK',
  'ECAD-SHEET-MISMATCH',
  'ECAD-INDEX-MISMATCH',
  'ECAD-DEVICE-DUPLICATE',
  'ECAD-WIRE-DUPLICATE',
  'ECAD-TEXT-TOO-SMALL',
  'ECAD-LAYER-UNKNOWN',
  'ECAD-SHEET-REF-UNRESOLVED',
  'ECAD-SCOPE'
]

/** Entity kinds the engine draws exactly. */
export const EXACT_KINDS: readonly string[] = ['line', 'polyline', 'arc', 'circle', 'ellipse', 'point', 'text', 'mtext', 'insert']
/** Entity kinds the engine draws approximately. */
export const APPROXIMATE_KINDS: readonly string[] = ['spline', 'hatch', 'solid', 'dimension', 'leader', 'viewport']
/** DXF entity types the engine recognises but cannot draw as geometry. */
export const UNSUPPORTED_TYPES: readonly string[] = [
  'PROXY / custom object',
  '3DSOLID / REGION / BODY (ACIS)',
  'OLE frame',
  'RASTERIMAGE',
  'WIPEOUT',
  'TABLE',
  'MLEADER / MLINE / FCF / SHAPE',
  'RAY / XLINE',
  'any entity type the engine does not list'
]

/** What this build cannot do, reported by `ecad_capabilities`. */
export const LIMITATIONS: readonly string[] = [
  'DWG is converted by the embedded acadrust converter (WASM), not parsed: the same tools read and write .dwg, conversion warnings are quoted, and a DWG write is verified by re-reading the written file.',
  'Proxy/custom objects, ACIS solids, OLE, raster images and wipeouts are counted but not drawn; in a converted DWG they are unmeasured, and the reader diagnostics are the only report.',
  'A DWG write renumbers anonymous blocks (for example *X26 → *X7): geometry and text are compared, handles and byte identity are not.',
  'Planar drawings only: entity OCS/extrusion, thickness and non-planar blocks are not transformed.',
  'Splines, hatches, dimensions, leaders and viewports are drawn as approximations, and the count is reported.',
  'A written DXF is a new drawing through the MIT DXF writer: ATTRIB vertical justification is not preserved, so the round-trip is verified by model comparison rather than byte equality.',
  'Cross-reference rows are text-pattern candidates: exploded symbols mean a tag is not a device record, and no connectivity is proved.',
  'Rendering is static SVG (geometry and colour only): linetypes, hatch patterns and exact font metrics are not reproduced.',
  'No shell-out and no vendor CAD application; SVG is the only rendered output.',
  'Sources are never overwritten; writes outside .ecad/ require the row writes switch, which is off by default.'
]

/** Text-search row. */
export interface FindRow {
  readonly path: string
  readonly layout: string
  readonly id: string
  readonly kind: string
  readonly layer: string
  readonly text: string
  readonly p?: readonly [number, number]
  readonly h?: number
}

/** One skipped input, with why it was not read. */
export interface SkippedSheet {
  readonly path: string
  readonly reason: string
  /** Machine-readable failure class, when the skipped load threw a typed error. */
  readonly code?: string
}

/** Which drawings one call covers. */
export interface ResolvedSheets {
  readonly paths: readonly string[]
  /** `explicit` when the caller named paths, `index` when `.ecad/index.json` was used. */
  readonly source: 'explicit' | 'index'
  /** True when the set is larger than the limit and only the first sheets are covered. */
  readonly truncated: boolean
  /** Index path, when the index was used. */
  readonly indexPath?: string
}

/** Sheets built for one call. */
export interface BuiltSheets {
  readonly views: readonly SheetView[]
  readonly skipped: readonly SkippedSheet[]
  readonly truncated: boolean
}

/**
 * The workspace root label used in messages and summaries.
 *
 * @param session - the row session.
 * @param exec - calling context.
 */
export function workspaceLabel(session: EcadSession, exec?: ExecContext): string {
  return session.workspace(exec)
}

/**
 * The optional `format`/`converted` fields a tool answer carries for a drawing
 * that was not a straight DXF read. They are absent for DXF, so the schema stays
 * the same today and gains a DWG value when the converter lands.
 *
 * @param format - format the drawing was read or written as.
 * @param conversion - conversion detail, when there was a conversion.
 */
export function formatFields(format: DrawingFormat, conversion: ConversionInfo | undefined): Record<string, unknown> {
  if (format === 'dxf') return {}
  return { format, ...(conversion === undefined ? {} : { converted: conversion }) }
}

/**
 * A display path made workspace-relative when it lives inside the workspace.
 *
 * @param session - the row session.
 * @param exec - calling context.
 * @param displayPath - resolved display path.
 */
export function workspaceRelative(session: EcadSession, exec: ExecContext | undefined, displayPath: string): string {
  return session.relativePath(exec, displayPath)
}

/**
 * Resolve which drawings one call covers.
 *
 * @param session - the row session.
 * @param args - tool arguments (`path`, `paths`).
 * @param exec - calling context.
 * @param options - limit and whether one sheet is enough.
 * @returns the resolved paths and where they came from.
 */
export async function resolveSheets(
  session: EcadSession,
  args: Readonly<Record<string, unknown>>,
  exec: ExecContext | undefined,
  options: { limit: number }
): Promise<ResolvedSheets> {
  const named = namedPaths(args)
  if (named !== undefined) {
    const paths = dedupe(named)
    return { paths: paths.slice(0, options.limit), source: 'explicit', truncated: paths.length > options.limit }
  }
  const index = await session.readIndex(exec)
  if (index === undefined) {
    throw new EngineeringError(
      'ECAD_NO_SHEETS',
      'No drawing was named and no .ecad/index.json exists in this workspace.',
      'Run ecad_scan to index the workspace drawings, or pass `path` (one drawing) or `paths` (several).'
    )
  }
  const paths = dedupe(index.index.sheets.map(sheet => sheet.path).filter((path): path is string => typeof path === 'string' && path !== ''))
  if (paths.length === 0) {
    throw new EngineeringError('ECAD_NO_SHEETS', 'The cached .ecad/index.json lists no drawings.', 'Run ecad_scan again after the drawings are in the workspace.')
  }
  return { paths: paths.slice(0, options.limit), source: 'index', truncated: paths.length > options.limit, indexPath: index.path }
}

/**
 * The paths a caller named explicitly, if any.
 *
 * @param args - tool arguments.
 */
export function namedPaths(args: Readonly<Record<string, unknown>>): string[] | undefined {
  const many = args.paths
  if (Array.isArray(many)) {
    const paths = many.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    if (paths.length > 0) return paths
  }
  const single = args.path
  if (typeof single === 'string' && single.trim() !== '') return [single]
  return undefined
}

/**
 * Build the models for a list of paths, collecting read failures instead of
 * aborting the whole review.
 *
 * @param session - the row session.
 * @param paths - drawings to read.
 * @param exec - calling context.
 * @param options - entity cap and a progress hook.
 * @returns the views and the skipped drawings.
 */
export async function buildSheets(
  session: EcadSession,
  paths: readonly string[],
  exec: ExecContext | undefined,
  options: { maxEntities?: number; onProgress?: (index: number, total: number) => void } = {}
): Promise<BuiltSheets> {
  const views: SheetView[] = []
  const skipped: SkippedSheet[] = []
  for (let index = 0; index < paths.length; index += 1) {
    if (exec?.signal?.aborted === true) {
      skipped.push({ path: paths[index]!, reason: 'cancelled before this drawing was read' })
      continue
    }
    const path = paths[index]!
    try {
      views.push(await session.load(path, exec, options.maxEntities === undefined ? {} : { maxEntities: options.maxEntities }))
      options.onProgress?.(index + 1, paths.length)
    } catch (error) {
      const code = error !== null && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : undefined
      skipped.push({ path, reason: error instanceof Error ? error.message : String(error), ...(code === undefined ? {} : { code }) })
    }
  }
  return { views, skipped, truncated: false }
}

/**
 * Refuse a set-level call that read nothing, keeping the typed reason of the
 * first failure. A single unreadable drawing therefore surfaces its conversion
 * reason instead of an empty summary, while a set that merely has one unreadable
 * sheet keeps it in the skipped list and answers about the rest.
 *
 * @param built - built sheets and skipped inputs.
 * @param requested - most inputs the caller named.
 * @throws EngineeringError the first `ECAD_DWG_*`/format reason for a single input, or ECAD_NO_READABLE_SHEETS.
 */
export function assertReadable(built: BuiltSheets, requested: number): void {
  if (built.views.length > 0) return
  const typed = built.skipped.find(sheet => sheet.code !== undefined && (sheet.code.startsWith('ECAD_DWG_') || sheet.code === 'ECAD_UNSUPPORTED_FORMAT'))
  if (typed !== undefined && requested <= 1) {
    throw new EngineeringError(
      typed.code ?? 'ECAD_NO_READABLE_SHEETS',
      typed.reason,
      'Check the drawing in a CAD application, or pass a DXF/DWG this build can convert; nothing was read or written.'
    )
  }
  const first = built.skipped[0]
  throw new EngineeringError(
    'ECAD_NO_READABLE_SHEETS',
    first === undefined ? 'No drawing could be read.' : `None of the ${requested} drawing(s) could be read; ${first.path}: ${first.reason}`,
    'Run ecad_scan and check its skipped list, or pass readable drawing paths explicitly.'
  )
}

/**
 * Detect the title block of one view, with the attribute path read from the database.
 *
 * @param view - the parsed drawing.
 * @param profile - the workspace profile.
 * @returns the title block.
 */
export async function titleBlockOf(view: SheetView, profile: EcadProfile): Promise<EcadTitleBlock> {
  const engineModule = await engine()
  const inserts = engineModule.extractInsertAttributes(view.opened)
  return engineModule.detectTitleBlock(view.model, profile, { inserts })
}

/**
 * Detect the index sheet of one view.
 *
 * @param view - the parsed drawing.
 * @param profile - the workspace profile.
 * @returns the index sheet, when this drawing is one.
 */
export async function indexOf(view: SheetView, profile: EcadProfile): Promise<EcadIndexSheet | undefined> {
  const engineModule = await engine()
  return engineModule.detectIndexSheet(view.model, profile)
}

/**
 * The set name one drawing belongs to: the file name without its sheet number.
 *
 * @param path - the drawing path.
 * @returns the set name, or `set` when the name carries no sheet number.
 */
export function setOfPath(path: string): string {
  const stem = stemOf(path)
  const match = /^(.*?)[-_ ]?(\d{1,4})$/u.exec(stem)
  const prefix = match?.[1]?.trim()
  return prefix !== undefined && prefix.length > 0 ? prefix : 'set'
}

/**
 * The sheet number one drawing file name carries, or undefined.
 *
 * @param path - the drawing path.
 */
export function sheetNumberOfPath(path: string): string | undefined {
  const match = /(\d{1,4})$/u.exec(stemOf(path))
  return match?.[1]?.replace(/^0+(?=\d)/u, '') ?? undefined
}

/**
 * One sheet summary in the shared workspace-index schema.
 *
 * @param view - the parsed drawing.
 * @param titleBlock - its title block.
 * @param exec - calling context, for workspace-relative paths.
 * @param session - the row session.
 * @returns the summary row.
 */
export function summaryOf(session: EcadSession, exec: ExecContext | undefined, view: SheetView, titleBlock: EcadTitleBlock): EcadSheetSummary {
  const fields = titleBlock.fields
  const revision = fields.revision?.value
  const path = workspaceRelative(session, exec, view.path)
  return {
    path,
    sha256: view.sha256,
    ...(setOfPath(path) === 'set' ? {} : { set: setOfPath(path) }),
    ...(fields.sheetNumber?.value === undefined ? {} : { sheetNumber: fields.sheetNumber.value }),
    ...(fields.title?.value === undefined ? {} : { title: fields.title.value }),
    ...(revision === undefined ? {} : { revision }),
    titleBlock,
    layers: view.model.layers.map(layer => layer.name),
    blockCount: view.model.blocks.length,
    entityCount: view.model.stats.entities,
    unsupported: view.model.stats.unsupported
  }
}

/**
 * The drawings found under one root, as workspace-relative paths.
 *
 * Discovery is the only place the folder-skip list lives; the file filter is
 * {@link isRecognisedDrawingPath} from the drawings module, so `.dwg` files are
 * found and then refused by the reader (reported as skipped) rather than being
 * silently invisible.
 */
export interface DrawingDiscovery {
  readonly paths: readonly string[]
  /** True when the file limit stopped the walk. */
  readonly truncated: boolean
  /** True when the depth limit stopped a branch. */
  readonly depthTruncated: boolean
}

/** Folder names discovery never descends into. */
const SKIP_DIRECTORIES = new Set(['node_modules', 'backups', '.git', '.ecad', '.svn', 'vendor'])

/**
 * Walk a folder for drawing files, bounded in depth and count.
 *
 * @param session - the row session.
 * @param rootArg - folder to walk, relative to the workspace or absolute; defaults to the workspace root.
 * @param exec - calling context.
 * @param options - file limit and depth limit.
 * @returns the drawing paths found and whether a limit cut the walk.
 */
export async function discoverDrawings(
  session: EcadSession,
  rootArg: string | undefined,
  exec: ExecContext | undefined,
  options: { limit: number; maxDepth: number }
): Promise<DrawingDiscovery> {
  if (session.fs.listDir === undefined) {
    throw new EngineeringError(
      'ECAD_SCAN_UNAVAILABLE',
      'The filesystem provider in this profile cannot list directories, so a workspace scan cannot run.',
      'Pass explicit `paths` to the sheet tools instead, or use a profile whose filesystem provider supports listing.'
    )
  }
  const rootLabel = rootArg !== undefined && rootArg.trim() !== '' ? rootArg : session.workspace(exec)
  const rootTarget = await session.resolve(rootLabel, exec)
  const rootInfo = await session.fs.stat(rootTarget, exec?.signal)
  if (rootInfo === undefined || rootInfo.type !== 'directory') {
    throw new EngineeringError('ECAD_INVALID_ROOT', `${JSON.stringify(rootLabel)} is not a directory.`, 'Pass a folder that contains the drawings, or omit `root` to scan the workspace root.')
  }
  const paths: string[] = []
  let truncated = false
  let depthTruncated = false
  const walk = async (target: typeof rootTarget, depth: number): Promise<void> => {
    if (paths.length >= options.limit) {
      truncated = true
      return
    }
    if (depth > options.maxDepth) {
      depthTruncated = true
      return
    }
    let entries
    try {
      entries = await session.fs.listDir!(target, exec?.signal)
    } catch (error) {
      throw new EngineeringError('ECAD_SCAN_FAILED', `Could not list ${target.displayPath}: ${error instanceof Error ? error.message : String(error)}`, 'Check the folder permissions, or scan a smaller root.')
    }
    for (const entry of entries) {
      if (paths.length >= options.limit) {
        truncated = true
        return
      }
      const name = entry.name
      if (entry.type === 'directory') {
        if (SKIP_DIRECTORIES.has(name.toLowerCase()) || name.startsWith('.')) continue
        const child = entry.target ?? (await session.resolve(joinPath(target.displayPath, name), exec))
        await walk(child, depth + 1)
        continue
      }
      if (entry.type !== 'file' || !isRecognisedDrawingPath(name)) continue
      const child = entry.target ?? (await session.resolve(joinPath(target.displayPath, name), exec))
      paths.push(session.relativePath(exec, child.displayPath))
    }
  }
  await walk(rootTarget, 0)
  paths.sort((a, b) => a.localeCompare(b))
  return { paths, truncated, depthTruncated }
}

/**
 * Total count from an unsupported-type map.
 *
 * @param unsupported - entity type → count.
 */
export function unsupportedTotal(unsupported: Readonly<Record<string, number>>): number {
  return Object.values(unsupported).reduce((sum, count) => sum + (Number.isFinite(count) ? count : 0), 0)
}

/**
 * Coverage from the sheets a call could and could not read.
 *
 * @param skipped - skipped drawings.
 * @param truncated - whether a limit cut the set.
 * @param unverified - extra statements the answer does not establish.
 * @returns the coverage document.
 */
export function coverageOf(skipped: readonly SkippedSheet[], truncated: boolean, unverified: readonly string[] = []): Coverage {
  const reasons = skipped.map(sheet => `${sheet.path}: ${sheet.reason}`)
  return {
    complete: skipped.length === 0 && !truncated,
    unverified: [...reasons, ...(truncated ? ['the set was larger than the configured limit, so some drawings were not searched'] : []), ...unverified]
  }
}

/**
 * Group findings by rule and severity, for a compact tool answer.
 *
 * @param findings - engine findings.
 */
export function groupFindings(findings: readonly EcadFinding[]): { byRule: Record<string, number>; bySeverity: Record<string, number> } {
  const byRule: Record<string, number> = {}
  const bySeverity: Record<string, number> = {}
  for (const finding of findings) {
    byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1
  }
  return { byRule, bySeverity }
}

/**
 * Read the workspace index, or explain what produces one.
 *
 * @param session - the row session.
 * @param exec - calling context.
 * @returns the index and its path.
 */
export async function requireIndex(session: EcadSession, exec: ExecContext | undefined): Promise<{ index: EcadWorkspaceIndex; path: string }> {
  const state = await session.readIndex(exec)
  if (state === undefined) {
    throw new EngineeringError('ECAD_NO_INDEX', 'No .ecad/index.json exists in this workspace.', 'Run ecad_scan first; it writes the index the set tools read.')
  }
  return state
}

/**
 * A short file label for a list of drawings, for summaries.
 *
 * @param paths - drawing paths.
 * @param limit - most names to include.
 */
export function labelOf(paths: readonly string[], limit = 3): string {
  const names = paths.slice(0, limit).map(path => baseNameOf(path))
  return names.length === 0 ? 'no drawings' : `${names.join(', ')}${paths.length > limit ? ` and ${paths.length - limit} more` : ''}`
}

/**
 * De-duplicate strings preserving order.
 *
 * @param values - strings.
 */
function dedupe(values: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

/** The engine's sheet-model type, re-exported for tool modules. */
export type { EcadSheetModel }
