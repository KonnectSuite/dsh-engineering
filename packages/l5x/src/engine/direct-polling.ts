/** Read-only EtherNet/IP sampling isolated from Studio SDK and shared host lifetimes. */
import { Worker } from 'node:worker_threads'
import { isIPv4 } from 'node:net'
import { EngineeringError, type ProjectSnapshot } from '../session.ts'
import { aliasesOf } from './configuration.ts'
import { findReferences } from './analysis.ts'
import { resolveTag } from './tag-resolution.ts'
import { controllerElementOf } from '../model/parse.ts'
import { elementChildren, firstChild } from '../model/xml.ts'
import type { LogicSample } from './observations.ts'

/** Deployment limits for SDK-independent controller reads. */
export interface PollingConfig {
  enabled: boolean
  minIntervalMs: number
  defaultIntervalMs: number
  maxTags: number
  maxSamples: number
  maxDurationMs: number
  requestTimeoutMs: number
  maxConcurrent: number
  allowedAddresses: readonly string[]
  displayRefreshMs: number
  displayMaxSamples: number
}
/** Explicit scalar operand and its project scope. */
export interface PollTag { name: string; program?: string; data_type: 'BOOL' | 'INT' | 'DINT' | 'REAL' }
/** Resolved request passed to the isolated driver. */
export interface PollRequest { ip: string; slot: number; tags: PollTag[]; samples: number; interval: number; timeout: number }
/** Complete sampled sweep; bad values remain gaps. */
export interface PollSample extends LogicSample { index: number; overrun: boolean }
/** Controller identity is observed over CIP, never inferred from an export. */
export interface PollIdentity { product_name: string; serial_number: number; revision: string; status: number }
/** Validated frames retained or forwarded by the owning host. */
export type PollFrame = { type: 'identity'; controller: PollIdentity } | ({ type: 'sample' } & PollSample)
/** One worker's lifetime, cancelled only by its owner. */
export interface PollHandle { cancel(): void; done: Promise<PollFrame[]> }

/**
 * Resolve declared scalar tags and bounds before making any network connection.
 * @param project - Fresh export snapshot.
 * @param input - Model arguments.
 * @param config - Resolved deployment limits.
 * @returns Worker request and source-linked operand evidence.
 */
