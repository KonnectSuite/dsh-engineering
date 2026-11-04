/**
 * Sheet-level ECAD tools: open, overview and find.
 *
 * `ecad_open` parses one drawing and caches its render model where the panel
 * imports previews from; `ecad_overview` answers structural questions from that
 * sheet or from the workspace index; `ecad_find` searches the text of a set with
 * bounded results and positions.
 *
 * @module dsh-engineering-ecad/tools/sheets
 */

import { EngineeringError, boolean, integer, list, object, optionalString, requiredString, string, success, tool } from '../core.ts'
import type { ExecContext, ToolDefinition } from '../core.ts'
import { EcadSession } from '../session.ts'
import { assertReadable, buildSheets, coverageOf, formatFields, namedPaths, resolveSheets, titleBlockOf, unsupportedTotal, workspaceRelative } from './shared.ts'

/**
 * The sheet tools this module contributes.
 *
 * @param session - the row session.
 */
export function sheetTools(session: EcadSession): ToolDefinition[] {
  return [openSheetTool(session), overviewTool(session), findTool(session)]
}

/**
 * `ecad_open`: read one drawing and cache its render model.
 *
 * @param session - the row session.
 */
function openSheetTool(session: EcadSession): ToolDefinition {
  return tool({
    name: 'ecad_open',
    description:
      'Open one DXF drawing: parse it, build the render model, detect its title block, and cache the model under .ecad/previews where the drawing panel reads it. Returns layouts, entity and unsupported-type counts, approximation count, title-block fields with their sources and confidence, and the preview path. `reload: true` re-reads a file that changed.',
    parameters: object(
      {
        path: string('Workspace-relative or absolute path of the .dxf drawing.'),
        reload: boolean('Re-read the drawing even when this chat already has it cached.', { default: false })
      },
      ['path']
    ),
    async run(args, exec) {
      const path = requiredString(args, 'path')
      const view = await session.open(path, exec, { reload: args.reload === true })
      const profileState = await session.profile(exec)
      const titleBlock = await titleBlockOf(view, profileState.profile)
      const drawingPath = workspaceRelative(session, exec, view.path)
      const modelPath = await session.savePreview(drawingPath, view.sha256, view.model, exec)
      const unsupported = unsupportedTotal(view.model.stats.unsupported)
      const unverified: string[] = []
      if (view.model.stats.truncated) unverified.push('the drawing exceeds the entity cap, so the model is incomplete')
      if (unsupported > 0) unverified.push(`${unsupported} unsupported entit${unsupported === 1 ? 'y is' : 'ies are'} counted but not drawn`)
      if (view.model.stats.approximate > 0) unverified.push(`${view.model.stats.approximate} primitive(s) are approximations`)
      return success(
        `Opened ${drawingPath}: ${view.model.stats.entities} primitives in ${view.model.layouts.length} layout(s), ${unsupported} unsupported, title block ${Object.keys(titleBlock.fields).length > 0 ? 'read' : 'not recognised'}.`,
        {
          path: drawingPath,
          requestedPath: path,
          ...formatFields(view.format, view.conversion),
          sourceBytes: view.sourceBytes,
          version: view.sha256,
          dxfVersion: view.model.dxfVersion,
          units: view.model.units,
          layouts: view.model.layouts.map(layout => ({ id: layout.id, name: layout.name, kind: layout.kind, entities: layout.entities.length })),
          entities: view.model.stats.entities,
          byKind: view.model.stats.byKind,
          unsupported: view.model.stats.unsupported,
          unsupportedTotal: unsupported,
          approximate: view.model.stats.approximate,
          truncated: view.model.stats.truncated,
          layers: view.model.layers.length,
          blocks: view.model.blocks.length,
          titleBlock,
          modelPath,
          profileSource: profileState.source,
          writes: session.writes
        },
        [
          { tool: 'ecad_overview', args: { path: drawingPath }, why: 'Check the entity coverage and the title block before answering structural questions.' },
          { tool: 'ecad_render', args: { path: drawingPath }, why: 'Write an SVG a person can look at when the geometry matters.' }
        ],
        { complete: !view.model.stats.truncated && unsupported === 0, unverified }
      )
    }
  })
}

