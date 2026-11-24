#!/usr/bin/env node
/**
 * Generate the display vocabulary both preview painters read.
 *
 * The preview used to keep its own list of element names. That list drifted to
 * 34 names while the installed schema declares 91, so 57 real objects — an arc,
 * a rounded rectangle, a keypad key, an audit trail list — were dropped without
 * a trace and the blank space looked authored.
 *
 * The snapshot at `packages/ftview/schema/me-schema.json` is already generated
 * from the vendor's `Gfx-ME*.xsd` (see `pnpm schema:ftview`). This script reads
 * that snapshot and writes one compact module per package that paints displays:
 *
 *   packages/ftview-viewer/src/vocabulary.generated.ts   the browser face
 *   packages/ftview/src/render-vocabulary.generated.ts   the ftview_render tool
 *
 * Two copies, not one shared module: the packages build with `rootDir: src`, so
 * a cross-package import either breaks the build or makes one package's runtime
 * path depend on the other's vendored layout. One generator plus
 * `test/render-conformance.spec.ts` keeps the copies equal; a comment in each
 * painter says so.
 *
 * Usage:
 *   node scripts/gen-ftview-viewer-vocabulary.mjs           # write both
 *   node scripts/gen-ftview-viewer-vocabulary.mjs --check   # fail when stale
 *
 * The output is deterministic: element and part names sorted, attribute lists
 * sorted, no timestamp, so regenerating an unchanged schema rewrites identical
 * bytes and the freshness test can compare them.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SCHEMA_FILE = join(ROOT, 'packages', 'ftview', 'schema', 'me-schema.json')
const TARGETS = [
  join(ROOT, 'packages', 'ftview-viewer', 'src', 'vocabulary.generated.ts'),
  join(ROOT, 'packages', 'ftview', 'src', 'render-vocabulary.generated.ts'),
]

/**
 * Painter families, most specific first.
 *
 * A family is how the object is drawn, not what it is called: every element in
 * the ME schema descends from `objectBaseType`, so anything unmatched still
 * paints as a labelled box rather than disappearing.
 */
const FAMILY_RULES = [
  ['line', chain => chain.includes('basicLineDrawingObjectType')],
  ['path', chain => chain.includes('basicPathDrawingObjectType')],
  ['polygon', chain => chain.includes('basicPolygonDrawingObjectType')],
  ['polyPolygon', chain => chain.includes('basicPolyPolygonDrawingObjectType')],
  ['angle', chain => chain.includes('basicAngleDrawingObjectType')],
  ['ellipse', chain => chain.includes('basicRotationDrawingObjectType')],
  ['roundedRectangle', chain => chain.includes('basicRoundedRectangleDrawingObjectType')],
  ['rectangle', chain => chain.includes('basicDrawingObjectType')],
  ['text', chain => chain.includes('basicTextDrawingObjectType')],
  ['image', chain => chain.includes('imageDrawingObjectType')],
  ['group', chain => chain.includes('groupType')],
  ['panel', chain => chain.includes('panelDrawingObjectType')],
  ['button', chain => [
    'simpleButtonType',
    'pushButtonValueType',
    'multistateButtonType',
    'keyButtonType',
    'rampButtonType',
    'interlockedButtonType',
    'linkedButtonType',
  ].some(base => chain.includes(base))],
  ['indicator', chain => ['multistateIndicatorType', 'symbolIndicatorType', 'listIndicatorType'].some(base => chain.includes(base))],
  ['chart', chain => ['barGraphType', 'gaugeType', 'scaleType'].some(base => chain.includes(base))],
  ['list', chain => [
    'alarmListType',
    'alarmBannerType',
    'alarmStatusListType',
    'diagnosticsListType',
    'auditTrailListType',
    'auditTrailDetailType',
    'recipePlusTableType',
    'recipePlusSelectorType',
    'controlListSelectorType',
    'pilotedControlListSelectorType',
    'displayListSelectorType',
    'messageDisplayType',
  ].some(base => chain.includes(base))],
  ['field', chain => [
    'numericDisplayType',
    'numericInputEnableType',
    'numericInputCursorPointType',
    'stringDisplayType',
    'stringInputEnableType',
    'timeAndDateDisplayType',
    'localMessageDisplayType',
  ].some(base => chain.includes(base))],
  ['activeX', chain => chain.includes('activeXObjectType')],
]

