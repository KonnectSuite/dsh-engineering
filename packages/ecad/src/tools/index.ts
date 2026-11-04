/**
 * The ECAD tool inventory, in registration order.
 *
 * The factories are separate so the generated tool reference can import them and
 * group them (`ecad_read`, `ecad_drafts`, `ecad_deliverables`) without mounting a
 * composition, exactly as the other engineering packages expose their tools.
 *
 * @module dsh-engineering-ecad/tools
 */

import type { ToolDefinition } from '../core.ts'
import type { EcadSession } from '../session.ts'
import { workspaceTools } from './workspace.ts'
import { sheetTools } from './sheets.ts'
import { reviewTools } from './review.ts'
import { draftTools } from './drafts.ts'
import { deliverTools } from './deliver.ts'

export { workspaceTools } from './workspace.ts'
export { sheetTools } from './sheets.ts'
export { reviewTools } from './review.ts'
export { draftTools } from './drafts.ts'
export { deliverTools } from './deliver.ts'

/**
 * Read-only workspace tools: capabilities, profile and scan.
 *
 * @param session - the row session.
 */
export function ecadReadTools(session: EcadSession): ToolDefinition[] {
  return [...workspaceTools(session), ...sheetTools(session), ...reviewTools(session)]
}

/**
 * Draft tools: stage, apply, discard and verify.
 *
 * @param session - the row session.
 */
export function ecadDraftTools(session: EcadSession): ToolDefinition[] {
  return draftTools(session)
}

/**
 * Deliverable tools: documentation bundle and backup.
 *
 * @param session - the row session.
 */
export function ecadDeliverTools(session: EcadSession): ToolDefinition[] {
  return deliverTools(session)
}

/**
 * Every tool this row registers, in registration order.
 *
 * The order is the order a caller should use them in: probe, profile, scan,
 * open, read, review, draft, deliver.
 *
 * @param session - the row session.
 */
export function ecadTools(session: EcadSession): ToolDefinition[] {
  return [...ecadReadTools(session), ...ecadDraftTools(session), ...ecadDeliverTools(session)]
}
