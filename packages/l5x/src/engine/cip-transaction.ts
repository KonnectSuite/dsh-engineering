/**
 * One-shot EtherNet/IP transactions: batch reads, identity/clock, writes and
 * discovery, each in its own worker so a hung socket cannot hold the host.
 *
 * Reads are the normal case. Writes are only ever reached through a tool that
 * has already asked a human for this exact operation, and every write result is
 * the readback the controller returned, never an assumption that it worked.
 *
 * @module dsh-engineering-l5x/engine/cip-transaction
 */

import { Worker } from 'node:worker_threads'
import { EngineeringError } from '../session.ts'

/** One observed value from a batch read. */
export interface CipValue {
  tag: string
  data_type: string
  actual_data_type?: string
  value: boolean | number | null
  quality: 'good' | 'bad'
  observed_at: string
  error?: string
}

/** Controller identity as CIP reports it. */
export interface CipIdentity {
  product_name: string
  serial_number: number
  revision: string
  status: number
}

/** Result of the batch read. */
export interface CipReadResult {
  controller: CipIdentity
  request_count: number
  observed_at: string
  values: CipValue[]
}

/** Result of the clock read. */
export interface CipClockResult {
  controller: CipIdentity
  supported: boolean
  controller_time?: string
  host_time: string
  reason?: string
}

/** Result of one tag write. */
export interface CipWriteResult {
  tag: string
  declared_data_type: string
  actual_data_type?: string
  previous_value: boolean | number | null
  requested_value: boolean | number
  readback: boolean | number | null
  verified: boolean
  written_at: string
}

/** Result of a wall-clock write. */
export interface CipWriteClockResult {
  requested_time: string
  readback: string
  verified: boolean
}

/** One discovered device. */
export interface CipDevice {
  ip_address: string
  product_name: string
  revision: string
  serial_number: string
  vendor_id: number
  device_type: number
  status: number
}

