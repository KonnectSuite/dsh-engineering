#!/usr/bin/env node
/**
 * Derive FactoryTalk Optix's type vocabulary from the installed Studio reference.
 *
 * Studio ships a version-locked API reference under `Help\en\Reference`: one page
 * per object type, data type and variable type, each carrying the BrowseName, the
 * SuperType, and tables of properties, methods and events. That reference is the
 * only asset that answers "what may I write on this object" before a single write
 * is attempted, and it needs no Studio session, no bridge and no licence.
 *
 * We do not redistribute the reference. This generator reads the installed copy
 * and writes identifiers only — type names, property BrowseNames, DataType names,
 * method signatures, event names and enum values. Rockwell's descriptive prose is
 * never copied; the property's own short label is kept as `display` when it
 * differs from the BrowseName, because that is the string Studio shows.
 *
 * Usage:
 *   node scripts/gen-optix-schema.mjs [--out <file>] [--help-dir <dir>] [--quiet]
 *
 * Environment:
 *   OPTIX_HELP_DIR   the `Help\en` folder to read instead of the newest install
 *
 * @module dsh-engineering/scripts/gen-optix-schema
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')

/** Where Studio installs its help, newest version last after sorting. */
const HELP_ROOTS = [
  'C:/Program Files/Rockwell Automation/FactoryTalk Optix',
  'C:/Program Files (x86)/Rockwell Automation/FactoryTalk Optix',
]

/** Namespaces the catalogs in `Reference\` are grouped under. */
const REFERENCE = 'Reference'

/** Sub-folders that hold a type page, and the kind each one means. */
const KINDS = new Map([
  ['ObjectTypes', 'object'],
  ['DataTypes', 'datatype'],
  ['VariableTypes', 'variable'],
])

/** Resolve the `Help\en` directory, honouring OPTIX_HELP_DIR. */
export function helpDir() {
  const override = process.env.OPTIX_HELP_DIR
  if (override !== undefined && override !== '') return resolve(override)
  const installed = []
  for (const root of HELP_ROOTS) {
    if (!existsSync(root)) continue
    for (const name of readdirSync(root)) {
      if (!/^Studio /u.test(name)) continue
      const candidate = join(root, name, 'Help', 'en')
      if (existsSync(join(candidate, REFERENCE))) installed.push(candidate)
    }
  }
  if (installed.length === 0) {
    throw new Error(`No FactoryTalk Optix help found under ${HELP_ROOTS.join(' or ')}. Set OPTIX_HELP_DIR to the Studio Help\\en folder.`)
  }
  const version = path => {
    const found = /Studio ([\d.]+)/u.exec(path)
    return found === null ? [0] : found[1].split('.').map(part => Number.parseInt(part, 10))
  }
  return installed.sort((left, right) => {
    const a = version(left)
    const b = version(right)
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      const delta = (a[index] ?? 0) - (b[index] ?? 0)
      if (delta !== 0) return delta
    }
    return 0
  }).at(-1)
}

/** Every `Reference\<Namespace>\<Kind>\<Name>.html` page. */
export function referencePages(dir) {
  const pages = []
  for (const namespace of readdirSync(join(dir, REFERENCE), { withFileTypes: true })) {
    if (!namespace.isDirectory()) continue
    for (const [folder, kind] of KINDS) {
      const kindDir = join(dir, REFERENCE, namespace.name, folder)
      if (!existsSync(kindDir)) continue
      for (const name of readdirSync(kindDir)) {
        if (!name.endsWith('.html')) continue
        pages.push({ namespace: namespace.name, kind, name: name.slice(0, -'.html'.length), path: join(kindDir, name) })
      }
    }
  }
  return pages.sort((left, right) => (left.namespace + left.kind + left.name).localeCompare(right.namespace + right.kind + right.name))
}

/** Strip markup and decode the entities Studio's single-page help emits. */
const ENTITIES = new Map([
  ['&lt;', '<'], ['&gt;', '>'], ['&quot;', '"'], ['&apos;', "'"], ['&amp;', '&'], ['&nbsp;', ' '],
])

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/giu, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&(lt|gt|quot|apos|amp|nbsp);/gu, (whole) => ENTITIES.get(whole) ?? whole)
}

