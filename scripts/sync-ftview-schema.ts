/**
 * Regenerate the FactoryTalk View display vocabulary snapshot.
 *
 * The drafting tools read the host's `Gfx-ME*.xsd` when Studio is installed and
 * fall back to the snapshot written here when it is not, so the snapshot is what
 * lets an agent draft on a machine without Rockwell software. It is generated,
 * never hand-edited: a hand-kept list of element types drifted until it offered
 * eight names no ME schema declares and refused sixty-five real ones.
 *
 * Usage:
 *   pnpm schema:ftview                     # newest installed Gfx-ME*.xsd
 *   pnpm schema:ftview -- --schema Gfx-ME15.xsd
 *   pnpm schema:ftview -- --dir "C:/path/to/Schemas" --out packages/ftview/schema/me-schema.json
 *
 * The snapshot records the schema file, its bytes and its sha256, so a checkout
 * says which vendor schema it was derived from and a mismatch is visible.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSchemaModel } from '../packages/ftview/src/xsd.ts'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

/** What the snapshot does not settle, written into the file itself. */
const COVERAGE =
  'Element names, attribute names, required attributes, enumerated values, value patterns and child elements, resolved through base types, attribute groups and global attribute references. Sequence order, occurrence counts and string-length facets are not enforced; Studio is the authority for those.'

/** One `--name value` pair from the command line. */
function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  return typeof value === 'string' && !value.startsWith('--') ? value : undefined
}

/** The schema directory: an explicit flag, the environment, or the installed product. */
function schemaDirectory(): string | undefined {
  const explicit = flag('dir') ?? process.env['FTVIEW_SCHEMA_DIR']
  if (explicit !== undefined) return existsSync(explicit) ? explicit : undefined
  for (const candidate of [
    'C:/Program Files (x86)/Rockwell Software/RSView Enterprise/Schemas',
    'C:/Program Files/Rockwell Software/RSView Enterprise/Schemas',
  ]) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

const directory = schemaDirectory()
if (directory === undefined) {
  console.error('schema:ftview: no Gfx-ME*.xsd found. Pass --dir <folder>, set FTVIEW_SCHEMA_DIR, or install FactoryTalk View Studio.')
  process.exit(1)
}

const files = readdirSync(directory)
  .filter(name => /^Gfx-ME\d+\.xsd$/u.test(name))
  .sort((a, b) => Number(a.replace(/\D+/gu, '')) - Number(b.replace(/\D+/gu, '')))
if (files.length === 0) {
  console.error(`schema:ftview: ${directory} holds no Gfx-ME*.xsd.`)
  process.exit(1)
}

const wanted = flag('schema') ?? files[files.length - 1]!
const source = join(directory, wanted)
if (!existsSync(source)) {
  console.error(`schema:ftview: ${source} does not exist. Installed: ${files.join(', ')}.`)
  process.exit(1)
}

const xml = readFileSync(source, 'utf8')
const model = parseSchemaModel(wanted, xml)
if (model.displayChildren.length === 0) {
  console.error(`schema:ftview: ${wanted} yielded no display object types; the resolver or the file is wrong.`)
  process.exit(1)
}

const outPath = resolve(repoRoot, flag('out') ?? 'packages/ftview/schema/me-schema.json')
mkdirSync(dirname(outPath), { recursive: true })
const snapshot = {
  ...model,
  source: {
    file: source,
    bytes: Buffer.byteLength(xml, 'utf8'),
    sha256: createHash('sha256').update(xml, 'utf8').digest('hex'),
  },
  coverage: COVERAGE,
  generated: new Date().toISOString(),
}

writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
const required = Object.entries(model.types)
  .flatMap(([typeName, type]) => Object.entries(type.attributes).filter(([, attribute]) => attribute.required).map(([name]) => `${typeName}.${name}`))
console.log(
  `schema:ftview: ${wanted} → ${outPath}: ${model.displayChildren.length} object types, ${Object.keys(model.types).length} types, ${model.parts.length} part elements, ${required.length} required attributes (${required.join(', ')}).`,
)
