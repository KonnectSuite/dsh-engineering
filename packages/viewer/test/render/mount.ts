/**
 * The page half of the ladder-viewer end-to-end harness.
 *
 * It is bundled as a plain browser script (no imports) and drives the shipped
 * artifact the way the shell does: the face registers itself through
 * `window.__ModuleLoader__.load`, so this page provides the loader, a context
 * carrying the services the face injects, and the slot props the shell passes.
 * React and the single primitive come from `window` so the page owns the
 * version and the face is loaded, not rebuilt.
 *
 * Nothing here mirrors the face's internals: the slot component is taken from
 * the registration and rendered with the same props the shell passes, so a
 * change to the face's contract shows up as a harness failure rather than as a
 * harness that quietly agrees with itself.
 */

/** The loader slot the artifact calls; see `scripts/build-viewer-face.mjs`. */
interface Loaded {
  readonly id: string
  readonly factory: (require: (id: string) => unknown) => {
    readonly apply: (ctx: unknown) => void
    readonly inject?: readonly string[]
  }
}

interface SlotRegistration {
  readonly name: string
  readonly key?: string
  readonly locale?: string
  readonly inject?: () => Record<string, unknown>
  readonly component: unknown
}

interface PageGlobals {
  readonly __ModuleLoader__: { load: (plugin: Loaded) => void }
  readonly __REACT__: unknown
  readonly __JSX__: unknown
  readonly __REACT_DOM__: unknown
  readonly __PRIMITIVES__: unknown
  readonly __CREATE_ROOT__: (element: unknown) => { render: (node: unknown) => void }
  __L5X_CAPTURED__?: Loaded
  __HARNESS__?: { status: string; detail?: string }
}

const page = window as unknown as PageGlobals & {
  addEventListener: (type: string, listener: () => void) => void
  fetch: typeof fetch
}

function report(status: string, detail?: string): void {
  page.__HARNESS__ = { status, detail }
}

/** Everything the face can reach through its context, and nothing more. */
function context(registrations: SlotRegistration[], locales: Map<string, Record<string, string>>): unknown {
  const disposer = (): void => {}
  /**
   * Scope services this page does not stand up. Cordis runs an injected callback
   * only once its services exist, so `sessions`, `conversation` and
   * `betterSidebar` are simply never provided: the face must work without them.
   */
  const provided = new Set<string>()
  const context = {
    effect: (run: () => unknown): void => { run() },
    inject: (services: readonly string[], callback?: (scope: unknown) => void): void => {
      if (callback === undefined || !services.every(service => provided.has(service))) return
      callback(context)
    },
    slots: {
      inject: (_name: string, callback: () => void): void => { callback() },
      register: (options: Omit<SlotRegistration, 'component'>, component: unknown): (() => void) => {
        registrations.push({ ...options, component })
        return disposer
      },
    },
    locale: {
      register: (namespace: string, dictionaries: Record<string, Record<string, string>>): (() => void) => {
        locales.set(namespace, dictionaries.en ?? {})
        return disposer
      },
      bind: (namespace: string) => (key: string): string => locales.get(namespace)?.[key] ?? key,
    },
    documentPreviews: { register: (): (() => void) => disposer },
    remote: { workspaceFiles: { readBytes: async () => ({ ok: false, error: { message: 'harness' } }) } },
  }
  return context
}

async function main(): Promise<void> {
  const registration = page.__L5X_CAPTURED__
  if (registration === undefined) {
    report('failed', 'the face did not register through window.__ModuleLoader__.load')
    return
  }
  const modules: Record<string, unknown> = {
    'react': page.__REACT__,
    'react/jsx-runtime': page.__JSX__,
    'react-dom': page.__REACT_DOM__,
    '@deepseek-ai/dsh-client-ui-primitives': page.__PRIMITIVES__,
  }
  const plugin = registration.factory((id: string) => {
    if (!(id in modules)) throw new Error(`harness: the face required "${id}", which this page does not provide`)
    return modules[id]
  })

  const registrations: SlotRegistration[] = []
  const locales = new Map<string, Record<string, string>>()
  plugin.apply(context(registrations, locales))

  const slot = registrations.find(entry => entry.name === 'sidebar.right.tab.document')
  if (slot === undefined) {
    report('failed', `no sidebar.right.tab.document registration; saw ${registrations.map(entry => entry.name).join(', ')}`)
    return
  }
  const namespace = locales.get(slot.locale ?? '')
  const t = (key: string, args?: Record<string, string>): string => {
    const text = namespace?.[key] ?? key
    return args === undefined ? text
      : text.replace(/\{(\w+)\}/gu, (match, name: string) => args[name] ?? match)
  }

  const response = await page.fetch('/fixture')
  if (!response.ok) {
    report('failed', `fixture fetch ${response.status}`)
    return
  }
  const xml = await response.text()
  const injected = {
    read: async (): Promise<{ xml: string; version: string }> => ({ xml, version: 'e2e' }),
    ask: (): boolean => true,
  }
  const React = page.__REACT__ as { createElement: (type: unknown, props: unknown) => unknown }
  const root = page.__CREATE_ROOT__(document.getElementById('root')) as { render: (node: unknown) => void }
  root.render(React.createElement(slot.component, {
    resourceAddress: 'dsh-resource://file/session/e2e/_e2e/out/CT9-Source.L5X',
    content: {
      kind: 'renderer', revision: 0,
      loaded: () => {}, failed: () => {}, reload: () => {},
    },
    scrollportRef: () => {},
    t,
    ...(slot.inject?.() ?? injected),
    ...injected,
  }))
  report('mounted')
}

void main().catch((error: unknown) => {
  report('failed', `mount threw: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
})
