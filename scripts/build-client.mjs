/**
 * Build the bundle's one browser half out of its committed face bundles.
 *
 * A package registers exactly **one** client bundle: the shell keys a client
 * module by the package name it resolved from the mounted row, so two faces
 * cannot register separately from one package. A second registration under a
 * different id is never asked for, which presents as a plugin that loaded and
 * drew nothing rather than as an error.
 *
 * So every engineering face runs inside one registration:
 *
 *   window.__ModuleLoader__.load({ id: '@aryacode/dsh-engineering', factory })
 *
 * Each face keeps its own closure - every body declares its own `React`, ids,
 * stylesheets and helpers - and nothing is re-authored: the previews are built
 * from this repository's own sources by `scripts/build-viewer-face.mjs` and
 * `scripts/build-ftview-face.mjs`, the settings pages are written directly in
 * `scripts/faces/settings.js`, and this script only moves their factories under
 * one registration and merges the declared surfaces.
 *
 * Run those two face builds first; `npm run build:client` does, and this script
 * fails loudly if an artifact it needs is missing rather than shipping a bundle
 * whose preview tab draws nothing.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as CONTRACT from '../src/remote/ecad-contract.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, 'lib')

/**
 * The module-table registration key. It must equal this package's `name`, or
 * the shell never asks for the factory this file registers.
 */
export const CLIENT_ID = '@aryacode/dsh-engineering'

/** Trailing source-map comment the face builds append. */
const SOURCE_MAP_TRAILER = /(?:\r?\n)?\/\/# sourceMappingURL=[^\r\n]*(?:\r?\n)?$/

/**
 * The faces, in the order their `apply` functions run. A face without
 * `packageName` has no retired component package behind it; the settings face
 * is written directly in `scripts/faces/settings.js` because it has no JSX
 * build of its own.
 */
export const FACES = [
  { name: 'ladder', file: 'packages/viewer/lib/client.js', packageName: '@aryacode/dsh-engineering-l5x-viewer' },
  { name: 'ftview', file: 'packages/ftview-viewer/lib/client.js', packageName: '@aryacode/dsh-engineering-ftview-viewer' },
  { name: 'settings', file: 'scripts/faces/settings.js' },
]

/**
 * Read one committed face bundle and return its factory body.
 *
 * The body is sliced out verbatim between the `factory: (require) => {` marker
 * and the brace that closes it, so a face keeps its own byte-for-byte
 * behaviour - no reformatting, no tree shaking, no CSS re-hashing.
 * @param face - one entry of {@link FACES}.
 * @returns the factory body, without the wrapper and without its closing brace.
 */
export function factoryBodyOf(face) {
  const path = join(ROOT, face.file)
  const raw = readFileSync(path, 'utf8').replace(SOURCE_MAP_TRAILER, '').trimEnd()
  const registration = 'window.__ModuleLoader__.load({'
  const startsAt = raw.indexOf(registration)
  if (startsAt === -1) throw new Error(`${face.file}: not a client bundle registration (no ${registration} call)`)
  // A face may carry its own documentation above the registration; no code may.
  const preamble = raw.slice(0, startsAt).replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/\/\/.*$/gmu, '').trim()
  if (preamble !== '') throw new Error(`${face.file}: code precedes the registration (${preamble.slice(0, 60)})`)
  if (raw.split('factory:').length !== 2) {
    throw new Error(`${face.file}: expected exactly one factory, found ${raw.split('factory:').length - 1}`)
  }
  const marker = raw.indexOf('factory:', startsAt)
  const open = raw.indexOf('{', marker)
  if (open === -1) throw new Error(`${face.file}: factory marker is not followed by a body`)
  let rest = raw.slice(open + 1)
  // The registration closes with `})` or `});`, depending on the emitting build.
  if (rest.endsWith(';')) rest = rest.slice(0, -1).trimEnd()
  if (!rest.endsWith('})')) {
    throw new Error(`${face.file}: unexpected registration tail (expected the load call to close with "})")`)
  }
  rest = rest.slice(0, -2).trimEnd()
  if (rest.endsWith(',')) rest = rest.slice(0, -1).trimEnd()
  if (!rest.endsWith('}')) throw new Error(`${face.file}: factory body does not close with a brace`)
  return { body: rest.slice(0, -1), packageName: face.packageName }
}

