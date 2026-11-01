/**
 * Function Block Diagram structure, checked the way Studio checks it.
 *
 * An FBD routine is a graph: elements carry an `ID`, and `<Wire FromID=".."
 * ToID="..">` elements connect them. The export states no rule for that graph, so
 * a diagram that Studio refuses looks exactly like one it accepts — a wire
 * pointing at an element that does not exist, two output references writing the
 * same tag, a connector with nothing on the other side.
 *
 * These checks are structural only. They read the decoded nodes
 * (`L5xRoutineBody` of type `FBD`), which is what the reader already parsed for
 * references, so no new XML is walked and an SFC routine is never touched: its
 * `DirectedLink` elements are a different language with different rules.
 *
 * @module dsh-engineering-l5x/engine/fbd
 */

import type { L5xDiagramNode, L5xRoutine } from '../model/types.ts'

/** One structural problem in a diagram. */
export interface DiagramFinding {
  /** Stable rule id, kept in the vocabulary the rest of the checks use. */
  readonly rule: string
  /** A diagram Studio will not accept is critical; a doubtful one is a warning. */
  readonly severity: 'info' | 'warning' | 'critical'
  /** What is wrong, in the reader's terms. */
  readonly message: string
  /** The elements the finding is about. */
  readonly evidence: unknown
  /** How sure the structural check is. */
  readonly confidence: 'high' | 'medium' | 'low'
}

/** Elements whose presence is not a wire and not a reference. */
const NOT_A_WIRE = 'Wire'

/** The tag an output or input reference writes or reads. */
function refTarget(node: L5xDiagramNode): string | undefined {
  const operand = node.operand?.trim()
  return operand === undefined || operand === '' ? undefined : operand
}

/** Ids an element defines, per sheet. */
function idsBySheet(nodes: readonly L5xDiagramNode[]): Map<number, Set<string>> {
  const bySheet = new Map<number, Set<string>>()
  for (const node of nodes) {
    if (node.kind === NOT_A_WIRE || node.id === undefined) continue
    const ids = bySheet.get(node.sheet) ?? new Set<string>()
    ids.add(node.id)
    bySheet.set(node.sheet, ids)
  }
  return bySheet
}

/**
 * A cycle in the wire graph of one sheet.
 *
 * Feedback in a Logix function block diagram is not wired; it goes through a tag.
 * A loop of wires therefore means the diagram cannot be scheduled.
 *
 * @param nodes - The decoded nodes of one routine.
 * @param sheet - The sheet to test.
 * @returns The ids on one cycle, or undefined when the sheet is acyclic.
 */
function wireCycle(nodes: readonly L5xDiagramNode[], sheet: number): readonly string[] | undefined {
  const edges = new Map<string, string[]>()
  for (const node of nodes) {
    if (node.kind !== NOT_A_WIRE || node.sheet !== sheet) continue
    if (node.fromId === undefined || node.toId === undefined) continue
    edges.set(node.fromId, [...edges.get(node.fromId) ?? [], node.toId])
  }
  const state = new Map<string, 'visiting' | 'done'>()
  const path: string[] = []
  const visit = (id: string): readonly string[] | undefined => {
    const seen = state.get(id)
    if (seen === 'visiting') return [...path.slice(path.indexOf(id)), id]
    if (seen === 'done') return undefined
    state.set(id, 'visiting')
    path.push(id)
    for (const next of edges.get(id) ?? []) {
      const cycle = visit(next)
      if (cycle !== undefined) return cycle
    }
    path.pop()
    state.set(id, 'done')
    return undefined
  }
  for (const id of edges.keys()) {
    const cycle = visit(id)
    if (cycle !== undefined) return cycle
  }
  return undefined
}

/**
 * Check one Function Block Diagram routine.
 *
 * @param routine - A routine whose body has already been decoded as `FBD`.
 * @returns One finding per structural problem, in element order.
 */
