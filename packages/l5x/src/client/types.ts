/**
 * The client surfaces this console consumes, declared locally.
 *
 * The browser half is built as a standalone bundle, so it names the shapes it
 * uses instead of importing the DSH type packages: those resolve inside the
 * harness, not in the profile's `node_modules` for a plugin package. Each
 * interface below mirrors one published contract — the slot registry, the two
 * Remotes this console calls, and the renderer-supplied selectors it reads — and
 * the mirror is deliberately narrow: only the members this console touches. A
 * drift that matters shows up as a type error here, and as a missing member at
 * runtime.
 */

/** A snapshot selector handed to slot occupants by the renderer. */
export type SnapshotSelectorHook<State> = <Selected>(select: (state: State) => Selected) => Selected

/** Cordis locale service, as a slot occupant uses it. */
export interface LocaleService {
  /** Bind a namespace to a translation function. */
  bind(namespace: string): (key: string) => string
  /** Register dictionaries for a namespace. @returns disposer. */
  register(
    namespace: string,
    dictionaries: { readonly zh: Record<string, string>, readonly en: Record<string, string> },
  ): () => void
}

/** The seats this console registers into. */
export type SlotName = 'main' | 'sidebar.panellist' | 'tool.call.toolview'

/** Registration metadata the slot owner reads for one occupant. */
export interface SlotRegistration {
  readonly name: SlotName
  /** List cell key (`sidebar.panellist`). */
  readonly id?: string
  /** Keyed cell key (`main`). */
  readonly key?: string
  /** Position among list occupants, ascending. */
  readonly order?: number
  /** Display text, or a thunk re-read on every projection. */
  readonly label?: string | (() => string)
  /** Locale namespace projected into the occupant as `t`. */
  readonly locale?: string
  /** Extra props handed to the occupant. */
  readonly inject?: () => Record<string, unknown>
}

/** Cordis slot registry, as a client plugin uses it. */
export interface SlotsService {
  /** Run `register` once the named slot exists. */
  inject(name: SlotName, register: () => unknown): void
  /** Occupy a slot. @returns a disposable registration. */
  register(options: SlotRegistration, occupant: unknown): unknown
}

/** One Remote call result: a failure is a value, not a rejection. */
export type RemoteResult<Value> =
  | { readonly ok: true, readonly value: Value }
  | { readonly ok: false, readonly error: { readonly code: string, readonly message: string } }

/** One direct child of a listed workspace directory. */
export interface WorkspaceDirectoryEntry {
  /** Basename inside the listed directory. */
  readonly name: string
  /** What the child resolves to. A symlink reports its destination's type. */
  readonly type: 'file' | 'directory' | 'other'
  /** Byte size, present only for a regular file whose backend reports it. */
  readonly size?: number
}

/** Direct children of one workspace directory. */
export interface WorkspaceDirectoryListing {
  /** The listed directory as a workspace path, empty for the root itself. */
  readonly path: string
  /** Direct children in the backend's stable name order. */
  readonly entries: readonly WorkspaceDirectoryEntry[]
  /** Whether the entry cap dropped children from `entries`. */
  readonly truncated: boolean
}

/** The `workspaceFiles` Remote namespace, as this console calls it. */
export interface WorkspaceFilesRemote {
  /**
   * List one directory inside a Session's workspace.
   * @param sessionId - Session whose workspace root resolves `path`.
   * @param path - absolute directory path.
   * @param signal - caller lifetime.
   */
  list(sessionId: string, path: string, signal?: AbortSignal): Promise<RemoteResult<WorkspaceDirectoryListing>>
}

/** Request to open one path on the host desktop. */
export interface SessionOpenWorkspacePathRequest {
  /** Path in host filesystem syntax. */
  readonly path: string
  /** File-manager navigation when requested; omission uses the default application. */
  readonly action?: 'reveal'
  /** Registered application path; ignored for reveal and for the default application. */
  readonly application?: string
}

