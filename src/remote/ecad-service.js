/**
 * Host half of the bundle's ECAD Remote service.
 *
 * The `viewers` row mounts this package root, which is what makes the Shell scan
 * the package for its client face and what makes the Typert loader import the
 * package's `./typert` artifact. That artifact registers the `ecad/<method>`
 * invocations; this module registers the Cordis service they dispatch to.
 *
 * The engine (`vendor/ecad/lib/engine`) is imported lazily on the first call, so
 * a profile that never opens a drawing does not pay for the DXF stack or for
 * `@mlightcad/data-model`. Every method returns a JSON envelope:
 * `{ ok: true, ... }` or `{ ok: false, error: { code, message, fix } }`.
 *
 * @module dsh-engineering-remote-service
 */

import { existsSync, mkdirSync, statSync } from 'node:fs'
import { readdir, writeFile as writeFileNode } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { bindTypertRemote } from '@deepseek-ai/dsh-typert-protocol'
import { ECAD_CONTRACT_VERSION, ECAD_METHODS, ECAD_NAMESPACE } from './ecad-contract.js'

/** The Cordis service key, and the Gateway binding the descriptor names. */
export const ECAD_SERVICE_KEY = ECAD_NAMESPACE

/** Largest drawing this service will read, matching the engine default. */
export const DEFAULT_MAX_FILE_BYTES = 64 * 1024 * 1024

/**
 * Service key a pre-retirement profile's row provided with its live write policy.
 *
 * The package-root row mounts this Remote service and the `ecad` row mounts the
 * tools; sibling rows may be applied in either order. Reading the policy on
 * every call, instead of relying on a one-time `configure` from the row's
 * the viewer, keeps the panel and the tools agreeing whichever mounted first.
 */
const POLICY_SERVICE = 'ecadPolicy'

/** Where cached render models live, relative to the session workspace. */
const PREVIEW_DIR = '.ecad/previews'
/** Where the workspace index lives, relative to the session workspace. */
const INDEX_FILE = '.ecad/index.json'
/** Where the confirmed workspace profile lives, relative to the session workspace. */
const PROFILE_FILE = '.ecad/profile.json'

/**
 * Engine module URLs, imported once per host process on first use.
 *
 * The assembled package vendors the engine under `vendor/ecad/`; the second
 * candidate is the repository's own compiled package before `pnpm assemble`,
 * so a developer checkout can exercise this service without packing first.
 */
const ENGINE_URLS = [
  new URL('../../vendor/ecad/lib/engine/index.js', import.meta.url),
  new URL('../../packages/ecad/lib/engine/index.js', import.meta.url),
]
let enginePromise
/** @returns the engine module. */
function engine() {
  enginePromise ??= (async () => {
    for (const url of ENGINE_URLS) {
      if (existsSync(url)) return import(url.href)
    }
    throw new EcadRemoteError(
      'ECAD_ENGINE_MISSING',
      'the ECAD engine is not installed beside this service',
      'Reinstall the engineering bundle, or in a repository checkout run `pnpm assemble` (or `tsc -p packages/ecad/tsconfig.json`) and retry.',
    )
  })()
  return enginePromise
}

/**
 * Converter module URLs, with the same vendor/repository fallback as the engine.
 *
 * The DWG converter is a separate module (`packages/ecad/src/dwg`):
 * `converterInfo`, `isDwg`, `dwgToDxf` and `dxfToDwg`, all byte-in/byte-out.
 * A build that ships without it keeps working and reports DWG as unavailable.
 */
const DWG_URLS = [
  new URL('../../vendor/ecad/lib/dwg/index.js', import.meta.url),
  new URL('../../packages/ecad/lib/dwg/index.js', import.meta.url),
]
let dwgPromise
/** @returns the converter module, or undefined when this build ships without it. */
function dwg() {
  dwgPromise ??= (async () => {
    for (const url of DWG_URLS) {
      if (existsSync(url)) return import(url.href)
    }
    return undefined
  })()
  return dwgPromise
}

/**
 * @param bytes - a drawing's bytes.
 * @returns true for a DWG container (every DWG version starts `AC10`).
 */
function isDwgBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 6) return false
  return bytes[0] === 0x41 && bytes[1] === 0x43 && bytes[2] === 0x31 && bytes[3] === 0x30
}

/**
 * Turn one workspace drawing into DXF bytes, converting a DWG first.
 * @param file - the bytes and workspace path `readWorkspaceFile` returned.
 * @returns DXF bytes, the source format and the conversion provenance.
 */
