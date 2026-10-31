/**
 * The resumable migration plan.
 *
 * A migration is a sequence of gates, and the expensive part is remembering
 * which gate passed and on what evidence. The plan is a JSON document in the
 * workspace (`.migration/plan.json` by default): decisions the engineer made,
 * the stages and their state, the exceptions that remain, and the files each
 * claim rests on. Nothing here touches a controller or claims a migration is
 * correct; it records what was decided and what was proved.
 *
 * @module dsh-engineering-migration/engine/plan
 */

/** The stages, in the order they gate each other. */
export const STAGES = [
  { id: 'intake', title: 'Interview the engineer and record the decisions' },
  { id: 'assess', title: 'Read the legacy project headlessly' },
  { id: 'convert', title: 'Run the migration wizard and keep the L5K' },
  { id: 'lint', title: 'Lint the L5K and repair a copy' },
  { id: 'import', title: 'Import into Studio and export the L5X' },
  { id: 'compare', title: 'Compare the legacy structure with the Logix export' },
  { id: 'engineer', title: 'Resolve the exceptions and prove each rewrite by build' },
  { id: 'commission', title: 'Commission, then baseline the source, ACD and L5X' },
] as const

/** One stage identifier. */
export type StageId = typeof STAGES[number]['id']

/** A stage state. */
export type StageStatus = 'pending' | 'active' | 'done' | 'blocked'

/** The five decisions no migration can start without. */
export interface PlanDecisions {
  readonly target_cpu?: string
  readonly target_revision?: number
  readonly io_strategy?: string
  readonly hmi_scope?: string
  readonly acceptance?: string
}

/** Which legacy file the plan is about. */
export interface PlanSource {
  readonly family: 'slc500' | 'plc5' | 'unknown'
  readonly path: string
  /** SHA-256 of the file when the caller recorded one. */
  readonly sha256?: string
}

/** One stage and its evidence. */
export interface PlanStage {
  readonly id: StageId
  readonly status: StageStatus
  readonly evidence: readonly string[]
  readonly note?: string
}

/** One remaining difference, and what is being done about it. */
export interface PlanException {
  readonly id: string
  readonly kind: string
  readonly description: string
  readonly rationale: string
  readonly status: 'open' | 'accepted' | 'fixed'
}

/** The whole document. */
export interface MigrationPlan {
  readonly schema: 1
  readonly project: string
  readonly created: string
  readonly updated: string
  readonly source: PlanSource
  readonly decisions: PlanDecisions
  readonly stages: readonly PlanStage[]
  readonly exceptions: readonly PlanException[]
}

/** The question each missing decision answers. */
const QUESTIONS: Readonly<Record<keyof PlanDecisions, string>> = {
  target_cpu: 'Which Logix controller is the migration target?',
  target_revision: 'Which firmware revision must it run? 37 or newer can be proved by an offline build; older targets only as imported.',
  io_strategy: 'Keep the 1746 chassis behind a 1747-AENTR bridge, or replace the I/O modules?',
  hmi_scope: 'Is the HMI in scope now or recorded for later? PanelView applications convert on their own path.',
  acceptance: 'What proves the migration is accepted: an offline build, a sequence test, or a golden part?',
}

/** Every decision key, in question order. */
const DECISION_KEYS = Object.keys(QUESTIONS) as (keyof PlanDecisions)[]

/** Build a fresh plan: every stage pending, no decisions yet. */
export function createPlan(input: {
  readonly project: string
  readonly source: PlanSource
  readonly now?: string
}): MigrationPlan {
  const now = input.now ?? new Date().toISOString()
  return {
    schema: 1,
    project: input.project,
    created: now,
    updated: now,
    source: input.source,
    decisions: {},
    stages: STAGES.map(stage => ({ id: stage.id, status: 'pending' as StageStatus, evidence: [] })),
    exceptions: [],
  }
}

/** Validate the decisions a caller passed, and reject nonsense. */
export function readDecisions(raw: Readonly<Record<string, unknown>>): PlanDecisions {
  const decisions: { target_cpu?: string; target_revision?: number; io_strategy?: string; hmi_scope?: string; acceptance?: string } = {}
  for (const key of DECISION_KEYS) {
    const value = raw[key]
    if (value === undefined || value === null || value === '') continue
    if (key === 'target_revision') {
      const revision = typeof value === 'number' ? value : Number(value)
      if (!Number.isInteger(revision) || revision < 1 || revision > 40) {
        throw new Error(`target_revision must be a whole number from 1 to 40; got ${String(value)}.`)
      }
      decisions.target_revision = revision
      continue
    }
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`${key} must be a non-empty sentence.`)
    }
    decisions[key] = value.trim()
  }
  return decisions
}

