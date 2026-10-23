/**
 * The PowerShell transport for the MotionWorks COM bridge.
 *
 * The bridge is a 32-bit PowerShell process that polls a request file and writes
 * one response file. Files, not stdio: a confined harness cannot open named
 * pipes, and `Mwt.exe` is a 32-bit LocalServer32 that a 64-bit client cannot
 * instantiate at all.
 *
 * This client owns the mailbox, serializes requests, starts the bridge once and
 * maps the bridge's answer onto the typed bridge contract.
 *
 * @module dsh-engineering-mwi/core/ps-bridge
 */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MwiError } from './errors.ts'
import type { BridgeRequest, BridgeResponse, BridgeTransport } from './bridge.ts'

/** Where the bridge lives and which workspace it may act on. */
export interface PowerShellBridgeOptions {
  /** Directory containing `start_bridge.cmd` and `mw_bridge.ps1`. */
  readonly bridgeDir: string
  /** Absolute workspace the bridge may touch. */
  readonly workspace: string
  /** The only stage root the bridge accepts: `<workspace>/.motionworks/stage`. */
  readonly stageRoot: string
  /** Mailbox directory; defaults to a private temp directory. */
  readonly ipcDir?: string
  /** Startup budget before the bridge must answer. Defaults to 12 s. */
  readonly startupMs?: number
}

/** One response file as the bridge writes it. */
interface BridgeFileResponse {
  readonly id: string
  readonly verb: string
  readonly ok: boolean
  readonly data: unknown
  readonly error: string | null
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/**
 * A serialized client over the file mailbox, matching the legacy bridge protocol.
 */
export class PowerShellBridgeTransport implements BridgeTransport {
  private readonly ipcDir: string
  private readonly requestPath: string
  private readonly responsePath: string
  private readonly startupMs: number
  private spawned = false
  private queue: Promise<unknown> = Promise.resolve()

  /**
   * @param options - Bridge location and workspace authorization.
   */
  constructor(private readonly options: PowerShellBridgeOptions) {
    this.ipcDir = options.ipcDir ?? join(tmpdir(), 'dsh-engineering-mwi', `${process.pid}-${randomUUID()}`)
    this.requestPath = join(this.ipcDir, 'req.json')
    this.responsePath = join(this.ipcDir, 'res.json')
    this.startupMs = options.startupMs ?? 12_000
  }

  /** The mailbox this client owns; exposed for diagnostics. */
  get mailbox(): string {
    return this.ipcDir
  }

  /**
   * Send one request and wait for its response.
   *
   * @param request - Operation and arguments.
   * @param timeoutMs - Hard operation budget.
   * @param signal - Cancellation owned by the caller.
   * @returns The bridge's answer.
   */
  async send(request: BridgeRequest, timeoutMs: number, signal?: AbortSignal): Promise<BridgeResponse> {
    const pending = this.queue.then(async () => await this.exchange(request, timeoutMs, signal))
    this.queue = pending.catch(() => undefined)
    return await pending
  }

  /** Run one request after the previous one settled. */
  private async exchange(request: BridgeRequest, timeoutMs: number, signal?: AbortSignal): Promise<BridgeResponse> {
    mkdirSync(this.ipcDir, { recursive: true })
    this.spawnBridge()
    const id = randomUUID()
    const payload = {
      id,
      verb: request.operation,
      ...request.arguments,
      workspace: this.options.workspace,
      stage_root: this.options.stageRoot,
    }
    const staged = `${this.requestPath}.tmp`
    rmSync(this.responsePath, { force: true })
    writeFileSync(staged, JSON.stringify(payload), 'utf8')
    renameSync(staged, this.requestPath)

    const deadline = Date.now() + Math.max(timeoutMs, this.startupMs)
    while (Date.now() < deadline) {
      if (signal?.aborted === true) throw new MwiError('ABORTED', 'The MotionWorks call was cancelled.', 'Retry when the IDE is idle.')
      const response = this.readResponse()
      if (response !== undefined && response.id === id) {
        return response.ok
          ? { ok: true, result: response.data }
          : { ok: false, error: { code: this.codeOf(response), message: response.error ?? 'The MotionWorks bridge refused the request.' } }
      }
      await sleep(120)
    }
    throw new MwiError(
      'BRIDGE_TIMEOUT',
      `The MotionWorks bridge did not answer ${request.operation} within ${Math.round(timeoutMs / 1000)} s.`,
      'Inspect the IDE: a modal dialog or a busy project blocks the bridge. Resolve it, then retry.',
    )
  }

  /** Read the current response file, ignoring partial or malformed writes. */
  private readResponse(): BridgeFileResponse | undefined {
    try {
      const parsed = JSON.parse(readFileSync(this.responsePath, 'utf8')) as BridgeFileResponse
      return typeof parsed?.id === 'string' ? parsed : undefined
    } catch {
      return undefined
    }
  }

  /** Map a bridge refusal to a stable code the model can act on. */
  private codeOf(response: BridgeFileResponse): string {
    const text = response.error ?? ''
    if (/no running MotionWorks IDE/i.test(text)) return 'IDE_NOT_RUNNING'
    if (/REFUSED/i.test(text)) return 'REFUSED'
    if (/unknown verb/i.test(text)) return 'BRIDGE_UNKNOWN_OPERATION'
    return 'BRIDGE_FAILED'
  }

  /** Start the 32-bit bridge once per client. */
  private spawnBridge(): void {
    if (this.spawned) return
    const launcher = join(this.options.bridgeDir, 'start_bridge.cmd')
    const child = spawn('cmd.exe', ['/c', launcher], {
      env: { ...process.env, MW_BRIDGE_DIR: this.ipcDir },
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
    })
    child.on('error', () => {
      this.spawned = false
    })
    child.unref()
    this.spawned = true
  }
}