async function drawingDxfBytes(file) {
  const looksDwg = isDwgBytes(file.bytes) || file.relative.toLowerCase().endsWith('.dwg')
  if (!looksDwg) return { dxfBytes: file.bytes, format: 'dxf', converted: undefined }
  if (!isDwgBytes(file.bytes)) {
    throw new EcadRemoteError('ECAD_DWG_INVALID', `"${file.relative}" is named .dwg but does not contain a DWG header`, 'Check the file, or convert it to DXF first.')
  }
  const converter = await dwg()
  if (converter === undefined) {
    throw new EcadRemoteError('ECAD_DWG_UNAVAILABLE', 'DWG support is not installed in this build', 'Reinstall the engineering bundle with the embedded DWG converter, or convert the drawing to DXF.')
  }
  const info = await converter.converterInfo()
  if (info.kind === 'unavailable') {
    throw new EcadRemoteError('ECAD_DWG_UNAVAILABLE', 'the DWG converter is present but unavailable', 'Reinstall the engineering bundle, or convert the drawing to DXF.')
  }
  const converted = await converter.dwgToDxf(file.bytes, { maxBytes: DEFAULT_MAX_FILE_BYTES })
  return {
    dxfBytes: converted.dxf,
    format: 'dwg',
    converted: {
      converter: info.kind,
      converterVersion: info.version,
      sourceVersion: converted.version,
      warnings: converted.warnings ?? [],
    },
  }
}

/**
 * A failure the Remote envelope carries without a stack.
 *
 * The engine's own `EcadError` already has the shape; this class covers the
 * service's own preconditions (session, workspace, write switch).
 */
class EcadRemoteError extends Error {
  /**
   * @param code - machine-readable failure class.
   * @param message - what went wrong, naming the input.
   * @param fix - what the caller should do instead.
   */
  constructor(code, message, fix) {
    super(message)
    this.name = 'EcadRemoteError'
    this.code = code
    this.fix = fix
  }
}

/** @param error - anything caught. @returns the wire failure object. */
function toFailure(error) {
  if (error instanceof EcadRemoteError) return { code: error.code, message: error.message, fix: error.fix }
  if (error !== null && typeof error === 'object' && typeof error.code === 'string' && typeof error.message === 'string') {
    return {
      code: error.code,
      message: error.message,
      fix: typeof error.fix === 'string' ? error.fix : 'Re-open the drawing and retry; if the failure repeats, report the sheet so the gap can be measured.',
    }
  }
  return {
    code: 'ECAD_INTERNAL',
    message: error instanceof Error ? error.message : String(error),
    fix: 'Report this failure with the drawing name; the call did not complete.',
  }
}

/**
 * Run one envelope method.
 * @param body - the operation.
 * @returns `{ ok: true, ... }` or `{ ok: false, error }`.
 */
async function envelope(body) {
  try {
    const value = await body()
    return { ok: true, contractVersion: ECAD_CONTRACT_VERSION, ...value }
  } catch (error) {
    return { ok: false, contractVersion: ECAD_CONTRACT_VERSION, error: toFailure(error) }
  }
}

/**
 * Resolve the live session and its workspace root.
 * @param ctx - Host plugin context.
 * @param sessionId - the session the client names.
 * @returns the session object and its workspace root.
 */
function sessionWorkspace(ctx, sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new EcadRemoteError('ECAD_NO_SESSION', 'the call did not name a session', 'Reload the conversation and retry from the drawing panel.')
  }
  const sessions = ctx.get?.('sessions')
  const session = sessions?.get?.(sessionId)
  if (session === undefined) {
    throw new EcadRemoteError('ECAD_NO_SESSION', `the session "${sessionId}" is not live in this Host`, 'Retry from the conversation that owns the drawing; a closed session cannot reach the workspace.')
  }
  const cwd = session.header?.cwd
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new EcadRemoteError('ECAD_NO_WORKSPACE', 'the session has no workspace folder', 'Open the conversation in the folder that holds the prints, then retry.')
  }
  return { session, cwd }
}

/**
 * Resolve one workspace path and refuse an escape.
 * @param cwd - workspace root.
 * @param path - workspace-relative or absolute path the client named.
 * @returns the absolute and workspace-relative path.
 */