/**
 * `ecad_overview`: structural summary of one sheet or the indexed set.
 *
 * @param session - the row session.
 */
function overviewTool(session: EcadSession): ToolDefinition {
  return tool({
    name: 'ecad_overview',
    description:
      'Summarise drawings rather than read them line by line. With `path`/`paths` it reads those sheets and reports entity kinds, unsupported types, approximations, layers, block count and title-block fields per sheet. With no path it summarises the indexed set from .ecad/index.json (counts, sets, per-sheet rows and anomalies such as a missing title block or duplicate sheet number) without re-parsing the files.',
    parameters: object({
      path: string('One drawing to summarise.'),
      paths: list('Several drawings to summarise; takes precedence over `path`.', string('.dxf path')),
      include_layers: boolean('Include each sheet’s layer names (capped at 50).', { default: false }),
      limit: integer('Most sheet rows to return.', { minimum: 1, maximum: 2000 })
    }),
    async run(args, exec) {
      const limit = session.cap(integerOf(args.limit), 100)
      const named = namedPaths(args)
      if (named !== undefined) return await overviewDrawings(session, named, limit, args.include_layers === true, exec)
      const state = await session.readIndex(exec)
      if (state === undefined) {
        throw new EngineeringError(
          'ECAD_NO_INDEX',
          'No drawing was named and no .ecad/index.json exists in this workspace.',
          'Run ecad_scan to index the drawings, or pass `path`/`paths` to summarise specific sheets.'
        )
      }
      const sheets = state.index.sheets
      const numberCounts = new Map<string, number>()
      for (const sheet of sheets) {
        const number = sheet.sheetNumber
        if (number !== undefined) numberCounts.set(number, (numberCounts.get(number) ?? 0) + 1)
      }
      const anomalies: Array<{ path: string; problem: string }> = []
      let unsupported = 0
      let entityCount = 0
      let blockCount = 0
      for (const sheet of sheets) {
        const sheetUnsupported = unsupportedTotal(sheet.unsupported)
        unsupported += sheetUnsupported
        entityCount += sheet.entityCount
        blockCount += sheet.blockCount
        if (sheet.sheetNumber === undefined) anomalies.push({ path: sheet.path, problem: 'no title-block sheet number recognised' })
        if (sheet.title === undefined) anomalies.push({ path: sheet.path, problem: 'no title-block title recognised' })
        if (sheetUnsupported > 0) anomalies.push({ path: sheet.path, problem: `${sheetUnsupported} unsupported entit${sheetUnsupported === 1 ? 'y' : 'ies'} not drawn` })
        const number = sheet.sheetNumber
        if (number !== undefined && (numberCounts.get(number) ?? 0) > 1) anomalies.push({ path: sheet.path, problem: `duplicate sheet number ${number} in the set` })
      }
      return success(
        `Index of ${sheets.length} drawing(s) in ${Object.keys(state.index.sets).length} set(s): ${unsupported} unsupported entit${unsupported === 1 ? 'y' : 'ies'}, ${anomalies.length} anomalies; scanned ${state.index.scannedAt}.`,
        {
          source: 'index',
          indexPath: workspaceRelative(session, exec, state.path),
          scannedAt: state.index.scannedAt,
          sheets: sheets.length,
          shown: Math.min(limit, sheets.length),
          truncated: sheets.length > limit,
          sets: Object.fromEntries(Object.entries(state.index.sets).map(([set, paths]) => [set, paths.length])),
          totals: { entityCount, unsupported, blockCount },
          rows: sheets.slice(0, limit).map(sheet => ({
            path: sheet.path,
            set: sheet.set,
            sheetNumber: sheet.sheetNumber,
            title: sheet.title,
            revision: sheet.revision,
            entities: sheet.entityCount,
            unsupported: unsupportedTotal(sheet.unsupported),
            layers: args.include_layers === true ? sheet.layers.slice(0, 50) : sheet.layers.length
          })),
          anomalies: anomalies.slice(0, limit),
          skipped: state.index.skipped.slice(0, limit)
        },
        [{ tool: 'ecad_checks', why: 'Turn the indexed anomalies into rule-based findings with evidence.' }],
        coverageOf(state.index.skipped, sheets.length > limit, ['the summary comes from .ecad/index.json, which may be older than the files on disk; run ecad_scan to refresh it'])
      )
    }
  })
}

