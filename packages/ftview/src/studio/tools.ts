/**
 * The FTView Studio entry: discovery, preflight and the manual handoff plan.
 *
 * @module dsh-engineering-ftview/studio/tools
 */

import { object, optionalString, requiredString, string, success, tool, type Coverage, type ToolDefinition } from '../core.ts'
import type { ViewSession } from '../session.ts'
import { discoverStudio, type StudioDiscovery } from './discover.ts'
import { handoffPlan, studioPreflight } from './preflight.ts'

/** Nothing here proves what Studio will do. */
const COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'FactoryTalk View Studio import behavior',
    'vendor XSD validation',
    'runtime behavior on the terminal',
    'automation through SEAddComponent (not executed)',
  ],
}

/** A compact view of the discovery for tool output. */
function discoveryData(discovery: StudioDiscovery): Record<string, unknown> {
  return {
    searched: discovery.searched,
    products: discovery.products,
    schemas: discovery.schemas,
    utilities: discovery.utilities,
    help: discovery.help,
    truncated: discovery.truncated,
  }
}

/**
 * The Studio tools.
 *
 * @param session - View handles from the read entry.
 * @param roots - Install roots to search.
 * @returns Tool definitions in registration order.
 */
export function studioTools(session: ViewSession, roots: readonly string[]): readonly ToolDefinition[] {
  return [
    tool({
      name: 'ftview_studio_status',
      description: 'Discover installed FactoryTalk View ME tooling: product folders, ME XSD schemas, help files and the Add Component utility. Read-only; does not start Studio or prove licensing.',
      parameters: object({}),
      async run(_args, exec) {
        const discovery = await discoverStudio(session.fs, roots, exec.signal)
        const products = discovery.products.length
        const utilities = discovery.utilities.length
        return success(
          `Searched ${discovery.searched.length} root(s): ${products} product folder(s), ${utilities} Add Component utility, ${discovery.schemas.length} schema(s).`,
          discoveryData(discovery),
          utilities === 0 ? [] : [{ tool: 'ftview_studio_preflight', why: 'Check a change set before importing it.' }],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_studio_preflight',
      description: 'Check the files that differ between two opened exports for a manual Studio import: parse state, name restrictions, discovered utility and schemas. Writes nothing and starts no Studio.',
      parameters: object({
        before_id: string('View id of the export before the edit.'),
        after_id: string('View id of the edited export.'),
      }, ['before_id', 'after_id']),
      async run(args, exec) {
        const before = session.require(requiredString(args, 'before_id'), exec).app
        const after = session.require(requiredString(args, 'after_id'), exec).app
        const discovery = await discoverStudio(session.fs, roots, exec.signal)
        const check = studioPreflight(before, after, discovery)
        return success(
          `${check.changed.length} file(s) differ; ${check.blockers.length} blocker(s).`,
          { ...check, discovery: discoveryData(discovery) },
          check.ready ? [{ tool: 'ftview_studio_handoff', args: { before_id: requiredString(args, 'before_id'), after_id: requiredString(args, 'after_id') }, why: 'Get the ordered manual import steps.' }] : [],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_studio_handoff',
      description: 'Return the ordered manual FactoryTalk View Studio import plan for the changed displays between two opened exports. No vendor utility runs and no file is written.',
      parameters: object({
        before_id: string('View id of the export before the edit.'),
        after_id: string('View id of the edited export.'),
        application: string('ME application name the human opens in Studio. Example: "Line".'),
      }, ['before_id', 'after_id', 'application']),
      async run(args, exec) {
        const before = session.require(requiredString(args, 'before_id'), exec).app
        const after = session.require(requiredString(args, 'after_id'), exec).app
        const discovery = await discoverStudio(session.fs, roots, exec.signal)
        const plan = handoffPlan(before, after, discovery)
        const application = optionalString(args, 'application') ?? plan.application
        return success(
          `${plan.changed.length} changed file(s) to import into ${application} by hand.`,
          { ...plan, application },
          [],
          COVERAGE,
        )
      },
    }),
  ]
}