function workspacePathOf(cwd, path) {
  if (typeof path !== 'string' || path.length === 0) {
    throw new EcadRemoteError('ECAD_NO_PATH', 'the call named no drawing path', 'Pass the drawing path the panel shows, for example "Prints/DXF/A-101.dxf".')
  }
  const absolute = resolve(cwd, path)
  const rel = relative(cwd, absolute)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new EcadRemoteError('ECAD_OUTSIDE_WORKSPACE', `"${path}" is outside the session workspace`, 'Pass a path inside the workspace folder that holds the prints.')
  }
  return { absolute, relative: rel.split(sep).join('/') }
}

/** @param ctx - Host context. @param session - live session. @returns the sandbox policy, when the composition offers one. */
function sandboxPolicyFor(ctx, session) {
  const policy = ctx.get?.('sandboxPolicy')
  return policy === undefined || typeof policy.resolve !== 'function' ? undefined : policy.resolve({ session })
}

/**
 * Refuse a binary write the session policy does not allow.
 *
 * The shipped host filesystem service writes UTF-8 text only, so a drawing is
 * published with the local byte writer. That path must keep the same promises:
 * a read-only session refuses, and the destination has to sit inside the
 * workspace (or an additional writable root) the policy names.
 * @param absolute - absolute destination.
 * @param cwd - session workspace root.
 * @param policy - sandbox policy, when one is supplied.
 */
function assertBinaryWriteAllowed(absolute, cwd, policy) {
  if (policy === null || typeof policy !== 'object') return
  if (policy.mode === 'read-only') {
    throw new EcadRemoteError('ECAD_WRITE_REFUSED', `the session is read-only, so ${absolute} was not written`, 'Switch the session to Workspace Write and retry; nothing was written.')
  }
  const roots = []
  if (typeof policy.workspaceRoot === 'string') roots.push(policy.workspaceRoot)
  if (Array.isArray(policy.additionalWritableRoots)) {
    for (const root of policy.additionalWritableRoots) if (typeof root === 'string') roots.push(root)
  }
  if (roots.length === 0) roots.push(cwd)
  const target = resolve(absolute)
  const inside = roots.some((root) => {
    const rel = relative(resolve(root), target)
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  })
  if (!inside) {
    throw new EcadRemoteError('ECAD_WRITE_REFUSED', `${absolute} is outside the writable workspace, so it was not written`, 'Choose a destination inside the session workspace and retry; nothing was written.')
  }
}

/**
 * Read one workspace file through the Host filesystem service.
 * @param ctx - Host context.
 * @param cwd - workspace root.
 * @param path - workspace-relative path.
 * @param signal - optional cancellation.
 * @returns bytes, absolute path and workspace-relative path.
 */
async function readWorkspaceFile(ctx, cwd, path, signal) {
  const fs = ctx.get?.('fs')
  if (fs === undefined) throw new EcadRemoteError('ECAD_NO_FS', 'the composition offers no filesystem service', 'Run a full AryaCode profile with the engineering bundle mounted; the drawing cannot be read here.')
  const { absolute, relative: rel } = workspacePathOf(cwd, path)
  const target = await fs.resolve(absolute, { cwd })
  let info
  try {
    info = await fs.stat(target)
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') {
      throw new EcadRemoteError('ECAD_NOT_A_FILE', `"${rel}" does not exist in this workspace`, 'Check the path with the document tab or the file browser, then retry.')
    }
    throw error
  }
  if (info === undefined || info.type !== 'file') {
    throw new EcadRemoteError('ECAD_NOT_A_FILE', `"${rel}" is not a readable file`, 'Check the path with the file browser, then retry.')
  }
  const bytes = await fs.readBytes(target, signal, DEFAULT_MAX_FILE_BYTES + 1)
  if (bytes.length > DEFAULT_MAX_FILE_BYTES) {
    throw new EcadRemoteError('ECAD_TOO_LARGE', `"${rel}" is larger than ${DEFAULT_MAX_FILE_BYTES} bytes`, 'Split the drawing; the viewer reads files up to 64 MiB in this build.')
  }
  return { bytes, absolute, relative: rel }
}

/**
 * Write one workspace file through the Host filesystem service.
 * @param ctx - Host context.
 * @param session - live session (sandbox policy owner).
 * @param cwd - workspace root.
 * @param path - workspace-relative path.
 * @param data - text or bytes.
 * @param kind - `createIfAbsent` for user outputs, `overwrite` for the service's own cache.
 */
