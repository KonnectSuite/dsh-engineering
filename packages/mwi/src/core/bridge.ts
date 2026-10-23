/**
 * The typed boundary to the 32-bit COM bridge.
 *
 * The bridge is implementation: it owns the PowerShell process and the vendor
 * automation components, while the tools speak this request/response contract.
 * Phase 0 defines the contract; the PowerShell transport lands with the session
 * row.
 *
 * @module dsh-engineering-mwi/core/bridge
 */

import { MwiError } from './errors.ts'

/** One operation the bridge understands. */
export interface BridgeRequest {
  /** Operation name, for example `ide-status` or `pou-read`. */
  readonly operation: string
  /** Operation arguments; the bridge validates them. */
  readonly arguments: Readonly<Record<string, unknown>>
}

/** The bridge's answer. */
export interface BridgeResponse {
  /** Whether the operation completed. */
  readonly ok: boolean
  /** Operation result when `ok` is true. */
  readonly result?: unknown
  /** Failure when `ok` is false. */
  readonly error?: {
    readonly code: string
    readonly message: string
    readonly details?: string
  }
}

/** The process boundary the client is built over. */
export interface BridgeTransport {
  /**
   * Send one request and read one response.
   *
   * @param request - Operation and arguments.
   * @param timeoutMs - Hard operation budget.
   * @param signal - Cancellation owned by the caller.
   * @returns The bridge's answer.
   */
  send(request: BridgeRequest, timeoutMs: number, signal?: AbortSignal): Promise<BridgeResponse>
}

/** Default operation budget; IDE compile operations are allowed to override it. */
export const DEFAULT_TIMEOUT_MS = 120_000

/** The typed client the tools call. */
export class Bridge {
  /**
   * @param transport - Process boundary that speaks to the PowerShell bridge.
   * @param timeoutMs - Default operation budget.
   */
  constructor(
    private readonly transport: BridgeTransport,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  /**
   * Run one bridge operation.
   *
   * @param operation - Operation name.
   * @param args - Operation arguments.
   * @param signal - Cancellation owned by the caller.
   * @returns The operation result.
   * @throws MwiError when the operation fails or the bridge refuses it.
   */
  async run(operation: string, args: Readonly<Record<string, unknown>> = {}, signal?: AbortSignal): Promise<unknown> {
    const response = await this.transport.send({ operation, arguments: args }, this.timeoutMs, signal)
    if (!response.ok) {
      throw new MwiError(
        response.error?.code ?? 'BRIDGE_FAILED',
        response.error?.message ?? `The MotionWorks bridge refused ${operation}.`,
        'Call mw_ide_status, resolve any modal dialog, then retry. If it repeats, restart the IDE and the bridge.',
      )
    }
    return response.result
  }
}

/**
 * Refuse on a host that cannot run the MotionWorks IDE.
 *
 * @param platform - Host platform; defaults to the running process.
 */
export function assertSupportedPlatform(platform: NodeJS.Platform = process.platform): void {
  if (platform !== 'win32') {
    throw new MwiError(
      'PLATFORM_UNSUPPORTED',
      `MotionWorks IEC 3 Pro is a Windows application; this host is ${platform}.`,
      'Enable the MotionWorks rows only on a Windows host with the IDE installed.',
    )
  }
}
