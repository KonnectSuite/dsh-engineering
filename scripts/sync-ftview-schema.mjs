#!/usr/bin/env node
/**
 * Derive the FactoryTalk View ME display vocabulary from the installed schema.
 *
 * The vendor ships `Gfx-ME*.xsd` with Studio. We do not redistribute the XSD:
 * this generator reads the installed copy and writes a compact JSON model of
 * what the schema allows (element names, attributes, required flags, enums and
 * child relationships) that the validator can check without a full XSD engine.
 *
 * Usage:
 *   node scripts/sync-ftview-schema.mjs [--out <file>] [--schema Gfx-ME17.xsd]
 *
 * @module dsh-engineering/scripts/sync-ftview-schema
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XMLParser } from 'fast-xml-parser'

/** Roots where Studio installs its display schemas. */
const SCHEMA_ROOTS = [
  'C:/Program Files (x86)/Rockwell Software/RSView Enterprise/Schemas',
  'C:/Program Files/Rockwell Software/RSView Enterprise/Schemas',
]

/** Resolve the schema directory, honouring FTVIEW_SCHEMA_DIR. */
function schemaDir() {
  const override = process.env.FTVIEW_SCHEMA_DIR
  if (override !== undefined && override !== '') return override
  const found = SCHEMA_ROOTS.find(root => existsSync(root))
  if (found === undefined) throw new Error('No FactoryTalk View schema directory found. Set FTVIEW_SCHEMA_DIR to the folder that holds Gfx-ME*.xsd.')
  return found
}

/** Newest Gfx-ME schema by numeric version. */
function newestSchema(dir) {
  const files = readdirSync(dir).filter(name => /^Gfx-ME\d+\.xsd$/u.test(name))
  if (files.length === 0) throw new Error(`No Gfx-ME*.xsd in ${dir}.`)
  const version = name => Number.parseInt(name.replace(/\D+/gu, ''), 10)
  return files.sort((left, right) => version(right) - version(left))[0]
}

/** Attributes of one XSD node. */
const attrs = node => Object.fromEntries(Object.entries(node ?? {}).filter(([key]) => key.startsWith('@_')).map(([key, value]) => [key.slice(2), value]))

/** One node or an array, always as an array. */
const list = value => (value === undefined ? [] : Array.isArray(value) ? value : [value])

/** Collect enumerations of a named simpleType. */
function enumsOf(node) {
  const restriction = node?.restriction
  const values = list(restriction?.enumeration).map(entry => String(attrs(entry).value))
  return values.length === 0 ? undefined : values
}

/** Child element declarations of a complexType body. */
function childrenOf(body) {
  const children = []
  for (const container of ['sequence', 'choice', 'all']) {
    for (const element of list(body?.[container]?.element)) {
      const declared = attrs(element)
      const name = declared.ref ?? declared.name
      if (name === undefined) continue
      children.push({
        name,
        type: declared.type ?? null,
        min: declared.minOccurs === undefined ? 1 : Number(declared.minOccurs),
        max: declared.maxOccurs === undefined ? 1 : declared.maxOccurs === 'unbounded' ? -1 : Number(declared.maxOccurs),
      })
    }
  }
  return children
}

/** Attribute declarations of a complexType body. */
function attributesOf(body) {
  const attributes = {}
  for (const attribute of list(body?.attribute)) {
    const declared = attrs(attribute)
    if (declared.name === undefined) continue
    attributes[declared.name] = {
      required: declared.use === 'required',
      type: declared.type ?? null,
      ...(declared.default === undefined ? {} : { default: declared.default }),
    }
  }
  return attributes
}

/** Convert one complexType, resolving its extension base. */
function complexTypeOf(node) {
  const name = attrs(node).name
  const complexContent = node.complexContent
  const extension = complexContent?.extension
  const body = extension ?? node
  return {
    name,
    base: extension === undefined ? undefined : attrs(extension).base,
    children: childrenOf(body),
    attributes: attributesOf(body),
  }
}

/** Convert one top-level element declaration. */
function elementDeclarations(schema) {
  const declarations = {}
  for (const element of list(schema.element)) {
    const declared = attrs(element)
    if (declared.name !== undefined) declarations[declared.name] = declared.type ?? null
  }
  return declarations
}

/**
 * Build the derived model.
 *
 * @param {string} xsdPath - Installed schema.
 * @returns {object} Catalog written to `src/schema/me-schema.json`.
 */
function build(xsdPath, schemaName) {
  const bytes = readFileSync(xsdPath)
  const text = bytes.toString('utf8')
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, isArray: name => ['element', 'attribute', 'enumeration', 'complexType', 'simpleType'].includes(name) })
  const parsed = parser.parse(text).schema
  const types = {}
  for (const type of list(parsed.complexType)) {
    const converted = complexTypeOf(type)
    if (converted.name !== undefined) types[converted.name] = converted
  }
  const enums = {}
  for (const type of list(parsed.simpleType)) {
    const name = attrs(type).name
    const values = enumsOf(type)
    if (name !== undefined && values !== undefined) enums[name] = values
  }
  // Resolve inheritance once, so the runtime validator merges nothing.
  for (const type of Object.values(types)) {
    let base = type.base
    let guard = 0
    while (base !== undefined && types[base] !== undefined && guard < 8) {
      const parent = types[base]
      type.children = [...parent.children, ...type.children]
      type.attributes = { ...parent.attributes, ...type.attributes }
      base = parent.base
      guard += 1
    }
    type.base = undefined
  }
  // Attach enum values to attributes that reference a named simpleType.
  for (const type of Object.values(types)) {
    for (const [name, attribute] of Object.entries(type.attributes)) {
      const values = attribute.type === null ? undefined : enums[attribute.type]
      if (values !== undefined) attribute.values = values
      delete attribute.type
    }
  }
  return {
    schema: schemaName.replace(/\.xsd$/iu, ''),
    generated: new Date().toISOString(),
    source: { file: schemaName, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
    root: elementDeclarations(parsed),
    types,
    coverage: 'Element names, attribute names, required attributes and enumerated values. Sequence order and occurrence counts are not enforced; Studio is the authority for those.',
  }
}

const args = process.argv.slice(2)
const argOf = flag => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1] }
const dir = argOf('--dir') ?? schemaDir()
const schemaName = argOf('--schema') ?? newestSchema(dir)
const out = argOf('--out') ?? fileURLToPath(new URL('../packages/ftview/src/schema/me-schema.json', import.meta.url))
const catalog = build(join(dir, schemaName), schemaName)
writeFileSync(out, `${JSON.stringify(catalog, null, 1)}\n`, 'utf8')
console.log(`ftview schema: ${catalog.schema} (${Object.keys(catalog.types).length} types, ${Object.keys(catalog.root).length} root elements) -> ${out}`)