export function pollingRequest(project: ProjectSnapshot, input: Readonly<Record<string, unknown>>, config: PollingConfig) {
  if (!config.enabled) throw new EngineeringError('DIRECT_POLLING_DISABLED', 'Enable directPollingEnabled to use SDK-independent reads')
  const ip = input.ip_address
  if (typeof ip !== 'string' || !isIPv4(ip) || (config.allowedAddresses.length > 0 && !config.allowedAddresses.includes(ip)))
    throw new EngineeringError('INVALID_CONTROLLER', 'Select an explicit IPv4 address allowed by this profile')
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const value = input[key] ?? fallback
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
      throw new EngineeringError('INVALID_POLL', `${key} must be between ${min} and ${max}`)
    return value
  }
  const slot = integer('slot', 0, 0, 31)
  const samples = integer('sample_count', 1, 1, config.maxSamples)
  const interval = integer('interval_ms', config.defaultIntervalMs, config.minIntervalMs, config.maxDurationMs)
  if ((samples - 1) * interval > config.maxDurationMs) throw new EngineeringError('INVALID_POLL', 'Requested window exceeds directPollingMaxDurationMs')
  const raw: unknown = typeof input.tags_json === 'string' ? JSON.parse(input.tags_json) : null
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > config.maxTags)
    throw new EngineeringError('INVALID_POLL', `tags_json must contain 1 through ${config.maxTags} declared scalar tags`)
  const seen = new Set<string>()
  const tags = raw.map((entry: unknown): PollTag => {
    if (!entry || typeof entry !== 'object' || !('name' in entry) || typeof entry.name !== 'string'
      || !/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u.test(entry.name) || !Object.keys(entry).every(key => key === 'name' || key === 'scope'))
      throw new EngineeringError('INVALID_POLL', 'Each tag needs an exact scalar name and optional scope only')
    const scope = 'scope' in entry ? entry.scope : 'controller'
    if (typeof scope !== 'string' || (scope !== 'controller' && !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(scope)))
      throw new EngineeringError('INVALID_POLL', 'scope must be controller or an exact program name')
    // A trend may watch one scalar member (Timer.PRE); the declaration lives on the base tag.
    const base = entry.name.split('.')[0] ?? entry.name
    const declared = project.document.tags.find(tag => tag.name === base && tag.scope === scope)
    const controller = controllerElementOf(project.document)
    const programs = firstChild(controller, 'Programs')
    const container = scope === 'controller' ? controller : programs === undefined ? undefined
      : elementChildren(programs, 'Program').find(program => program.attrs.Name === scope)
    const tagContainer = container === undefined ? undefined : firstChild(container, 'Tags')
    const declaration = tagContainer === undefined ? undefined : elementChildren(tagContainer, 'Tag').find(tag => tag.attrs.Name === base)
    const dimensions = declaration?.attrs.Dimensions ?? declaration?.attrs.Dimension ?? ''
    // A poll is a read: an alias is a normal operand, and ExternalAccess only
    // stops writes. Refusing aliases made every module-point BOOL unmonitorable.
    const scalars = ['BOOL', 'INT', 'DINT', 'REAL']
    let type = declared !== undefined && scalars.includes(declared.dataType) ? declared.dataType : ''
    if (type === '' && declared !== undefined) {
      const resolution = resolveTag(project.document, scope, entry.name)
      if (resolution.resolved && resolution.data_type !== undefined && scalars.includes(resolution.data_type)) type = resolution.data_type
    }
    if (!declared || type === '' || (dimensions !== '' && dimensions !== '0'))
      throw new EngineeringError('UNSUPPORTED_POLL_TAG', 'Select a declared scalar BOOL, INT, DINT, or REAL, or one scalar member (aliases are read through; arrays are refused)')
    const key = `${scope}::${entry.name}`.toLowerCase()
    if (seen.has(key)) throw new EngineeringError('INVALID_POLL', 'Duplicate watch tag')
    seen.add(key)
    return { name: entry.name, ...(scope === 'controller' ? {} : { program: scope }), data_type: type as PollTag['data_type'] }
  })
  const request: PollRequest = { ip, slot, tags, samples, interval, timeout: config.requestTimeoutMs }
  return { request, evidence: tags.map(tag => ({ tag: tag.name, scope: tag.program ?? 'controller',
    references: findReferences(project, tag.name).filter(reference => reference.resolved?.toLowerCase() === `${tag.program ?? 'controller'}::${tag.name}`.toLowerCase()),
    reference_completeness: 'static_partial' })) }
}

/** Validate frames crossing the worker boundary. @param value - Worker message. @returns A bounded scalar frame. */
export function decodePollFrame(value: unknown): PollFrame {
  if (!value || typeof value !== 'object' || !('type' in value)) throw new Error('Invalid polling frame')
  if (value.type === 'failure' && 'message' in value && typeof value.message === 'string') throw new Error(value.message)
  if (value.type === 'identity' && 'controller' in value) {
    const controller = value.controller
    if (controller && typeof controller === 'object' && 'product_name' in controller && typeof controller.product_name === 'string'
      && 'serial_number' in controller && typeof controller.serial_number === 'number' && Number.isInteger(controller.serial_number)
      && 'revision' in controller && typeof controller.revision === 'string' && 'status' in controller && typeof controller.status === 'number')
      return { type: 'identity', controller: { product_name: controller.product_name, serial_number: controller.serial_number, revision: controller.revision, status: controller.status } }
  }
  if (value.type === 'sample' && 'index' in value && 'elapsed_ms' in value && 'sweep_ms' in value && 'overrun' in value && 'values' in value
    && typeof value.index === 'number' && Number.isInteger(value.index) && value.index >= 0
    && typeof value.elapsed_ms === 'number' && Number.isFinite(value.elapsed_ms) && value.elapsed_ms >= 0
    && typeof value.sweep_ms === 'number' && Number.isFinite(value.sweep_ms) && value.sweep_ms >= 0
    && typeof value.overrun === 'boolean' && Array.isArray(value.values) && value.values.length <= 256) {
    const values: LogicSample['values'] = value.values.map((item: unknown) => {
      if (!item || typeof item !== 'object' || !('tag' in item) || typeof item.tag !== 'string' || !('value' in item)
        || !(item.value === null || typeof item.value === 'boolean' || typeof item.value === 'number' && Number.isFinite(item.value))
        || !('quality' in item) || !['good', 'bad'].includes(String(item.quality))
        || !('observed_at' in item) || typeof item.observed_at !== 'string' || !Number.isFinite(Date.parse(item.observed_at)))
        throw new Error('Invalid polling value')
      return { tag: item.tag, value: item.value, quality: String(item.quality), observed_at: item.observed_at,
        ...('error' in item && typeof item.error === 'string' ? { error: item.error.slice(0, 1000) } : {}) }
    })
    return { type: 'sample', index: value.index, elapsed_ms: value.elapsed_ms, sweep_ms: value.sweep_ms, overrun: value.overrun, values }
  }
  throw new Error('Invalid polling frame')
}