async function writeWorkspaceFile(ctx, session, cwd, path, data, kind) {
  const fs = ctx.get?.('fs')
  if (fs === undefined) throw new EcadRemoteError('ECAD_NO_FS', 'the composition offers no filesystem service', 'Run a full AryaCode profile with the engineering bundle mounted.')
  const { absolute } = workspacePathOf(cwd, path)
  // The service owns `.ecad/`, including its directories; the fs service writes the file itself.
  mkdirSync(dirname(absolute), { recursive: true })
  const target = await fs.resolve(absolute, { cwd })
  const policy = sandboxPolicyFor(ctx, session)
  if (typeof data === 'string') {
    await fs.writeText(target, data, { kind }, undefined, policy)
    return
  }
  if (typeof fs.writeBytes === 'function') {
    await fs.writeBytes(target, data, { kind }, undefined, policy)
    return
  }
  assertBinaryWriteAllowed(absolute, cwd, policy)
  try {
    await writeFileNode(absolute, data, kind === 'createIfAbsent' ? { flag: 'wx' } : undefined)
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'EEXIST') {
      throw new EcadRemoteError('ECAD_EXISTS', `"${path}" already exists`, 'Choose a new output name; this service never overwrites a drawing.')
    }
    throw new EcadRemoteError('ECAD_WRITE_REFUSED', `writing "${path}" failed: ${error instanceof Error ? error.message : String(error)}`, 'Check the workspace permissions and retry; nothing was written.')
  }
}

/** @param relPath - workspace path. @returns the preview artifact path keyed by the path itself. */
async function previewPathFor(relPath) {
  const { sha256 } = await engine()
  const key = sha256(new TextEncoder().encode(relPath))
  return `${PREVIEW_DIR}/${key}.json`
}

/**
 * Write the render-model artifact the panel reads.
 * @param ctx - Host context.
 * @param session - live session.
 * @param cwd - workspace root.
 * @param relPath - the drawing's workspace path.
 * @param version - source bytes hash.
 * @param model - the render model.
 * @returns the workspace-relative artifact path.
 */
async function writePreview(ctx, session, cwd, relPath, version, model) {
  const path = await previewPathFor(relPath)
  const payload = {
    schema: 1,
    contractVersion: ECAD_CONTRACT_VERSION,
    path: relPath,
    version,
    generatedAt: new Date().toISOString(),
    model,
  }
  await writeWorkspaceFile(ctx, session, cwd, path, `${JSON.stringify(payload)}\n`, 'overwrite')
  return path
}

/**
 * Read one workspace text file through the byte API.
 *
 * The Host filesystem contract has no text reader; profiles and index files are
 * this service's own UTF-8 JSON artifacts, so decoding them here is lossless.
 * @param fs - Host filesystem service.
 * @param target - resolved target (or path) the service returned.
 * @returns the file text.
 */
async function readTextTarget(fs, target) {
  const bytes = await fs.readBytes(target, undefined, 8 * 1024 * 1024)
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

/**
 * Resolve the cached workspace index, when it exists.
 * @param ctx - Host context.
 * @param session - live session.
 * @param cwd - workspace root.
 * @returns a path → sheet summary map, or an empty map.
 */
async function cachedSheetSummaries(ctx, session, cwd) {
  const fs = ctx.get?.('fs')
  if (fs === undefined) return new Map()
  try {
    const target = await fs.resolve(join(cwd, INDEX_FILE), { cwd })
    const info = await fs.stat(target)
    if (info === undefined) return new Map()
    const text = await readTextTarget(fs, target)
    const parsed = JSON.parse(text)
    const sheets = Array.isArray(parsed?.sheets) ? parsed.sheets : []
    return new Map(sheets.filter(sheet => typeof sheet?.path === 'string').map(sheet => [sheet.path, sheet]))
  } catch {
    return new Map()
  }
}

/**
 * Read the confirmed workspace profile, falling back to the defaults.
 *
 * A pre-retirement profile could write `.ecad/profile.json` when a person confirmed
 * the inferred conventions; until then the panel and the service use the engine
 * defaults and report `profileSource: 'default'`.
 * @param ctx - Host context.
 * @param cwd - workspace root.
 * @param engineModule - the loaded engine module.
 * @returns the profile and where it came from.
 */
async function loadWorkspaceProfile(ctx, cwd, engineModule) {
  const fs = ctx.get?.('fs')
  if (fs === undefined) return { profile: engineModule.defaultProfile(), source: 'default' }
  try {
    const target = await fs.resolve(join(cwd, PROFILE_FILE), { cwd })
    const info = await fs.stat(target)
    if (info === undefined) return { profile: engineModule.defaultProfile(), source: 'default' }
    const text = await readTextTarget(fs, target)
    return { profile: engineModule.loadProfile(text), source: 'workspace' }
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') {
      return { profile: engineModule.defaultProfile(), source: 'default' }
    }
    throw new EcadRemoteError(
      'ECAD_PROFILE_INVALID',
      `the workspace profile could not be read: ${error instanceof Error ? error.message : String(error)}`,
      'Delete .ecad/profile.json to fall back to the defaults; the drawing viewer never requires a profile.',
    )
  }
}

