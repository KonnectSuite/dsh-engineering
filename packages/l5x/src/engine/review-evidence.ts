/** Exact source-citation checks for model-authored engineering findings. */
import { EngineeringError, type ProjectSnapshot } from '../session.ts'

interface Citation {
  program: string
  routine: string
  quote: string
  rung?: number
  line?: number
}

function citation(value: unknown): Citation {
  if (typeof value !== 'object' || value === null || !('program' in value) || typeof value.program !== 'string'
    || !('routine' in value) || typeof value.routine !== 'string' || !('quote' in value) || typeof value.quote !== 'string'
    || value.program.trim() === '' || value.routine.trim() === '' || value.quote.trim() === '') {
    throw new EngineeringError('INVALID_CITATION', 'Each citation requires program, routine and a nonempty verbatim quote')
  }
  const rung = 'rung' in value ? value.rung : undefined
  const line = 'line' in value ? value.line : undefined
  if ((rung === undefined) === (line === undefined)
    || (rung !== undefined && (typeof rung !== 'number' || !Number.isInteger(rung) || rung < 0))
    || (line !== undefined && (typeof line !== 'number' || !Number.isInteger(line) || line < 0))) {
    throw new EngineeringError('INVALID_CITATION', 'Specify exactly one nonnegative integer rung or zero-based ST line')
  }
  return { program: value.program, routine: value.routine, quote: value.quote,
    ...(typeof rung === 'number' ? { rung } : {}), ...(typeof line === 'number' ? { line } : {}) }
}

/** Verify exact names, locations and quotes without certifying their interpretation.
 * @param project - hash-checked export snapshot.
 * @param request - JSON array of program/routine/quote citations with rung or zero-based ST line; AOI programs use AOI::Name.
 * @returns source identity and per-citation results; no controller or network contact.
 */
export function verifyReviewEvidence(project: ProjectSnapshot, request: string): object {
  let parsed: unknown
  try { parsed = JSON.parse(request) }
  catch (error) { throw new EngineeringError('INVALID_CITATION', `Citations must be JSON: ${error instanceof Error ? error.message : String(error)}`) }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new EngineeringError('INVALID_CITATION', 'Citations must be a nonempty JSON array')
  const citations = parsed.map(citation)
  const results = citations.map(item => {
    const routine = item.program.startsWith('AOI::')
      ? project.document.aois.find(aoi => `AOI::${aoi.name}` === item.program)?.routines.find(r => r.name === item.routine)
      : project.document.routines.find(r => r.program === item.program && r.name === item.routine)
    const text = routine?.body.type === 'RLL' && item.rung !== undefined
      ? routine.body.rungs.find(r => r.number === item.rung)?.text
      : routine?.body.type === 'ST' && item.line !== undefined ? routine.body.code.split('\n')[item.line] : undefined
    const reason = routine === undefined ? 'routine_not_found' : text === undefined ? 'location_not_found'
      : !text.includes(item.quote) ? 'quote_mismatch' : 'matched'
    return { ...item, verified: reason === 'matched', reason, ...(text === undefined ? {} : { source_text: text }) }
  })
  return { project_id: project.id, sha256: project.sha256, results, all_citations_verified: results.every(result => result.verified),
    interpretation_verified: false, controller_contacted: false,
    note: 'Matching text verifies a citation only. It does not establish runtime behavior, absence of other references, instruction semantics or whole-machine safety.' }
}
