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
import { draftTools } from '../packages/l5x/src/tools/drafts.ts'
import { studioTools as l5xStudioTools } from '../packages/l5x/src/tools/studio.ts'
import { controllerTools } from '../packages/l5x/src/tools/controller.ts'
import { liveTools } from '../packages/l5x/src/tools/live.ts'
import { ftviewTools } from '../packages/ftview/src/tools.ts'
import { vendorTools } from '../packages/ftview/src/vendor-tools.ts'
import { editTools } from '../packages/ftview/src/edit/tools.ts'
import { studioTools as ftviewStudioTools } from '../packages/ftview/src/studio/tools.ts'
import { sessionTools as mwiSessionTools } from '../packages/mwi/src/tools/session.ts'
import { readTools as mwiReadTools } from '../packages/mwi/src/tools/read.ts'
import { verifyTools as mwiVerifyTools } from '../packages/mwi/src/tools/verify.ts'
import { editTools as mwiEditTools } from '../packages/mwi/src/tools/edit.ts'
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
  readonly product: 'L5X' | 'FactoryTalk View' | 'MotionWorks IEC'
  readonly blurb: string
  readonly tools: readonly ToolRow[]
}

/** Group metadata, in registration order. */
const GROUPS: readonly { group: string; product: 'L5X' | 'FactoryTalk View' | 'MotionWorks IEC'; blurb: string }[] = [
  { group: 'L5X read', product: 'L5X', blurb: 'Open a Studio 5000 L5X export and read its structure and components.' },
  { group: 'L5X references', product: 'L5X', blurb: 'Follow a symbol through exported logic without opening every routine.' },
  { group: 'L5X checks', product: 'L5X', blurb: 'Evidence-backed structural checks and export comparison.' },
  { group: 'L5X documentation', product: 'L5X', blurb: 'The instruction catalog the composer validates, and the handover bundle written to a new folder.' },
  { group: 'L5X drafts', product: 'L5X', blurb: 'Stage edits in a chat draft. `draft_apply` writes one new L5X beside the source and never overwrites it.' },
  { group: 'L5X Studio SDK', product: 'L5X', blurb: 'Logix Designer SDK: export, verify, build and evidence review. Requires Studio 5000 and the SDK service.' },
  { group: 'L5X controller', product: 'L5X', blurb: 'Supervised controller access. Upload, mode changes and downloads require per-call human approval.' },
  { group: 'L5X live', product: 'L5X', blurb: 'Direct EtherNet/IP reads with no Studio, FactoryTalk Linx or ACD snapshot.' },
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
    ['L5X drafts', draftTools(stub, stub, 100, 1 << 30)],
    ['L5X Studio SDK', l5xStudioTools(stub, stub)],
    ['L5X controller', controllerTools(stub, stub, stub)],
    ['L5X live', liveTools(stub, stub, stub, { transactions: stub, allowWrites: false, maxBatchTags: 64 })],
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
  const products = [...new Set(groups.map(group => group.product))]
  const lines: string[] = [
    '# Tool reference',
    '',
    '<!-- Generated by `pnpm docs:tools` from the registered tool definitions. Do not edit by hand. -->',
    '',
    `The engineering bundle registers **${total} tools** for ${products.join(' and ')}. Each tool answers with a summary,`,
    'structured data and suggested next calls; expected failures return a code, a message and a fix.',
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
  }))
  return `${JSON.stringify({ tools: groups.flatMap(group => group.tools.map(tool => tool.name)), groups: products }, null, 2)}\n`
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
