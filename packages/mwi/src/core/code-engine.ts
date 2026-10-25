/**
 * The Python code engine.
 *
 * The engine owns the saved-project work the COM bridge does not: binding a
 * staged `.mwt` wrapper to its new directory, reading saved declarations and
 * validating native containers. It is stdlib-only and speaks a file protocol:
 * one request JSON in, one response JSON out.
 *
 * @module dsh-engineering-mwi/core/code-engine
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MwiError } from './errors.ts'

/** Where the engine lives and which workspace it serves. */
export interface CodeEngineOptions {
  /** Absolute workspace root. */
  readonly workspace: string
  /** The only stage root the engine accepts. */
  readonly stageRoot: string
  /** Directory holding `mw_code.py` and `engine/`; defaults to the package's `code/`. */
  readonly codeDir: string
  /** Python interpreter; defaults to MW_PYTHON, the Arya interpreter, then `python`. */
  readonly python?: string
}

/** One engine response after a successful call. */
export type EngineResult = Readonly<Record<string, unknown>>

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** Resolve the first usable Python 3 interpreter. */
export function findPython(): string {
  if (process.env.MW_PYTHON) return process.env.MW_PYTHON
  const candidates = [
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'AryaCode', 'resources', 'runtime', 'primary-runtime', 'dependencies', 'python', 'python.exe'),
    join(process.env.USERPROFILE ?? '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe'),
  ]
  for (const candidate of candidates) {
    if (candidate.length > 0 && existsSync(candidate)) return candidate
  }
  return 'python'
}

/** The typed engine client. */
export class CodeEngine {
  private readonly python: string

  /**
   * @param options - Engine location and workspace authorization.
   */
  constructor(private readonly options: CodeEngineOptions) {
    this.python = options.python ?? findPython()
  }

  /**
   * Run one engine verb.
   *
   * @param verb - Engine verb, for example `bind_mwt`.
   * @param request - Verb arguments.
   * @param timeoutMs - Hard budget; the engine writes a response file.
   * @param signal - Cancellation owned by the caller.
   * @returns The response body after `ok`.
   * @throws MwiError when the engine refuses or is unavailable.
   */
  async run(verb: string, request: Readonly<Record<string, unknown>>, timeoutMs = 180_000, signal?: AbortSignal): Promise<EngineResult> {
    const helper = join(this.options.codeDir, 'mw_code.py')
    if (!existsSync(helper)) {
      throw new MwiError('ENGINE_MISSING', `The MotionWorks code engine is missing at ${helper}.`, 'Reinstall the bundle; the package ships code/mw_code.py.')
    }
    const ipc = mkdtempSync(join(tmpdir(), 'mwi-engine-'))
    const requestPath = join(ipc, 'req.json')
    const responsePath = join(ipc, 'res.json')
    try {
      writeFileSync(requestPath, JSON.stringify(request), 'utf8')
      const child = spawn(this.python, [helper, verb, requestPath, responsePath], {
        windowsHide: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          MW_SRC: join(this.options.codeDir, 'engine'),
          PYTHONIOENCODING: 'utf-8',
          MOTIONWORKS_MCP_BACKUP_DIR: join(this.options.workspace, '.motionworks', 'backups'),
          MOTIONWORKS_MCP_ROOT: this.options.stageRoot,
          MOTIONWORKS_MCP_CLOSE_IDE: '0',
          MOTIONWORKS_MCP_WORKSPACE: this.options.workspace,
          MOTIONWORKS_MCP_STAGE: this.options.stageRoot,
        },
      })
      const failure = new Promise<never>((_resolve, reject) => {
        child.once('error', error => reject(new MwiError(
          'PYTHON_UNAVAILABLE',
          `Cannot start the MotionWorks code engine with ${this.python}: ${error.message}`,
          'Set MW_PYTHON to a Python 3 interpreter, then retry.',
        )))
      })
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        if (signal?.aborted === true) throw new MwiError('ABORTED', 'The MotionWorks engine call was cancelled.', 'Retry when the IDE is idle.')
        if (existsSync(responsePath)) {
          const payload = await this.readResponse(responsePath)
          if (payload.ok === false) {
            throw new MwiError(
              'ENGINE_REFUSED',
              typeof payload.error === 'string' ? payload.error : `The MotionWorks engine refused ${verb}.`,
              'Read the message, correct the request, and retry. Do not retry the same invalid request.',
            )
          }
          return payload
        }
        await Promise.race([sleep(120), failure])
      }
      throw new MwiError(
        'ENGINE_TIMEOUT',
        `The MotionWorks code engine did not answer ${verb} within ${Math.round(timeoutMs / 1000)} s.`,
        'Inspect the project files and retry; a locked or malformed project fails here.',
      )
    } finally {
      rmSync(ipc, { recursive: true, force: true })
    }
  }

  /** Read the response file, tolerating a partial write. */
  private async readResponse(path: string): Promise<Record<string, unknown> & { ok?: boolean }> {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> & { ok?: boolean }
      return parsed
    } catch {
      await sleep(50)
      return {}
    }
  }
}
