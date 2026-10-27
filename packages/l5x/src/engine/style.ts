/**
 * Infer the house style of one L5X project.
 *
 * Every number here is counted from the export, and the shape is deliberately
 * the bundle-wide profile schema (`packages/resources/src/profile.ts`) rather
 * than an L5X-specific one, so the resources row can validate and store it.
 * Nothing is inferred from fewer than a handful of samples, and the confidence
 * field says how much of the project the inference actually saw.
 *
 * @module dsh-engineering-l5x/engine/style
 */

import type { ProjectSnapshot } from '../session.ts'

/** One counted value. */
interface Counted { readonly value: string; readonly count: number }

/** Evidence for one claim. */
interface Evidence { readonly file?: string; readonly line?: number; readonly count?: number; readonly note: string }

/** The profile, structurally compatible with the resources schema. */
export interface L5xStyleProfile {
  readonly schema: 1
  readonly source: { readonly kind: 'l5x'; readonly path: string; readonly sha256: string }
  readonly naming: {
    readonly tags: { readonly prefixes: readonly Counted[]; readonly case: string }
    readonly routines: { readonly case: string; readonly examples: readonly string[] }
  }
  readonly idioms: {
    readonly sealIn: { readonly count: number; readonly form: string }
    readonly latch: { readonly count: number }
  }
  readonly comments: { readonly total: number; readonly commented: number; readonly ratio: number }
  readonly evidence: readonly Evidence[]
  readonly confidence: 'low' | 'medium' | 'high'
}

/** Classify one identifier's case convention. */
function caseOf(identifier: string): 'PascalCase' | 'camelCase' | 'snake_case' | 'other' {
  if (/^[A-Z][A-Za-z0-9]*$/u.test(identifier)) return 'PascalCase'
  if (/^[a-z][A-Za-z0-9]*$/u.test(identifier)) return 'camelCase'
  if (/^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+$/u.test(identifier)) return 'snake_case'
  return 'other'
}

/** The most common value in a counter, with its count. */
function top(counts: ReadonlyMap<string, number>): Counted | undefined {
  let best: Counted | undefined
  for (const [value, count] of counts) {
    if (best === undefined || count > best.count) best = { value, count }
  }
  return best
}

/**
 * Read the style of one project.
 *
 * @param project - Snapshot the session opened.
 * @returns The profile.
 */
export function styleProfileOf(project: ProjectSnapshot): L5xStyleProfile {
  const document = project.document
  const rungs = document.routines
    .filter(routine => routine.body.type === 'RLL')
    .flatMap(routine => (routine.body.type === 'RLL' ? routine.body.rungs.map(rung => ({ routine: routine.name, rung })) : []))
  const identifiers = new Map<string, number>()
  const prefixes = new Map<string, number>()
  const cases = new Map<string, number>()
  let sealIn = 0
  let latchInstructions = 0
  let commented = 0
  const evidence: Evidence[] = []
  const aoiNames = new Set(document.aois.map(aoi => aoi.name.toUpperCase()))
  let firstSealInRung: number | undefined

  for (const { routine, rung } of rungs) {
    if (rung.comment !== undefined) commented += 1
    const text = rung.text
    for (const match of text.matchAll(/[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*/gu)) {
      const whole = match[0]
      if (aoiNames.has(whole.toUpperCase())) continue
      const base = whole.split('.')[0] ?? whole
      if (base.length < 5) continue
      identifiers.set(base, (identifiers.get(base) ?? 0) + 1)
      const parts = base.split('_')
      if (parts.length > 1) {
        const prefix = parts[0] as string
        if (/^[A-Z][A-Za-z]{1,6}$/u.test(prefix) && base.length > prefix.length + 3) {
          prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1)
        }
      }
      const kind = caseOf(base)
      if (kind !== 'other') cases.set(kind, (cases.get(kind) ?? 0) + 1)
    }
    for (const coil of text.matchAll(/OTE\(([^),]+)\)/gu)) {
      const target = (coil[1] ?? '').trim()
      const contact = `XIC(${target})`
      const coilIndex = coil.index ?? 0
      const contactIndex = text.indexOf(contact)
      if (contactIndex >= 0 && contactIndex < coilIndex) {
        sealIn += 1
        if (firstSealInRung === undefined) firstSealInRung = rung.number
      }
    }
    latchInstructions += (text.match(/OT[LU]\(/gu) ?? []).length
  }

  const total = rungs.length
  const dominant = top(prefixes)
  const dominantCase = top(cases)
  const prefixShare = dominant === undefined ? 0 : dominant.count / Math.max(1, [...prefixes.values()].reduce((sum, count) => sum + count, 0))
  const routineCases = new Map<string, number>()
  for (const routine of document.routines) {
    const kind = caseOf(routine.name)
    if (kind !== 'other') routineCases.set(kind, (routineCases.get(kind) ?? 0) + 1)
  }
  const routineCase = top(routineCases)

  if (dominant !== undefined) evidence.push({ count: dominant.count, note: `tag prefix "${dominant.value}" appears ${dominant.count} time(s)` })
  if (firstSealInRung !== undefined) evidence.push({ line: firstSealInRung, count: sealIn, note: `seal-in rungs detected from rung ${firstSealInRung}` })
  evidence.push({ count: total, note: `${total} ladder rung(s) read, ${commented} with a comment` })

  const confidence: L5xStyleProfile['confidence'] = total >= 50 && prefixShare >= 0.5 ? 'high' : total >= 10 ? 'medium' : 'low'
  return {
    schema: 1,
    source: { kind: 'l5x', path: project.path, sha256: project.sha256 },
    naming: {
      tags: { prefixes: [...prefixes].sort((left, right) => right[1] - left[1]).slice(0, 6).map(([value, count]) => ({ value, count })), case: dominantCase?.value ?? 'PascalCase' },
      routines: { case: routineCase?.value ?? 'PascalCase', examples: document.routines.slice(0, 5).map(routine => routine.name) },
    },
    idioms: {
      sealIn: { count: sealIn, form: sealIn > 0 ? 'XIC(seal) in parallel with the start contact, in series with the stop contact' : 'not observed' },
      latch: { count: latchInstructions },
    },
    comments: { total, commented, ratio: total === 0 ? 0 : Number((commented / total).toFixed(2)) },
    evidence,
    confidence,
  }
}