/** The questions the plan still cannot answer. */
export function openQuestions(plan: MigrationPlan): readonly string[] {
  return DECISION_KEYS
    .filter(key => plan.decisions[key] === undefined || plan.decisions[key] === '')
    .map(key => QUESTIONS[key])
}

/** The first stage that is not done. */
export function currentStage(plan: MigrationPlan): StageId | undefined {
  return plan.stages.find(stage => stage.status !== 'done')?.id
}

/** `blocked` before the interview is complete, `done` after commissioning, else `active`. */
export function planState(plan: MigrationPlan): 'blocked' | 'active' | 'done' {
  if (openQuestions(plan).length > 0) return 'blocked'
  return plan.stages.every(stage => stage.status === 'done') ? 'done' : 'active'
}

/** What the caller should do next. */
export function nextAction(plan: MigrationPlan): string {
  const questions = openQuestions(plan)
  if (questions.length > 0) return `Answer the interview questions: ${questions.length} remain.`
  const open = plan.exceptions.filter(exception => exception.status === 'open')
  if (plan.stages.find(stage => stage.id === 'commission')?.status === 'done') return 'The migration is recorded as complete; keep the baseline trio with the machine file.'
  if (open.length > 0) return `Resolve or accept ${open.length} open exception(s), then prove each fix by build.`
  return `Work stage \`${currentStage(plan) ?? 'unknown'}\`.`
}

/** Add or replace one decision; the plan keeps no half-answered question. */
export function withDecisions(plan: MigrationPlan, decisions: PlanDecisions, now = new Date().toISOString()): MigrationPlan {
  return {
    ...plan,
    updated: now,
    decisions: { ...plan.decisions, ...decisions },
  }
}

/** Set one stage, recording the evidence that lets the gate pass. */
export function withStage(
  plan: MigrationPlan,
  id: StageId,
  status: StageStatus,
  evidence: readonly string[] = [],
  note?: string,
  now = new Date().toISOString(),
): MigrationPlan {
  return {
    ...plan,
    updated: now,
    stages: plan.stages.map(stage => (stage.id === id
      ? { id: stage.id, status, evidence: [...stage.evidence, ...evidence], ...(note === undefined ? {} : { note }) }
      : stage)),
  }
}

/** Append an exception, or replace one with the same id. */
export function withException(plan: MigrationPlan, exception: PlanException, now = new Date().toISOString()): MigrationPlan {
  const exists = plan.exceptions.some(entry => entry.id === exception.id)
  return {
    ...plan,
    updated: now,
    exceptions: exists
      ? plan.exceptions.map(entry => (entry.id === exception.id ? exception : entry))
      : [...plan.exceptions, exception],
  }
}

/** Read a plan document, refusing anything that is not one. */
export function parsePlan(text: string): MigrationPlan {
  const raw: unknown = JSON.parse(text)
  if (typeof raw !== 'object' || raw === null) throw new Error('The plan is not a JSON object.')
  const record = raw as Partial<MigrationPlan>
  if (record.schema !== 1) throw new Error('The plan has no schema 1 marker; it was not written by this tool.')
  if (typeof record.project !== 'string' || record.project === '') throw new Error('The plan has no project name.')
  if (!Array.isArray(record.stages)) throw new Error('The plan has no stage list.')
  const known = new Set(STAGES.map(stage => stage.id as string))
  for (const stage of record.stages) {
    if (!known.has(stage.id)) throw new Error(`The plan names stage ${String(stage.id)}, which this tool does not know.`)
  }
  return record as MigrationPlan
}

/** A one-line summary of the plan. */
export function summarize(plan: MigrationPlan): string {
  const done = plan.stages.filter(stage => stage.status === 'done').length
  const open = plan.exceptions.filter(exception => exception.status === 'open').length
  return `${plan.project}: ${done}/${plan.stages.length} stage(s) done, ${open} open exception(s). State: ${planState(plan)}.`
}
