/**
 * Drafts for staged ME edits.
 *
 * One draft per opened export per chat. Operations accumulate until validate or
 * apply; nothing here reads or writes export files.
 *
 * @module dsh-engineering-ftview/edit/drafts
 */

import { randomUUID } from 'node:crypto'
import { EngineeringError, type ExecContext } from '../core.ts'
import type { EditOperation } from './operations.ts'

/** One accumulated edit list. */
export interface EditDraft {
  readonly id: string
  readonly viewId: string
  readonly operations: readonly EditOperation[]
  readonly createdAt: string
}

/** Drafts, scoped to the chat that created them. */
export class EditDrafts {
  private readonly chats = new WeakMap<object, Map<string, EditDraft>>()
  private readonly detached = new Map<string, EditDraft>()

  /**
   * Append one operation to the draft for a view, creating it on first use.
   *
   * @param exec - Calling context.
   * @param viewId - View the draft edits.
   * @param operation - Operation to append.
   * @param maxOperations - Inclusive cap for one draft.
   * @returns The updated draft.
   */
  append(exec: ExecContext | undefined, viewId: string, operation: EditOperation, maxOperations: number): EditDraft {
    const drafts = this.draftsOf(exec)
    const current = [...drafts.values()].find(draft => draft.viewId === viewId)
    if (current === undefined) {
      const created: EditDraft = { id: randomUUID(), viewId, operations: [operation], createdAt: new Date().toISOString() }
      drafts.set(created.id, created)
      return created
    }
    if (current.operations.length >= maxOperations) {
      throw new EngineeringError('DRAFT_TOO_LARGE', `This draft already holds ${current.operations.length} operations, the configured maximum.`, 'Validate and apply this draft, then start another for the remaining edits.')
    }
    const updated: EditDraft = { ...current, operations: [...current.operations, operation] }
    drafts.set(updated.id, updated)
    return updated
  }

  /**
   * Resolve one draft by handle.
   *
   * @param exec - Calling context.
   * @param id - Draft handle; empty selects the chat's only draft.
   * @returns The draft.
   */
  get(exec: ExecContext | undefined, id: string | undefined): EditDraft {
    const drafts = this.draftsOf(exec)
    const ids = [...drafts.keys()]
    if (id === undefined || id === '') {
      const only = ids[0]
      if (only === undefined) throw new EngineeringError('NO_DRAFT', 'No edit draft exists in this chat.', 'Add an operation with an ftview_draft_* tool first.')
      if (ids.length > 1) throw new EngineeringError('AMBIGUOUS_DRAFT', `${ids.length} drafts exist in this chat, so draft_id is required.`, `Pass one of: ${ids.join(', ')}.`, ids)
      return drafts.get(only) as EditDraft
    }
    const draft = drafts.get(id)
    if (draft === undefined) {
      throw new EngineeringError('UNKNOWN_DRAFT', `No draft exists with draft_id ${JSON.stringify(id)} in this chat.`, ids.length === 0 ? 'Add an operation with an ftview_draft_* tool first.' : `Pass one of this chat's draft ids: ${ids.join(', ')}.`, ids)
    }
    return draft
  }

  /**
   * Drop one draft, whether it was applied or abandoned.
   *
   * @param exec - Calling context.
   * @param id - Draft handle.
   * @returns True when a draft was removed.
   */
  discard(exec: ExecContext | undefined, id: string): boolean {
    return this.draftsOf(exec).delete(id)
  }

  /**
   * Drop one draft after it is applied.
   *
   * @param exec - Calling context.
   * @param id - Draft handle.
   */
  remove(exec: ExecContext | undefined, id: string): void {
    this.draftsOf(exec).delete(id)
  }

  /** The draft map for one calling chat. */
  private draftsOf(exec: ExecContext | undefined): Map<string, EditDraft> {
    const chat = exec?.chat
    if (chat === undefined) return this.detached
    const existing = this.chats.get(chat)
    if (existing !== undefined) return existing
    const created = new Map<string, EditDraft>()
    this.chats.set(chat, created)
    return created
  }
}
