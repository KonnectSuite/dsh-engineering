/**
 * A write must carry the host's per-call sandbox policy.
 *
 * The bug this pins: the store called `fs.writeText` with four arguments, so a
 * confining provider fell back to the deployment default (`workspace-write`) and
 * refused a draft write in a session whose mode was `danger-full-access`. The
 * host's own tools resolve the policy per call and pass it as the fifth argument.
 */
import { describe, expect, it } from 'vitest'
import { ProjectSession } from '../src/session.ts'
import type { ExecContext, FsService, FsTarget } from '../src/core/tool.ts'

/** A provider that records what it was handed. */
function recordingFs(seen: unknown[][]): FsService {
  return {
    resolve: async (path: string) => ({ displayPath: path } as unknown as FsTarget),
    stat: async () => undefined,
    readBytes: async () => new Uint8Array(),
    writeText: async (...args: unknown[]) => { seen.push(args) },
  } as FsService
}

describe('sandbox policy on writes', () => {
  it('forwards the policy the host resolves for this session', async () => {
    const seen: unknown[][] = []
    const owner = { id: 'session-1' }
    const policy = {
      resolve: (options: { session?: unknown }) => ({ mode: 'danger-full-access', session: options.session }),
    }
    const store = new ProjectSession(recordingFs(seen), 1024, policy as never)
    await store.writeTextAt('out.L5X', '<x/>', { agent: { session: owner } } as unknown as ExecContext)

    expect(seen).toHaveLength(1)
    // Fifth argument: target, text, options, signal, policy.
    expect(seen[0]?.[4]).toEqual({ mode: 'danger-full-access', session: owner })
  })

  it('passes nothing when the composition has no policy service', async () => {
    const seen: unknown[][] = []
    const store = new ProjectSession(recordingFs(seen), 1024)
    await store.writeTextAt('out.L5X', '<x/>')

    expect(seen).toHaveLength(1)
    expect(seen[0]?.[4]).toBeUndefined()
  })
})
