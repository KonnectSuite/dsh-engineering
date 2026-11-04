/**
 * Review tools: cross-reference, checks, compare and render.
 *
 * These are the read-only answers a person acts on. Every one of them states its
 * coverage: cross-reference rows are text-pattern candidates, checks are static
 * measurements, a diff describes what the model sees, and a render is geometry
 * and colour only.
 *
 * @module dsh-engineering-ecad/tools/review
 */

import type { EcadEntity, EcadEntityChange } from '../engine/index.ts'
import { EngineeringError, integer, list, number, object, optionalString, requiredString, string, success, tool } from '../core.ts'
import type { ToolDefinition } from '../core.ts'
import { EcadSession, engine, stemOf } from '../session.ts'
import {
  ECAD_RULES,
  assertReadable,
  buildSheets,
  coverageOf,
  formatFields,
  groupFindings,
  indexOf,
  resolveSheets,
  titleBlockOf,
  unsupportedTotal,
  workspaceRelative
} from './shared.ts'

/**
 * The review tools this module contributes.
 *
 * @param session - the row session.
 */
export function reviewTools(session: EcadSession): ToolDefinition[] {
  return [crossReferenceTool(session), checksTool(session), renderTool(session), compareTool(session)]
}

/**
 * `ecad_cross_reference`: candidate device tags, wire labels and sheet references.
 *
 * @param session - the row session.
 */
function crossReferenceTool(session: EcadSession): ToolDefinition {
  return tool({
    name: 'ecad_cross_reference',
    description:
      'Find text-pattern cross-reference candidates across a drawing set: device tags seen on several sheets, wire labels within a sheet, and sheet references. Each row carries a status (ok, duplicate, one-sided, unresolved), a confidence and a note saying what matched. Rows are candidates, not electrical truth: exploded symbols mean a tag is text, so a duplicate is a question to ask, not a fault to report.',
    parameters: object({
      path: string('One drawing to read.'),
      paths: list('Drawings to read; takes precedence over `path`.', string('.dxf path')),
      limit: integer('Most candidate rows to return.', { minimum: 1, maximum: 1000 }),
      max_sheets: integer('Most drawings to read.', { minimum: 1, maximum: 2000 })
    }),
    async run(args, exec) {
      const limit = session.cap(integerOf(args.limit), 100, 1000)
      const maxSheets = session.cap(integerOf(args.max_sheets), 50)
      const profileState = await session.profile(exec)
      const resolved = await resolveSheets(session, args, exec, { limit: maxSheets })
      const built = await buildSheets(session, resolved.paths, exec)
      assertReadable(built, resolved.paths.length)
      const engineModule = await engine()
      const rows = engineModule.crossReference(
        built.views.map(view => ({ path: workspaceRelative(session, exec, view.path), model: view.model })),
        profileState.profile,
        { maxRows: limit }
      )
      const byKind: Record<string, number> = {}
      const byStatus: Record<string, number> = {}
      for (const row of rows) {
        byKind[row.kind] = (byKind[row.kind] ?? 0) + 1
        byStatus[`${row.kind}:${row.status}`] = (byStatus[`${row.kind}:${row.status}`] ?? 0) + 1
      }
      return success(
        `${rows.length} cross-reference candidate(s) from ${built.views.length} drawing(s)${Object.keys(byStatus).length > 0 ? `: ${Object.entries(byStatus).map(([key, count]) => `${key} ${count}`).join(', ')}` : ''}.`,
        {
          profileSource: profileState.source,
          sheets: built.views.length,
          rows: rows.map(row => ({
            kind: row.kind,
            value: row.value,
            status: row.status,
            confidence: row.confidence,
            note: row.note,
            occurrences: row.sheets.length,
            sheets: row.sheets.slice(0, 10).map(sheet => ({ path: sheet.path, layout: sheet.layout, layer: sheet.layer, id: sheet.entityId, position: sheet.position, text: sheet.text }))
          })),
          totals: { byKind, byStatus },
          skipped: built.skipped
        },
        [{ tool: 'ecad_checks', args: restArgs(args), why: 'Turn duplicate and unresolved candidates into rule-based findings with evidence.' }],
        coverageOf(built.skipped, resolved.truncated, ['rows are text-pattern candidates: a tag or wire number is not a device record and no connectivity is proved'])
      )
    }
  })
}

