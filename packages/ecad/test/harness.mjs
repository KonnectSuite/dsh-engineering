/**
 * Test harness for the ECAD tools.
 *
 * Mirrors the host contract rather than approximating it: `fs.resolve` returns an
 * `FsTarget` object (the host's shape, not a string), writes take a write intent
 * and the sandbox policy, listDir returns child targets, and the tool context
 * carries `get`/`provide`/`effect` exactly as Cordis does. Fixtures are the
 * committed synthetic DXFs; nothing here reaches the customer print set.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply } from '../src/index.ts'

/** Folder holding the committed fixtures. */
export const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

/** The fake workspace root every path resolves under. */
export const WS = '/ws'

/**
 * Bytes of one committed fixture.
 *
 * @param name - fixture file name.
 */
export function fixtureBytes(name) {
  return new Uint8Array(readFileSync(join(fixturesDir, name)))
}

/**
 * Normalise one path against a workspace root, collapsing `.` and `..`.
 *
 * @param path - caller path.
 * @param cwd - workspace root.
 */
function normalizePath(path, cwd) {
  let value = String(path).replace(/\\/gu, '/')
  const base = String(cwd ?? WS).replace(/\\/gu, '/')
  if (!value.startsWith('/')) value = `${base.replace(/\/+$/u, '')}/${value}`
  const parts = []
  for (const segment of value.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      parts.pop()
      continue
    }
    parts.push(segment)
  }
  return `/${parts.join('/')}`
}

/** The path of an FsTarget (or a string a lenient provider returned). */
function targetOf(target) {
  return typeof target === 'string' ? target : target.displayPath
}

/**
 * Build a plugin harness with an in-memory workspace.
 *
 * @param files - initial path → text|bytes.
 * @param options - write switch, provider capabilities, policy/service seeding.
 * @returns definitions, the mutable workspace and a call helper.
 */
