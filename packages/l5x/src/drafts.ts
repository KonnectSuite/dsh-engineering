/**
 * Drafts: one accumulated edit list per project per chat.
 *
 * The model adds one operation at a time, sees the count grow, then validates
 * and applies. Nothing here writes a file; preparation and application belong
 * to the tools, so an abandoned draft leaves no residue.
 *
 * @module dsh-engineering-l5x/drafts
 */

import { randomUUID } from 'node:crypto'
import { L5xError } from './core/errors.ts'
import type { ExecContext } from './core/tool.ts'

/** One version-1 change-set operation, as the engine accepts it. */
export interface DraftOperation {
  readonly operation: string
  readonly [field: string]: unknown
}

/** One accumulated draft. */
export interface Draft {
  /** Stable handle returned to the caller. */
  readonly id: string
  /** Project handle this draft applies to. */
  readonly projectId: string
  /** Operations in the order they were added. */
  readonly operations: readonly DraftOperation[]
  /** ISO timestamp of the first operation. */
  readonly createdAt: string
}

/** Drafts, scoped to the chat that created them. */
export class DraftStore {
  private readonly chats = new WeakMap<object, Map<string, Draft>>()
  private readonly detached = new Map<string, Draft>()

  /**
   * The draft for one project in this chat, created on first use.
   *
   * @param exec - Calling context; its chat selects the draft set.
   * @param projectId - Project handle the draft edits.
   * @returns The accumulated draft.
   */
  forProject(exec: ExecContext | undefined, projectId: string): Draft {
    const drafts = this.chatsOf(exec)
    for (const draft of drafts.values()) {
      if (draft.projectId === projectId) return draft
    }
    const created: Draft = { id: randomUUID(), projectId, operations: [], createdAt: new Date().toISOString() }
    drafts.set(created.id, created)
    return created
  }

  /**
   * Append one operation to a project's draft.
   *
   * @param exec - Calling context.
   * @param projectId - Project handle the draft edits.
   * @param operation - Operation to append.
   * @param maxOperations - Inclusive operation cap for one draft.
   * @returns The updated draft.
   */
  append(exec: ExecContext | undefined, projectId: string, operation: DraftOperation, maxOperations: number): Draft {
    const current = this.forProject(exec, projectId)
    if (current.operations.length >= maxOperations) {
      throw new L5xError(
        'DRAFT_TOO_LARGE',
        `This draft already holds ${current.operations.length} operations, the configured maximum.`,
        'Validate and apply this draft, then start another for the remaining edits.',
      )
    }
    const updated: Draft = { ...current, operations: [...current.operations, operation] }
    this.chatsOf(exec).set(updated.id, updated)
    return updated
  }

  /**
   * Resolve one draft by handle.
   *
   * @param exec - Calling context.
   * @param id - Draft handle; empty selects the chat's only draft.
   * @returns The draft.
   */
  get(exec: ExecContext | undefined, id: string | undefined): Draft {
    const drafts = this.chatsOf(exec)
    const ids = [...drafts.keys()]
    if (id === undefined || id === '') {
      const only = ids[0]
      if (only === undefined) {
        throw new L5xError('NO_DRAFT', 'No draft exists in this chat.', 'Add an operation with a draft_* tool first.')
      }
      if (ids.length > 1) {
        throw new L5xError('AMBIGUOUS_DRAFT', `${ids.length} drafts exist in this chat, so draft_id is required.`, `Pass one of: ${ids.join(', ')}.`, ids)
      }
      return drafts.get(only) as Draft
    }
    const draft = drafts.get(id)
    if (draft === undefined) {
      throw new L5xError(
        'UNKNOWN_DRAFT',
        `No draft exists with draft_id ${JSON.stringify(id)} in this chat.`,
        ids.length === 0 ? 'Add an operation with a draft_* tool first.' : `Pass one of this chat's draft ids: ${ids.join(', ')}.`,
        ids,
      )
    }
    return draft
  }

  /**
   * Remove one operation from a draft, keeping the rest.
   *
   * A draft is append-only by design, so a wrong rung used to mean abandoning
   * every staged edit. Listing the operations first makes the index verifiable,
   * so this can drop exactly one of them.
   *
   * @param exec - Calling context.
   * @param id - Draft handle.
   * @param index - Zero-based position as `draft_list` reports it.
   * @returns The updated draft.
   */
  removeAt(exec: ExecContext | undefined, id: string, index: number): Draft {
    const draft = this.get(exec, id)
    if (!Number.isInteger(index) || index < 0 || index >= draft.operations.length) {
      throw new L5xError(
        'UNKNOWN_OPERATION',
        `Draft ${draft.id} has no operation at index ${index}; it holds ${draft.operations.length}.`,
        'Call draft_list to read the indices, then remove one of them.',
      )
    }
    const updated: Draft = { ...draft, operations: draft.operations.filter((_, position) => position !== index) }
    this.chatsOf(exec).set(updated.id, updated)
    return updated
  }

  /**
   * Remove one draft that has been applied or abandoned.
   *
   * @param exec - Calling context.
   * @param id - Draft handle.
   * @returns True when a draft was removed.
   */
  discard(exec: ExecContext | undefined, id: string): boolean {
    return this.chatsOf(exec).delete(id)
  }

  /**
   * Remove one draft after it is applied.
   *
   * @param exec - Calling context.
   * @param id - Draft handle.
   */
  remove(exec: ExecContext | undefined, id: string): void {
    this.chatsOf(exec).delete(id)
  }

  /** The draft map for one calling chat. */
  private chatsOf(exec: ExecContext | undefined): Map<string, Draft> {
    const chat = exec?.chat
    if (chat === undefined) return this.detached
    const existing = this.chats.get(chat)
    if (existing !== undefined) return existing
    const created = new Map<string, Draft>()
    this.chats.set(chat, created)
    return created
  }
}