/**
 * `ecad_checks`: static review findings with rule ids and coverage.
 *
 * @param session - the row session.
 */
function checksTool(session: EcadSession): ToolDefinition {
  return tool({
    name: 'ecad_checks',
    description:
      'Run the static review rules over a drawing set and return findings with stable rule ids, severity and evidence: missing or blank title-block fields, a sheet number that disagrees with the file name, index entries the files do not satisfy, duplicate device-tag and wire-label candidates, text below the profile minimum, unknown layers and unresolved sheet references. The answer always ends with the ECAD-SCOPE note stating what the checks do not prove.',
    parameters: object({
      path: string('One drawing to check.'),
      paths: list('Drawings to check; takes precedence over `path`.', string('.dxf path')),
      limit: integer('Most findings to return.', { minimum: 1, maximum: 1000 }),
      max_sheets: integer('Most drawings to check.', { minimum: 1, maximum: 2000 })
    }),
    async run(args, exec) {
      const limit = session.cap(integerOf(args.limit), 100, 1000)
      const maxSheets = session.cap(integerOf(args.max_sheets), 50)
      const profileState = await session.profile(exec)
      const resolved = await resolveSheets(session, args, exec, { limit: maxSheets })
      const built = await buildSheets(session, resolved.paths, exec)
      assertReadable(built, resolved.paths.length)
      const engineModule = await engine()
      const sheets = []
      let index
      let indexSheet: string | undefined
      for (const view of built.views) {
        const path = workspaceRelative(session, exec, view.path)
        const titleBlock = await titleBlockOf(view, profileState.profile)
        const detected = await indexOf(view, profileState.profile)
        if (detected !== undefined && index === undefined) {
          index = detected
          indexSheet = path
        }
        sheets.push({ path, model: view.model, titleBlock, ...(detected === undefined ? {} : { index: detected }) })
      }
      const findings = engineModule.runChecks({ sheets, profile: profileState.profile, ...(index === undefined ? {} : { index }) }, { maxFindings: limit })
      const counts = groupFindings(findings)
      const scope = findings.find(finding => finding.rule === 'ECAD-SCOPE')?.message
      const problems = findings.filter(finding => finding.severity !== 'info').length
      const unverified: string[] = [scope ?? 'the checks are static text and layer measurements']
      return success(
        `${findings.length} finding(s) from ${built.views.length} drawing(s): ${problems} warning/critical, ${counts.bySeverity.info ?? 0} informational.`,
        {
          sheets: built.views.length,
          indexSheet,
          findings,
          counts,
          rulesRun: ECAD_RULES,
          scope,
          skipped: built.skipped
        },
        [
          { tool: 'ecad_overview', args: restArgs(args), why: 'Look at the entity and title-block coverage of the sheets the findings name.' },
          { tool: 'ecad_render', args: args.path === undefined ? {} : { path: args.path }, why: 'Render a flagged drawing when a person must judge the geometry.' }
        ],
        coverageOf(built.skipped, resolved.truncated, unverified)
      )
    }
  })
}

/**
 * `ecad_compare`: semantic diff of two drawings.
 *
 * @param session - the row session.
 */
