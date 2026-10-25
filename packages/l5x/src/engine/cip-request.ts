/**
 * Validation for one-shot controller transactions.
 *
 * Nothing here opens a socket. Every argument is resolved against the open
 * export first, so a mistyped tag, an alias, an array or a type-mismatched write
 * is refused before the controller is contacted.
 *
 * @module dsh-engineering-l5x/engine/cip-request
 */

import { isIPv4 } from 'node:net'
import { EngineeringError, type ProjectSnapshot } from '../session.ts'
import { aliasesOf } from './configuration.ts'
import { findReferences } from './analysis.ts'
import { controllerElementOf } from '../model/parse.ts'
import { elementChildren, firstChild } from '../model/xml.ts'
import type { PollingConfig } from './direct-polling.ts'

/** Scalar types this surface can read and write. */
const SCALARS = ['BOOL', 'INT', 'DINT', 'REAL'] as const
type Scalar = (typeof SCALARS)[number]

/** Integer ranges enforced before a write leaves the machine. */
const RANGES: Record<'INT' | 'DINT', readonly [number, number]> = { INT: [-32768, 32767], DINT: [-2147483648, 2147483647] }

/** One resolved scalar address. */
export interface ScalarTag { name: string; program?: string; data_type: Scalar }

const isScalar = (value: unknown): value is Scalar => typeof value === 'string' && (SCALARS as readonly string[]).includes(value)

/**
 * Resolve the controller address and slot both read and write share.
 * @param input - Tool arguments.
 * @param config - Resolved deployment limits.
 * @returns The validated target.
 */
export function controllerTarget(input: Readonly<Record<string, unknown>>, config: PollingConfig): { ip: string; slot: number; timeout: number } {
  if (!config.enabled) throw new EngineeringError('DIRECT_POLLING_DISABLED', 'Enable directPollingEnabled to use SDK-independent reads')
  const ip = input.ip_address
  if (typeof ip !== 'string' || !isIPv4(ip) || (config.allowedAddresses.length > 0 && !config.allowedAddresses.includes(ip)))
    throw new EngineeringError('INVALID_CONTROLLER', 'Select an explicit IPv4 address allowed by this profile')
  const slot = input.slot ?? 0
  if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot > 31)
    throw new EngineeringError('INVALID_POLL', 'slot must be an integer between 0 and 31')
  return { ip, slot, timeout: config.requestTimeoutMs }
}

/**
 * Resolve declared scalar tags for a batch read, then bound the batch.
 * @param project - Fresh export snapshot.
 * @param input - Tool arguments carrying `tags`.
 * @param config - Resolved deployment limits.
 * @param maxBatch - Largest accepted batch.
 * @returns Worker request and operand evidence.
 */
export function batchReadRequest(project: ProjectSnapshot, input: Readonly<Record<string, unknown>>, config: PollingConfig, maxBatch: number) {
  const target = controllerTarget(input, config)
  const raw: unknown = typeof input.tags_json === 'string' ? JSON.parse(input.tags_json) : null
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > maxBatch)
    throw new EngineeringError('INVALID_POLL', `tags must contain 1 through ${String(maxBatch)} declared scalar tags`)
  const tags = raw.map((entry: unknown): ScalarTag => resolveScalar(project, entry))
  const seen = new Set<string>()
  for (const tag of tags) {
    const key = `${tag.program ?? 'controller'}::${tag.name}`.toLowerCase()
    if (seen.has(key)) throw new EngineeringError('INVALID_POLL', 'Duplicate tag in the batch')
    seen.add(key)
  }
  return {
    request: { op: 'read', ...target, tags },
    evidence: tags.map(tag => ({
      tag: tag.name,
      scope: tag.program ?? 'controller',
      references: findReferences(project, tag.name)
        .filter(reference => reference.resolved?.toLowerCase() === `${tag.program ?? 'controller'}::${tag.name}`.toLowerCase()),
      reference_completeness: 'static_partial',
    })),
  }
}

/**
 * Resolve one writable scalar and check the value against its declared type.
 * @param project - Fresh export snapshot.
 * @param input - Tool arguments carrying `name`, optional `program`, and `value`.
 * @param config - Resolved deployment limits.
 * @returns The validated worker request.
 */
