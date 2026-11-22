/**
 * The `plc5_docs` adapter.
 *
 * The retrieval engine is a source library: `packages/knowledge/src/core.ts` is copied
 * into `src/knowledge/core.ts` by `scripts/sync-knowledge-lib.mjs`, and the authored
 * corpus lives under `knowledge/plc5-program-text/` (index plus page bodies). The core
 * reads authored bodies itself through the package-root knowledge directory, so this
 * adapter only names the collection and the tool.
 *
 * @module dsh-engineering-plc5/docs
 */

import { createDocsTool } from './knowledge/core.js'
import type { PluginContext, ToolDefinition } from './core/tool.ts'

/** The authored collection this row ships. */
export const COLLECTION = 'plc5-program-text'

/** The docs tool name. */
export const DOCS_TOOL_NAME = 'plc5_docs'

/** What the docs tool answers, in the shape the registry shows the model. */
export const DOCS_DESCRIPTION =
  'Look up authored RSLogix 5 (PLC-5) program knowledge: the instruction families and their neutral text forms, rung and address grammar, chassis and remote I/O reading, the .PC5 text export grammar and its pitfalls, the six read-only text tools, and every failure code the row returns. Actions: contents, search, read, status, lookup. Authored pages ship with this bundle; vendor help is never shipped.'

/**
 * The one-tool factory the row entry expects.
 *
 * @param _ctx - Plugin context; the docs tool reads files itself and needs no service.
 * @returns The `plc5_docs` definition.
 */
export function docsTools(_ctx: PluginContext): ToolDefinition[] {
  const tool = createDocsTool({
    name: DOCS_TOOL_NAME,
    description: DOCS_DESCRIPTION,
    collections: [{ id: COLLECTION }],
    logger: { warn: (_message: string) => undefined },
  })
  // `DocsToolDefinition` and this package's `ToolDefinition` describe the same JSON
  // object. The docs library types `parameters` as its closed schema (no index
  // signature); the registry types any tool's parameters as an open record. This is a
  // widening of the same value, so the cast is the whole adaptation.
  return [{ ...tool, parameters: tool.parameters as unknown as ToolDefinition['parameters'] }]
}
