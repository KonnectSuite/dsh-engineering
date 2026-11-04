/**
 * The wire contract of the bundle's ECAD Remote service.
 *
 * The engineering bundle is a third-party package: it ships its own Typert
 * artifacts instead of generated ones. `scripts/build-client.mjs` turns
 * {@link buildHostManifest} into `lib/typert.host.js` (the package's `"./typert"`
 * export, imported by the Host's typert loader while the `viewers` row mounts
 * the package root). The client face imports {@link buildClientContribution} and
 * mounts it with `ctx.remote.$mount`, which installs `ctx.remote.ecad.<method>`.
 *
 * Both faces must agree on every endpoint, parameter order, wire name and codec
 * mode; a mismatch presents as `gateway/arguments-invalid` or as a descriptor the
 * loader refuses, so those facts live here once.
 *
 * @module dsh-engineering-remote-contract
 */

/** The package that owns the contribution. The loader checks this against the manifest. */
export const ECAD_PACKAGE = '@aryacode/dsh-engineering'
/** Remote namespace, Cordis service key, and the service the Gateway dispatches to. */
export const ECAD_NAMESPACE = 'ecad'
/** Wire contract version the client checks against `capabilities`. */
export const ECAD_CONTRACT_VERSION = 1

/**
 * One strict codec over the shape a parameter or result carries.
 *
 * A strict codec carries a `create()` factory the Gateway calls to parse the wire
 * value exactly once. There is no `encode`: every value on this wire is already
 * JSON. `accept` is the only check this hand-written artifact can promise, and it
 * is deliberately structural (the Host method validates the domain meaning).
 * @param typeSymbol - the generated-type identity this codec stands for.
 * @param accept - structural predicate a JSON value must satisfy.
 * @param jsonSchema - the JSON Schema projection the catalog can carry.
 * @param description - optional prose for the parameter's wire description.
 * @returns a fresh strict codec; each descriptor owns its own instance.
 */
export function jsonCodec(typeSymbol, accept, jsonSchema, description) {
  return {
    mode: 'strict',
    typeSymbol,
    create() {
      return {
        parse(value) {
          if (accept(value) !== true) throw new TypeError(`${typeSymbol}: unexpected wire value`)
          return value
        },
      }
    },
    jsonSchema,
    ...(description === undefined ? {} : { description }),
  }
}

/** @returns true when `value` is a string with at least one character. */
const nonEmptyString = value => typeof value === 'string' && value.length > 0
/** @returns true when `value` is a finite number. */
const finiteNumber = value => typeof value === 'number' && Number.isFinite(value)
/** @returns true when `value` is a JSON object (not an array or null). */
const jsonObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
/** @returns true when `value` is a JSON array. */
const jsonArray = value => Array.isArray(value)

/**
 * One parameter of one method: name and wire name are the same, order is the
 * positional call order, and the codec is what both faces must agree on.
 * @param name - positional and wire name.
 * @param description - wire description.
 * @param accept - structural predicate.
 * @param jsonSchema - JSON Schema projection.
 * @returns one method parameter spec.
 */
function parameter(name, description, accept, jsonSchema) {
  return { name, wire: name, description, source: 'json', accept, jsonSchema }
}