/**
 * Walk the workspace for drawings, bounded in depth and count.
 * @param cwd - workspace root.
 * @param limit - most drawings to collect.
 * @param extensions - lower-case extensions to collect, for example `['.dxf', '.dwg']`.
 * @returns drawing rows with their sizes.
 */
async function listDrawings(cwd, limit, extensions = ['.dxf']) {
  const found = []
  let truncated = false
  /**
   * @param directory - directory to walk.
   * @param depth - nesting depth.
   */
  async function walk(directory, depth) {
    if (found.length >= limit) return
    if (depth > 8) { truncated = true; return }
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (found.length >= limit) { truncated = true; return }
      const name = entry.name
      if (entry.isDirectory()) {
        if (name === 'node_modules' || name === 'backups' || name === '.git' || name === '.ecad' || name.startsWith('.')) continue
        await walk(join(directory, name), depth + 1)
        continue
      }
      const lower = name.toLowerCase()
      if (!entry.isFile() || !extensions.some(extension => lower.endsWith(extension))) continue
      const absolute = join(directory, name)
      let bytes
      try {
        bytes = statSync(absolute).size
      } catch {
        bytes = undefined
      }
      const rel = relative(cwd, absolute)
      if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) continue
      found.push({ path: rel.split(sep).join('/'), bytes })
    }
  }
  await walk(cwd, 0)
  found.sort((a, b) => a.path.localeCompare(b.path))
  return { rows: found, truncated }
}

/**
 * Create the ECAD Remote service and register its Gateway binding.
 *
 * @param ctx - Host plugin context from the package-root row.
 * @returns the service object, so a composition test can configure it.
 */