/**
 * Summarise explicitly named drawings.
 *
 * @param session - the row session.
 * @param paths - drawings to read.
 * @param limit - most sheets.
 * @param includeLayers - include layer names.
 * @param exec - calling context.
 */
async function overviewDrawings(session: EcadSession, paths: readonly string[], limit: number, includeLayers: boolean, exec?: ExecContext): Promise<unknown> {
  const profileState = await session.profile(exec)
  const selected = paths.slice(0, limit)
  const built = await buildSheets(session, selected, exec)
  assertReadable(built, paths.length)
  const rows = []
  const unsupportedByType: Record<string, number> = {}
  let entities = 0
  let unsupported = 0
  for (const view of built.views) {
    const titleBlock = await titleBlockOf(view, profileState.profile)
    const viewUnsupported = unsupportedTotal(view.model.stats.unsupported)
    entities += view.model.stats.entities
    unsupported += viewUnsupported
    for (const [type, count] of Object.entries(view.model.stats.unsupported)) unsupportedByType[type] = (unsupportedByType[type] ?? 0) + count
    rows.push({
      path: workspaceRelative(session, exec, view.path),
      ...formatFields(view.format, view.conversion),
      version: view.sha256,
      sourceBytes: view.sourceBytes,
      dxfVersion: view.model.dxfVersion,
      units: view.model.units,
      entities: view.model.stats.entities,
      byKind: view.model.stats.byKind,
      unsupported: view.model.stats.unsupported,
      unsupportedTotal: viewUnsupported,
      approximate: view.model.stats.approximate,
      truncated: view.model.stats.truncated,
      blocks: view.model.blocks.length,
      layers: includeLayers ? view.model.layers.map(layer => layer.name).slice(0, 50) : view.model.layers.length,
      titleBlock,
      layouts: view.model.layouts.map(layout => ({ id: layout.id, kind: layout.kind, entities: layout.entities.length, extents: layout.extents }))
    })
  }
  const anomalies = rows
    .filter(row => row.unsupportedTotal > 0 || row.truncated)
    .map(row => ({ path: row.path, problem: row.truncated ? 'entity cap reached' : `${row.unsupportedTotal} unsupported entities not drawn` }))
  return success(
    `Summarised ${rows.length} drawing(s): ${entities} primitives, ${unsupported} unsupported, ${anomalies.length} anomalies.`,
    {
      source: 'drawings',
      sheets: rows.length,
      requested: paths.length,
      truncated: paths.length > limit,
      totals: { entities, unsupported, unsupportedByType },
      rows,
      anomalies,
      skipped: built.skipped
    },
    [{ tool: 'ecad_checks', args: { paths: selected }, why: 'Run the review rules over these drawings.' }],
    coverageOf(built.skipped, paths.length > limit, ['approximated and unsupported geometry is counted, not described'])
  )
}

/**
 * `ecad_find`: literal or regular-expression text search across a set.
 *
 * @param session - the row session.
 */
