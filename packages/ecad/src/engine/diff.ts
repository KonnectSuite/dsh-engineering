/**
 * Comparing two sheet models.
 *
 * The comparison is entity-level and normalised: geometry is rounded to a
 * tolerance, angles are wrapped, and two entities with the same id are compared
 * field by field so a change names what changed ("text", "geometry", "layer").
 * Entities whose handles changed but whose normalised content matches are not
 * reported, because a re-written file is not a change to the drawing.
 *
 * @module dsh-engineering-ecad/engine/diff
 */

import type { EcadDiff, EcadEntity, EcadEntityChange, EcadEntityKind, EcadPoint, EcadSheetModel } from './types.ts'

/** Options of {@link diffSheetModels}. */
export interface DiffSheetModelsOptions {
  /** Geometry rounding tolerance in drawing units. Defaults to 0.001. */
  readonly tolerance?: number
  /** Cap on total added+removed+changed rows. Defaults to 1000. */
  readonly maxChanges?: number
  /** Compare the owning insert (`g`). Defaults to false: a re-flattened block is not a change. */
  readonly compareOwners?: boolean
}

/** A model entity reduced to comparable, tolerance-rounded values. */
interface Normalised {
  readonly entity: EcadEntity
  readonly k: EcadEntityKind
  readonly layer: string
  readonly color: number
  readonly rgb?: readonly [number, number, number]
  readonly lt?: string
  readonly lw?: number
  readonly g?: string
  readonly block?: string
  readonly closed?: boolean
  readonly approx?: boolean
  readonly src?: string
  readonly pts?: readonly EcadPoint[]
  readonly c?: EcadPoint
  readonly r?: number
  readonly a0?: number
  readonly a1?: number
  readonly rx?: number
  readonly ry?: number
  readonly rot?: number
  readonly p?: EcadPoint
  readonly t?: string
  readonly h?: number
  readonly w?: number
  readonly ha?: number
  readonly va?: number
  readonly scale?: readonly [number, number]
}

/** One pending comparison row with its deterministic sort key. */
interface Pending {
  readonly layout: string
  readonly order: number
  readonly change: EcadEntityChange
}

/**
 * Compare two sheet models.
 *
 * @param a - the earlier model.
 * @param b - the later model.
 * @param options - tolerance and row cap.
 * @returns added, removed and changed entities with reasons, capped and flagged when truncated.
 */