/**
 * Render the `TYPERT` host-face manifest as a self-contained `lib/typert.host.js`.
 *
 * This is the hand-written equivalent of a `@deepseek-ai/dsh-typert-generator`
 * artifact: a default-free module that exports `TYPERT`, whose invocations carry
 * strict codecs and whose model names one service. The typert loader imports it
 * from the package's `"./typert"` export when the `viewers` row mounts the
 * package root.
 * @returns the artifact source.
 */
export function renderTypertHost() {
  const manifest = CONTRACT.buildHostManifest()
  const invocations = manifest.invocations.map(descriptor => `{
  id: ${JSON.stringify(descriptor.id)},
  service: ${JSON.stringify(descriptor.service)},
  namespace: ${JSON.stringify(descriptor.namespace)},
  method: ${JSON.stringify(descriptor.method)},
  description: ${JSON.stringify(descriptor.description ?? '')},
  invocation: { kind: 'direct' },
  parameters: [
${descriptor.parameters.map(parameter => `    {
      name: ${JSON.stringify(parameter.name)},
      wire: ${JSON.stringify(parameter.wire)},
      description: ${JSON.stringify(parameter.description ?? '')},
      source: ${JSON.stringify(parameter.source)},
      codec: strictCodec(${JSON.stringify(parameter.codec.typeSymbol)}, ${JSON.stringify(parameter.codec.jsonSchema)}),
    }`).join(',\n')}
  ],
  result: strictCodec(${JSON.stringify(descriptor.result.typeSymbol)}, ${JSON.stringify(descriptor.result.jsonSchema)}),
}`).join(',\n')
  return `/* Generated by scripts/build-client.mjs from src/remote/ecad-contract.js — do not edit. */
/**
 * Host-face Typert artifact of the engineering bundle.
 *
 * A package exporting "./typert" has this module imported by the Host's typert
 * loader while its row is mounted; the loader validates the manifest and
 * registers every invocation in \`ctx.typert\`, so the Gateway dispatches
 * \`${CONTRACT.ECAD_NAMESPACE}/<method>\` to the Cordis service named by
 * \`service\`. The service itself is registered by this package's host half
 * (\`lib/index.js\`).
 */

/**
 * Build a strict codec over the wire shape the contract names.
 * The Gateway calls \`create().parse(value)\` once over the wire value.
 * @param typeSymbol - generated-type identity the codec stands for.
 * @param jsonSchema - the JSON Schema projection the catalog carries.
 * @returns the strict codec.
 */
function strictCodec(typeSymbol, jsonSchema) {
  const accept = jsonSchema.type === 'string'
    ? value => typeof value === 'string' && value.length > 0
    : jsonSchema.type === 'number'
      ? value => typeof value === 'number' && Number.isFinite(value)
      : jsonSchema.type === 'array'
        ? value => Array.isArray(value)
        : value => value !== null && typeof value === 'object' && !Array.isArray(value)
  return {
    mode: 'strict',
    typeSymbol,
    create: () => ({
      parse(value) {
        if (!accept(value)) throw new TypeError(typeSymbol + ': unexpected wire value')
        return value
      },
    }),
    jsonSchema,
  }
}

const INVOCATIONS = [
${invocations}
]

export const TYPERT = {
  package: ${JSON.stringify(manifest.package)},
  face: 'host',
  schemas: [],
  get invocations() { return INVOCATIONS },
  model: ${JSON.stringify(manifest.model, null, 2)},
}
`
}

/**
 * Render `lib/client.js`: every face factory under one registration, with the
 * exported plugins merged.
 * @returns the bundle source.
 */
