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
import type { DownloadReview } from './engine/download-review.ts'

/** One SDK build that passed and may be downloaded with its verification id. */
export interface VerifiedBuild {
  /** Built ACD path. */
  readonly path: string
  /** SHA-256 of the built ACD at verification time. */
  readonly sha256: string
  /** Baseline L5X the build was reviewed against. */
  readonly baselinePath: string
  /** Edited L5X the build imported. */
  readonly sourcePath: string
  /** Review recorded with the build, including both L5X hashes. */
  readonly review: Pick<DownloadReview, 'baseline_sha256' | 'source_sha256'>
}

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

/** Exports and verified builds, scoped to the chat that ran them. */
export class StudioState {
  // A chat object is not stable across turns: the same conversation can present a fresh
  // wrapper object on the next tool call. Keying the provenance only by that identity made a
  // baseline exported in one turn "not exported from an ACD" in a later turn, so the stable
  // session id is the first key and object identity is the fallback.
  private readonly sessionChats = new Map<string, Map<string, AcdExportRecord>>()
  private readonly sessionBuilds = new Map<string, Map<string, VerifiedBuild>>()
  private readonly chats = new WeakMap<object, Map<string, AcdExportRecord>>()
  private readonly detached = new Map<string, AcdExportRecord>()
  private readonly buildChats = new WeakMap<object, Map<string, VerifiedBuild>>()
  private readonly detachedBuilds = new Map<string, VerifiedBuild>()

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

  /**
   * Remember one build that passed and may later be downloaded.
   *
   * @param exec - Calling context.
   * @param id - Verification id returned to the caller.
   * @param build - Build binding and its review.
   */
  addVerified(exec: ExecContext | undefined, id: string, build: VerifiedBuild): void {
    this.buildsOf(exec).set(id, build)
  }

  /**
   * The build behind one verification id, if this chat produced it.
   *
   * @param exec - Calling context.
   * @param id - Verification id.
   * @returns The verified build, or undefined.
   */
  verified(exec: ExecContext | undefined, id: string): VerifiedBuild | undefined {
    return this.buildsOf(exec).get(id)
  }

  /** The record map for one calling chat. */
  private chatsOf(exec: ExecContext | undefined): Map<string, AcdExportRecord> {
    const sessionId = exec?.sessionId
    if (sessionId !== undefined) {
      const existing = this.sessionChats.get(sessionId)
      if (existing !== undefined) return existing
      const created = new Map<string, AcdExportRecord>()
      this.sessionChats.set(sessionId, created)
      return created
    }
    const chat = exec?.chat
    if (chat === undefined) return this.detached
    const existing = this.chats.get(chat)
    if (existing !== undefined) return existing
    const created = new Map<string, AcdExportRecord>()
    this.chats.set(chat, created)
    return created
  }

  /** The verified-build map for one calling chat. */
  private buildsOf(exec: ExecContext | undefined): Map<string, VerifiedBuild> {
    const sessionId = exec?.sessionId
    if (sessionId !== undefined) {
      const existing = this.sessionBuilds.get(sessionId)
      if (existing !== undefined) return existing
      const created = new Map<string, VerifiedBuild>()
      this.sessionBuilds.set(sessionId, created)
      return created
    }
    const chat = exec?.chat
    if (chat === undefined) return this.detachedBuilds
    const existing = this.buildChats.get(chat)
    if (existing !== undefined) return existing
    const created = new Map<string, VerifiedBuild>()
    this.buildChats.set(chat, created)
    return created
  }
}
