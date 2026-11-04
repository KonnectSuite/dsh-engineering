/**
 * Generate the engineering bundle's tool reference from the registered tool
 * definitions.
 *
 * The reference is derived, never hand-maintained: every description and
 * parameter row is read from the same factory the plugins register at runtime,
 * so a renamed tool or a changed argument cannot drift from its documentation.
 *
 * Usage:
 *   pnpm docs:tools            write docs/reference/tools.md and tools.json
 *   pnpm docs:tools -- --check fail when either file is stale
 *
 * @module scripts/gen-tool-reference
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readTools } from '../packages/l5x/src/tools/read.ts'
import { referenceTools } from '../packages/l5x/src/tools/references.ts'
import { checkTools } from '../packages/l5x/src/tools/checks.ts'
import { documentTools } from '../packages/l5x/src/tools/document.ts'
import { previewTools } from '../packages/l5x/src/tools/preview.ts'
import { diagramTools } from '../packages/l5x/src/tools/diagram.ts'
import { draftTools } from '../packages/l5x/src/tools/drafts.ts'
import { studioTools as l5xStudioTools } from '../packages/l5x/src/tools/studio.ts'
import { controllerTools } from '../packages/l5x/src/tools/controller.ts'
import { liveTools } from '../packages/l5x/src/tools/live.ts'
import { ftviewTools } from '../packages/ftview/src/tools.ts'
import { resourceTools } from '../packages/resources/src/tools.ts'
import { migrationTools } from '../packages/migration/src/tools.ts'
import { vendorTools } from '../packages/ftview/src/vendor-tools.ts'
import { editTools } from '../packages/ftview/src/edit/tools.ts'
import { studioTools as ftviewStudioTools } from '../packages/ftview/src/studio/tools.ts'
import { sessionTools as mwiSessionTools } from '../packages/mwi/src/tools/session.ts'
import { readTools as mwiReadTools } from '../packages/mwi/src/tools/read.ts'
import { verifyTools as mwiVerifyTools } from '../packages/mwi/src/tools/verify.ts'
import { editTools as mwiEditTools } from '../packages/mwi/src/tools/edit.ts'
import { ecadDeliverTools, ecadDraftTools, ecadReadTools } from '../packages/ecad/src/tools/index.ts'
import type { Parameters } from '../packages/l5x/src/core/params.ts'
import type { ToolDefinition } from '../packages/l5x/src/core/tool.ts'

/** One documented tool. */
export interface ToolRow {
  readonly name: string
  readonly description: string
  readonly parameters: Parameters
}

/** One section of the reference. */
export interface ToolGroup {
  readonly group: string
  readonly product: 'L5X' | 'FactoryTalk View' | 'MotionWorks IEC' | 'ECAD' | 'Engineering resources' | 'Migration'
  readonly blurb: string
  readonly tools: readonly ToolRow[]
}

/** Group metadata, in registration order. */
const GROUPS: readonly { group: string; product: 'L5X' | 'FactoryTalk View' | 'MotionWorks IEC' | 'ECAD' | 'Engineering resources' | 'Migration'; blurb: string }[] = [
  { group: 'L5X read', product: 'L5X', blurb: 'Open a Studio 5000 L5X export and read its structure and components.' },
  { group: 'L5X references', product: 'L5X', blurb: 'Follow a symbol through exported logic without opening every routine.' },
  { group: 'L5X checks', product: 'L5X', blurb: 'Evidence-backed structural checks and export comparison.' },
  { group: 'L5X documentation', product: 'L5X', blurb: 'The instruction catalog the composer validates, and the handover bundle written to a new folder.' },
  { group: 'L5X preview', product: 'L5X', blurb: 'Render proposed rungs as a viewer document so a chat answer shows ladder, not NeutralText.' },
  { group: 'L5X diagrams', product: 'L5X', blurb: 'Draw existing routines, or the whole project, as a schematic page.' },
  { group: 'L5X drafts', product: 'L5X', blurb: 'Stage edits in a chat draft. `draft_apply` writes one new L5X beside the source and never overwrites it.' },
  { group: 'L5X Studio SDK', product: 'L5X', blurb: 'Logix Designer SDK: export, verify, build and evidence review. Requires Studio 5000 and the SDK service.' },
  { group: 'L5X controller', product: 'L5X', blurb: 'Supervised controller access. Upload, mode changes and downloads require per-call human approval.' },
  { group: 'L5X live', product: 'L5X', blurb: 'Direct EtherNet/IP reads with no Studio, FactoryTalk Linx or ACD snapshot.' },
  { group: 'Migration', product: 'Migration', blurb: 'Assess a legacy RSLogix 500 export and lint the .L5K a migration wizard writes. Offline file readers; no controller and no claim that a file is migrated.' },
  { group: 'Engineering resources', product: 'Engineering resources', blurb: 'The local standards corpus and the house-style profile read from the open project. No network, no model calls.' },
  { group: 'ECAD read', product: 'ECAD', blurb: 'Probe the drawing engine, confirm the set profile, index the sheets, then open, read, review, cross-reference, render and compare DXF (and DWG through the embedded converter) drawings with stated coverage.' },
  { group: 'ECAD drafts', product: 'ECAD', blurb: 'Stage print edits and prove them: `draft_ops` validates and stages, `draft_apply` writes one NEW drawing beside the source, and `draft_discard`/`verify` close the loop. Requires the row write switch.' },
  { group: 'ECAD deliverables', product: 'ECAD', blurb: 'Write a review/documentation bundle and back up source drawings into the shared `backups/ecad/` tree. Both name their own new output.' },
  { group: 'FTView read', product: 'FactoryTalk View', blurb: 'Open a FactoryTalk View ME export and read displays and HMI tags.' },
  { group: 'FTView edit', product: 'FactoryTalk View', blurb: 'Stage display and tag edits. `ftview_apply` writes a new export folder and leaves the source untouched.' },
  { group: 'FTView Studio', product: 'FactoryTalk View', blurb: 'Plan the manual FactoryTalk View Studio import for changed displays.' },
  { group: 'MWI session', product: 'MotionWorks IEC', blurb: 'Find and stage a workspace project, then start, inspect and close the IDE.' },
  { group: 'MWI read', product: 'MotionWorks IEC', blurb: 'Read the saved project model, code, references, review evidence and installed help.' },
  { group: 'MWI verify', product: 'MotionWorks IEC', blurb: 'Compile, read the IDE output panes and compare saved-source baselines.' },
  { group: 'MWI edit', product: 'MotionWorks IEC', blurb: 'On by default. Code, declarations, structure, block insertion and POU packages, each verified against saved and native state.' },
]

