/**
 * The ECAD drawing preview face: registration and the Remote bridge.
 *
 * The document preview shell hands the body a `dsh-resource://file/…` address and
 * a renderer-mode content descriptor; this module is the only place that knows
 * how to turn that into a sheet model. It mounts the bundle's own Typert Remote
 * contribution once, calls `ecad/open` through a child fiber (a face may not read
 * `ctx.remote.ecad` from its own fiber), reads the cached render model through
 * the workspace file API, and hands the body an `open` function plus the
 * conversation-draft bridge the other engineering faces use for Ask Arya.
 *
 * `ctx.remote` is optional on purpose: in a composition without the client
 * gateway the preview still registers and shows a read-only "editing
 * unavailable" state instead of throwing at apply time.
 *
 * @module dsh-engineering-ecad/client
 */

import { createElement, useState, type ReactNode } from 'react'
import { ECAD_CONTRACT_VERSION, buildClientContribution } from '../../../../src/remote/ecad-contract.js'
import { EcadBody, type EcadBodyProps, type EcadBodyInjected, type Translate } from './EcadBody.tsx'
import {
  EcadArtifactError,
  readPreviewArtifact,
  type EcadFailure,
  type EcadOpenEnvelope,
  type EcadOpenResult,
  type EcadReadBytes,
} from './artifacts.ts'
import { en, zh, type EcadPreviewKey } from './locales.ts'
import { fileAddressFor, parseFileAddress } from './vendor/workspace-path.ts'

/** The document-preview id and the slot key this face registers under. */
const ID = 'dsh-engineering-ecad/drawing'
/** Locale namespace for this face. */
const NS = 'sidebarEcad'
/** How long the face waits for the Remote namespace before reporting it absent. */
const MOUNT_TIMEOUT_MS = 15_000
/** Bytes per workspace read of the cached preview. */
const READ_CHUNK = 1024 * 1024

/** Locale namespace declaration for the typed UI dictionaries. */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { sidebarEcad: EcadPreviewKey }
}

/** One Remote method call, resolved on a child fiber. */
type EcadInvoke = (method: string, ...args: readonly unknown[]) => Promise<unknown>

/** The typed Client Remote contribution mount. */
interface RemoteCarrier {
  readonly $mount: (contribution: unknown) => Promise<unknown>
  readonly workspaceFiles: {
    readonly readBytes: (
      sessionId: string,
      path: string,
      options: { readonly range: { readonly offset: number; readonly length: number } },
      signal: AbortSignal,
    ) => Promise<{ readonly ok: true; readonly value: { readonly data: Uint8Array; readonly eof: boolean; readonly version?: string; readonly bytes?: number } } | { readonly ok: false; readonly error: { readonly message: string } }>
  }
}

/** The services the face needs from the shell. */
interface ClientContext {
  readonly effect: (callback: () => void | (() => void), label?: string) => void
  readonly inject: (services: readonly string[], callback: (scope: ClientScope) => void) => void
  readonly locale: {
    readonly register: (namespace: string, dictionaries: { readonly en: Record<string, string>; readonly zh: Record<string, string> }) => (() => void) | void
    readonly bind: (namespace: string) => Translate
  }
  readonly documentPreviews: { readonly register: (descriptor: Record<string, unknown>) => (() => void) | void }
  readonly slots: {
    readonly inject: (name: string, callback: () => void) => void
    readonly register: (options: Record<string, unknown>, component: (props: never) => ReactNode) => (() => void) | void
  }
  readonly remote?: RemoteCarrier
}

/** The injected optional services this face uses. */
interface ClientScope {
  readonly effect?: (callback: () => void | (() => void), label?: string) => void
  readonly sessions?: { readonly scope: (sessionId: string) => unknown }
  readonly conversation?: { readonly input: { readonly for: (session: unknown) => { readonly state: { readonly getSnapshot: () => { readonly draft: string } }; readonly setDraft: (value: string) => void; readonly focus: () => void } } }
  readonly betterSidebar?: { readonly registerFileViewer: (descriptor: Record<string, unknown>) => () => void }
  readonly remote?: { readonly ecad?: Record<string, (...args: readonly unknown[]) => Promise<unknown>> }
}

/** The document-preview descriptor the shell reads. */
interface WorkspaceFileViewerProps {
  readonly scope: { readonly sessionId: string; readonly cwd?: string }
  readonly path: string
}

/** The registered services, in the order the shell resolves them. */
export const inject = ['slots', 'locale', 'documentPreviews', 'remote', 'remote.workspaceFiles']