function compareTool(session: EcadSession): ToolDefinition {
  return tool({
    name: 'ecad_compare',
    description:
      'Compare two DXF drawings semantically: entities are matched by id then by normalised content, geometry is rounded to a tolerance, and every added, removed or changed primitive is reported with a reason (text, geometry, layer, colour, block, approximation). Bounded row count; the answer says when it truncated. Use it to see what a draft changed, or to compare two revisions of a sheet.',
    parameters: object(
      {
        a: string('First drawing path (the earlier version).'),
        b: string('Second drawing path (the later version).'),
        tolerance: number('Geometry rounding tolerance in drawing units.', { minimum: 0.000000001, maximum: 1000000 }),
        limit: integer('Most change rows to return.', { minimum: 1, maximum: 5000 })
      },
      ['a', 'b']
    ),
    async run(args, exec) {
      const a = requiredString(args, 'a')
      const b = requiredString(args, 'b')
      const limit = session.cap(integerOf(args.limit), 100, 5000)
      const tolerance = clampTolerance(args.tolerance)
      const engineModule = await engine()
      const left = await session.load(a, exec)
      const right = await session.load(b, exec)
      const diff = engineModule.diffSheetModels(left.model, right.model, { tolerance, maxChanges: limit })
      const toRow = (change: EcadEntityChange): Record<string, unknown> => ({
        kind: change.kind,
        layout: change.layout,
        entityKind: change.entityKind,
        layer: change.layer,
        reason: change.reason,
        ...(change.before === undefined ? {} : { before: compactEntity(change.before) }),
        ...(change.after === undefined ? {} : { after: compactEntity(change.after) })
      })
      const rows = [...diff.added, ...diff.removed, ...diff.changed].slice(0, limit).map(toRow)
      const unverified: string[] = []
      if (diff.truncated) unverified.push('the comparison hit its row cap, so the change list is incomplete')
      return success(
        `${diff.added.length} added, ${diff.removed.length} removed, ${diff.changed.length} changed primitive(s) between ${stemOf(a)} and ${stemOf(b)}.`,
        {
          a: { path: workspaceRelative(session, exec, left.path), version: left.sha256, ...formatFields(left.format, left.conversion) },
          b: { path: workspaceRelative(session, exec, right.path), version: right.sha256, ...formatFields(right.format, right.conversion) },
          tolerance,
          added: diff.added.length,
          removed: diff.removed.length,
          changed: diff.changed.length,
          truncated: diff.truncated,
          rows
        },
        [{ tool: 'ecad_render', args: { path: b }, why: 'Render the changed drawing when a person must judge what moved.' }],
        { complete: !diff.truncated, unverified }
      )
    }
  })
}

/**
 * `ecad_render`: render one layout as SVG under `.ecad/renders/`.
 *
 * @param session - the row session.
 */
