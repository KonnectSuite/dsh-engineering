/**
 * Every check rule must carry a remedy.
 *
 * Round 152 compared the rule list against the remedy map by hand; this does it on every run.
 * A new rule that forgets a remedy fails here rather than reaching a caller who asks what to do.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FINDING_RULES } from '../src/engine/review.ts'

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

describe('the filterable rule list', () => {
  it('lists every rule the source can emit, with no duplicates', () => {
    const srcRoot = fileURLToPath(new URL('../src', import.meta.url))
    const files = (readdirSync(srcRoot, { recursive: true }) as string[]).filter(file => file.endsWith('.ts'))
    const source = files.map(file => readFileSync(join(srcRoot, file), 'utf8')).join('\n')
    const emitted: string[] = []
    // A rule may be chosen by an expression inside report(...), so scan the call's first argument.
    // The severity literal ends it; text after that is message prose, not a rule name.
    for (const call of source.matchAll(/report\(/gu)) {
      const window = source.slice(call.index, call.index + 400)
      const severity = /,\s*'(?:info|warning|critical)'/u.exec(window)
      const ruleExpression = severity === null ? window : window.slice(0, severity.index)
      for (const literal of ruleExpression.matchAll(/'([A-Z][A-Z0-9_]+)'/gu)) emitted.push(literal[1] as string)
    }
    for (const literal of source.matchAll(/rule:\s*'([A-Z0-9_]+)'/gu)) emitted.push(literal[1] as string)
    const rules = new Set(emitted)
    const known = new Set(FINDING_RULES)
    const missing = [...rules].filter(rule => !known.has(rule)).sort()
    expect({ emitted: rules.size, missing }).toEqual({ emitted: rules.size, missing: [] })
    // A stale name left in the list would accept a filter that can never match: the same
    // silent-clean answer as a misspelling. The list must not exceed what the source emits.
    const extra = FINDING_RULES.filter(rule => !rules.has(rule)).sort()
    expect({ listed: FINDING_RULES.length, extra }).toEqual({ listed: FINDING_RULES.length, extra: [] })
    expect(FINDING_RULES.length).toBe(new Set(FINDING_RULES).size)
    expect(FINDING_RULES.length).toBeGreaterThanOrEqual(36)
  })
})