export function diffSheetModels(a: EcadSheetModel, b: EcadSheetModel, options: DiffSheetModelsOptions = {}): EcadDiff {
  const tolerance = typeof options.tolerance === 'number' && Number.isFinite(options.tolerance) && options.tolerance > 0 ? options.tolerance : 0.001
  const maxChanges = Math.max(1, Math.trunc(options.maxChanges ?? 1000))
  const compareOwners = options.compareOwners === true
  const pending: Pending[] = []
  const layoutIds: string[] = []
  const byLayoutA = new Map<string, readonly EcadEntity[]>(a.layouts.map(layout => [layout.id, layout.entities]))
  const byLayoutB = new Map<string, readonly EcadEntity[]>(b.layouts.map(layout => [layout.id, layout.entities]))
  for (const layout of [...a.layouts, ...b.layouts]) {
    if (!layoutIds.includes(layout.id)) layoutIds.push(layout.id)
  }

  for (const layoutId of layoutIds) {
    const before = (byLayoutA.get(layoutId) ?? []).map((entity, index) => ({ normalised: normalise(entity, tolerance), order: index }))
    const after = (byLayoutB.get(layoutId) ?? []).map((entity, index) => ({ normalised: normalise(entity, tolerance), order: index }))
    const matchedBefore = new Set<number>()
    const matchedAfter = new Set<number>()

    // Pass 1: match by stable id.
    const beforeById = new Map<string, number>()
    for (let index = 0; index < before.length; index += 1) beforeById.set(before[index]!.normalised.entity.id, index)
    for (let indexAfter = 0; indexAfter < after.length; indexAfter += 1) {
      const candidate = after[indexAfter]!
      const indexBefore = beforeById.get(candidate.normalised.entity.id)
      if (indexBefore === undefined || matchedBefore.has(indexBefore) || matchedAfter.has(indexAfter)) continue
      matchedBefore.add(indexBefore)
      matchedAfter.add(indexAfter)
      const beforeEntity = before[indexBefore]!.normalised
      const afterEntity = candidate.normalised
      if (beforeEntity.k !== afterEntity.k) {
        pending.push(removedRow(layoutId, beforeEntity, 'entity kind changed'))
        pending.push(addedRow(layoutId, afterEntity, 'entity kind changed'))
        continue
      }
      const reasons = compareEntities(beforeEntity, afterEntity, compareOwners)
      if (reasons.length > 0) {
        pending.push({ layout: layoutId, order: indexAfter, change: { kind: 'changed', layout: layoutId, entityKind: afterEntity.k, layer: afterEntity.layer, before: beforeEntity.entity, after: afterEntity.entity, reason: reasons.join(', ') } })
      }
    }

    // Pass 2: match the remainder by normalised content, so a handle change does
    // not read as a delete plus an insert.
    const signatureBuckets = new Map<string, number[]>()
    for (let index = 0; index < before.length; index += 1) {
      if (matchedBefore.has(index)) continue
      const signature = signatureOf(before[index]!.normalised)
      const bucket = signatureBuckets.get(signature) ?? []
      bucket.push(index)
      signatureBuckets.set(signature, bucket)
    }
    for (let indexAfter = 0; indexAfter < after.length; indexAfter += 1) {
      if (matchedAfter.has(indexAfter)) continue
      const candidate = after[indexAfter]!.normalised
      const bucket = signatureBuckets.get(signatureOf(candidate))
      const indexBefore = bucket?.pop()
      if (indexBefore === undefined) continue
      matchedBefore.add(indexBefore)
      matchedAfter.add(indexAfter)
    }

    for (let indexBefore = 0; indexBefore < before.length; indexBefore += 1) {
      if (matchedBefore.has(indexBefore)) continue
      pending.push(removedRow(layoutId, before[indexBefore]!.normalised, 'not present in b'))
    }
    for (let indexAfter = 0; indexAfter < after.length; indexAfter += 1) {
      if (matchedAfter.has(indexAfter)) continue
      pending.push(addedRow(layoutId, after[indexAfter]!.normalised, 'not present in a'))
    }
  }

  pending.sort((a2, b2) => a2.layout.localeCompare(b2.layout) || a2.order - b2.order || a2.change.entityKind.localeCompare(b2.change.entityKind))
  const limited = pending.slice(0, maxChanges)
  const added: EcadEntityChange[] = []
  const removed: EcadEntityChange[] = []
  const changed: EcadEntityChange[] = []
  for (const row of limited) {
    if (row.change.kind === 'added') added.push(row.change)
    else if (row.change.kind === 'removed') removed.push(row.change)
    else changed.push(row.change)
  }

  return {
    a: { path: a.path, version: a.version },
    b: { path: b.path, version: b.version },
    added,
    removed,
    changed,
    truncated: pending.length > limited.length
  }
}

/**
 * One added row.
 *
 * @param layout - layout id.
 * @param entity - the added entity.
 * @param reason - why it is reported.
 */
function addedRow(layout: string, entity: Normalised, reason: string): Pending {
  return { layout, order: 0, change: { kind: 'added', layout, entityKind: entity.k, layer: entity.layer, after: entity.entity, reason } }
}

/**
 * One removed row.
 *
 * @param layout - layout id.
 * @param entity - the removed entity.
 * @param reason - why it is reported.
 */
function removedRow(layout: string, entity: Normalised, reason: string): Pending {
  return { layout, order: 0, change: { kind: 'removed', layout, entityKind: entity.k, layer: entity.layer, before: entity.entity, reason } }
}

/**
 * Field-by-field comparison of two normalised entities.
 *
 * @param before - earlier value.
 * @param after - later value.
 * @param compareOwners - include the owning insert id in the comparison.
 * @returns change reasons in a stable order; empty when nothing changed.
 */
function compareEntities(before: Normalised, after: Normalised, compareOwners: boolean): string[] {
  const reasons: string[] = []
  if (before.layer !== after.layer) reasons.push('layer changed')
  if (before.color !== after.color || !sameTriple(before.rgb, after.rgb)) reasons.push('colour changed')
  if (before.lt !== after.lt || before.lw !== after.lw) reasons.push('linetype changed')
  if (before.block !== after.block) reasons.push('block changed')
  if (before.closed !== after.closed) reasons.push('closed flag changed')
  if (before.approx !== after.approx || before.src !== after.src) reasons.push('approximation changed')
  if (compareOwners && before.g !== after.g) reasons.push('owner changed')
  if (before.t !== after.t) reasons.push('text changed')
  if (!samePoint(before.p, after.p) || !samePoint(before.c, after.c)) reasons.push('position changed')
  if (before.r !== after.r || before.rx !== after.rx || before.ry !== after.ry) reasons.push('size changed')
  if (before.a0 !== after.a0 || before.a1 !== after.a1 || before.rot !== after.rot) reasons.push('angle changed')
  if (before.h !== after.h || before.w !== after.w) reasons.push('height changed')
  if (before.ha !== after.ha || before.va !== after.va) reasons.push('alignment changed')
  if (!samePoints(before.pts, after.pts)) reasons.push('geometry changed')
  if (!samePoint(before.scale, after.scale)) reasons.push('scale changed')
  return reasons
}

