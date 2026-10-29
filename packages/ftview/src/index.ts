/**
 * The rebuilt FactoryTalk View ME read surface.
 *
 * Six intents over one opened export folder: open, list, get, find, check and
 * compare. No Python engine, no Studio automation, no MER decoding.
 *
 * @module dsh-engineering-ftview
 */

import { stringFs, type PluginContext } from './core.ts'
import { decodeText } from './model.ts'
import { ViewSession } from './session.ts'
import { ftviewTools } from './tools.ts'
import { vendorTools } from './vendor-tools.ts'
import { displayRoute, globalsRoute, imageRoute, liveRoute } from './live-route.ts'

/** Plugin name in a composition. */
export const name = 'ftview-read'

/** Services this plugin cannot register without. */
export const inject = ['tools', 'fs'] as const

/** Service name the editing entry consumes. */
export const VIEWS_SERVICE = 'ftviewViews'

/** Configuration for the read surface. */
export interface Config {
  /** Most display and tag files one open may scan. Defaults to 2000. */
  maxFiles?: number
  /** Serve the live-values route a preview can poll. Defaults to true. */
  live?: boolean
  /** Optional IPv4 allowlist for live reads; empty permits any explicit address. */
  allowedAddresses?: string[]
}

/**
 * Register the ME read surface.
 *
 * @param ctx - Plugin context with the tool registry and filesystem provider.
 * @param config - Deployment limits.
 */
export function apply(ctx: PluginContext, config: Config = {}): void {
  const maxFiles = config.maxFiles ?? 2000
  if (!Number.isInteger(maxFiles) || maxFiles <= 0) {
    throw new Error('ftview-read: maxFiles must be a positive integer')
  }
  const files = stringFs(ctx.fs)
  const session = new ViewSession(files, maxFiles)
  ctx.provide?.(VIEWS_SERVICE, session)
  const readText = async (path: string): Promise<string> => decodeText(await files.readBytes(path, undefined))
  for (const definition of [...ftviewTools(session, readText), ...vendorTools(files, session)]) ctx.tools.register(definition)
  if (config.live !== false) {
    // The route is mounted only when the host offers a web server; a CLI host
    // without one keeps the tool surface and simply has no live preview.
    const host = ctx as unknown as {
      inject?: (services: string[], callback: (scope: {
        webServer?: { register(route: unknown): unknown }
        effect?: (callback: () => unknown, label?: string) => unknown
      }) => void) => void
    }
    host.inject?.(['webServer'], scope => {
      const register = (): void => {
        scope.webServer?.register({
          kind: 'exact',
          path: '/engineering/ftview/live',
          handler: async (request: { method?: string; url?: string }, response: {
            writeHead(status: number, headers: Record<string, string>): void
            end(body?: string): void
          }) => {
            if (request.method !== 'GET') {
              response.writeHead(405, { 'content-type': 'application/json', allow: 'GET' })
              response.end(JSON.stringify({ error: 'GET only' }))
              return
            }
            const answer = await liveRoute(new URL(request.url ?? '/', 'http://localhost'), { allowedAddresses: config.allowedAddresses })
            response.writeHead(answer.status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
            response.end(JSON.stringify(answer.body))
          },
        })
        scope.webServer?.register({
          kind: 'exact',
          path: '/engineering/ftview/display',
          handler: (request: { method?: string; url?: string }, response: {
            writeHead(status: number, headers: Record<string, string>): void
            end(body?: string): void
          }) => {
            if (request.method !== 'GET') {
              response.writeHead(405, { 'content-type': 'application/json', allow: 'GET' })
              response.end(JSON.stringify({ error: 'GET only' }))
              return
            }
            const answer = displayRoute(new URL(request.url ?? '/', 'http://localhost'))
            response.writeHead(answer.status, { 'content-type': answer.contentType, 'cache-control': 'no-store' })
            response.end(answer.body)
          },
        })
        scope.webServer?.register({
          kind: 'exact',
          path: '/engineering/ftview/globals',
          handler: (request: { method?: string; url?: string }, response: {
            writeHead(status: number, headers: Record<string, string>): void
            end(body?: string): void
          }) => {
            if (request.method !== 'GET') {
              response.writeHead(405, { 'content-type': 'application/json', allow: 'GET' })
              response.end(JSON.stringify({ error: 'GET only' }))
              return
            }
            const answer = globalsRoute(new URL(request.url ?? '/', 'http://localhost'))
            response.writeHead(answer.status, { 'content-type': answer.contentType, 'cache-control': 'no-store' })
            response.end(answer.body)
          },
        })
        scope.webServer?.register({
          kind: 'exact',
          path: '/engineering/ftview/image',
          handler: (request: { method?: string; url?: string }, response: {
            writeHead(status: number, headers: Record<string, string>): void
            end(body?: string | Uint8Array): void
          }) => {
            if (request.method !== 'GET') {
              response.writeHead(405, { 'content-type': 'application/json', allow: 'GET' })
              response.end(JSON.stringify({ error: 'GET only' }))
              return
            }
            const answer = imageRoute(new URL(request.url ?? '/', 'http://localhost'))
            response.writeHead(answer.status, { 'content-type': answer.contentType, 'cache-control': 'no-store' })
            response.end(answer.body)
          },
        })
      }
      return scope.effect?.(register, 'ftview-live: routes') ?? register()
    })
  }
}

export { ViewSession } from './session.ts'
export { ftviewTools } from './tools.ts'
export { vendorTools } from './vendor-tools.ts'
export { EngineeringError } from './core.ts'
export type { Coverage, NextStep, Success, ToolDefinition } from './core.ts'