const stub = {} as never

/**
 * Collect every tool definition the bundle registers, grouped for the reference.
 *
 * @returns One row per tool, in registration order.
 */
export function collectTools(): readonly ToolGroup[] {
  const source: readonly (readonly [string, readonly ToolDefinition[]])[] = [
    ['L5X read', readTools(stub)],
    ['L5X references', referenceTools(stub)],
    ['L5X checks', checkTools(stub)],
    ['L5X documentation', documentTools(stub)],
    ['L5X preview', previewTools(stub)],
    ['L5X diagrams', diagramTools(stub)],
    ['L5X drafts', draftTools(stub, stub, 100, 1 << 30)],
    ['L5X Studio SDK', l5xStudioTools(stub, stub)],
    ['L5X controller', controllerTools(stub, stub, stub)],
    ['L5X live', liveTools(stub, stub, stub, { transactions: stub, allowWrites: false, maxBatchTags: 64 })],
    ['Engineering resources', resourceTools(() => undefined)],
    ['ECAD read', ecadReadTools(stub)],
    ['ECAD drafts', ecadDraftTools(stub)],
    ['ECAD deliverables', ecadDeliverTools(stub)],
    ['Migration', migrationTools(stub)],
    ['FTView read', [...ftviewTools(stub), ...vendorTools(stub)]],
    ['FTView edit', editTools(stub, stub, stub, 100)],
    ['FTView Studio', ftviewStudioTools(stub, [])],
    ['MWI session', mwiSessionTools(stub)],
    ['MWI read', mwiReadTools(stub)],
    ['MWI verify', mwiVerifyTools(stub)],
    ['MWI edit', mwiEditTools(stub)],
  ]
  const byGroup = new Map(source.map(([group, tools]) => [group, tools]))
  return GROUPS.map(meta => ({
    ...meta,
    tools: (byGroup.get(meta.group) ?? []).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Parameters,
    })),
  }))
}

/** Escape a pipe inside a Markdown table cell. */
function cell(text: string): string {
  return text.replaceAll('|', '\\|')
}

/**
 * Characters the model pays for one registered definition.
 *
 * The definition the host sends is its name, its description and its parameter
 * schema; this is the same value as JSON with no whitespace, so it tracks a
 * wording change as faithfully as a new tool.
 *
 * @param tool - One documented tool.
 * @returns The character count of its model-visible definition.
 */
function definitionCharacters(tool: ToolRow): number {
  return JSON.stringify({ name: tool.name, description: tool.description, parameters: tool.parameters }).length
}

/**
 * Characters the model pays for every tool in one group.
 *
 * @param group - Tool group in registration order.
 * @returns The summed definition characters.
 */
function groupCharacters(group: ToolGroup): number {
  return group.tools.reduce((total, tool) => total + definitionCharacters(tool), 0)
}

