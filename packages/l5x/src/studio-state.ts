/**
 * Provenance for ACD exports and verified builds, scoped to one chat.
 *
 * An ACD export is only usable as a baseline for a later build when this chat
 * exported that exact L5X from that exact ACD: both hashes must still match.
 * The record is what makes that check possible without trusting a path.
 *
 * @module dsh-engineering-l5x/studio-state
 */

import type { ExecContext } from './core/tool.ts'

/** One L5X produced by `export_acd_to_l5x`, with the hashes that bind it. */
export interface AcdExportRecord {
  /** Resolved ACD that was exported. */
  readonly acdPath: string
  /** Resolved L5X that was written. */
  readonly l5xPath: string
  /** SHA-256 of the ACD bytes at export time. */
  readonly acdSha256: string
  /** SHA-256 of the L5X bytes at export time. */
  readonly l5xSha256: string
}

/** Exports, scoped to the chat that ran them. */
export class StudioState {
  private readonly chats = new WeakMap<object, Map<string, AcdExportRecord>>()
  private readonly detached = new Map<string, AcdExportRecord>()

  /**
   * Record one export.
   *
   * @param exec - Calling context; its chat owns the record.
   * @param record - Export binding to remember.
   */
  record(exec: ExecContext | undefined, record: AcdExportRecord): void {
    this.chatsOf(exec).set(record.l5xPath.toLowerCase(), record)
  }

  /**
   * The export that produced one L5X, if this chat produced it.
   *
   * @param exec - Calling context.
   * @param l5xPath - Resolved L5X path.
   * @returns The export record, or undefined.
   */
  forL5x(exec: ExecContext | undefined, l5xPath: string): AcdExportRecord | undefined {
    return this.chatsOf(exec).get(l5xPath.toLowerCase())
  }

  /** The record map for one calling chat. */
  private chatsOf(exec: ExecContext | undefined): Map<string, AcdExportRecord> {
    const chat = exec?.chat
    if (chat === undefined) return this.detached
    const existing = this.chats.get(chat)
    if (existing !== undefined) return existing
    const created = new Map<string, AcdExportRecord>()
    this.chats.set(chat, created)
    return created
  }
}