export function renderClient() {
  const faces = FACES.map((face) => {
    const extracted = factoryBodyOf(face)
    return { ...face, ...extracted }
  })
  const declarations = faces
    .map(face => `    const ${face.name} = (() => {\n${face.body}\n    })()`)
    .join('\n')
  const calls = faces.map(face => `        ${face.name}.apply(ctx)`).join('\n')
  const checks = faces
    .map(face => `      typeof ${face.name}.apply !== 'function'`)
    .join(' ||\n')
  return `/**
 * The engineering bundle's one browser half: the ladder viewer, the
 * FactoryTalk View ME display preview and the product-row settings pages inside
 * a single module registration.
 *
 * Generated by scripts/build-client.mjs from the committed face bundles
 * (${faces.map(face => face.file).join(', ')}).
 * Do not edit: change a face in its own package and rebuild.
 *
 * The package name is the registration id because the shell keys a client
 * module by package name; a mismatch registers under a key the shell never
 * asks for, presenting as a plugin that loaded and drew nothing.
 */
window.__ModuleLoader__.load({
  id: ${JSON.stringify(CLIENT_ID)},
  factory: (require) => {
    // One closure per face: both bodies declare their own React binding,
    // document-preview id, stylesheet text and helpers.
${declarations}

    if (
${checks}
    ) {
      throw new Error(${JSON.stringify(CLIENT_ID)} + ': a merged client face exports no apply()')
    }

    // The declared services are the union of every face's: one Cordis plugin
    // cannot inject less than its parts need. CJS shape (exports.apply /
    // exports.inject) is the loader's contract for a registered factory.
    return {
      inject: [...new Set([${faces.map(face => `...${face.name}.inject`).join(', ')}])],
      apply: (ctx) => {
${calls}
      },
    }
  },
})
`
}

/**
 * Render `lib/index.js`: the host half of this package.
 *
 * The `viewers` row mounts this package root: that is what makes the shell scan
 * the package for `./client`, and it is also what makes the typert loader read
 * the package's `./typert` artifact. The artifact registers the `ecad/<method>`
 * invocations; this entry registers the Cordis service they dispatch to, and the
 * ECAD row later switches its write policy on.
 * @returns the host entry source.
 */
export function renderHost() {
  return `/**
 * Host half of the engineering bundle.
 *
 * The bundle's work happens in its patch (\`cordis.patch.yml\`), its client face
 * (\`./client\`) and its Typert host face (\`./typert\`). A client bundle is
 * discovered through a *mounted* package row, and a row mounts a package root;
 * this entry registers the \`${CONTRACT.ECAD_NAMESPACE}\` Remote service the
 * package's \`./typert\` invocations name, and the client face reaches it through
 * \`ctx.remote.${CONTRACT.ECAD_NAMESPACE}\`.
 */
import { createEcadService } from '../src/remote/ecad-service.js'

/** Cordis service key, and Remote namespace, of the bundle's ECAD service. */
export const ECAD_SERVICE = ${JSON.stringify(CONTRACT.ECAD_NAMESPACE)}
/** Every Remote endpoint the package's \`./typert\` artifact registers for that service. */
export const ECAD_ENDPOINTS = ${JSON.stringify(CONTRACT.ECAD_METHODS.map(method => `${CONTRACT.ECAD_NAMESPACE}/${method.method}`))}

/**
 * Register the ECAD Remote service; the Gateway binding is applied inside.
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  createEcadService(ctx)
}
`
}

/** Render `lib/index.d.ts`. */
export function renderHostTypes() {
  return `/** Host half of the engineering bundle: provides the \`${CONTRACT.ECAD_NAMESPACE}\` Remote service named by the package's \`./typert\` invocations. */
export declare const ECAD_SERVICE: '${CONTRACT.ECAD_NAMESPACE}'
/** Every Remote endpoint the \`./typert\` artifact registers for that service. */
export declare const ECAD_ENDPOINTS: readonly string[]
/** Register the Remote service. */
export declare function apply(ctx: unknown): void
`
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(OUT, { recursive: true })
  const artifacts = [
    ['client.js', renderClient()],
    ['index.js', renderHost()],
    ['index.d.ts', renderHostTypes()],
    ['typert.host.js', renderTypertHost()],
  ]
  for (const [name, source] of artifacts) writeFileSync(join(OUT, name), source)
  console.log(`built lib/${artifacts.map(([name]) => name).join(', lib/')} for ${CLIENT_ID}`)
}