/** Every family the generated module can name, in painter order. */
const FAMILIES = [...FAMILY_RULES.map(([family]) => family), 'box']

/** The base types of a type name, deepest last. */
function chainOf(schema, typeName) {
  const chain = []
  const seen = new Set()
  let current = typeName
  while (typeof current === 'string' && current !== '' && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    const type = schema.types[current]
    current = type === undefined ? undefined : type.base
  }
  return chain
}

/** The painter family of a type name. */
function familyOf(schema, typeName) {
  const chain = chainOf(schema, typeName)
  for (const [family, matches] of FAMILY_RULES) {
    if (matches(chain)) return family
  }
  return 'box'
}

/** One node's facts, or `undefined` when the schema does not describe it. */
function factsOf(schema, typeName) {
  const type = schema.types[typeName]
  if (type === undefined) return undefined
  return {
    type: typeName,
    family: familyOf(schema, typeName),
    attributes: Object.keys(type.attributes).sort(),
    children: [...type.children].sort(),
    requiredChildren: [...type.requiredChildren].sort(),
  }
}

/** A TypeScript object literal for one facts record. */
function record(facts) {
  const fields = [
    `type: ${quote(facts.type)}`,
    `family: ${quote(facts.family)}`,
  ]
  fields.push(`attributes: [${facts.attributes.map(quote).join(', ')}]`)
  fields.push(`children: [${facts.children.map(quote).join(', ')}]`)
  fields.push(`requiredChildren: [${facts.requiredChildren.map(quote).join(', ')}]`)
  return `{ ${fields.join(', ')} }`
}

/** A single-quoted TypeScript string. */
function quote(value) {
  return `'${value.replace(/\\/gu, '\\\\').replace(/'/gu, "\\'")}'`
}

