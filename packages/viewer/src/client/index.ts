/** Logix project renderer registration. The source remains an unchanged workspace file. */
import type { Context } from '@deepseek-ai/cordis'
import { createElement, useState, type ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { fileAddressFor, parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import { L5xBody, type L5xBodyInjected } from './L5xBody.tsx'
import { en, zh, type L5xPreviewKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { sidebarL5x: L5xPreviewKey }
}

interface WorkspaceFileViewerProps {
  readonly scope: { readonly sessionId: string; readonly cwd?: string }
  readonly path: string
}

interface WorkspaceFileViewer {
  readonly id: string
  readonly title: () => string
  readonly exts: readonly string[]
  readonly priority: number
  readonly fetchStrategy: 'none'
  readonly component: (props: WorkspaceFileViewerProps) => ReactNode
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional workspace file viewer registry supplied by Better Sidebar. */
    betterSidebar: { registerFileViewer: (descriptor: WorkspaceFileViewer) => () => void }
  }
}

const ID = '@deepseek-ai/dsh-client-ui-logix-project-viewer'
const CHUNK = 1024 * 1024
const LIMIT = 64 * 1024 * 1024

export const inject = ['slots', 'locale', 'documentPreviews', 'remote', 'remote.workspaceFiles']

function hostFileOf(address: string): { sessionId: SessionId; path: string } {
  const parsed = parseFileAddress(address)
  if (parsed?.scope !== 'session') throw new Error(`ui-logix-project-viewer: not a session file address "${address}"`)
  return { sessionId: parsed.sessionId as SessionId, path: parsed.path }
}

export function apply(ctx: Context): void {
  let draft: (address: string, context: string) => boolean = () => false
  ctx.inject(['sessions', 'conversation'], (scope) => {
    draft = (address, context) => {
      const file = hostFileOf(address)
      const session = scope.sessions.scope(file.sessionId)
      if (session === undefined) return false
      const input = scope.conversation.input.for(session)
      const existing = input.state.getSnapshot().draft
      const prompt = `Review this offline Studio 5000 project at ${file.path}. ${context}`
      input.setDraft(existing === '' ? prompt : `${existing}\n${prompt}`)
      input.focus()
      return true
    }
    scope.effect(() => () => { draft = () => false })
  })
  ctx.effect(() => ctx.locale.register('sidebarL5x', { en, zh }))
  const t = ctx.locale.bind('sidebarL5x')
  const read: L5xBodyInjected['read'] = async (address, signal) => {
    const file = hostFileOf(address)
    const chunks: Uint8Array[] = []
    let offset = 0
    let version: string | undefined
    let total = 0
    while (true) {
      signal.throwIfAborted()
      const result = await ctx.remote.workspaceFiles.readBytes(file.sessionId, file.path, { range: { offset, length: CHUNK } }, signal)
      if (!result.ok) throw new Error(result.error.message)
      const page = result.value
      if (version !== undefined && version !== page.version) throw new Error(t('changed'))
      version = page.version
      total += page.data.length
      if (total > LIMIT || (page.bytes !== undefined && page.bytes > LIMIT)) throw new Error(t('tooLarge'))
      chunks.push(page.data)
      offset += page.data.length
      if (page.eof) break
      if (page.data.length === 0) throw new Error(t('invalid'))
    }
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let xml = ''
    for (const chunk of chunks) xml += decoder.decode(chunk, { stream: true })
    xml += decoder.decode()
    return { xml, version }
  }
  const ask: L5xBodyInjected['ask'] = (address, context) => draft(address, context)
  function WorkspaceLogixBody({ scope, path }: WorkspaceFileViewerProps): ReactNode {
    const [revision, setRevision] = useState(0)
    return createElement(L5xBody, {
      resourceAddress: fileAddressFor(scope.sessionId, scope.cwd, path),
      content: {
        kind: 'renderer', revision,
        loaded: () => {}, failed: () => {},
        reload: () => { setRevision(value => value + 1) },
      },
      scrollportRef: () => {}, t, read, ask,
    })
  }
  ctx.inject(['betterSidebar'], (scope) => {
    scope.effect(() => scope.betterSidebar.registerFileViewer({
      id: `${ID}:workspace-file`, title: () => t('title'), exts: ['l5x', 'acd'],
      priority: 20, fetchStrategy: 'none', component: WorkspaceLogixBody,
    }), 'ui-logix-project-viewer: workspace files')
  })
  ctx.effect(() => ctx.documentPreviews.register({
    id: ID, extensions: ['l5x', 'acd'], binaryExtensions: ['acd'], priority: 'extension',
    title: () => t('title'), loading: 'renderer', wrap: false,
  }))
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
    name: 'sidebar.right.tab.document', key: ID, locale: 'sidebarL5x',
    inject: (): L5xBodyInjected => ({ read, ask }),
  }, L5xBody)))
}