export function harness(files = new Map(), options = {}) {
  /** Current workspace contents, path → bytes. */
  const store = new Map()
  for (const [path, value] of files) store.set(normalizePath(path), typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value))
  const definitions = []
  /** Tool names a mounted MCP server contributes to the composition, added by `addBridgeTool`. */
  const extraTools = []
  const written = []
  const deleted = []
  const writeCalls = []
  const resolveCalls = []
  const configureCalls = []
  const policyResolveCalls = []
  const disposers = []
  const warnings = []
  const services = new Map()
  const exec = { cwd: options.cwd ?? WS, chat: options.chat ?? {} }

  const exists = (path) => store.has(path) || [...store.keys()].some(key => key.startsWith(`${path}/`))
  const childrenOf = (path) => {
    const prefix = `${path.replace(/\/+$/u, '')}/`
    const children = new Map()
    for (const key of store.keys()) {
      if (!key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      const separator = rest.indexOf('/')
      children.set(separator < 0 ? rest : rest.slice(0, separator), separator < 0 ? 'file' : 'directory')
    }
    return [...children].map(([name, type]) => ({ name, type, target: { targetKey: `${path}/${name}`, displayPath: `${path}/${name}` } }))
  }

  const fs = {
    async resolve(path, resolveOptions) {
      const displayPath = normalizePath(path, resolveOptions?.cwd ?? exec.cwd)
      const target = { targetKey: displayPath, displayPath }
      resolveCalls.push({ path, target })
      return target
    },
    async stat(target) {
      const path = targetOf(target)
      const bytes = store.get(path)
      if (bytes !== undefined) return { type: 'file', size: bytes.byteLength }
      if (exists(path) && childrenOf(path).length > 0) return { type: 'directory' }
      return undefined
    },
    async readBytes(target, _signal, maxBytes) {
      const path = targetOf(target)
      const bytes = store.get(path)
      if (bytes === undefined) {
        const error = new Error(`missing ${path}`)
        error.code = 'FS_NOT_FOUND'
        throw error
      }
      if (typeof maxBytes === 'number' && bytes.byteLength > maxBytes) {
        const error = new Error(`${path} exceeds ${maxBytes} bytes`)
        error.code = 'FS_TOO_LARGE'
        throw error
      }
      return bytes
    },
    ...(options.listDir === false ? {} : { listDir: async target => childrenOf(targetOf(target)) }),
    ...(options.write === false
      ? {}
      : {
          writeText: async (target, text, expected, _signal, policy) => {
            const path = targetOf(target)
            writeCalls.push({ path, policy })
            if (expected?.kind === 'createIfAbsent' && store.has(path)) {
              const error = new Error(`${path} already exists`)
              error.code = 'FS_NOT_OBSERVED'
              throw error
            }
            const bytes = new TextEncoder().encode(text)
            store.set(path, bytes)
            written.push({ path, bytes })
            return { operation: store.has(path) ? 'update' : 'create', version: 'v1' }
          },
          writeBytes: async (target, bytes, expected, _signal, policy) => {
            const path = targetOf(target)
            writeCalls.push({ path, policy })
            if (expected?.kind === 'createIfAbsent' && store.has(path)) {
              const error = new Error(`${path} already exists`)
              error.code = 'FS_NOT_OBSERVED'
              throw error
            }
            store.set(path, new Uint8Array(bytes))
            written.push({ path, bytes: new Uint8Array(bytes) })
            return { operation: 'create', version: 'v1' }
          }
        }),
    ...(options.delete === false
      ? {}
      : {
          deleteFile: async target => {
            const path = targetOf(target)
            if (!store.has(path)) {
              const error = new Error(`${path} not found`)
              error.code = 'FS_STALE_VERSION'
              throw error
            }
            store.delete(path)
            deleted.push(path)
          }
        })
  }

  const remoteService = {
    writes: false,
    configure(config = {}) {
      configureCalls.push(config)
      if (options.configureThrows === true) throw new Error('service refused the policy')
      remoteService.writes = config.writes === true
      return { writes: remoteService.writes }
    }
  }
  if (options.service === true) services.set('ecad', remoteService)
  if (options.policy === true) {
    services.set('sandboxPolicy', {
      resolve(resolveOptions) {
        policyResolveCalls.push(resolveOptions)
        return { mode: 'danger-full-access', workspace: WS }
      }
    })
  }

  const ctx = {
    tools: {
      register(definition) { definitions.push(definition) },
      // The read face a real registry exposes is optional on ToolRegistry, and
      // `ecad_capabilities` uses it to report which AryaCAD bridge tools are live.
      // `bridge: false` models a host that cannot answer at all; `addBridgeTool`
      // models a server whose tools appeared in the composition.
      ...(options.bridge === false
        ? {}
        : {
            definitions: () => [
              ...definitions.map(definition => ({ name: definition.name })),
              ...extraTools.map(name => ({ name })),
            ],
          }),
    },
    fs,
    get(name) { return services.get(name) },
    provide(name, value) { services.set(name, value) },
    effect(callback) {
      const disposer = callback()
      if (typeof disposer === 'function') disposers.push(disposer)
      return disposer
    },
    logger: { warn(message) { warnings.push(message) } }
  }

  apply(ctx, { writes: options.writes === true, ...(options.config ?? {}) })

  const byName = new Map(definitions.map(definition => [definition.name, definition]))
  return {
    definitions,
    fs,
    files: store,
    written,
    deleted,
    writeCalls,
    resolveCalls,
    configureCalls,
    policyResolveCalls,
    disposers,
    warnings,
    services,
    remoteService,
    ctx,
    exec,
    /** Name a tool as contributed by a mounted MCP server, after the row applied. */
    addBridgeTool(name) {
      extraTools.push(name)
    },
    call(name, args = {}, execOverride = {}) {
      const definition = byName.get(name)
      if (definition === undefined) throw new Error(`no tool ${name}`)
      return definition.execute(args, { ...exec, ...execOverride })
    },
    disposeAll() {
      for (const disposer of disposers.reverse()) disposer()
    }
  }
}
