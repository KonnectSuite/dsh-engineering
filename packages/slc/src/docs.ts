/**
 * The `slc500_docs` adapter.
 *
 * The retrieval engine is not a package in this repository: `packages/knowledge`
 * is a source library, and `scripts/sync-knowledge-lib.mjs` copies its built
 * `core.ts` into `src/knowledge/core.ts` for every consumer. The import below
 * stays dynamic so this package compiles and mounts before that generated copy
 * exists; until it does every call answers a typed `TOOL_UNAVAILABLE` rather
 * than a fabricated page.
 *
 * @module dsh-engineering-slc/docs
 */

import { jsonText, type PluginContext, type ToolDefinition, type ToolExec } from './core/tool.ts'

/** The authored collection this row ships. */
export const COLLECTION = 'rslogix-500'

/** The one action union the docs tool exposes. */
export const DOCS_DESCRIPTION =
  'Look up authored RSLogix 500 knowledge: instruction behaviour, data-file and addressing rules, I/O slot conventions, processor status words, documentation-export grammar, and legacy file formats. Actions: contents, search, read, status, lookup. Authored pages ship with this bundle; installed-help text is never shipped.'

interface DocsToolDefinitionLike extends ToolDefinition {
  execute(args: Readonly<Record<string, unknown>>, exec: unknown): Promise<unknown>
}

interface DocsCore {
  createDocsTool(options: Record<string, unknown>): DocsToolDefinitionLike
}

let cached: DocsCore | undefined

/** Load the generated core module once, if this build carries it. */
async function loadCore(): Promise<DocsCore> {
  if (cached !== undefined) return cached
  const specifier = './knowledge/core.js'
  const module = (await import(specifier)) as Partial<DocsCore>
  if (typeof module.createDocsTool !== 'function') {
    throw new Error('the generated knowledge core did not export createDocsTool')
  }
  cached = module as DocsCore
  return cached
}

function unavailable(): Record<string, unknown> {
  return {
    summary: 'The authored RSLogix 500 knowledge collection is not built into this copy of the bundle, so no page can be read.',
    data: { collection: COLLECTION, source: 'authored' },
    next: [],
    coverage: { complete: false, unverified: ['the knowledge engine and authored corpus were not built into this package'] },
    error: {
      code: 'TOOL_UNAVAILABLE',
      message: `The authored collection "${COLLECTION}" is not available in this build.`,
      fix: 'Run the knowledge sync step for this package (scripts/sync-knowledge-lib.mjs) and rebuild; the row ships authored pages, not vendor text.',
    },
  }
}

/** The `slc500_docs` tool, backed by the generated collection. */
export function slc500DocsTool(_ctx: PluginContext): ToolDefinition {
  return {
    name: 'slc500_docs',
    description: DOCS_DESCRIPTION,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['contents', 'search', 'read', 'status', 'lookup'], description: 'Which docs action to run: contents lists collections or one collection section table of contents; search ranks pages for a query; read returns one page; status reports which corpus is readable; lookup resolves an exact identifier.' },
        query: { type: 'string', description: 'Search words for search, or an exact identifier, address or mnemonic for lookup.' },
        id: { type: 'string', description: 'Page id for read.' },
        collection: { type: 'string', description: `Collection id, default ${COLLECTION}.` },
        revision: { type: 'string', description: 'Optional program revision or publication revision, e.g. 12.00.00.' },
        limit: { type: 'number', description: 'Maximum hits or contents rows (1-8, default 5).' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const core = await loadCore()
        const tool = core.createDocsTool({
          name: 'slc500_docs',
          description: DOCS_DESCRIPTION,
          collections: [{ id: COLLECTION }],
          logger: { warn: (_message: string) => undefined },
        })
        return await tool.execute(args as Readonly<Record<string, unknown>>, exec)
      } catch (error) {
        if (
          error instanceof Error &&
          /not built|did not export|Cannot find module|ERR_MODULE_NOT_FOUND|does not provide an export|Unexpected token/u.test(error.message)
        ) {
          return unavailable()
        }
        return {
          summary: 'The docs lookup failed.',
          data: { collection: COLLECTION },
          next: [],
          coverage: { complete: false, unverified: [] },
          error: {
            code: 'TOOL_UNAVAILABLE',
            message: error instanceof Error ? error.message : String(error),
            fix: 'Rebuild the package after the knowledge sync step and retry; the corpus is offline and read-only.',
          },
        }
      }
    },
  }
}

/** The factory shape the row entry expects: exactly one tool. */
export function docsTools(ctx: PluginContext): ToolDefinition[] {
  return [slc500DocsTool(ctx)]
}
