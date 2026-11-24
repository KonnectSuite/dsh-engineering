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
  /** Export folder this draft was applied into; absent until apply writes it. */
  readonly appliedTo?: string
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
    const current = [...drafts.values()].find(draft => draft.viewId === viewId && draft.appliedTo === undefined)
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
    if (id === undefined || id === '') {
      // Authoring acts on the live draft. An applied draft stays behind for the
      // import proof, so it is only the answer when nothing else is staged.
      const live = [...drafts.values()].filter(draft => draft.appliedTo === undefined)
      if (live.length === 1) return live[0] as EditDraft
      const pool = live.length === 0 ? [...drafts.values()] : live
      const only = pool[0]
      if (only === undefined) throw new EngineeringError('NO_DRAFT', 'No edit draft exists in this chat.', 'Add an operation with an ftview_draft_* tool first.')
      if (pool.length > 1) {
        const ids = pool.map(draft => draft.id)
        throw new EngineeringError('AMBIGUOUS_DRAFT', `${ids.length} drafts exist in this chat, so draft_id is required.`, `Pass one of: ${ids.join(', ')}.`, ids)
      }
      return only
    }
    const draft = drafts.get(id)
    if (draft === undefined) {
      const ids = [...drafts.keys()]
      throw new EngineeringError('UNKNOWN_DRAFT', `No draft exists with draft_id ${JSON.stringify(id)} in this chat.`, ids.length === 0 ? 'Add an operation with an ftview_draft_* tool first.' : `Pass one of this chat's draft ids: ${ids.join(', ')}.`, ids)
    }
    return draft
  }

  /**
   * Replace the operations of one draft, used to drop a single staged change.
   *
   * @param exec - Calling context.
   * @param id - Draft handle.
   * @param operations - Operations the draft should hold.
   * @returns The updated draft.
   */
  replaceOperations(exec: ExecContext | undefined, id: string, operations: readonly EditOperation[]): EditDraft {
    const drafts = this.draftsOf(exec)
    const current = drafts.get(id)
    if (current === undefined) throw new EngineeringError('UNKNOWN_DRAFT', `No draft exists with draft_id ${JSON.stringify(id)} in this chat.`, 'Add an operation with an ftview_draft_* tool first.')
    const updated: EditDraft = { ...current, operations }
    drafts.set(id, updated)
    return updated
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
   * Record that a draft was applied, keeping it for the import proof.
   *
   * The draft is the only record of what was staged, and `ftview_verify_import`
   * compares that record with a fresh export after the vendor import. Dropping the
   * draft here made the proof impossible in the order apply recommends (apply,
   * import, verify), so it stays and is marked with the folder it wrote; a later
   * authoring call starts a new draft instead of appending to an applied one.
   *
   * @param exec - Calling context.
   * @param id - Draft handle.
   * @param outputRoot - Export folder apply wrote.
   * @returns The marked draft.
   */
  markApplied(exec: ExecContext | undefined, id: string, outputRoot: string): EditDraft {
    const drafts = this.draftsOf(exec)
    const current = drafts.get(id)
    if (current === undefined) throw new EngineeringError('UNKNOWN_DRAFT', `No draft exists with draft_id ${JSON.stringify(id)} in this chat.`, 'Add an operation with an ftview_draft_* tool first.')
    const updated: EditDraft = { ...current, appliedTo: outputRoot }
    drafts.set(id, updated)
    return updated
  }

  /**
   * The most recently applied draft for a view, when one exists.
   *
   * Verification runs after the import, by which time new authoring may have
   * started another draft; the applied one is what the import was made from.
   *
   * @param exec - Calling context.
   * @param viewId - Optional view to narrow to.
   * @returns The latest applied draft, or undefined.
   */
  latestApplied(exec: ExecContext | undefined, viewId?: string): EditDraft | undefined {
    const applied = [...this.draftsOf(exec).values()].filter(draft => draft.appliedTo !== undefined && (viewId === undefined || draft.viewId === viewId))
    return applied[applied.length - 1]
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