/** The session controller's Remote namespace, as this console calls it. */
export interface SessionRemote {
  /** Registered handlers for this particular file on the serving desktop. */
  workspacePathApplications?(
    request: { readonly path: string }, signal?: AbortSignal,
  ): Promise<RemoteResult<readonly FileApplication[]>>
  /** Whether the host can hand a workspace path to a native desktop. */
  canOpenWorkspacePath(): Promise<RemoteResult<boolean>>
  /** Open one host path in its default application, or reveal it in the file manager. */
  openWorkspacePath(
    request: SessionOpenWorkspacePathRequest, signal?: AbortSignal,
  ): Promise<RemoteResult<unknown>>
}

/** OS handler identity, revalidated by the host when opening a file. */
export interface FileApplication {
  readonly id: string
  readonly name: string
  readonly default: boolean
  readonly icon: string | null
}

/**
 * The composed Client Remote. Both namespaces are optional at the type level on
 * purpose: this console registers its icon unconditionally and explains a missing
 * capability in the panel, rather than going silent because a profile did not
 * compose a namespace.
 */
export interface ClientRemote {
  readonly workspaceFiles?: WorkspaceFilesRemote | undefined
  readonly session?: SessionRemote | undefined
  /** Existing session-authorized background job stream. */
  readonly job?: TrendJobRemote | undefined
}

/** The existing job Remote operations consumed by a live trend card. */
export interface TrendJobRemote {
  /** Observe retained and live job output without consuming the model cursor. */
  follow(request: { jobId: string; sessionId: string }, signal: AbortSignal): AsyncIterable<unknown>
  /** Stop only a job visible to this session. */
  kill(request: { jobId: string; sessionId: string }, signal?: AbortSignal): Promise<RemoteResult<unknown>>
}

/** One durable Workspace as the browser projection reports it. */
export interface WorkspaceView {
  readonly workspaceId: string
  /** Canonical host directory path. */
  readonly path: string
  /** User-visible title. */
  readonly title: string
  /** Sessions accounted to this workspace. */
  readonly sessionIds: readonly string[]
  /** ISO-8601 last-mutation instant. */
  readonly updatedAt: string
}

/** The workspace list projection. */
export interface WorkspaceSnapshot {
  readonly items: readonly WorkspaceView[]
  readonly state: 'idle' | 'loading' | 'error'
}

/** One Session row as the client list reports it. */
export interface SessionSummary {
  /** Project directory the Session was started in. */
  readonly cwd?: string | undefined
  /** Human-facing label: durable title, project basename, then session id. */
  readonly displayTitle?: string | undefined
  /** Epoch milliseconds of the last update. */
  readonly updatedAt: number
  /** Whether this is an unused New Session row. */
  readonly blank: boolean
}

/** The session list projection, keyed by session id. */
export interface SessionListState {
  /** Host list order; every id has a matching `byId` row. */
  readonly ids: readonly string[]
  readonly byId: Record<string, SessionSummary>
}

/** The client context subset this console's `apply` uses. */
export interface ClientScope {
  readonly slots: SlotsService
  readonly locale: LocaleService
  readonly remote: ClientRemote
  /** Wait for services, then run on a scope that has them. */
  inject(dependencies: readonly string[], apply: (scope: ClientScope) => void): void
  /** Run setup with its cleanup tied to the plugin's own lifetime. */
  effect(callback: () => (() => void) | void, label?: string): void
}

/** Props the sidebar panel row hands to an icon occupant. */
export interface PanelIconProps {
  /** Requested square edge in pixels. */
  readonly size: number
  /** Whether this panel is the selected one. */
  readonly active: boolean
}

/** Props the renderer hands to a localized occupant. */
export interface LocalizedProps {
  /** Translation bound to the registration's locale namespace. */
  readonly t: (key: string) => string
}

/**
 * Renderer-supplied selectors every root-scoped occupant receives.
 *
 * Declared optional because the console must still render when a profile omits
 * the UI package that publishes one: reading a missing selector would throw
 * inside render, and a panel that explains itself is worth more than an icon
 * that leads to a blank column.
 */
export interface GlobalStandardProps {
  /** Session list and the working directory each row was started in. */
  readonly useSessions?: SnapshotSelectorHook<SessionListState> | undefined
  /** Workspaces the deployment has registered. */
  readonly useWorkspaces?: SnapshotSelectorHook<WorkspaceSnapshot> | undefined
}