/** Visible text of one HTML fragment, collapsed. */
export function textOf(html) {
  return decodeEntities(html.replace(/<[^>]*>/gu, ' ')).replace(/\s+/gu, ' ').trim()
}

/** Every row of one `<table>`, each cell's raw HTML. */
function tableRows(table) {
  const body = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/u.exec(table)
  const scope = body === null ? table : body[1]
  return [...scope.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gu)].map(row =>
    [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gu)].map(cell => cell[1]),
  )
}

/** Column names of one `<table>`. */
function tableHead(table) {
  const head = /<thead\b[^>]*>([\s\S]*?)<\/thead>/u.exec(table)
  if (head === null) return []
  return [...head[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gu)].map(cell => textOf(cell[1]))
}

/** The first `<table>` in a fragment. */
function firstTable(html) {
  const found = /<table\b[\s\S]*?<\/table>/u.exec(html)
  return found === null ? undefined : found[0]
}

/**
 * Cells of one row aligned to the header.
 *
 * Studio's pages carry two empty `<td>` cells in front of every data row (they
 * hold the expand affordance), so a row can be longer than the header. The real
 * values are always the *last* `head.length` cells, which also keeps a genuinely
 * empty trailing description cell in place.
 */
function align(cells, headLength) {
  if (cells.length <= headLength) return cells
  return cells.slice(cells.length - headLength)
}

/**
 * The href a cell points at, when it points at a reference page.
 *
 * A page links to a sibling with a bare `X.html` and to another namespace with a
 * path, so both shapes have to resolve; a bare link is reported as `relative` and
 * settled against the parsed catalog, because only the caller knows which folder
 * the current page lives in.
 */
function linkedType(cell) {
  const href = /href="([^"]+)"/u.exec(cell)
  if (href === null) return undefined
  const found = /\/(ObjectTypes|DataTypes|VariableTypes)\/([^/"#]+)\.html$/u.exec(href[1])
  if (found !== null) {
    const kind = found[1] === 'VariableTypes' ? 'variable' : found[1] === 'ObjectTypes' ? 'object' : 'datatype'
    return { kind, name: found[2] }
  }
  const sibling = /^([^/"#]+)\.html$/u.exec(href[1])
  return sibling === null ? undefined : { kind: 'relative', name: sibling[1] }
}

/** The name of the page a fragment links to, when it links to one. */
function linkedPageName(html) {
  const href = /href="([^"]+\.html)"/u.exec(html)
  if (href === null) return undefined
  const found = /(?:^|\/)([^/"#]+)\.html$/u.exec(href[1])
  return found === null ? undefined : found[1]
}

/** `dt`/`dd` pairs of the summary list under the title. */
function summary(html) {
  const pairs = new Map()
  const pattern = /<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gu
  for (const match of html.matchAll(pattern)) {
    const key = textOf(match[1])
    if (key === '' || pairs.has(key)) continue
    pairs.set(key, match[2])
  }
  return pairs
}

/** The SuperType name: the linked page when there is one, else the label. */
export function superTypeOf(cell) {
  if (cell === undefined) return undefined
  const href = /href="([^"]+)"\s*(?:title="[^"]*")?[^>]*>([^<]*)<\/a>/u.exec(cell)
  if (href !== null && href[2].trim() !== '') return href[2].trim()
  return textOf(cell).replace(/\s*\([^)]*\)\s*$/u, '').trim() || undefined
}

/** The `<h2>` section with this heading, or ''. */
function section(html, heading) {
  const start = new RegExp(`<h2\\b[^>]*>\\s*${heading}\\s*</h2>`, 'u').exec(html)
  if (start === null) return ''
  const from = start.index + start[0].length
  const next = /<h2\b[^>]*>/u.exec(html.slice(from))
  return next === null ? html.slice(from) : html.slice(from, from + next.index)
}

/**
 * Parse one object-type or variable-type page.
 *
 * Properties keep the BrowseName (what a write names), the datatype, whether it
 * is inherited, and — when the datatype is itself an object type — the child type
 * that may be created inside this one, which is the allowed-children edge.
 */