export function writableTagRequest(project: ProjectSnapshot, input: Readonly<Record<string, unknown>>, config: PollingConfig) {
  const target = controllerTarget(input, config)
  const name = input.name
  const program = input.program
  const tag = resolveScalar(project, { name, ...(program === undefined ? {} : { scope: program }) })
  const value = input.value
  if (tag.data_type === 'BOOL') {
    if (typeof value !== 'boolean') throw new EngineeringError('INVALID_WRITE', `${tag.name} is BOOL; value must be true or false`, 'Pass value: true or value: false.')
  } else if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new EngineeringError('INVALID_WRITE', `${tag.name} is ${tag.data_type}; value must be a finite number`, 'Pass a number for INT, DINT or REAL.')
  } else if (tag.data_type !== 'REAL') {
    const [min, max] = RANGES[tag.data_type]
    if (!Number.isInteger(value) || value < min || value > max)
      throw new EngineeringError('INVALID_WRITE', `${tag.name} is ${tag.data_type}; value must be an integer between ${String(min)} and ${String(max)}`, 'Use whole numbers inside the declared range.')
  }
  return { request: { op: 'write', ...target, tag, value } }
}

/**
 * Bound a discovery window.
 * @param input - Tool arguments carrying optional `duration_seconds`.
 * @param config - Resolved deployment limits.
 * @returns Worker request with the window in milliseconds.
 */
export function discoverRequest(input: Readonly<Record<string, unknown>>, config: PollingConfig) {
  if (!config.enabled) throw new EngineeringError('DIRECT_POLLING_DISABLED', 'Enable directPollingEnabled to use controller discovery')
  const seconds = input.duration_seconds ?? 3
  if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 1 || seconds > 15)
    throw new EngineeringError('INVALID_POLL', 'duration_seconds must be an integer between 1 and 15')
  return { request: { op: 'discover', duration: seconds * 1000, timeout: config.requestTimeoutMs } }
}

/** Resolve one declared scalar (never an alias, array or unknown tag). */
function resolveScalar(project: ProjectSnapshot, entry: unknown): ScalarTag {
  if (!entry || typeof entry !== 'object' || !('name' in entry) || typeof entry.name !== 'string'
    || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(entry.name)
    || !Object.keys(entry).every(key => key === 'name' || key === 'scope'))
    throw new EngineeringError('UNSUPPORTED_WRITE_TAG', 'Each tag needs an exact scalar name and optional scope only')
  const scope = 'scope' in entry ? entry.scope : 'controller'
  if (typeof scope !== 'string' || (scope !== 'controller' && !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(scope)))
    throw new EngineeringError('INVALID_POLL', 'scope must be controller or an exact program name')
  const declared = project.document.tags.find(tag => tag.name === entry.name && tag.scope === scope)
  const controller = controllerElementOf(project.document)
  const programs = firstChild(controller, 'Programs')
  const container = scope === 'controller' ? controller : programs === undefined ? undefined
    : elementChildren(programs, 'Program').find(program => program.attrs.Name === scope)
  const tagContainer = container === undefined ? undefined : firstChild(container, 'Tags')
  const declaration = tagContainer === undefined ? undefined : elementChildren(tagContainer, 'Tag').find(tag => tag.attrs.Name === entry.name)
  const dimensions = declaration?.attrs.Dimensions ?? declaration?.attrs.Dimension ?? ''
  if (!declared || aliasesOf(project.document).has(`${scope}::${declared.name}`)
    || !isScalar(declared.dataType)
    || (dimensions !== '' && dimensions !== '0')
    || declaration?.attrs.ExternalAccess === 'None')
    throw new EngineeringError('UNSUPPORTED_WRITE_TAG', `${String(entry.name)} is not a writable declared scalar BOOL, INT, DINT or REAL`, 'Reads accept the same tags; writes additionally need ExternalAccess and no array dimensions.')
  return { name: declared.name, ...(scope === 'controller' ? {} : { program: scope }), data_type: declared.dataType as Scalar }
}
