/**
 * Provenance across turns.
 *
 * A baseline is only downloadable when this chat exported it from an ACD. The
 * chat object is not stable across turns, so a record keyed only by that object
 * vanished and an unchanged baseline looked untrusted. The stable session id is
 * now the key; these tests hold that, plus session isolation and the identity
 * fallback for callers that carry no session id.
 */
import { describe, expect, it } from 'vitest'
import { StudioState } from '../src/studio-state.ts'

const exportRecord = {
  acdPath: 'C:/project/base.ACD',
  l5xPath: 'C:/project/base.L5X',
  acdSha256: 'a'.repeat(64),
  l5xSha256: 'b'.repeat(64),
}

const build = {
  path: 'C:/project/built.ACD',
  sha256: 'c'.repeat(64),
  baselinePath: 'C:/project/base.L5X',
  sourcePath: 'C:/project/edited.L5X',
  review: { baseline_sha256: 'b'.repeat(64), source_sha256: 'd'.repeat(64) },
}

describe('studio provenance', () => {
  it('keeps an ACD export across turns that present a new chat object', () => {
    const state = new StudioState()
    state.record({ sessionId: 'session-1', chat: { turn: 1 } }, exportRecord)
    expect(state.forL5x({ sessionId: 'session-1', chat: { turn: 2 } }, 'c:/PROJECT/base.l5x')).toEqual(exportRecord)
  })

  it('keeps a verified build by session id', () => {
    const state = new StudioState()
    state.addVerified({ sessionId: 'session-1', chat: { turn: 1 } }, 'verification-1', build)
    expect(state.verified({ sessionId: 'session-1', chat: { turn: 3 } }, 'verification-1')).toEqual(build)
  })

  it('does not carry provenance into another session', () => {
    const state = new StudioState()
    state.record({ sessionId: 'session-1', chat: {} }, exportRecord)
    expect(state.forL5x({ sessionId: 'session-2', chat: {} }, exportRecord.l5xPath)).toBeUndefined()
  })

  it('still falls back to chat identity when no session id is supplied', () => {
    const state = new StudioState()
    const chat = {}
    state.record({ chat }, exportRecord)
    expect(state.forL5x({ chat }, exportRecord.l5xPath)).toEqual(exportRecord)
    expect(state.forL5x({ chat: {} }, exportRecord.l5xPath)).toBeUndefined()
  })
})