export function parseTypePage(html, { namespace, name, kind }) {
  const pairs = summary(html)
  const browseName = textOf(pairs.get('BrowseName') ?? '') || name
  const superType = superTypeOf(pairs.get('SuperType'))

  const properties = []
  const propertiesTable = firstTable(section(html, 'Properties'))
  if (propertiesTable !== undefined) {
    const head = tableHead(propertiesTable)
    const nameAt = head.indexOf('Name')
    const browseAt = head.indexOf('BrowseName')
    const typeAt = head.indexOf('DataType')
    const descriptionAt = head.indexOf('Description')
    for (const row of tableRows(propertiesTable)) {
      const cells = align(row, head.length)
      const display = nameAt === -1 ? '' : textOf(cells[nameAt] ?? '')
      const property = browseAt === -1 ? display : textOf(cells[browseAt] ?? '')
      if (property === '') continue
      // The DataType cell's own link names the type; its anchor text is a label,
      // so the link wins ("Horizontal alignment" is really HorizontalAlignmentEnum).
      const linked = typeAt === -1 ? undefined : linkedType(cells[typeAt] ?? '')
      const dataType = linked?.name ?? (typeAt === -1 ? undefined : textOf(cells[typeAt] ?? '').replace(/\s*\([^)]*\)\s*$/u, '').trim() || undefined)
      const description = descriptionAt === -1 ? '' : textOf(cells[descriptionAt] ?? '')
      const inherited = /^\(Inherited from/iu.test(description)
      properties.push({
        name: property,
        ...(display !== '' && display !== property ? { display } : {}),
        ...(dataType === undefined ? {} : { dataType }),
        ...(inherited ? { inherited: true } : {}),
        ...(linked === undefined || linked.kind === 'datatype' ? {} : { child: linked.name, childKind: linked.kind }),
      })
    }
  }

  const methods = []
  for (const chunk of section(html, 'Methods').split(/<div class="- topic\/sectiondiv sectiondiv">/u)) {
    const browse = /<dt\b[^>]*>BrowseName<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/u.exec(chunk)
    if (browse === null) continue
    const args = []
    const tables = [...chunk.matchAll(/<table\b[\s\S]*?<\/table>/gu)].map(match => match[0])
    const table = tables.find(candidate => candidate.includes('InputArguments')) ?? tables[0]
    if (table !== undefined) {
      const head = tableHead(table)
      const nameAt = head.indexOf('Name')
      const typeAt = head.indexOf('DataType')
      for (const row of tableRows(table)) {
        const cells = align(row, head.length)
        const argument = nameAt === -1 ? '' : textOf(cells[nameAt] ?? '')
        if (argument === '') continue
        const linked = typeAt === -1 ? undefined : linkedType(cells[typeAt] ?? '')
        const dataType = linked?.name ?? (typeAt === -1 ? '' : textOf(cells[typeAt] ?? ''))
        args.push({ name: argument, ...(dataType === '' ? {} : { dataType }) })
      }
    }
    methods.push({ name: textOf(browse[1]), ...(args.length === 0 ? {} : { args }) })
  }

  const events = []
  for (const chunk of section(html, 'Events').split(/<div class="- topic\/sectiondiv sectiondiv">/u)) {
    const browse = /<dt\b[^>]*>BrowseName<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/u.exec(chunk)
    if (browse === null) continue
    // The event's own type page is what a handler is wired to ("MouseClickEvent"),
    // while the anchor text is the label Studio shows ("MouseDown event").
    const name = linkedPageName(browse[1]) ?? textOf(browse[1])
    const display = textOf(browse[1])
    if (name === '') continue
    events.push(display === '' || display === name ? name : { name, display })
  }

  return {
    namespace,
    browseName,
    kind,
    ...(superType === undefined ? {} : { superType }),
    ...(properties.length === 0 ? {} : { properties }),
    ...(methods.length === 0 ? {} : { methods }),
    ...(events.length === 0 ? {} : { events }),
  }
}