/** Render one parameter type, including literal choices. */
function typeOf(schema: Readonly<Record<string, unknown>>): string {
  const type = typeof schema.type === 'string' ? schema.type : 'value'
  const choices = Array.isArray(schema.enum) ? schema.enum.map(String) : []
  return choices.length > 0 ? `${type} (${choices.join(' | ')})` : type
}

/**
 * Render the Markdown reference.
 *
 * @param groups - Tool groups in registration order.
 * @returns The complete document.
 */
export function renderMarkdown(groups: readonly ToolGroup[]): string {
  const total = groups.reduce((sum, group) => sum + group.tools.length, 0)
  const characters = groups.reduce((sum, group) => sum + groupCharacters(group), 0)
  const products = [...new Set(groups.map(group => group.product))]
  const lines: string[] = [
    '# Tool reference',
    '',
    '<!-- Generated by `pnpm docs:tools` from the registered tool definitions. Do not edit by hand. -->',
    '',
    `The engineering bundle registers **${total} tools** for ${products.join(' and ')}. Each tool answers with a summary,`,
    'structured data and suggested next calls; expected failures return a code, a message and a fix.',
    `Those ${total} definitions total **${characters} characters** of model-visible JSON — name, description and`,
    'parameter schema — which is the cost the [component contract](components.md) budgets for a default-on row.',
    'See [Examples](../examples.md) for end-to-end usage and the [README](../../README.md) for components and switches.',
    '',
    '| Product | Group | Tools |',
    '|---|---|---|',
  ]
  for (const group of groups) {
    lines.push(`| ${group.product} | ${group.group} | ${group.tools.length} |`)
  }
  for (const product of products) {
    lines.push('', `## ${product}`, '')
    for (const group of groups.filter(entry => entry.product === product)) {
      lines.push(`### ${group.group}`, '', group.blurb, '')
      for (const tool of group.tools) {
        lines.push(`#### \`${tool.name}\``, '', tool.description, '')
        const properties = tool.parameters.properties as Readonly<Record<string, Readonly<Record<string, unknown>>>>
        const required = new Set(tool.parameters.required ?? [])
        const names = Object.keys(properties)
        if (names.length === 0) {
          lines.push('No parameters.', '')
          continue
        }
        lines.push('| Parameter | Type | Required | Meaning |', '|---|---|---|---|')
        for (const name of names) {
          const schema = properties[name] ?? {}
          const description = typeof schema.description === 'string' ? schema.description : ''
          lines.push(`| \`${name}\` | ${cell(typeOf(schema))} | ${required.has(name) ? 'yes' : 'no'} | ${cell(description)} |`)
        }
        lines.push('')
      }
    }
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/**
 * Render the machine-readable inventory used by the policy tests.
 *
 * @param groups - Tool groups in registration order.
 * @returns JSON text.
 */
export function renderInventory(groups: readonly ToolGroup[]): string {
  const products = groups.map(group => ({
    product: group.product,
    group: group.group,
    tools: group.tools.map(tool => tool.name),
    contextChars: groupCharacters(group),
  }))
  const byProduct: Record<string, number> = {}
  for (const group of groups) byProduct[group.product] = (byProduct[group.product] ?? 0) + groupCharacters(group)
  const characters = Object.values(byProduct).reduce((total, value) => total + value, 0)
  return `${JSON.stringify({ tools: groups.flatMap(group => group.tools.map(tool => tool.name)), groups: products, context: { characters, byProduct } }, null, 2)}\n`
}

const referenceDir = fileURLToPath(new URL('../docs/reference/', import.meta.url))
const markdownPath = join(referenceDir, 'tools.md')
const inventoryPath = join(referenceDir, 'tools.json')

/** Write or check both generated files. */
async function main(): Promise<void> {
  const check = process.argv.includes('--check')
  const groups = collectTools()
  const markdown = renderMarkdown(groups)
  const inventory = renderInventory(groups)
  await mkdir(referenceDir, { recursive: true })
  if (check) {
    const stale: string[] = []
    for (const [path, expected] of [[markdownPath, markdown], [inventoryPath, inventory]] as const) {
      const actual = await readFile(path, 'utf8').catch(() => undefined)
      if (actual !== expected) stale.push(join(dirname(path), '') + path.split(/[\\/]/u).at(-1))
    }
    if (stale.length > 0) {
      console.error(`gen-tool-reference: stale ${stale.join(', ')}; run pnpm docs:tools`)
      process.exitCode = 1
      return
    }
    console.log('gen-tool-reference: reference is up to date.')
    return
  }
  await writeFile(markdownPath, markdown)
  await writeFile(inventoryPath, inventory)
  console.log(`gen-tool-reference: wrote ${groups.reduce((sum, group) => sum + group.tools.length, 0)} tools to docs/reference/.`)
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) await main()
