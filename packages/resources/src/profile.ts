/**
 * The house-style profile: the evidence-backed conventions of one open project.
 *
 * A profile is produced by a product package (it owns the parser) and validated
 * here. It is deliberately small JSON: every field names its evidence and the
 * whole profile carries a confidence level, because a convention inferred from
 * six rungs is a hint, not a rule.
 *
 * @module dsh-engineering-resources/profile
 */

import { createHash } from 'node:crypto'

/** One counted convention, e.g. a tag prefix. */
export interface Counted {
  /** The observed value. */
  readonly value: string
  /** How many times it was observed. */
  readonly count: number
}

/** Evidence behind one claim. */
export interface ProfileEvidence {
  /** File the evidence came from. */
  readonly file?: string
  /** Rung or line number, when the product can name one. */
  readonly line?: number
  /** How many observations support the claim. */
  readonly count?: number
  /** Human-readable note. */
  readonly note: string
}

/** Kind of project the profile was read from. */
export type ProfileKind = 'l5x' | 'ftview' | 'mwi' | 'optix'

/** The profile schema every product returns. */
export interface StyleProfile {
  /** Schema version; refuse anything else. */
  readonly schema: 1
  /** Where the profile came from. */
  readonly source: {
    readonly kind: ProfileKind
    readonly path: string
    readonly sha256?: string
  }
  /** Naming conventions, when the product can infer them. */
  readonly naming?: {
    readonly tags?: { readonly prefixes: readonly Counted[]; readonly case?: string }
    readonly routines?: { readonly case?: string; readonly examples?: readonly string[] }
    readonly displays?: { readonly case?: string; readonly examples?: readonly string[] }
  }
  /** Logic idioms the project actually uses. */
  readonly idioms?: {
    readonly sealIn?: { readonly count: number; readonly form: string }
    readonly latch?: { readonly count: number }
    readonly stateMachine?: { readonly count: number; readonly form: string }
  }
  /** HMI conventions, for FactoryTalk View and Optix. */
  readonly hmi?: {
    readonly palette?: readonly Counted[]
    readonly fonts?: readonly Counted[]
    readonly button?: readonly Counted[]
    readonly navigation?: { readonly displaysWithNav: number; readonly displays: number }
    readonly popups?: { readonly onTop: number; readonly replace: number }
  }
  /** Comment density, where the product exposes comments. */
  readonly comments?: { readonly total: number; readonly commented: number; readonly ratio: number }
  /** What the profile is based on. */
  readonly evidence: readonly ProfileEvidence[]
  /** How much to trust it. */
  readonly confidence: 'low' | 'medium' | 'high'
}

/** A validation result: the profile, or the reasons it was refused. */
export interface ProfileCheck {
  readonly ok: boolean
  readonly problems: readonly string[]
}

/**
 * Validate one profile from a product package.
 *
 * @param value - Whatever the product returned.
 * @returns Ok, or the specific problems.
 */
export function validateProfile(value: unknown): ProfileCheck {
  const problems: string[] = []
  if (typeof value !== 'object' || value === null) return { ok: false, problems: ['profile is not an object'] }
  const profile = value as Partial<StyleProfile>
  if (profile.schema !== 1) problems.push('schema must be 1')
  const source = profile.source as StyleProfile['source'] | undefined
  if (source === undefined) problems.push('source is required')
  else {
    if (!['l5x', 'ftview', 'mwi', 'optix'].includes(source.kind)) problems.push(`unknown source.kind ${JSON.stringify(source.kind)}`)
    if (typeof source.path !== 'string' || source.path === '') problems.push('source.path is required')
  }
  if (!['low', 'medium', 'high'].includes(profile.confidence ?? '')) problems.push('confidence must be low, medium or high')
  if (!Array.isArray(profile.evidence) || profile.evidence.length === 0) problems.push('evidence must be a non-empty array')
  if (profile.naming === undefined && profile.idioms === undefined && profile.hmi === undefined && profile.comments === undefined) {
    problems.push('a profile needs at least one of naming, idioms, hmi or comments')
  }
  return { ok: problems.length === 0, problems }
}

/**
 * A stable handle for one profile, so a tool can refer to it later.
 *
 * @param profile - A validated profile.
 * @returns Short id derived from the source and its digest.
 */
export function profileId(profile: StyleProfile): string {
  const seed = JSON.stringify([profile.source.kind, profile.source.path, profile.source.sha256 ?? '', profile.evidence.length])
  return createHash('sha256').update(seed).digest('hex').slice(0, 12)
}