export function createEcadService(ctx) {
  /** Writes stay off in this viewer-only build. */
  let writesEnabled = false
  /** The legacy live policy, when an old profile still mounts the retired row. */
  const policyOf = () => {
    try {
      const policy = ctx.get?.(POLICY_SERVICE)
      return policy !== null && typeof policy === 'object' ? policy : undefined
    } catch {
      return undefined
    }
  }
  /** The legacy config a pre-retirement profile may still carry, read from the Loader that booted the app. */
  const rowConfigOf = () => {
    try {
      const loader = ctx.loader ?? ctx.get?.('loader')
      if (loader === undefined || typeof loader.entries !== 'function') return undefined
      for (const entry of loader.entries()) {
        if (entry?.options?.id !== 'ecad') continue
        const config = entry.options.config
        return config !== null && typeof config === 'object' ? config : undefined
      }
    } catch {
      // The Loader is a host service; a test double or a future host may not have it.
    }
    return undefined
  }
  const writesNow = () => {
    const row = rowConfigOf()?.writes
    const live = row !== null && typeof row === 'object' && typeof row.get === 'function' ? row.get() : row
    if (typeof live === 'boolean') return live
    const policy = policyOf()
    return policy !== undefined && typeof policy.writes === 'boolean' ? policy.writes : writesEnabled
  }
  const service = {
    /** The Cordis service key the descriptors name, exposed for tests. */
    serviceKey: ECAD_SERVICE_KEY,
    /** Whether deliverable writes are enabled. Read from the legacy policy when an old profile provides it. */
    get writes() { return writesNow() },
    /**
     * Apply the legacy write policy.
     * @param config - `{ writes?: boolean, maxFileBytes?: number }`.
     * @returns the stored policy.
     */
    configure(config = {}) {
      writesEnabled = config.writes === true
      return { writes: writesEnabled }
    },
    /**
     * Open a drawing and cache its render model.
     * @param sessionId - live session id.
     * @param path - workspace-relative drawing path.
     * @returns the Remote envelope.
     */
    async open(sessionId, path) {
      return envelope(async () => {
        const { session, cwd } = sessionWorkspace(ctx, sessionId)
        const engineModule = await engine()
        const { profile, source: profileSource } = await loadWorkspaceProfile(ctx, cwd, engineModule)
        const file = await readWorkspaceFile(ctx, cwd, path)
        const drawing = await drawingDxfBytes(file)
        const opened = await engineModule.openSheet({ path: file.relative, bytes: drawing.dxfBytes, maxFileBytes: DEFAULT_MAX_FILE_BYTES })
        const version = engineModule.sha256(file.bytes)
        const model = engineModule.buildSheetModel(opened)
        const titleBlock = engineModule.detectTitleBlock(opened, profile)
        const modelPath = await writePreview(ctx, session, cwd, file.relative, version, model)
        const unsupported = Object.values(model.stats.unsupported).reduce((total, count) => total + count, 0)
        return {
          path: file.relative,
          sourceBytes: file.bytes.length,
          version,
          format: drawing.format,
          converted: drawing.converted,
          dxfVersion: model.dxfVersion,
          units: model.units,
          layouts: model.layouts.map(layout => ({ id: layout.id, name: layout.name, kind: layout.kind, entities: layout.entities.length })),
          entities: model.stats.entities,
          unsupported,
          approximate: model.stats.approximate,
          truncated: model.stats.truncated,
          titleBlock,
          modelPath,
          profileSource,
          writes: writesNow(),
        }
      })
    },
    /**
     * Open a drawing and cache its render model.
     * @param sessionId - live session id.
     * @param limit - most drawings to return.
     * @returns the Remote envelope.
     */
    async sheets(sessionId, limit) {
      return envelope(async () => {
        const { session, cwd } = sessionWorkspace(ctx, sessionId)
        const cap = Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), 2000) : 500
        const converter = await dwg()
        let dwgAvailable = false
        let converterVersion
        if (converter !== undefined) {
          try {
            const info = await converter.converterInfo()
            dwgAvailable = info.kind !== 'unavailable'
            converterVersion = info.version
          } catch {
            dwgAvailable = false
          }
        }
        const extensions = dwgAvailable ? ['.dxf', '.dwg'] : ['.dxf']
        const { rows, truncated } = await listDrawings(cwd, cap, extensions)
        const indexCache = await cachedSheetSummaries(ctx, session, cwd)
        return {
          workspace: cwd,
          dwg: { available: dwgAvailable, converterVersion },
          sheets: rows.map(row => {
            const cached = indexCache.get(row.path)
            return {
              path: row.path,
              format: row.path.toLowerCase().endsWith('.dwg') ? 'dwg' : 'dxf',
              bytes: row.bytes,
              sheetNumber: cached?.sheetNumber,
              title: cached?.title,
              titleBlock: cached?.titleBlock,
            }
          }),
          truncated,
          indexed: indexCache.size > 0,
        }
      })
    },
    /**
     * Report the ECAD surface.
     * @param sessionId - live session id.
     * @returns the Remote envelope.
     */
    async capabilities(sessionId) {
      return envelope(async () => {
        const { cwd } = sessionWorkspace(ctx, sessionId)
        const engineModule = await engine()
        const { source: profileSource } = await loadWorkspaceProfile(ctx, cwd, engineModule)
        const converter = await dwg()
        let dwgState = { available: false, kind: 'unavailable', version: undefined, versions: [] }
        if (converter !== undefined) {
          try {
            const info = await converter.converterInfo()
            dwgState = {
              available: info.kind !== 'unavailable',
              kind: info.kind,
              version: info.version,
              versions: Array.isArray(info.versions) ? [...info.versions] : [],
            }
          } catch (error) {
            dwgState = { available: false, kind: 'unavailable', version: undefined, versions: [], error: error instanceof Error ? error.message : String(error) }
          }
        }
        return {
          contractVersion: ECAD_CONTRACT_VERSION,
          engine: dwgState.available ? 'dxf+dwg' : 'dxf',
          dwg: dwgState,
          writes: writesNow(),
          maxFileBytes: DEFAULT_MAX_FILE_BYTES,
          methods: ECAD_METHODS.map(method => method.method),
          profileSource,
          workspace: cwd,
        }
      })
    },
  }
  // Explicit Service-to-Gateway binding: the Gateway refuses a descriptor whose
  // service does not expose `typertRemote`, artifact or source mode alike.
  service.typertRemote = bindTypertRemote(service, ECAD_SERVICE_KEY)
  ctx.provide?.(ECAD_SERVICE_KEY, service)
  return service
}

/** Kept for callers that import the constant from the service module. */
export { ECAD_CONTRACT_VERSION, ECAD_METHODS, ECAD_NAMESPACE }