function renderTool(session: EcadSession): ToolDefinition {
  return tool({
    name: 'ecad_render',
    description:
      'Render one layout of a drawing as static SVG and write it under .ecad/renders/ (no DOM, no canvas, no shell-out). Returns the artifact path, size and what was drawn: entity counts, unsupported entities skipped and the approximated-primitive count. The image is geometry and colour only — linetypes, hatch patterns and exact font metrics are not reproduced.',
    parameters: object(
      {
        path: string('Drawing to render.'),
        layout: string('Layout id: "Model" (default) or a paper layout id the drawing lists.'),
        name: string('Output file name under .ecad/renders/; defaults to <drawing>-<layout>.svg.'),
        max_entities: integer('Most primitives to draw.', { minimum: 1, maximum: 500000 })
      },
      ['path']
    ),
    async run(args, exec) {
      const path = requiredString(args, 'path')
      const layoutId = optionalString(args, 'layout') ?? 'Model'
      const engineModule = await engine()
      const view = await session.open(path, exec)
      const layout = view.model.layouts.find(entry => entry.id === layoutId)
      if (layout === undefined) {
        throw new EngineeringError(
          'ECAD_UNKNOWN_LAYOUT',
          `Layout ${JSON.stringify(layoutId)} does not exist in ${path}.`,
          `Use one of: ${view.model.layouts.map(entry => entry.id).join(', ')}.`
        )
      }
      const cap = Math.max(1, Math.min(integerOf(args.max_entities) ?? session.maxEntities, session.maxEntities))
      const svg = engineModule.renderLayoutSvg(view.model, layoutId, { maxEntities: cap })
      const drawingPath = workspaceRelative(session, exec, view.path)
      const name = sanitizeName(optionalString(args, 'name') ?? `${stemOf(drawingPath)}-${layoutId}.svg`)
      const svgPath = await session.saveRender(name, svg, exec)
      const skippedKinds = layout.entities.filter(entity => entity.k !== 'insert' && entity.k !== 'unsupported').length
      const unsupported = layout.entities.filter(entity => entity.k === 'unsupported').length
      const approximate = layout.entities.filter(entity => entity.approx === true).length
      const unverified: string[] = ['the SVG draws geometry and colour only: linetypes, hatch patterns and exact font metrics are not reproduced']
      if (unsupported > 0) unverified.push(`${unsupported} unsupported entit${unsupported === 1 ? 'y is' : 'ies are'} not drawn`)
      if (approximate > 0) unverified.push(`${approximate} primitive(s) are drawn as approximations`)
      return success(
        `Rendered ${drawingPath} layout ${layoutId}: ${skippedKinds} primitive(s) to ${svgPath} (${Math.round(svg.length / 1024)} KB).`,
        {
          path: drawingPath,
          ...formatFields(view.format, view.conversion),
          layout: layoutId,
          kind: layout.kind,
          svgPath,
          characters: svg.length,
          entities: layout.entities.length,
          drawn: skippedKinds,
          unsupported,
          approximate,
          truncated: view.model.stats.truncated,
          extents: layout.extents,
          writes: false
        },
        [{ tool: 'ecad_overview', args: { path: drawingPath }, why: 'Read the entity coverage before judging the image.' }],
        { complete: unsupported === 0 && !view.model.stats.truncated, unverified }
      )
    }
  })
}

/**
 * A compact entity view for a diff row: identity and the fields a reader needs.
 *
 * @param entity - the entity as the model carries it.
 */
function compactEntity(entity: EcadEntity): Record<string, unknown> {
  return {
    id: entity.id,
    k: entity.k,
    layer: entity.layer,
    ...(entity.t === undefined ? {} : { text: entity.t }),
    ...(entity.block === undefined ? {} : { block: entity.block }),
    ...(entity.p === undefined ? {} : { p: entity.p }),
    ...(entity.pts === undefined ? { points: 0 } : { points: entity.pts.length }),
    ...(entity.src === undefined ? {} : { src: entity.src }),
    ...(entity.approx === true ? { approximate: true } : {})
  }
}

/**
 * Clamp the diff tolerance into a range the engine accepts.
 *
 * @param value - caller tolerance.
 */
function clampTolerance(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0.001
  return Math.min(1_000_000, Math.max(1e-9, value))
}

/**
 * Strip path separators from an output file name.
 *
 * @param name - proposed name.
 */
function sanitizeName(name: string): string {
  const base = name.replace(/\\/gu, '/').split('/').pop() ?? 'render.svg'
  const cleaned = base.replace(/[^A-Za-z0-9._-]/gu, '-').replace(/^-+/u, '')
  return (cleaned === '' ? 'render' : cleaned).toLowerCase().endsWith('.svg') ? (cleaned === '' ? 'render.svg' : cleaned) : `${cleaned === '' ? 'render' : cleaned}.svg`
}

/**
 * Pass the sheet selection arguments through to a follow-up call.
 *
 * @param args - current tool arguments.
 */
function restArgs(args: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  if (args.path !== undefined) out.path = args.path
  if (args.paths !== undefined) out.paths = args.paths
  return out
}

/**
 * Read an optional integer argument.
 *
 * @param value - raw argument.
 */
function integerOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

/** Re-exported for callers that want the coverage type from the review module. */
export type { Coverage } from '../core.ts'