/**
 * Resolve the session address a preview body carries.
 * @param address - the `dsh-resource://file/…` address.
 * @returns the session and workspace-relative path.
 */
function hostFileOf(address: string): { readonly sessionId: string; readonly path: string } {
  const parsed = parseFileAddress(address)
  if (parsed === undefined || parsed.scope !== 'session' || parsed.sessionId === undefined) {
    throw new EcadArtifactError('ECAD_NO_SESSION', `not a session file address "${address}"`, 'Open the drawing from the conversation whose workspace holds it.')
  }
  return { sessionId: parsed.sessionId, path: parsed.path }
}

/**
 * Normalise an unknown wire failure into the panel's shape.
 * @param value - anything the envelope carried.
 * @param fallback - code and fix to use when the value is not a failure.
 * @returns the failure.
 */
function failureOf(value: unknown, fallback: { readonly code: string; readonly fix: string }): EcadFailure {
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.code === 'string' && typeof record.message === 'string') {
      return {
        code: record.code,
        message: record.message,
        fix: typeof record.fix === 'string' ? record.fix : fallback.fix,
      }
    }
  }
  return {
    code: fallback.code,
    message: typeof value === 'string' && value !== '' ? value : fallback.code,
    fix: fallback.fix,
  }
}

/**
 * Register the ECAD drawing preview.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  // Ask Arya: append a review prompt to the conversation input draft, the same
  // bridge every engineering face uses. Optional services, so a composition
  // without a conversation simply reports the action unavailable.
  let draft: (address: string, context: string) => boolean = () => false
  ctx.inject(['sessions', 'conversation'], (scope) => {
    const sessions = scope.sessions
    const conversation = scope.conversation
    if (sessions === undefined || conversation === undefined) return
    draft = (address, context) => {
      let file: { readonly sessionId: string; readonly path: string }
      try {
        file = hostFileOf(address)
      } catch {
        return false
      }
      const session = sessions.scope(file.sessionId)
      if (session === undefined) return false
      const input = conversation.input.for(session)
      const existing = input.state.getSnapshot().draft
      const prompt = `Review this DXF drawing at ${file.path}. ${context}`
      input.setDraft(existing === '' ? prompt : `${existing}\n${prompt}`)
      input.focus()
      return true
    }
  })

  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'ecad-preview: dictionaries')
  const t = ctx.locale.bind(NS)

  // The Remote bridge: mount the bundle's contribution once, then resolve the
  // namespace on a child fiber. Reading `ctx.remote.ecad` from this face's own
  // fiber is a dependency the face did not declare, and Cordis refuses it.
  let invoke: EcadInvoke | undefined
  let mountFailure: EcadFailure | undefined
  let settle: ((call: EcadInvoke | undefined) => void) | undefined
  const ready = new Promise<EcadInvoke | undefined>((resolve) => {
    settle = resolve
  })
  const unavailable = (message: string): EcadFailure => ({
    code: 'ECAD_DISABLED',
    message,
    fix: t('unavailableFix'),
  })
  const remote = ctx.remote
  if (remote === undefined || typeof remote.$mount !== 'function') {
    mountFailure = unavailable(t('unavailable'))
    settle?.(undefined)
  } else {
    const timer = setTimeout(() => {
      if (invoke !== undefined) return
      mountFailure ??= unavailable(t('unavailable'))
      settle?.(undefined)
    }, MOUNT_TIMEOUT_MS)
    void (async () => {
      try {
        await remote.$mount(buildClientContribution())
        await new Promise<void>((resolve, reject) => {
          try {
            ctx.inject(['remote.ecad'], (scope) => {
              const ecad = scope.remote?.ecad
              if (ecad === undefined) {
                reject(new Error('the ecad Remote namespace did not appear after mounting its contribution'))
                return
              }
              invoke = (method, ...args) => {
                const call = ecad[method]
                if (typeof call !== 'function') return Promise.reject(new Error(`the ecad Remote namespace has no ${method} method`))
                return call(...args)
              }
              resolve()
            })
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)))
          }
        })
        clearTimeout(timer)
        settle?.(invoke)
      } catch (error) {
        clearTimeout(timer)
        mountFailure = unavailable(error instanceof Error ? error.message : String(error))
        settle?.(undefined)
      }
    })()
  }

  const readBytes: EcadReadBytes = async (sessionId, path, options, signal) => {
    const carrier = ctx.remote
    if (carrier === undefined) return { ok: false, error: { message: t('unavailable') } }
    return carrier.workspaceFiles.readBytes(sessionId, path, options, signal) as ReturnType<EcadReadBytes>
  }

  const open = async (address: string, signal: AbortSignal): Promise<EcadOpenResult> => {
    let file: { readonly sessionId: string; readonly path: string }
    try {
      file = hostFileOf(address)
    } catch (error) {
      return { ok: false, error: failureOf(error, { code: 'ECAD_NO_SESSION', fix: t('unavailableFix') }) }
    }
    const call = await ready
    if (call === undefined) return { ok: false, error: mountFailure ?? unavailable(t('unavailable')) }
    signal.throwIfAborted()
    let payload: unknown
    try {
      payload = await call('open', file.sessionId, file.path)
    } catch (error) {
      return { ok: false, error: failureOf(error, { code: 'ECAD_DISABLED', fix: t('unavailableFix') }) }
    }
    const envelope = payload !== null && typeof payload === 'object' ? payload as Record<string, unknown> : undefined
    if (envelope === undefined || envelope.ok !== true) {
      return { ok: false, error: failureOf(envelope?.error ?? payload, { code: 'ECAD_INTERNAL', fix: t('unavailableFix') }) }
    }
    const summary = envelope as unknown as EcadOpenEnvelope & { contractVersion?: number }
    if (summary.contractVersion !== undefined && summary.contractVersion !== ECAD_CONTRACT_VERSION) {
      return {
        ok: false,
        error: {
          code: 'ECAD_CONTRACT_MISMATCH',
          message: `the Host speaks ECAD contract ${summary.contractVersion}; this face speaks ${ECAD_CONTRACT_VERSION}`,
          fix: 'Update the engineering bundle so both halves are the same release.',
        },
      }
    }
    if (typeof summary.modelPath !== 'string' || !Array.isArray(summary.layouts) || typeof summary.version !== 'string') {
      return {
        ok: false,
        error: { code: 'ECAD_PREVIEW_INVALID', message: t('invalidArtifact'), fix: 'Reload the drawing so the host writes the preview again.' },
      }
    }
    try {
      const artifact = await readPreviewArtifact(readBytes, file.sessionId, summary.modelPath, signal)
      return { ok: true, summary, model: artifact.model }
    } catch (error) {
      if (signal.aborted) throw error
      return { ok: false, error: failureOf(error, { code: 'ECAD_PREVIEW_READ', fix: 'Reload the drawing; the preview artifact could not be read.' }) }
    }
  }

  const injected: EcadBodyInjected = {
    open,
    ask: (address, context) => draft(address, context),
  }

  /**
   * Better Sidebar's file viewer: the same body, reloading through its own revision.
   * @param props - the file the sidebar opened.
   */
  function WorkspaceEcadBody(props: WorkspaceFileViewerProps): ReactNode {
    const [revision, setRevision] = useState(0)
    return createElement(EcadBody, {
      resourceAddress: fileAddressFor(props.scope.sessionId, props.scope.cwd, props.path),
      content: {
        kind: 'renderer',
        revision,
        loaded: () => {},
        failed: () => {},
        reload: () => {
          setRevision(value => value + 1)
        },
      },
      scrollportRef: () => {},
      t,
      ...injected,
    } satisfies EcadBodyProps)
  }
  // Better Sidebar's own file viewer, when that plugin is in the composition.
  ctx.inject(['betterSidebar'], (scope) => {
    const sidebar = scope.betterSidebar
    if (sidebar === undefined) return
    scope.effect?.(() => sidebar.registerFileViewer({
      id: `${ID}:workspace-file`,
      title: () => t('title'),
      exts: ['dxf', 'dwg'],
      priority: 20,
      fetchStrategy: 'none',
      component: WorkspaceEcadBody,
    }), 'ecad-preview: sidebar file viewer')
  })

  ctx.effect(() => ctx.documentPreviews.register({
    id: ID,
    extensions: ['dxf', 'dwg'],
    // DWG is binary and is converted by the host before the sheet model exists;
    // the shared reader must not offer it as plain text.
    binaryExtensions: ['dwg'],
    priority: 'extension',
    title: () => t('title'),
    loading: 'renderer',
    wrap: false,
  }), 'ecad-preview: document preview')

  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
    name: 'sidebar.right.tab.document',
    key: ID,
    locale: NS,
    inject: () => injected,
  }, EcadBody)), 'ecad-preview: document body')

}
