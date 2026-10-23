/**
 * Open ME export folders for one chat.
 *
 * A folder is scanned once when opened; later calls read the same application
 * model. Handles belong to the calling chat and are bounded, so an abandoned
 * conversation does not retain export trees.
 *
 * @module dsh-engineering-ftview/session
 */

import { randomUUID } from 'node:crypto'
import { EngineeringError, type ExecContext, type FsService } from './core.ts'
import { scanApplication, type Application } from './model.ts'

/** One opened export folder. */
export interface OpenView {
  readonly id: string
  readonly app: Application
}

/** The scanned export store, keyed by chat. */
export class ViewSession {
  private readonly chats = new WeakMap<object, Map<string, OpenView>>()
  private readonly detached = new Map<string, OpenView>()

  /**
   * @param fs - Filesystem provider.
   * @param maxFiles - Most display and tag files one open may scan.
   * @param maxViews - Most export folders one chat retains.
   */
  constructor(
    private readonly fs: FsService,
    private readonly maxFiles: number,
    private readonly maxViews = 2,
  ) {}

  /**
   * Resolve, check and scan one export folder for the calling chat.
   *
   * @param requestedRoot - Folder as the caller supplied it.
   * @param exec - Calling context: cancellation, workspace and chat identity.
   * @returns The retained view.
   */
  async open(requestedRoot: string, exec?: ExecContext): Promise<OpenView> {
    const root = await this.fs.resolve(requestedRoot, {
      ...(exec?.cwd === undefined ? {} : { cwd: exec.cwd }),
      ...(exec?.signal === undefined ? {} : { signal: exec.signal }),
    })
    const info = await this.fs.stat(root, exec?.signal)
    if (info === undefined) {
      throw new EngineeringError(
        'VIEW_NOT_FOUND',
        `No export folder exists at ${requestedRoot}.`,
        'Pass an absolute path or a path inside this workspace, for example "C:/Projects/Line/ME Export".',
      )
    }
    if (info.type !== 'directory') {
      throw new EngineeringError(
        'INVALID_VIEW',
        `${requestedRoot} is not a folder.`,
        'Pass the export folder that contains the display XML files and the tag CSV.',
      )
    }
    const app = await scanApplication(this.fs, root, exec?.signal, this.maxFiles)
    const view: OpenView = { id: randomUUID(), app }
    const views = this.viewsOf(exec)
    views.set(view.id, view)
    while (views.size > this.maxViews) {
      const oldest = views.keys().next().value
      if (oldest !== undefined) views.delete(oldest)
    }
    return view
  }

  /**
   * Resolve the view a call applies to.
   *
   * @param viewId - Explicit handle, or undefined to use the chat's only view.
   * @param exec - Calling context.
   * @returns The open view.
   */
  require(viewId: string | undefined, exec?: ExecContext): OpenView {
    const views = this.viewsOf(exec)
    const ids = [...views.keys()]
    if (viewId === undefined || viewId === '') {
      const only = ids[0]
      if (only === undefined) {
        throw new EngineeringError('NO_VIEW', 'No ME export is open in this chat.', 'Call ftview_open with the export folder first.')
      }
      if (ids.length > 1) {
        throw new EngineeringError('AMBIGUOUS_VIEW', `${ids.length} ME exports are open in this chat, so view_id is required.`, `Pass one of this chat's view ids: ${ids.join(', ')}.`, ids)
      }
      return views.get(only) as OpenView
    }
    const view = views.get(viewId)
    if (view === undefined) {
      throw new EngineeringError(
        'UNKNOWN_VIEW',
        `No ME export is open with view_id ${JSON.stringify(viewId)} in this chat.`,
        ids.length === 0 ? 'Call ftview_open with the export folder first.' : `Pass one of this chat's view ids: ${ids.join(', ')}.`,
        ids,
      )
    }
    return view
  }

  /** The view map for one calling chat. */
  private viewsOf(exec: ExecContext | undefined): Map<string, OpenView> {
    const chat = exec?.chat
    if (chat === undefined) return this.detached
    const existing = this.chats.get(chat)
    if (existing !== undefined) return existing
    const created = new Map<string, OpenView>()
    this.chats.set(chat, created)
    return created
  }
}