/** Own isolated connections across chats and await worker exit during disposal. */
export class DirectPolling {
  private readonly active = new Map<string, PollHandle>()
  private disposed = false
  constructor(private readonly workerPath: string, readonly config: PollingConfig) {
    if (config.minIntervalMs > config.defaultIntervalMs || config.defaultIntervalMs > config.maxDurationMs
      || config.allowedAddresses.some(address => !isIPv4(address)))
      throw new Error('Invalid direct polling interval or IPv4 allowlist')
  }

  /**
   * Start one bounded read window; repeated sweeps reuse its connection.
   * @param request - Validated request.
   * @param onFrame - Synchronous logged-output consumer.
   * @param signal - Optional foreground lifetime.
   * @returns Owned cancellation and quiescent completion.
   */
  start(request: PollRequest, onFrame: (frame: PollFrame) => void, signal?: AbortSignal): PollHandle {
    const key = `${request.ip}:${request.slot}`
    if (this.disposed || this.active.has(key) || this.active.size >= this.config.maxConcurrent)
      throw new EngineeringError('POLL_BUSY', 'Controller polling capacity is occupied or the plugin is stopping')
    signal?.throwIfAborted()
    const worker = new Worker(this.workerPath, { workerData: request, env: {}, stdout: true, stderr: true })
    // Only structured frames enter tool/job output; drain private driver diagnostics.
    worker.stdout.resume(); worker.stderr.resume()
    const frames: PollFrame[] = []
    let identified = false; let sampleIndex = 0; let lastElapsed = -1
    let failure: Error | undefined
    const cancel = () => { failure ??= new EngineeringError('POLL_CANCELLED', 'Polling was cancelled'); void worker.terminate() }
    const timer = setTimeout(() => { failure = new EngineeringError('POLL_TIMEOUT', 'Polling exceeded its configured deadline'); void worker.terminate() }, this.config.maxDurationMs + this.config.requestTimeoutMs)
    const connecting = setTimeout(() => { failure = new EngineeringError('POLL_TIMEOUT', 'Controller connection exceeded its configured deadline'); void worker.terminate() }, this.config.requestTimeoutMs)
    signal?.addEventListener('abort', cancel, { once: true })
    const done = new Promise<PollFrame[]>((resolve, reject) => {
      worker.on('message', (message: unknown) => {
        if (failure) return
        try {
          const frame = decodePollFrame(message)
          if (frame.type === 'identity') {
            if (identified || frames.length !== 0) throw new Error('Unexpected controller identity frame')
            identified = true; clearTimeout(connecting)
          } else {
            if (!identified || frame.index !== sampleIndex || frame.elapsed_ms < lastElapsed || frame.values.length !== request.tags.length
              || frame.values.some((value, index) => value.tag !== (request.tags[index]!.program ? `Program:${request.tags[index]!.program}.${request.tags[index]!.name}` : request.tags[index]!.name)))
              throw new Error('Polling samples do not match the requested watch')
            sampleIndex++; lastElapsed = frame.elapsed_ms
          }
          if (frames.length >= request.samples + 1) throw new Error('Polling frame limit exceeded')
          frames.push(frame); onFrame(frame)
        } catch (error) { failure = error instanceof Error ? error : new Error('Polling frame failed'); void worker.terminate() }
      })
      worker.once('error', error => { failure = error })
      worker.once('exit', code => {
        clearTimeout(timer); clearTimeout(connecting); signal?.removeEventListener('abort', cancel); this.active.delete(key)
        if (failure) reject(failure)
        else if (code !== 0 || frames.filter(frame => frame.type === 'sample').length !== request.samples) reject(new Error('Polling ended without all requested samples'))
        else resolve(frames)
      })
    })
    const handle = { cancel, done }
    this.active.set(key, handle)
    // A just-returned background handle may be collected on a later turn.
    void done.catch(() => {})
    return handle
  }

  /** Stop only owned workers and await all exits. @returns Quiescent disposal. */
  async dispose(): Promise<void> {
    this.disposed = true
    const handles = [...this.active.values()]
    for (const handle of handles) handle.cancel()
    await Promise.allSettled(handles.map(handle => handle.done))
  }
}
