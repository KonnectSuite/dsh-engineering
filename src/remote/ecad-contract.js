/**
 * The hand-written wire contract for the bundle's one probe Remote method.
 *
 * The engineering bundle is a third-party package, so it ships its own Typert
 * artifacts instead of generated ones: `build-client.mjs` turns
 * {@link buildHostManifest} into `lib/typert.host.js` (the package's
 * `"./typert"` export, imported by the Host's typert loader), and the client
 * face at `scripts/faces/typert-probe.js` mounts the contribution
 * {@link buildClientContribution} describes.
 *
 * Both faces must agree on the endpoint, the parameter wire field and the
 * codec modes; a mismatch presents as `gateway/arguments-invalid` or as a
 * `strict` descriptor the loader refuses, so the facts live here once.
 *
 * @module dsh-engineering-remote-contract
 */

/** The package that owns the contribution. The loader checks this against the manifest. */
export const ECAD_PACKAGE = '@aryacode/dsh-engineering'
/** Remote namespace the client mounts and the Host service registers. */
export const ECAD_NAMESPACE = 'ecad'
/** The one method this spike exposes. */
export const ECAD_METHOD = 'ping'
/** `<namespace>/<method>`, the Gateway endpoint key. */
export const ECAD_ENDPOINT = `${ECAD_NAMESPACE}/${ECAD_METHOD}`
/** Wire field the client sends the payload under. */
export const ECAD_PAYLOAD_WIRE = 'payload'

/**
 * Build one strict codec over a lossless JSON value.
 *
 * A strict codec carries a `create()` factory the Gateway calls to parse the
 * wire value exactly once, plus the `typeSymbol` the generated form would have
 * carried. There is no `encode`: the result is already a JSON value.
 * @param typeSymbol - the generated-type identity this codec stands for.
 * @param description - optional prose for the parameter's wire description.
 * @returns a fresh strict codec; each descriptor owns its own instance.
 */
export function jsonObjectCodec(typeSymbol, description) {
  return {
    mode: 'strict',
    typeSymbol,
    create() {
      return {
        parse(value) {
          if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            throw new TypeError(`${typeSymbol}: expected a JSON object`)
          }
          return value
        },
      }
    },
    jsonSchema: { type: 'object', additionalProperties: true },
    ...(description === undefined ? {} : { description }),
  }
}

/**
 * Build the Host descriptor the typert loader registers in `ctx.typert`.
 *
 * `service` is the Cordis service key the Gateway dispatches to; the loader
 * does not check that link, so the Host half registers exactly this service.
 * @param typePrefix - `typeSymbol` prefix for the generated-type identities.
 * @returns a direct invocation descriptor with strict input and result codecs.
 */
export function buildHostDescriptor(typePrefix = ECAD_PACKAGE) {
  return {
    id: `${ECAD_PACKAGE}#${ECAD_ENDPOINT}`,
    service: ECAD_NAMESPACE,
    namespace: ECAD_NAMESPACE,
    method: ECAD_METHOD,
    description: 'Probe the client-to-Host Typert Remote path of the engineering bundle.',
    invocation: { kind: 'direct' },
    parameters: [{
      name: ECAD_PAYLOAD_WIRE,
      wire: ECAD_PAYLOAD_WIRE,
      description: 'the client payload, echoed back by the Host service.',
      source: 'json',
      codec: jsonObjectCodec(`${typePrefix}#${ECAD_ENDPOINT}:payload`),
    }],
    result: jsonObjectCodec(`${typePrefix}#${ECAD_ENDPOINT}:result`),
    sourceLocation: { file: 'src/remote/ecad-contract.js', line: 1, column: 1 },
  }
}

/**
 * Build the package-reflection model the typert loader validates beside the
 * invocation list. The Gateway does not read it; it exists because a generated
 * `./typert` artifact always carries one.
 * @returns the model with one service, no events and no objects.
 */
export function buildHostModel() {
  return {
    services: [{
      description: 'Engineering bundle Remote service hosting the diagnostic probe.',
      summary: 'Engineering bundle Remote service hosting the diagnostic probe.',
      tags: [],
      jsDoc: '/** Engineering bundle Remote service hosting the diagnostic probe. */',
      key: ECAD_NAMESPACE,
      exportName: 'Ecad',
      members: [{
        kind: 'method',
        name: ECAD_METHOD,
        signature: '@Remote async ping(payload: Record<string, unknown>): Promise<Record<string, unknown>>',
        summary: 'Echo a client payload and record the invariant Host-side side effect.',
        jsDoc: '/**\n * Echo a client payload and record the invariant Host-side side effect.\n * @param payload - the client payload.\n * @returns the marker path and the received payload.\n */',
      }],
      types: [{
        name: 'EcadPingPayload',
        declaration: 'export type EcadPingPayload = Record<string, unknown>;',
      }],
    }],
    events: [],
    objects: [],
  }
}

/**
 * Build the Host-face `TYPERT` manifest the loader imports from `./typert`.
 * @returns the manifest with one invocation and its reflection model.
 */
export function buildHostManifest() {
  return {
    package: ECAD_PACKAGE,
    face: 'host',
    schemas: [],
    invocations: [buildHostDescriptor()],
    model: buildHostModel(),
  }
}

/**
 * Build the contribution the browser half mounts with `ctx.remote.$mount`.
 *
 * The client descriptors carry strict codecs because `$mount` refuses
 * non-strict parameters; the codecs' `create()` factories are never called on
 * this side - the Host validates the wire value with the descriptor it
 * registered from `./typert`.
 * @returns `{ package, descriptors }`, the shape `TypertRemoteContribution` names.
 */
export function buildClientContribution() {
  const host = buildHostDescriptor()
  return {
    package: ECAD_PACKAGE,
    descriptors: [{
      id: host.id,
      service: host.service,
      namespace: host.namespace,
      method: host.method,
      description: host.description,
      invocation: host.invocation,
      parameters: host.parameters,
      result: host.result,
    }],
  }
}