export function validateDiagram(routine: L5xRoutine): readonly DiagramFinding[] {
  if (routine.body.type !== 'FBD') return []
  const nodes = routine.body.nodes
  const findings: DiagramFinding[] = []
  const report = (rule: string, severity: DiagramFinding['severity'], message: string, evidence: unknown, confidence: DiagramFinding['confidence'] = 'high'): void => {
    findings.push({ rule, severity, message, evidence, confidence })
  }
  const where = (node: L5xDiagramNode): string => `${routine.program}::${routine.name} sheet ${node.sheet} id ${node.id ?? '?'}`
  // A wire has no id of its own, so naming it by the elements it joins is the only way a reader
  // can find it on the sheet; "id ?" was in every wire finding and located nothing.
  const whereWire = (node: L5xDiagramNode): string => `${routine.program}::${routine.name} sheet ${node.sheet} ${node.kind} ${node.fromId ?? '?'} -> ${node.toId ?? '?'}`

  const ids = idsBySheet(nodes)

  // A wire that names an element the sheet does not contain cannot be drawn.
  for (const node of nodes) {
    if (node.kind !== NOT_A_WIRE) continue
    const sheetIds = ids.get(node.sheet) ?? new Set<string>()
    for (const [side, id] of [['FromID', node.fromId], ['ToID', node.toId]] as const) {
      if (id === undefined || sheetIds.has(id)) continue
      report('FBD_DANGLING_WIRE', 'critical',
        `${whereWire(node)}: ${side}="${id}" names no element on that sheet`,
        { program: routine.program, routine: routine.name, sheet: node.sheet, side, id, from_id: node.fromId, to_id: node.toId, elements: sheetIds.size })
    }
  }

  // A wire may only land on a pin the block declares visible. A pin the block does not show is
  // a wiring mistake a reader cannot see from the wire alone, and Studio refuses the export.
  const blockPins = new Map<string, { pins: Set<string>; id: string; sheet: number }>()
  for (const node of nodes) {
    if (node.kind !== 'Block' || node.id === undefined || node.pins === undefined) continue
    blockPins.set(`${node.sheet}::${node.id}`, { pins: new Set(node.pins.split(/\s+/u).filter(Boolean)), id: node.id, sheet: node.sheet })
  }
  for (const node of nodes) {
    if (node.kind !== NOT_A_WIRE) continue
    for (const [side, id, pin] of [['FromID', node.fromId, node.fromParam], ['ToID', node.toId, node.toParam]] as const) {
      if (id === undefined || pin === undefined) continue
      const block = blockPins.get(`${node.sheet}::${id}`)
      if (block === undefined || block.pins.has(pin)) continue
      report('FBD_WIRE_PIN_NOT_VISIBLE', 'warning',
        `${whereWire(node)}: ${side} pin "${pin}" is not a visible pin of block ${id} (${[...block.pins].join(', ')})`,
        { program: routine.program, routine: routine.name, sheet: node.sheet, side, block: id, pin, visible_pins: [...block.pins], from_id: node.fromId, to_id: node.toId })
    }
  }

  // A reference with no operand reads or writes nothing.
  for (const node of nodes) {
    if (node.kind !== 'IRef' && node.kind !== 'ORef') continue
    if (refTarget(node) !== undefined) continue
    report(node.kind === 'IRef' ? 'IREF_TAG_NOT_PROVIDED' : 'OREF_TAG_NOT_PROVIDED', 'warning',
      `${where(node)}: ${node.kind} has no Operand`,
      { program: routine.program, routine: routine.name, sheet: node.sheet, id: node.id })
  }

  // Two output references writing one tag on a sheet is a double driver.
  const written = new Map<string, string[]>()
  for (const node of nodes) {
    if (node.kind !== 'ORef') continue
    const target = refTarget(node)
    if (target === undefined) continue
    const key = `${node.sheet}::${target.toLowerCase()}`
    written.set(key, [...written.get(key) ?? [], node.id ?? '?'])
  }
  for (const [key, elementIds] of written) {
    if (elementIds.length < 2) continue
    const [sheet, tag] = key.split('::')
    report('OREF_DUPLICATE_DESTINATION', 'warning',
      `${routine.program}::${routine.name} sheet ${sheet} writes ${tag} from ${elementIds.length} output references`,
      { program: routine.program, routine: routine.name, sheet: Number(sheet), tag, ids: elementIds, basis: 'one-driver-per-output' })
  }

  // Connectors pair an input in one place with an output in another, by name.
  const conductors = nodes.filter(node => node.kind === 'ICon' || node.kind === 'OCon')
  const oconNames = new Map<string, string[]>()
  for (const node of conductors) {
    if (node.kind !== 'OCon') continue
    const name = node.name?.trim()
    if (name !== undefined && name !== '') oconNames.set(name.toLowerCase(), [...oconNames.get(name.toLowerCase()) ?? [], node.id ?? '?'])
  }
  for (const node of conductors) {
    const name = node.name?.trim()
    if (name === undefined || name === '') {
      report(node.kind === 'ICon' ? 'ICON_NAME_NOT_PROVIDED' : 'OCON_NAME_NOT_PROVIDED', 'warning',
        `${where(node)}: ${node.kind} has no Name`, { program: routine.program, routine: routine.name, sheet: node.sheet, id: node.id })
      continue
    }
    // An input connector needs an output connector of the same name, and vice versa.
    if (node.kind === 'ICon' && !oconNames.has(name.toLowerCase())) {
      report('ICON_NO_MATCHING_OCON', 'warning',
        `${where(node)}: input connector "${name}" has no output connector of that name in ${routine.program}::${routine.name}`,
        { program: routine.program, routine: routine.name, sheet: node.sheet, id: node.id, name })
    }
    // And a connector with no wire on its working side carries nothing.
    const wired = nodes.some(edge => edge.kind === NOT_A_WIRE && (node.kind === 'OCon' ? edge.toId === node.id : edge.fromId === node.id))
    if (!wired) {
      report(node.kind === 'OCon' ? 'OCON_NO_INBOUND_WIRE' : 'ICON_NO_OUTBOUND_WIRE', 'info',
        `${where(node)}: ${node.kind} "${name}" has no wire connected`,
        { program: routine.program, routine: routine.name, sheet: node.sheet, id: node.id, name })
    }
  }
  for (const [name, elementIds] of oconNames) {
    if (elementIds.length < 2) continue
    report('OCON_DUPLICATE_NAME', 'warning',
      `${routine.program}::${routine.name} declares ${elementIds.length} output connectors named "${name}"`,
      { program: routine.program, routine: routine.name, name, ids: elementIds })
  }

  // One reporting per sheet: a large diagram with a loop would otherwise drown the rest.
  const sheets = [...new Set(nodes.map(node => node.sheet))].sort((left, right) => left - right)
  for (const sheet of sheets) {
    const cycle = wireCycle(nodes, sheet)
    if (cycle === undefined) continue
    report('FBD_FEEDBACK_CYCLE', 'warning',
      `${routine.program}::${routine.name} sheet ${sheet} has a wire loop: ${cycle.join(' -> ')}`,
      { program: routine.program, routine: routine.name, sheet, cycle, basis: 'feedback goes through a tag, not a wire' })
  }

  return findings
}

