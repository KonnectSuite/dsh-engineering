/**
 * Build the bundle's one browser half out of its two committed face bundles.
 *
 * A package registers exactly **one** client bundle: the shell keys a client
 * module by the package name it resolved from the mounted row, so two faces
 * cannot register separately from one package. A second registration under a
 * different id is never asked for, which presents as a plugin that loaded and
 * drew nothing rather than as an error.
 *
 * So both engineering previews run inside one registration:
 *
 *   window.__ModuleLoader__.load({ id: '@aryacode/dsh-engineering', factory })
 *
 * Each face keeps its own closure - both bodies declare their own `React`,
 * ids, stylesheets and helpers - and nothing is re-authored: the faces are the
 * committed build artifacts of `packages/viewer` and `packages/ftview-viewer`,
 * and this script only moves their factories under one registration and merges
 * the two exported surfaces.
 *
 * The FTView face has no source anywhere (see docs/handoff-one-package.md); its
 * committed closure bundle is the only form it exists in, which is why this
 * build wraps artifacts instead of compiling sources.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
 * Render `lib/client.js`: both face factories under one registration, with the
 * two exported plugins merged.
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
 * The engineering bundle's one browser half: the ladder viewer and the
 * FactoryTalk View ME display preview inside a single module registration.
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

    // The declared services are the union of both faces': one Cordis plugin
    // cannot inject less than its parts need. CJS shape (exports.apply /
    // exports.inject) is the loader's contract for a registered factory.
    return {
      inject: [...new Set([...${faces[0].name}.inject, ...${faces[1].name}.inject])],
      apply: (ctx) => {
${calls}
      },
    }
  },
})
`
}

/**
 * Render `lib/index.js`: the host half of this package. The row that mounts the
 * bundle exists so the shell can find the client bundle, which it only scans for
 * mounted packages; the host half itself registers nothing.
 * @returns the host entry source.
 */
export function renderHost() {
  return `/**
 * Host half of the engineering bundle.
 *
 * The bundle's work happens in its patch (\`cordis.patch.yml\`: the tool policy
 * and the product rows) and in its client face (\`./client\`). This entry exists
 * because a client bundle is discovered through a *mounted* package row, and a
 * row mounts a package root. It registers nothing of its own.
 */
export function apply() {}
`
}

/** Render `lib/index.d.ts`. */
export function renderHostTypes() {
  return `/** Host half of the engineering bundle: registers nothing; the patch and the client face do the work. */
export declare function apply(): void
`
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(OUT, { recursive: true })
  const artifacts = [
    ['client.js', renderClient()],
    ['index.js', renderHost()],
    ['index.d.ts', renderHostTypes()],
  ]
  for (const [name, source] of artifacts) writeFileSync(join(OUT, name), source)
  console.log(`built lib/${artifacts.map(([name]) => name).join(', lib/')} for ${CLIENT_ID}`)
}
