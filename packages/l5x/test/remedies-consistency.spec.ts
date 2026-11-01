/**
 * Every check rule must carry a remedy.
 *
 * Round 152 compared the rule list against the remedy map by hand; this does it on every run.
 * A new rule that forgets a remedy fails here rather than reaching a caller who asks what to do.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const reviewSource = readFileSync(fileURLToPath(new URL('../src/engine/review.ts', import.meta.url)), 'utf8')

const producedRules = [...reviewSource.matchAll(/report\(\s*'([A-Z0-9_]+)'/gu)].map(match => match[1] as string)
const remedyKeys = [...reviewSource.matchAll(/^ {2}([A-Z0-9_]+): '/gmu)].map(match => match[1] as string)

describe('the remedy map', () => {
  it('covers every rule the checks report', () => {
    const rules = [...new Set(producedRules)].sort()
    const remedies = new Set(remedyKeys)
    const missing = rules.filter(rule => !remedies.has(rule))
    expect({ rules: rules.length, missing }).toEqual({ rules: rules.length, missing: [] })
    expect(rules.length).toBeGreaterThanOrEqual(20)
  })
})
