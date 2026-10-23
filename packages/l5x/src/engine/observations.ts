/** Bind bounded live samples to source evidence; only simple series BOOL contacts are evaluated. */
import { evidenceOf, type Evidence } from './analysis.ts'
import { EngineeringError, type ProjectSnapshot } from '../session.ts'
import type { LiveWatchTag } from './studio-sdk.ts'
import { aliasesOf } from './configuration.ts'

/** A sweep returned by the SDK with per-tag quality and actual timestamps. */
export interface LogicSample {
  elapsed_ms: number
  sweep_ms: number
  values: { tag: string; value: string | number | boolean | null; quality: string; observed_at: string; error?: string }[]
}

/** Choose controller scalar tags referenced by exactly one selected routine.
 * @param project - verified export snapshot.
 * @param program - exact program name.
 * @param routine - exact routine name.
 * @param selected - optional explicit subset of tag names.
 * @returns bounded watch candidates and unresolved evidence; never truncates a watch silently.
 */
export function logicWatch(project: ProjectSnapshot, program: string, routine: string, selected?: readonly string[]) {
  const body = project.document.routines.find(entry => entry.program === program && entry.name === routine)
  if (body === undefined) throw new EngineeringError('COMPONENT_NOT_FOUND', 'Select an existing program and routine')
  const evidence = evidenceOf(project).filter(entry => entry.scope === program && entry.routine === routine)
  const tags: LiveWatchTag[] = []
  const unresolved: Evidence[] = []
  for (const entry of evidence) {
    const tag = project.document.tags.find(candidate => candidate.scope === 'controller' && entry.resolved === `controller::${candidate.name}`)
    if (tag === undefined || aliasesOf(project.document).has(`controller::${tag.name}`) || !['BOOL', 'INT', 'DINT', 'REAL'].includes(tag.dataType)) { unresolved.push(entry); continue }
    if (selected !== undefined && !selected.some(name => name.toLowerCase() === tag.name.toLowerCase())) continue
    if (!tags.some(item => item.name.toLowerCase() === tag.name.toLowerCase())) {
      const type = tag.dataType
      if (type === 'BOOL' || type === 'INT' || type === 'DINT' || type === 'REAL') tags.push({ name: tag.name, data_type: type })
    }
  }
  if (selected !== undefined && (selected.length === 0 || selected.some(name => !tags.some(tag => tag.name.toLowerCase() === name.toLowerCase()))))
    throw new EngineeringError('INVALID_WATCH', 'Every selected tag must be a controller scalar referenced by this routine')
  return { program, routine, language: body.type, tags, unresolved, evidence,
    sampling_available: tags.length > 0 && tags.length <= 16,
    next_step: tags.length > 16 ? 'Select at most 16 tag names using tags_json; all candidates are shown.' : tags.length === 0 ? 'This routine has no supported controller scalar candidates; inspect unresolved evidence.' : 'Use observe_logic with sample_count and interval_ms to sample this watch.' }
}

/** Explain only supported series contacts; sequential reads cannot establish runtime causality.
 * @param project - source export.
 * @param program - selected program.
 * @param routine - selected routine.
 * @param samples - timestamped SDK sweeps.
 * @returns contacts failing their observed conditions and explicit unresolved rungs.
 */
export function explainLogicSamples(project: ProjectSnapshot, program: string, routine: string, samples: readonly LogicSample[]): object {
  const body = project.document.routines.find(entry => entry.program === program && entry.name === routine)?.body
  const observations = samples.map(sample => {
    const conditions = body?.type !== 'RLL' ? [] : body.rungs.map(rung => {
      const supported = /^(?:XIC\([A-Za-z_][A-Za-z0-9_]*\)|XIO\([A-Za-z_][A-Za-z0-9_]*\))+OTE\([A-Za-z_][A-Za-z0-9_]*\);?$/u.test(rung.text.trim())
      if (!supported) return { rung: rung.number, status: 'unresolved', reason: 'Only series XIC/XIO contacts ending in OTE are evaluated; branches and other instructions need review.' }
      const contacts = [...rung.text.matchAll(/(XIC|XIO)\(([A-Za-z_][A-Za-z0-9_]*)\)/gu)].map(match => {
        const symbol = match[2] ?? ''
        // A program tag shadows a controller tag of the same name.
        const scoped = project.document.tags.some(tag => tag.scope === program && tag.name.toLowerCase() === symbol.toLowerCase())
        const reading = scoped ? undefined : sample.values.find(value => value.tag.toLowerCase() === symbol.toLowerCase())
        const boolean = reading?.quality === 'good' ? reading.value === true || reading.value === 'true' ? true : reading.value === false || reading.value === 'false' ? false : undefined : undefined
        return { symbol, instruction: match[1], value: boolean ?? null, condition: boolean === undefined ? 'unknown' : boolean === (match[1] === 'XIC') ? 'met' : 'not_met' }
      })
      return { rung: rung.number, status: contacts.some(contact => contact.condition === 'unknown') ? 'unresolved' : 'observed', contacts, unmet_contacts: contacts.filter(contact => contact.condition === 'not_met').map(contact => contact.symbol) }
    })
    return { elapsed_ms: sample.elapsed_ms, sweep_ms: sample.sweep_ms, conditions }
  })
  return { observations, evaluation: body?.type === 'RLL' ? 'limited_series_contacts' : 'source_evidence_only',
    limitation: 'Sequential point-in-time samples can miss transitions. Contact observations do not prove execution, scheduling, output state, or the root cause. Export logic may differ from online logic.' }
}
