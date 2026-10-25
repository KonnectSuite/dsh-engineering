/**
 * The L5X live entry: SDK-free EtherNet/IP reads and trends.
 *
 * Reads use the package's polling worker and its own TCP connection, so no
 * Studio 5000, FactoryTalk Linx service or SDK is required. The entry is off by
 * default; enabling the row is the switch that permits controller traffic.
 *
 * @module dsh-engineering-l5x/live
 */

import { fileURLToPath } from 'node:url'
import type { PluginContext } from './core/tool.ts'
import { DirectPolling } from './engine/direct-polling.ts'
import { CipTransactions } from './engine/cip-transaction.ts'
import { liveTools } from './tools/live.ts'
import type { ProjectSession } from './session.ts'
import { PROJECTS_SERVICE } from './index.ts'

/** Plugin name in a composition. */
export const name = 'l5x-live'

/** The read entry's project service must already be mounted. */
export const inject = ['tools', PROJECTS_SERVICE] as const

/** Configuration for the live entry. */
export interface Config {
  /** Permit controller traffic. Defaults to true; the entry row is the switch. */
  enabled?: boolean
  /** Minimum requested sweep interval. Defaults to 50 ms. */
  minIntervalMs?: number
  /** Default requested sweep interval. Defaults to 200 ms. */
  defaultIntervalMs?: number
  /** Most scalar tags in one window. Defaults to 16. */
  maxTags?: number
  /** Most sweeps in one window. Defaults to 1200. */
  maxSamples?: number
  /** Longest window, in milliseconds. Defaults to 60000. */
  maxDurationMs?: number
  /** Per-read driver timeout. Defaults to 3000 ms. */
  requestTimeoutMs?: number
  /** Most simultaneous controller windows across chats. Defaults to 2. */
  maxConcurrent?: number
  /** Optional IPv4 allowlist; empty permits any explicit address. */
  allowedAddresses?: string[]
  /** Permit one-shot writes (tag and wall clock). Each write still needs human approval. Defaults to false. */
  allowWrites?: boolean
  /** Largest accepted batch read. Defaults to 64. */
  maxBatchTags?: number
  /** Chart redraw interval, independent of reads. Defaults to 250 ms. */
  displayRefreshMs?: number
  /** Most points retained per chart. Defaults to 1200. */
  displayMaxSamples?: number
}

/**
 * Register the live tools.
 *
 * @param ctx - Plugin context carrying the read entry's project service.
 * @param config - Deployment limits.
 */
export function apply(ctx: PluginContext, config: Config = {}): void {
  const session = ctx.get?.(PROJECTS_SERVICE) as ProjectSession | undefined
  if (session === undefined) {
    throw new Error('l5x-live: the l5xProjects service is unavailable; mount the L5X read entry before this one')
  }
  const polling = new DirectPolling(fileURLToPath(new URL('../poll-worker.mjs', import.meta.url)), {
    enabled: config.enabled ?? true,
    minIntervalMs: config.minIntervalMs ?? 50,
    defaultIntervalMs: config.defaultIntervalMs ?? 200,
    maxTags: config.maxTags ?? 16,
    maxSamples: config.maxSamples ?? 1200,
    maxDurationMs: config.maxDurationMs ?? 60_000,
    requestTimeoutMs: config.requestTimeoutMs ?? 3000,
    maxConcurrent: config.maxConcurrent ?? 2,
    allowedAddresses: config.allowedAddresses ?? [],
    displayRefreshMs: config.displayRefreshMs ?? 250,
    displayMaxSamples: config.displayMaxSamples ?? 1200,
  })
  const transactions = new CipTransactions(fileURLToPath(new URL('../cip-worker.mjs', import.meta.url)), {
    timeout: config.requestTimeoutMs ?? 3000,
    maxConcurrent: config.maxConcurrent ?? 2,
  })
  const effect = (ctx as PluginContext & { effect?<T>(fn: () => T): void }).effect
  effect?.(() => () => { void polling.dispose(); void transactions.dispose() })
  const extensions = {
    transactions,
    allowWrites: config.allowWrites === true,
    maxBatchTags: config.maxBatchTags ?? 64,
  }
  for (const definition of liveTools(session, polling, ctx, extensions)) ctx.tools.register(definition)
}

export { DirectPolling } from './engine/direct-polling.ts'
export { CipTransactions } from './engine/cip-transaction.ts'
export { liveTools } from './tools/live.ts'
