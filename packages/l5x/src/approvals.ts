/**
 * Human approval for the controller actions that change a machine.
 *
 * Reading a controller needs no approval. Uploading a snapshot, changing mode
 * and downloading a project each ask the session's approval service for this
 * exact operation, and proceed only on `allowed-once`. A session whose policy
 * is not `ask` cannot request approval at all, and the tool refuses before it
 * touches the controller.
 *
 * @module dsh-engineering-l5x/approvals
 */

import { L5xError } from './core/errors.ts'
import type { ExecContext, PluginContext } from './core/tool.ts'

/** The approval service the composition may provide. */
export interface ApprovalService {
  request?(request: {
    readonly agent: unknown
    readonly toolName: string
    readonly callId: unknown
    readonly reason: string
    readonly signal?: AbortSignal
  }): Promise<string>
  overrideOf?(session: unknown): 'ask' | 'never' | undefined
  readonly config?: { readonly policy?: 'ask' | 'never' }
}

/** The permission-preset service, used only to explain a refusal. */
interface PresetService {
  current?(session: unknown): string
}

/** The calling session behind an agent context. */
function sessionOf(exec?: ExecContext): unknown {
  return (exec?.agent as { readonly session?: unknown } | undefined)?.session
}

/**
 * Report whether this session can request per-operation approval.
 *
 * @param ctx - Plugin context that may provide the approval service.
 * @param exec - Calling context carrying the agent.
 * @returns The status fields the tool shows the reader.
 */
export function approvalStatus(ctx: PluginContext, exec?: ExecContext): Record<string, unknown> {
  const approval = ctx.get?.('approval') as ApprovalService | undefined
  const session = sessionOf(exec)
  const presets = ctx.get?.('permissionPresets') as PresetService | undefined
  const preset = session === undefined ? undefined : presets?.current?.(session)
  const policy = session === undefined || approval === undefined
    ? undefined
    : approval.overrideOf?.(session) ?? approval.config?.policy ?? 'ask'
  const requestable = session !== undefined && typeof approval?.request === 'function' && policy === 'ask'
  return {
    permission_preset: preset ?? 'unknown',
    approval_policy: policy ?? 'unknown',
    approval_service: typeof approval?.request === 'function',
    agent_context: session !== undefined,
    approved_controller_actions_requestable: requestable,
    approval_required_per_call: ['capture_controller_snapshot', 'change_controller_mode', 'download_project'],
    ...(requestable
      ? { note: 'A human must still approve each exact operation; this does not confirm an answerer is online.' }
      : {
          next_step: policy === 'never'
            ? preset === 'danger-full-access'
              ? 'Switch this session from Full access to a preset that asks for approval, then call this tool again.'
              : 'This session has Never approval policy. Change it to Ask before a controller action, then call this tool again.'
            : 'Use a session with an agent context and an approval service that can ask. Do not bypass the plugin.',
        }),
  }
}

/**
 * Refuse when approval cannot be requested at all.
 *
 * @param ctx - Plugin context.
 * @param exec - Calling context.
 */
export function ensureApprovalReady(ctx: PluginContext, exec?: ExecContext): void {
  const status = approvalStatus(ctx, exec) as { approved_controller_actions_requestable: boolean; approval_policy: string; next_step?: string }
  if (!status.approved_controller_actions_requestable) {
    throw new L5xError(
      'APPROVAL_UNAVAILABLE',
      `Human approval cannot be requested (policy: ${status.approval_policy}). ${status.next_step ?? ''}`,
      'Switch to an approval preset that asks, then call this tool again.',
    )
  }
}

/**
 * Ask for approval of one exact operation and refuse unless it is granted once.
 *
 * @param ctx - Plugin context.
 * @param exec - Calling context.
 * @param toolName - Tool asking, recorded with the request.
 * @param reason - Exact operation the human is approving.
 */
export async function requireHumanApproval(ctx: PluginContext, exec: ExecContext | undefined, toolName: string, reason: string): Promise<void> {
  ensureApprovalReady(ctx, exec)
  const approval = ctx.get?.('approval') as ApprovalService | undefined
  if (exec?.agent === undefined || typeof approval?.request !== 'function') {
    throw new L5xError(
      'APPROVAL_UNAVAILABLE',
      `${toolName} requires human approval for this exact operation.`,
      'Use a session with an agent context and an approval service, then call this tool again.',
    )
  }
  let outcome: string
  try {
    outcome = await approval.request({
      agent: exec.agent,
      toolName,
      callId: exec.callId,
      reason,
      ...(exec.signal === undefined ? {} : { signal: exec.signal }),
    })
  } catch (error) {
    throw new L5xError(
      'APPROVAL_UNAVAILABLE',
      error instanceof Error ? error.message : String(error),
      'Check that a human can answer approval requests in this session, then retry.',
    )
  }
  if (outcome !== 'allowed-once') {
    throw new L5xError(
      'APPROVAL_DENIED',
      `${toolName} was not approved (${outcome}).`,
      'Nothing was sent to the controller. Ask the human what to change, then request a new operation.',
    )
  }
}