/** Result of discovery. */
export interface CipDiscoverResult {
  seconds: number
  devices: CipDevice[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string'
const isInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isScalar = (value: unknown): value is boolean | number => typeof value === 'boolean' || isFiniteNumber(value)

/** Narrow one identity record. */
function identityOf(value: unknown): CipIdentity {
  if (!isRecord(value) || !isText(value.product_name) || !isInteger(value.serial_number)
    || !isText(value.revision) || !isFiniteNumber(value.status)) throw new Error('Invalid controller identity in CIP result')
  return { product_name: value.product_name, serial_number: value.serial_number, revision: value.revision, status: value.status }
}

/** Narrow one observed value. */
function valueOf(value: unknown): CipValue {
  if (!isRecord(value) || !isText(value.tag) || !isText(value.data_type) || !isText(value.observed_at)
    || !(value.value === null || isScalar(value.value)) || (value.quality !== 'good' && value.quality !== 'bad'))
    throw new Error('Invalid CIP read value')
  return {
    tag: value.tag,
    data_type: value.data_type,
    ...(isText(value.actual_data_type) ? { actual_data_type: value.actual_data_type } : {}),
    value: value.value as boolean | number | null,
    quality: value.quality,
    observed_at: value.observed_at,
    ...(isText(value.error) ? { error: value.error.slice(0, 1000) } : {}),
  }
}

/** Validate a batch-read result. */
export function decodeReadResult(value: unknown): CipReadResult {
  if (!isRecord(value) || !isInteger(value.request_count) || !isText(value.observed_at)
    || !Array.isArray(value.values) || value.values.length > 256) throw new Error('Invalid CIP read result')
  return {
    controller: identityOf(value.controller),
    request_count: value.request_count,
    observed_at: value.observed_at,
    values: value.values.map(valueOf),
  }
}

/** Validate a clock result. */
export function decodeClockResult(value: unknown): CipClockResult {
  if (!isRecord(value) || typeof value.supported !== 'boolean' || !isText(value.host_time)) throw new Error('Invalid CIP clock result')
  return {
    controller: identityOf(value.controller),
    supported: value.supported,
    host_time: value.host_time,
    ...(isText(value.controller_time) ? { controller_time: value.controller_time } : {}),
    ...(isText(value.reason) ? { reason: value.reason.slice(0, 500) } : {}),
  }
}

/** Validate a write result. */
export function decodeWriteResult(value: unknown): CipWriteResult {
  if (!isRecord(value) || !isText(value.tag) || !isText(value.declared_data_type) || !isText(value.written_at)
    || !(value.previous_value === null || isScalar(value.previous_value))
    || !isScalar(value.requested_value) || !(value.readback === null || isScalar(value.readback))
    || typeof value.verified !== 'boolean') throw new Error('Invalid CIP write result')
  return {
    tag: value.tag,
    declared_data_type: value.declared_data_type,
    ...(isText(value.actual_data_type) ? { actual_data_type: value.actual_data_type } : {}),
    previous_value: value.previous_value as boolean | number | null,
    requested_value: value.requested_value,
    readback: value.readback as boolean | number | null,
    verified: value.verified,
    written_at: value.written_at,
  }
}

/** Validate a wall-clock write result. */
export function decodeWriteClockResult(value: unknown): CipWriteClockResult {
  if (!isRecord(value) || !isText(value.requested_time) || !isText(value.readback) || typeof value.verified !== 'boolean')
    throw new Error('Invalid CIP clock write result')
  return { requested_time: value.requested_time, readback: value.readback, verified: value.verified }
}

/** Validate a discovery result. */
export function decodeDiscoverResult(value: unknown): CipDiscoverResult {
  if (!isRecord(value) || !isFiniteNumber(value.seconds) || !Array.isArray(value.devices) || value.devices.length > 512)
    throw new Error('Invalid CIP discovery result')
  return {
    seconds: value.seconds,
    devices: value.devices.map((device: unknown): CipDevice => {
      if (!isRecord(device) || !isText(device.ip_address) || !isText(device.product_name) || !isText(device.revision)
        || !isText(device.serial_number) || !isFiniteNumber(device.vendor_id) || !isFiniteNumber(device.device_type)
        || !isFiniteNumber(device.status)) throw new Error('Invalid discovered device')
      return {
        ip_address: device.ip_address,
        product_name: device.product_name,
        revision: device.revision,
        serial_number: device.serial_number,
        vendor_id: device.vendor_id,
        device_type: device.device_type,
        status: device.status,
      }
    }),
  }
}

/** Bounds shared with the polling engine. */
export interface TransactionLimits {
  /** Per-request driver timeout, in milliseconds. */
  timeout: number
  /** Most simultaneous transactions. */
  maxConcurrent: number
}

/**
 * Run one worker transaction and enforce its deadline.
 *
 * The worker emits exactly one message: `{ ok: true, value }` or
 * `{ ok: false, message }`. Anything else, or a worker that outlives the
 * deadline, fails the call rather than returning a partial answer.
 */
export class CipTransactions {
  private active = 0
  private disposed = false

  constructor(private readonly workerPath: string, private readonly limits: TransactionLimits) {}

  /**
   * Run one operation.
   * @param spec - Worker request, already validated by the caller.
   * @param signal - Optional lifetime, aborted by the calling turn.
   * @param extraMs - Deadline beyond the driver timeout (discovery needs its window).
   * @returns The raw `value` of the worker's reply.
   */
  async run(spec: Readonly<Record<string, unknown>>, signal?: AbortSignal, extraMs = 0): Promise<unknown> {
    if (this.disposed) throw new EngineeringError('CONTROLLER_BUSY', 'The controller bridge is shutting down')
    if (this.active >= this.limits.maxConcurrent) throw new EngineeringError('CONTROLLER_BUSY', 'Controller transaction capacity is occupied')
    signal?.throwIfAborted()
    this.active += 1
    const worker = new Worker(this.workerPath, { workerData: spec, env: {}, stdout: true, stderr: true })
    worker.stdout.resume(); worker.stderr.resume()
    const deadline = this.limits.timeout + extraMs
    const timer = setTimeout(() => { void worker.terminate() }, deadline)
    const onAbort = () => { void worker.terminate() }
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      return await new Promise<unknown>((resolve, reject) => {
        let settled = false
        const settle = (fn: () => void) => { if (!settled) { settled = true; fn() } }
        worker.on('message', (message: unknown) => {
          if (!isRecord(message)) return settle(() => reject(new Error('Malformed controller reply')))
          if (message.ok === true) return settle(() => resolve(message.value))
          settle(() => reject(new Error(isText(message.message) ? message.message : 'Controller transaction failed')))
        })
        worker.once('error', error => settle(() => reject(error)))
        worker.once('exit', code => {
          settle(() => reject(new Error(`Controller transaction ended without a reply (exit ${String(code)})`)))
        })
      })
    } catch (error) {
      if (signal?.aborted) throw new EngineeringError('CONTROLLER_CANCELLED', 'The controller transaction was cancelled')
      throw error instanceof EngineeringError ? error : new EngineeringError(
        'CONTROLLER_UNREACHABLE',
        error instanceof Error ? error.message : 'Controller transaction failed',
        'Check the controller address and slot, that the port is reachable, and retry.',
      )
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      this.active -= 1
      void worker.terminate()
    }
  }

  /** Refuse new work and let running transactions finish. */
  async dispose(): Promise<void> {
    this.disposed = true
    this.active = 0
  }
}