/**
 * Check one Sequential Function Chart routine.
 *
 * A chart is a step/transition graph plus links; the export never states reachability, so this
 * checks only what it records: link targets, and the initial-step markers a chart needs to start.
 *
 * @param routine - A routine whose body has already been decoded as `SFC`.
 * @returns One finding per structural problem, in element order.
 */
export function validateSfcDiagram(routine: L5xRoutine): readonly DiagramFinding[] {
  if (routine.body.type !== 'SFC') return []
  const nodes = routine.body.nodes
  const findings: DiagramFinding[] = []
  const report = (rule: string, severity: DiagramFinding['severity'], message: string, evidence: unknown, confidence: DiagramFinding['confidence'] = 'high'): void => {
    findings.push({ rule, severity, message, evidence, confidence })
  }
  const where = (node: L5xDiagramNode): string => `${routine.program}::${routine.name} sheet ${node.sheet} id ${node.id ?? '?'}`
  // A directed link carries no id either: name it by the elements it joins.
  const whereLink = (node: L5xDiagramNode): string => `${routine.program}::${routine.name} sheet ${node.sheet} ${node.kind} ${node.fromId ?? '?'} -> ${node.toId ?? '?'}`
  // A chart's links may reach a step drawn on another sheet, so a target resolves anywhere in the
  // routine; resolving per sheet would report a valid cross-sheet link as critical.
  const chartIds = new Set(nodes.flatMap(node => node.id === undefined ? [] : [node.id]))

  // A link that names an element the chart does not contain cannot be followed.
  for (const node of nodes) {
    if (node.kind !== 'DirectedLink') continue
    for (const [side, id] of [['FromID', node.fromId], ['ToID', node.toId]] as const) {
      if (id === undefined || chartIds.has(id)) continue
      report('SFC_LINK_TARGET_MISSING', 'critical',
        `${whereLink(node)}: ${side}="${id}" names no step or transition in this chart`,
        { program: routine.program, routine: routine.name, sheet: node.sheet, side, id, from_id: node.fromId, to_id: node.toId, elements: chartIds.size })
    }
  }

  // A chart starts at exactly one initial step.
  const steps = nodes.filter(node => node.kind === 'Step')
  if (steps.length > 0) {
    const initial = steps.filter(step => step.initialStep === 'true' || step.initialStep === '1')
    if (initial.length === 0) {
      report('SFC_NO_INITIAL_STEP', 'warning',
        `${routine.program}::${routine.name} declares ${steps.length} step(s) but no initial step`,
        { program: routine.program, routine: routine.name, steps: steps.map(step => step.id ?? '?') })
    } else if (initial.length > 1) {
      report('SFC_MULTIPLE_INITIAL_STEPS', 'warning',
        `${routine.program}::${routine.name} declares ${initial.length} initial steps; one chart starts at one step`,
        { program: routine.program, routine: routine.name, steps: initial.map(step => step.id ?? '?') })
    }
  }

  return findings
}