/**
 * Normalise one entity into its comparable form.
 *
 * @param entity - model entity.
 * @param tolerance - rounding tolerance.
 */
function normalise(entity: EcadEntity, tolerance: number): Normalised {
  const round = (value: number | undefined): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? quantise(value, tolerance) : undefined)
  const point = (value: EcadPoint | undefined): EcadPoint | undefined => (value ? [round(value[0]) ?? 0, round(value[1]) ?? 0] : undefined)
  const points = (value: readonly EcadPoint[] | undefined): EcadPoint[] | undefined => (value ? value.map(entry => [round(entry[0]) ?? 0, round(entry[1]) ?? 0] as EcadPoint) : undefined)
  const angle = (value: number | undefined): number | undefined => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
    const wrapped = ((value % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    return quantise(wrapped, tolerance)
  }
  return {
    entity,
    k: entity.k,
    layer: entity.layer,
    color: entity.color,
    rgb: entity.rgb,
    lt: entity.lt,
    lw: entity.lw,
    g: entity.g,
    block: entity.block,
    closed: entity.closed,
    approx: entity.approx,
    src: entity.src,
    pts: points(entity.pts),
    c: point(entity.c),
    r: round(entity.r),
    a0: entity.k === 'arc' ? angle(entity.a0) : round(entity.a0),
    a1: entity.k === 'arc' ? angle(entity.a1) : round(entity.a1),
    rx: round(entity.rx),
    ry: round(entity.ry),
    rot: entity.k === 'arc' || entity.k === 'ellipse' ? angle(entity.rot) : round(entity.rot),
    p: point(entity.p),
    t: entity.t,
    h: round(entity.h),
    w: round(entity.w),
    ha: entity.ha,
    va: entity.va,
    scale: entity.scale ? [round(entity.scale[0]) ?? 0, round(entity.scale[1]) ?? 0] : undefined
  }
}

/**
 * Signature used to pair entities whose ids differ.
 *
 * @param entity - normalised entity.
 */
function signatureOf(entity: Normalised): string {
  return JSON.stringify([
    entity.k,
    entity.layer,
    entity.color,
    entity.rgb ?? null,
    entity.block ?? null,
    entity.closed ?? null,
    entity.pts ?? null,
    entity.c ?? null,
    entity.r ?? null,
    entity.a0 ?? null,
    entity.a1 ?? null,
    entity.rx ?? null,
    entity.ry ?? null,
    entity.rot ?? null,
    entity.p ?? null,
    entity.t ?? null,
    entity.h ?? null,
    entity.w ?? null,
    entity.ha ?? null,
    entity.va ?? null,
    entity.scale ?? null
  ])
}

/**
 * Snap a number to the tolerance grid, avoiding float noise in snapshots.
 *
 * @param value - number.
 * @param tolerance - grid step (any positive number, including one above 1).
 */
function quantise(value: number, tolerance: number): number {
  const step = tolerance > 0 && Number.isFinite(tolerance) ? tolerance : 1
  return Number((Math.round(value / step) * step).toFixed(9))
}

/**
 * Compare two optional points.
 *
 * @param a - first point.
 * @param b - second point.
 */
function samePoint(a: EcadPoint | undefined, b: EcadPoint | undefined): boolean {
  if (!a || !b) return a === b
  return a[0] === b[0] && a[1] === b[1]
}

/**
 * Compare two optional point lists.
 *
 * @param a - first list.
 * @param b - second list.
 */
function samePoints(a: readonly EcadPoint[] | undefined, b: readonly EcadPoint[] | undefined): boolean {
  if (!a || !b) return a === b
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) {
    if (a[index]![0] !== b[index]![0] || a[index]![1] !== b[index]![1]) return false
  }
  return true
}

/**
 * Compare two optional RGB triples.
 *
 * @param a - first triple.
 * @param b - second triple.
 */
function sameTriple(a: readonly [number, number, number] | undefined, b: readonly [number, number, number] | undefined): boolean {
  if (!a || !b) return a === b
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
}