/** The generated module body. */
function render(schema) {
  const elements = Object.keys(schema.elements).sort()
  const parts = schema.parts
    .filter(name => schema.types[`${name}Type`] !== undefined)
    .sort()
  const lines = []
  lines.push('/**')
  lines.push(' * The FactoryTalk View ME display vocabulary, generated.')
  lines.push(' *')
  lines.push(` * Source: \`packages/ftview/schema/me-schema.json\` (${schema.schema}, ${elements.length} element(s)).`)
  lines.push(' * Regenerate with `pnpm schema:ftview:vocabulary`; `packages/ftview-viewer/test/vocabulary.spec.mjs`')
  lines.push(' * fails when this file and the snapshot disagree, so never hand-edit it.')
  lines.push(' *')
  lines.push(' * `family` is how the object is drawn: every ME element descends from')
  lines.push(' * `objectBaseType`, so `box` is the floor and no element is ever dropped.')
  lines.push(' *')
  lines.push(' * @module')
  lines.push(' */')
  lines.push('')
  lines.push(`/** The vendor schema this vocabulary was derived from. */`)
  lines.push(`export const SCHEMA = ${quote(schema.schema)}`)
  lines.push('')
  lines.push(`/** The schema version number, as the vendor names it. */`)
  lines.push(`export const SCHEMA_VERSION = ${schema.version}`)
  lines.push('')
  lines.push(`/** How many display elements the schema declares. */`)
  lines.push(`export const ELEMENT_COUNT = ${elements.length}`)
  lines.push('')
  lines.push('/** How an object is drawn. */')
  lines.push(`export const FAMILIES = [${FAMILIES.map(quote).join(', ')}] as const`)
  lines.push('')
  lines.push('/** One family name. */')
  lines.push(`export type Family = (typeof FAMILIES)[number]`)
  lines.push('')
  lines.push('/** What the schema says about one element or part. */')
  lines.push('export interface NodeFacts {')
  lines.push('  readonly type: string')
  lines.push('  readonly family: Family')
  lines.push('  readonly attributes: readonly string[]')
  lines.push('  readonly children: readonly string[]')
  lines.push('  readonly requiredChildren: readonly string[]')
  lines.push('}')
  lines.push('')
  lines.push('/** Every display element the schema declares, by element name. */')
  lines.push('export const ELEMENTS: Readonly<Record<string, NodeFacts>> = {')
  for (const name of elements) {
    const facts = factsOf(schema, schema.elements[name])
    if (facts === undefined) continue
    lines.push(`  ${quote(name)}: ${record(facts)},`)
  }
  lines.push('}')
  lines.push('')
  lines.push('/** The schema-defined parts, by part name (the rest are read generically). */')
  lines.push('export const PARTS: Readonly<Record<string, NodeFacts>> = {')
  for (const name of parts) {
    const facts = factsOf(schema, `${name}Type`)
    if (facts === undefined) continue
    lines.push(`  ${quote(name)}: ${record(facts)},`)
  }
  lines.push('}')
  lines.push('')
  lines.push('/**')
  lines.push(' * Every part name the schema declares, typed or not.')
  lines.push(' *')
  lines.push(' * A part is a child element, never an object: `<caption>`, `<imageSettings>`,')
  lines.push(' * `<threshold>` and `<innerPolygon>` are parts of the object around them. A')
  lines.push(' * renderer that tells objects from parts by a hand-kept list of names ends up')
  lines.push(' * drawing a `<caption>` as a box of its own — measured on a real export, where')
  lines.push(' * 19 objects became 41 drawn shapes and every caption was reported as an')
  lines.push(' * unknown element. This list is the schema\'s answer, so the set cannot drift.')
  lines.push(' */')
  lines.push(`export const PART_NAMES: readonly string[] = [${schema.parts.slice().sort().map(quote).join(', ')}]`)
  lines.push('')
  lines.push('/** The facts for one element, or `undefined` when the schema does not name it. */')
  lines.push('export function elementFacts(name: string): NodeFacts | undefined {')
  lines.push('  return Object.hasOwn(ELEMENTS, name) ? ELEMENTS[name] : undefined')
  lines.push('}')
  lines.push('')
  lines.push('/** The facts for one part, or `undefined` when it is read generically. */')
  lines.push('export function partFacts(name: string): NodeFacts | undefined {')
  lines.push('  return Object.hasOwn(PARTS, name) ? PARTS[name] : undefined')
  lines.push('}')
  lines.push('')
  lines.push('/** Whether the schema declares one attribute on a node. */')
  lines.push('export function declaresAttribute(node: string, attribute: string): boolean {')
  lines.push('  const facts = elementFacts(node) ?? partFacts(node)')
  lines.push('  return facts !== undefined && facts.attributes.includes(attribute)')
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

const check = process.argv.includes('--check')
if (!existsSync(SCHEMA_FILE)) {
  console.error(`gen-ftview-viewer-vocabulary: ${relative(ROOT, SCHEMA_FILE)} is missing. Run pnpm schema:ftview first.`)
  process.exit(1)
}
const schema = JSON.parse(readFileSync(SCHEMA_FILE, 'utf8'))
const body = render(schema)
const stale = []
for (const target of TARGETS) {
  const current = existsSync(target) ? readFileSync(target, 'utf8').replace(/\r\n/gu, '\n') : ''
  if (current === body) continue
  if (check) {
    stale.push(relative(ROOT, target))
    continue
  }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, body, 'utf8')
}
if (stale.length > 0) {
  console.error(`gen-ftview-viewer-vocabulary: stale against ${relative(ROOT, SCHEMA_FILE)}:\n  ${stale.join('\n  ')}\nRun pnpm schema:ftview:vocabulary.`)
  process.exit(1)
}
const elements = Object.keys(schema.elements).length
if (check) console.log(`gen-ftview-viewer-vocabulary: up to date (${elements} element(s)).`)
else console.log(`gen-ftview-viewer-vocabulary: wrote ${TARGETS.length} file(s) for ${elements} element(s), ${body.length} bytes each.`)