/** Parse one data-type page: an enum's values with their numbers. */
export function parseEnumPage(html, { namespace, name }) {
  const pairs = summary(html)
  const browseName = textOf(pairs.get('BrowseName') ?? '') || name
  const table = firstTable(section(html, 'Values')) ?? firstTable(html)
  const values = []
  if (table !== undefined) {
    const head = tableHead(table)
    const valueAt = head.indexOf('Value')
    const displayAt = head.indexOf('DisplayName')
    if (valueAt !== -1 && displayAt !== -1) {
      for (const row of tableRows(table)) {
        const cells = align(row, head.length)
        const value = textOf(cells[valueAt] ?? '')
        const display = textOf(cells[displayAt] ?? '')
        if (value === '' || display === '') continue
        const numeric = Number(value)
        values.push({ value: Number.isNaN(numeric) ? value : numeric, name: display })
      }
    }
  }
  return { namespace, browseName, kind: 'enum', values }
}

/** Build the catalog object from a help directory. */
export function buildSchema(dir = helpDir()) {
  const types = {}
  const enums = {}
  const variableTypes = {}
  const dataTypes = {}
  const skipped = []
  const version = /Studio ([\d.]+)/u.exec(dir)
  const pages = referencePages(dir)
  for (const page of pages) {
    const html = readFileSync(page.path, 'utf8')
    if (page.kind === 'datatype') {
      const parsed = parseEnumPage(html, page)
      // Every DataTypes page names a type the model may carry, even when the page
      // has no value table (the OPC UA structs are stubs), so the catalog keeps the
      // name for validation and "did you mean" while only enums get values.
      dataTypes[parsed.browseName] = {
        namespace: page.namespace,
        ...(parsed.values.length === 0 ? { kind: 'type' } : { kind: 'enum', values: parsed.values }),
      }
      if (parsed.values.length > 0) enums[parsed.browseName] = { namespace: page.namespace, values: parsed.values }
      continue
    }
    const parsed = parseTypePage(html, page)
    if (parsed.properties === undefined && parsed.methods === undefined && parsed.events === undefined && parsed.superType === undefined) {
      skipped.push(`${page.namespace}/${page.name}`)
      continue
    }
    if (page.kind === 'variable') {
      variableTypes[parsed.browseName] = parsed
      continue
    }
    types[parsed.browseName] = parsed
  }
  // Settle the child edges now that every type is known: a property whose type is
  // an object type may hold instances of it, and that is the allowed-children
  // graph a `create_widget` lookup needs. A bare sibling link counts when the
  // target is a type this catalog actually holds.
  for (const entry of [...Object.values(types), ...Object.values(variableTypes)]) {
    const children = new Set()
    for (const property of entry.properties ?? []) {
      if (property.childKind === undefined) continue
      const resolvable = property.childKind === 'object' || (property.childKind === 'relative' && types[property.child] !== undefined)
      if (!resolvable) continue
      children.add(property.child)
      property.childKind = 'object'
    }
    if (children.size > 0) entry.children = [...children].sort()
  }
  return {
    schemaVersion: 1,
    studioVersion: version === null ? 'unknown' : version[1],
    generatedFrom: dir.replaceAll('\\', '/'),
    counts: {
      types: Object.keys(types).length,
      variableTypes: Object.keys(variableTypes).length,
      dataTypes: Object.keys(dataTypes).length,
      enums: Object.keys(enums).length,
      pages: pages.length,
      skipped: skipped.length,
    },
    types,
    variableTypes,
    dataTypes,
    enums,
    skipped: skipped.sort(),
  }
}

/** Write the catalog, then report what was written. */
function main(argv) {
  const at = argv.indexOf('--out')
  const dirAt = argv.indexOf('--help-dir')
  const out = resolve(at === -1 ? join(repo, 'packages/optix/schema/optix-schema.json') : argv[at + 1])
  const dir = dirAt === -1 ? helpDir() : resolve(argv[dirAt + 1])
  const schema = buildSchema(dir)
  const json = `${JSON.stringify(schema)}\n`
  writeFileSync(out, json, 'utf8')
  if (!argv.includes('--quiet')) {
    const counts = schema.counts
    process.stdout.write(
      `gen-optix-schema: wrote ${(json.length / 1024).toFixed(0)} KB to ${out}\n` +
        `  Studio ${schema.studioVersion}: ${counts.types} object types, ${counts.variableTypes} variable types, ${counts.enums} enums (${counts.pages} reference pages, ${counts.skipped} without tables)\n`,
    )
  }
  return schema
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2))
