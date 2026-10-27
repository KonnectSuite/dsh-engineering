/**
 * Chat-scoped storage for house-style profiles.
 *
 * A profile is produced by a product tool call and consumed by a generation tool
 * later in the same conversation, so it lives in memory under a short handle. It
 * is rebuilt from the project whenever the agent asks again; nothing is written
 * to disk.
 *
 * @module dsh-engineering-resources/store
 */

import type { StyleProfile } from './profile.ts'

/** Most profiles one process keeps before dropping the oldest. */
const MAX = 32

const profiles = new Map<string, StyleProfile>()

/**
 * Remember one profile under its handle.
 *
 * @param id - Handle from `profileId`.
 * @param profile - The validated profile.
 */
export function rememberProfile(id: string, profile: StyleProfile): void {
  if (profiles.size >= MAX) {
    const oldest = profiles.keys().next().value
    if (oldest !== undefined) profiles.delete(oldest)
  }
  profiles.set(id, profile)
}

/** The profile for one handle, when it is still in memory. */
export function getProfile(id: string): StyleProfile | undefined {
  return profiles.get(id)
}

/** Drop every profile; tests use this between cases. */
export function clearProfiles(): void {
  profiles.clear()
}