/** The methods this bundle exposes, in registration order. */
export const ECAD_METHODS = [
  {
    method: 'open',
    description:
      'Open a drawing (DXF, or DWG through the embedded converter) from the session workspace, cache its render model under .ecad/previews, and return the model path the panel reads.',
    signature: 'async open(sessionId: string, path: string): Promise<EcadOpenResult>',
    parameters: [
      parameter('sessionId', 'the session whose workspace holds the drawing', nonEmptyString, { type: 'string' }),
      parameter('path', 'workspace-relative path of the drawing (a .dxf file)', nonEmptyString, { type: 'string' }),
    ],
    result: parameter('result', 'the open result: version, model path and a short summary', jsonObject, { type: 'object' }),
  },
  {
    method: 'apply',
    description:
      'Apply a staged draft to a NEW drawing beside the source (same format, never overwriting it), re-read the written file and return the verification.',
    signature: 'async apply(sessionId: string, path: string, baseVersion: string, ops: readonly EcadOp[]): Promise<EcadApplyResult>',
    parameters: [
      parameter('sessionId', 'the session whose workspace holds the drawing', nonEmptyString, { type: 'string' }),
      parameter('path', 'workspace-relative path of the source drawing', nonEmptyString, { type: 'string' }),
      parameter('baseVersion', 'SHA-256 of the source bytes the draft was staged against', nonEmptyString, { type: 'string' }),
      parameter('ops', 'the staged operations, in application order', jsonArray, { type: 'array' }),
    ],
    result: parameter('result', 'the apply result: output path, version and verification', jsonObject, { type: 'object' }),
  },
  {
    method: 'sheets',
    description: 'List the drawings (DXF, and DWG when the converter is available) in the session workspace, optionally enriched from the cached .ecad index.',
    signature: 'async sheets(sessionId: string, limit?: number): Promise<EcadSheetsResult>',
    parameters: [
      parameter('sessionId', 'the session whose workspace is scanned', nonEmptyString, { type: 'string' }),
      parameter('limit', 'most drawings to return (default 500)', finiteNumber, { type: 'number' }),
    ],
    result: parameter('result', 'the drawing list', jsonObject, { type: 'object' }),
  },
  {
    method: 'capabilities',
    description: 'Report the ECAD surface: contract version, whether writes are enabled, engine limits and the DWG converter state.',
    signature: 'async capabilities(sessionId: string): Promise<EcadCapabilitiesResult>',
    parameters: [
      parameter('sessionId', 'the session to report the workspace for', nonEmptyString, { type: 'string' }),
    ],
    result: parameter('result', 'the capability report', jsonObject, { type: 'object' }),
  },
]

/** @param method - one method spec. @returns descriptor type symbol. */
const descriptorTypeSymbol = method => `${ECAD_PACKAGE}#${ECAD_NAMESPACE}/${method.method}`

/**
 * Build the Host descriptor the typert loader registers in `ctx.typert`.
 *
 * `service` is the Cordis service key the Gateway dispatches to; the loader does
 * not check that link, so the Host half registers exactly this service.
 * @param method - one method spec from {@link ECAD_METHODS}.
 * @returns a direct invocation descriptor with strict input and result codecs.
 */
export function buildHostDescriptor(method) {
  const base = descriptorTypeSymbol(method)
  return {
    id: `${ECAD_PACKAGE}#${ECAD_NAMESPACE}/${method.method}`,
    service: ECAD_NAMESPACE,
    namespace: ECAD_NAMESPACE,
    method: method.method,
    description: method.description,
    invocation: { kind: 'direct' },
    parameters: method.parameters.map((meta, index) => ({
      name: meta.name,
      wire: meta.wire,
      description: meta.description,
      source: 'json',
      codec: jsonCodec(`${base}:parameter:${index}`, meta.accept, meta.jsonSchema),
    })),
    result: jsonCodec(`${base}:result`, method.result.accept, method.result.jsonSchema, method.result.description),
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
      description: 'Engineering bundle Remote service for ECAD drawings: open, apply, sheets and capabilities.',
      summary: 'ECAD drawings: open a sheet model, apply a verified draft, list workspace drawings.',
      tags: [],
      jsDoc: '/** Engineering bundle Remote service for ECAD drawings. */',
      key: ECAD_NAMESPACE,
      exportName: 'Ecad',
      members: ECAD_METHODS.map(method => ({
        kind: 'method',
        name: method.method,
        signature: `@Remote ${method.signature}`,
        summary: method.description,
        jsDoc: `/**\n * ${method.description}\n */`,
      })),
      types: [],
    }],
    events: [],
    objects: [],
  }
}

/**
 * Build the Host-face `TYPERT` manifest the loader imports from `./typert`.
 * @returns the manifest with one invocation per ECAD method and its model.
 */
export function buildHostManifest() {
  return {
    package: ECAD_PACKAGE,
    face: 'host',
    schemas: [],
    invocations: ECAD_METHODS.map(buildHostDescriptor),
    model: buildHostModel(),
  }
}

/**
 * Build the contribution the browser half mounts with `ctx.remote.$mount`.
 *
 * Client descriptors carry strict codecs because `$mount` refuses non-strict
 * parameters; the codecs' `create()` factories are never called on this side -
 * the Host validates the wire value with the descriptor its `./typert` artifact
 * registered.
 * @returns `{ package, descriptors }`, the shape `TypertRemoteContribution` names.
 */
export function buildClientContribution() {
  return {
    package: ECAD_PACKAGE,
    descriptors: ECAD_METHODS.map((method) => {
      const host = buildHostDescriptor(method)
      return {
        id: host.id,
        service: host.service,
        namespace: host.namespace,
        method: host.method,
        description: host.description,
        invocation: host.invocation,
        parameters: host.parameters,
        result: host.result,
      }
    }),
  }
}
