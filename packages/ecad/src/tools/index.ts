/**
 * The ECAD tool inventory, in registration order.
 *
 * The factories are separate so the generated tool reference can import them and
 * group them (`ecad_read`, `ecad_deliverables`) without mounting a composition,
 * exactly as the other engineering packages expose their tools.
 *
 * Authoring is not here: a drawing is edited in AryaCAD Electrical through its
 * MCP bridge, and this row re-reads what that app wrote.
 *
 * @module dsh-engineering-ecad/tools
 */

import type { CadBridge } from '../bridge.ts'
import type { ToolDefinition } from '../core.ts'
import type { EcadSession } from '../session.ts'
import { workspaceTools } from './workspace.ts'
import { sheetTools } from './sheets.ts'
import { reviewTools } from './review.ts'
import { deliverTools } from './deliver.ts'

export { workspaceTools } from './workspace.ts'
export { sheetTools } from './sheets.ts'
export { reviewTools } from './review.ts'
export { deliverTools } from './deliver.ts'

/**
 * Read-only workspace tools: capabilities, profile and scan.
 *
 * @param session - the row session.
 * @param bridge - the configured CAD bridge, when the caller has a registry to read.
 */
export function ecadReadTools(session: EcadSession, bridge?: CadBridge): ToolDefinition[] {
  return [...workspaceTools(session, bridge), ...sheetTools(session), ...reviewTools(session)]
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
 * open, read, review, deliver.
 *
 * @param session - the row session.
 * @param bridge - the configured CAD bridge, when the caller has a registry to read.
 */
export function ecadTools(session: EcadSession, bridge?: CadBridge): ToolDefinition[] {
  return [...ecadReadTools(session, bridge), ...ecadDeliverTools(session)]
}
