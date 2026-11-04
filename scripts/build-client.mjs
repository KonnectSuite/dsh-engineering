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
import {
  ECAD_METHOD,
  ECAD_NAMESPACE,
  ECAD_PACKAGE,
  buildClientContribution,
  buildHostDescriptor,
  buildHostManifest,
  buildHostModel,
} from '../src/remote/ecad-contract.js'

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
 * Render the factory body of the Typert probe face.
 *
 * The probe is generated from `src/remote/ecad-contract.js` rather than kept as
 * a committed face file: the browser half and the Host `./typert` artifact must
 * name the same endpoint, parameter wire field and codec modes, and generating
 * both from one contract is what keeps them in agreement.
 * @returns the factory body that mounts the contribution and calls `ecad/ping`.
 */
export function renderTypertProbeBody() {
  const { package: contributionPackage, descriptors } = buildClientContribution()
  const [descriptor] = descriptors
  const renderCodec = typeSymbol => `{
            mode: 'strict',
            typeSymbol: ${JSON.stringify(typeSymbol)},
            // Never called on the client: the Host parses the wire value with the
            // descriptor its own ./typert artifact registered. $mount only requires
            // a strict codec to exist.
            create: () => ({ parse: value => value }),
            jsonSchema: { type: 'object', additionalProperties: true },
          }`
  const parameters = descriptor.parameters.map(parameter => `          {
            name: ${JSON.stringify(parameter.name)},
            wire: ${JSON.stringify(parameter.wire)},
            description: ${JSON.stringify(parameter.description ?? '')},
            source: 'json',
            codec: ${renderCodec(parameter.codec.typeSymbol)},
          }`).join(',\n')
  return `    // The probe: mount the bundle's own Typert Remote contribution, then call it.
    // Both halves are generated from src/remote/ecad-contract.js.
    const contribution = {
      package: ${JSON.stringify(contributionPackage)},
      descriptors: [{
        id: ${JSON.stringify(descriptor.id)},
        service: ${JSON.stringify(descriptor.service)},
        namespace: ${JSON.stringify(descriptor.namespace)},
        method: ${JSON.stringify(descriptor.method)},
        description: ${JSON.stringify(descriptor.description ?? '')},
        invocation: { kind: 'direct' },
        parameters: [
${parameters}
        ],
        result: ${renderCodec(descriptor.result.typeSymbol)},
      }],
    }

    /**
     * Show the probe outcome in the page and on the console, so the result is
     * visible without DevTools and survives a screenshot review.
     * @param text - the line to display.
     * @param ok - true for success, false for failure, undefined while running.
     */
    function report(text, ok) {
      const color = ok === true ? '#166534' : ok === false ? '#991b1b' : '#92400e'
      const background = ok === true ? '#dcfce7' : ok === false ? '#fee2e2' : '#fef3c7'
      if (typeof document !== 'undefined' && document.body !== null && document.body !== undefined) {
        let banner = document.getElementById('ecad-typert-spike-banner')
        if (banner === null) {
          banner = document.createElement('div')
          banner.id = 'ecad-typert-spike-banner'
          banner.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;max-width:56ch;padding:8px 10px;'
            + 'border:1px solid rgba(0,0,0,.18);border-radius:6px;font:12px/1.45 ui-monospace,Consolas,monospace;'
            + 'white-space:pre-wrap;box-shadow:0 2px 8px rgba(0,0,0,.18)'
          document.body.appendChild(banner)
        }
        banner.style.color = color
        banner.style.background = background
        banner.textContent = 'ecad Typert spike: ' + text
      }
      console.log('[ecad-typert-spike] ' + text)
    }

    /**
     * Mount the contribution and call the Host method it names.
     *
     * The namespace service only exists after the mount, so the call runs on a
     * child fiber that injects \`remote.${ECAD_NAMESPACE}\`: reading
     * \`ctx.remote.${ECAD_NAMESPACE}\` from this face's own fiber would be a
     * dependency it did not declare, and Cordis refuses that read.
     * @param ctx - the browser plugin context carrying the Remote carrier.
     */
    async function probe(ctx) {
      if (typeof ctx.remote === 'undefined' || ctx.remote === null) {
        console.log('[ecad-typert-spike] no Remote carrier in this composition; probe skipped')
        return
      }
      report('mounting ${ECAD_NAMESPACE}/${ECAD_METHOD}…')
      try {
        await ctx.remote.$mount(contribution)
        const call = ctx.inject(['remote.${ECAD_NAMESPACE}'], async (scope) => {
          try {
            const result = await scope.remote.${ECAD_NAMESPACE}.${ECAD_METHOD}({ hello: 'spike', at: new Date().toISOString() })
            window.__ECAD_TYPERT_SPIKE__ = { ok: true, result }
            const detail = result && result.marker
              ? result.descriptor + ' descriptor — ' + result.marker
              : JSON.stringify(result)
            report('OK (' + detail + ')', true)
          } catch (error) {
            const message = error && error.message ? error.message : String(error)
            window.__ECAD_TYPERT_SPIKE__ = { ok: false, error: message }
            report('FAILED — ' + message, false)
          }
        })
        await call
      } catch (error) {
        const message = error && error.message ? error.message : String(error)
        window.__ECAD_TYPERT_SPIKE__ = { ok: false, error: message }
        report('FAILED — ' + message, false)
      }
    }

    /**
     * Start the probe once the browser plugin is applied.
     * @param ctx - the browser plugin context.
     */
    function apply(ctx) {
      void probe(ctx)
    }

    return { inject: ['remote'], apply }`
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
  const descriptor = buildHostDescriptor()
  const model = buildHostModel()
  const parameters = descriptor.parameters.map(parameter => `    {
      name: ${JSON.stringify(parameter.name)},
      wire: ${JSON.stringify(parameter.wire)},
      description: ${JSON.stringify(parameter.description ?? '')},
      source: ${JSON.stringify(parameter.source)},
      codec: objectCodec(${JSON.stringify(parameter.codec.typeSymbol)}),
    }`).join(',\n')
  return `/* Generated by scripts/build-client.mjs from src/remote/ecad-contract.js — do not edit. */
/**
 * Host-face Typert artifact of the engineering bundle.
 *
 * A package exporting "./typert" has this module imported by the Host's typert
 * loader while its row is mounted; the loader validates the manifest and
 * registers every invocation in \`ctx.typert\`, so the Gateway dispatches
 * \`${ECAD_NAMESPACE}/${ECAD_METHOD}\` to the Cordis service named by
 * \`service\`. The service itself is registered by this package's host half
 * (\`lib/index.js\`).
 */

/**
 * Build a strict codec over a lossless JSON object.
 * The Gateway calls \`create().parse(value)\` once over the wire value.
 * @param typeSymbol - generated-type identity the codec stands for.
 * @returns the strict codec.
 */
function objectCodec(typeSymbol) {
  return {
    mode: 'strict',
    typeSymbol,
    create: () => ({
      parse(value) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          throw new TypeError(typeSymbol + ': expected a JSON object')
        }
        return value
      },
    }),
    jsonSchema: { type: 'object', additionalProperties: true },
  }
}

const INVOCATIONS = [{
  id: ${JSON.stringify(descriptor.id)},
  service: ${JSON.stringify(descriptor.service)},
  namespace: ${JSON.stringify(descriptor.namespace)},
  method: ${JSON.stringify(descriptor.method)},
  description: ${JSON.stringify(descriptor.description ?? '')},
  invocation: { kind: 'direct' },
  parameters: [
${parameters}
  ],
  result: objectCodec(${JSON.stringify(descriptor.result.typeSymbol)}),
}]

export const TYPERT = {
  package: ${JSON.stringify(ECAD_PACKAGE)},
  face: 'host',
  schemas: [],
  get invocations() { return INVOCATIONS },
  model: ${JSON.stringify(model, null, 2)},
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
  faces.push({ name: 'typertProbe', body: renderTypertProbeBody() })
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
 * the package's `./typert` artifact. The artifact registers the invocation; this
 * entry registers the Cordis service the invocation dispatches to, so the
 * client bundle's `ctx.remote.ecad.ping()` reaches `ping()` below and leaves a
 * marker file on the Host.
 * @returns the host entry source.
 */
export function renderHost() {
  const endpoint = `${ECAD_NAMESPACE}/${ECAD_METHOD}`
  return `/**
 * Host half of the engineering bundle.
 *
 * The bundle's work happens in its patch (\`cordis.patch.yml\`: the tool policy
 * and the product rows), in its client face (\`./client\`) and in its Typert
 * host face (\`./typert\`). This entry exists because a client bundle is
 * discovered through a *mounted* package row, and a row mounts a package root;
 * it provides the \`${ECAD_NAMESPACE}\` Remote service the package's \`./typert\`
 * invocation names, and writes one marker file per call so the client-to-Host
 * path can be verified without a debugger.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { bindTypertRemote } from '@deepseek-ai/dsh-typert-protocol'

/** Cordis service key, and Remote namespace, of the bundle's probe service. */
export const ECAD_SERVICE = ${JSON.stringify(ECAD_NAMESPACE)}
/** Remote endpoint the ./typert artifact registers for this service. */
export const ECAD_ENDPOINT = ${JSON.stringify(endpoint)}

/**
 * Write the invariant Host-side marker for one probe call.
 *
 * \`ECAD_SPIKE_DIR\` lets a test boot pin the location; otherwise the system temp
 * directory holds a fresh \`pong-<epoch>-<pid>.json\` per call.
 * @param payload - the client payload, recorded verbatim.
 * @param descriptors - which descriptor kind dispatched the call.
 * @returns the marker path and its timestamp.
 */
function writeMarker(payload, descriptors) {
  const directory = process.env.ECAD_SPIKE_DIR ?? join(process.env.TEMP ?? homedir(), 'ecad-typert-spike')
  mkdirSync(directory, { recursive: true })
  const at = new Date().toISOString()
  const marker = join(directory, \`pong-\${Date.now()}-\${process.pid}.json\`)
  writeFileSync(marker, JSON.stringify({
    ok: true,
    service: ECAD_SERVICE,
    endpoint: ECAD_ENDPOINT,
    descriptor: descriptors,
    received: payload,
    at,
    pid: process.pid,
  }, null, 2) + '\\n')
  return { marker, at }
}

/**
 * Register the \`${ECAD_NAMESPACE}\` Cordis service.
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  const service = {
    /**
     * Echo the client payload and record the Host-side marker.
     * @param payload - the JSON object the client sent.
     * @returns the marker path, the dispatch kind and the echoed payload.
     */
    ping(payload) {
      const strict = ctx.get('typert')?.local.get(ECAD_ENDPOINT) !== undefined
      const { marker, at } = writeMarker(payload, strict ? 'strict' : 'src')
      ctx.logger.info(\`[ecad-typert-spike] \${ECAD_ENDPOINT} dispatched via \${strict ? 'strict' : 'src'} descriptor: \${marker}\`)
      return { ok: true, echo: payload, at, marker, descriptor: strict ? 'strict' : 'src' }
    },
  }
  // Explicit Service-to-Gateway binding: the Gateway refuses to dispatch to a
  // service without this visible binding, whether the descriptor came from the
  // ./typert artifact or from its source-mode fallback.
  service.typertRemote = bindTypertRemote(service, ECAD_SERVICE)
  ctx.provide(ECAD_SERVICE, service)
}
`
}

/** Render `lib/index.d.ts`. */
export function renderHostTypes() {
  return `/** Host half of the engineering bundle: provides the \`${ECAD_NAMESPACE}\` Remote service named by the package's \`./typert\` artifact. */
export declare const ECAD_SERVICE: '${ECAD_NAMESPACE}'
/** Remote endpoint the \`./typert\` artifact registers for that service. */
export declare const ECAD_ENDPOINT: '${ECAD_NAMESPACE}/${ECAD_METHOD}'
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