function findTool(session: EcadSession): ToolDefinition {
  return tool({
    name: 'ecad_find',
    description:
      'Search the text of DXF drawings (TEXT, MTEXT and flattened block attribute values) for a literal string or a regular expression, optionally on one layer, and return bounded matches with sheet, layout, entity id, layer and insertion point. Also reports how many matches exist so a capped answer says so. Set `regex: true` to treat the query as a regular expression.',
    parameters: object(
      {
        query: string('Text to find, or a regular expression when regex is true.'),
        path: string('One drawing to search.'),
        paths: list('Drawings to search; takes precedence over `path`.', string('.dxf path')),
        layer: string('Only text on this layer (case-insensitive exact name).'),
        regex: boolean('Treat the query as a regular expression.', { default: false }),
        case_sensitive: boolean('Match case exactly.', { default: false }),
        limit: integer('Most matches to return.', { minimum: 1, maximum: 1000 }),
        max_sheets: integer('Most drawings to search.', { minimum: 1, maximum: 2000 })
      },
      ['query']
    ),
    async run(args, exec) {
      const query = requiredString(args, 'query')
      const useRegex = args.regex === true
      const caseSensitive = args.case_sensitive === true
      const layerFilter = optionalString(args, 'layer')?.toUpperCase()
      const limit = session.cap(integerOf(args.limit), 50, 1000)
      const maxSheets = session.cap(integerOf(args.max_sheets), 50)
      let matcher: (text: string) => boolean
      if (useRegex) {
        let pattern: RegExp
        try {
          pattern = new RegExp(query, caseSensitive ? 'u' : 'iu')
        } catch (error) {
          throw new EngineeringError(
            'ECAD_INVALID_PATTERN',
            `The regular expression ${JSON.stringify(query)} is not valid: ${error instanceof Error ? error.message : String(error)}`,
            'Fix the expression or pass regex:false for a literal search.'
          )
        }
        matcher = (text: string) => pattern.test(text)
      } else {
        const needle = caseSensitive ? query : query.toLowerCase()
        matcher = (text: string) => (caseSensitive ? text : text.toLowerCase()).includes(needle)
      }
      const resolved = await resolveSheets(session, args, exec, { limit: maxSheets })
      const built = await buildSheets(session, resolved.paths, exec)
      assertReadable(built, resolved.paths.length)
      const rows: Array<Record<string, unknown>> = []
      const perSheet: Array<{ path: string; matches: number }> = []
      let total = 0
      for (const view of built.views) {
        let sheetMatches = 0
        for (const layout of view.model.layouts) {
          for (const entity of layout.entities) {
            if (entity.k !== 'text' && entity.k !== 'mtext') continue
            if (layerFilter !== undefined && entity.layer.toUpperCase() !== layerFilter) continue
            const text = entity.t ?? ''
            if (text.length === 0 || !matcher(text)) continue
            total += 1
            sheetMatches += 1
            if (rows.length >= limit) continue
            rows.push({
              path: workspaceRelative(session, exec, view.path),
              layout: layout.id,
              id: entity.id,
              kind: entity.k,
              layer: entity.layer,
              text: text.length > 400 ? `${text.slice(0, 400)}…` : text,
              ...(entity.p === undefined ? {} : { p: entity.p }),
              ...(entity.h === undefined ? {} : { h: entity.h })
            })
          }
        }
        perSheet.push({ path: workspaceRelative(session, exec, view.path), matches: sheetMatches })
      }
      const truncated = total > rows.length
      return success(
        `Found ${total} match(es) for ${JSON.stringify(query)} in ${built.views.length} drawing(s)${truncated ? `; returning the first ${rows.length}` : ''}.`,
        {
          query,
          regex: useRegex,
          caseSensitive,
          layer: layerFilter,
          matches: total,
          returned: rows.length,
          truncated,
          sheetsSearched: built.views.length,
          perSheet: perSheet.filter(sheet => sheet.matches > 0).slice(0, 100),
          rows,
          skipped: built.skipped
        },
        [{ tool: 'ecad_render', args: { path: rows[0]?.path }, why: 'Render the drawing a match was found on when the position matters.' }],
        coverageOf(built.skipped, resolved.truncated || truncated, ['the search covers text the render model carries; text inside unsupported entities such as TABLEs is absent'])
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
