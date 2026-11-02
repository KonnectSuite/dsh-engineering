/** Small, read-only projection of an L5X export for the project viewer. */
export interface Rung { readonly number: string; readonly comment: string; readonly text: string }
/**
 * One drawn element of a function block diagram or a sequential function chart.
 *
 * The export carries the sheet position of every element, so a diagram can be drawn where Studio puts
 * it. Wire and link elements carry no position of their own: they join two ids and are drawn between
 * the elements those ids name.
 */
export interface DiagramElement {
  /** Export element name: Block, IRef, ORef, ICon, OCon, Wire, Step, Transition or DirectedLink. */
  readonly kind: string
  /** Export id, empty for a wire or a link. */
  readonly id: string
  /** Sheet position as the export writes it. */
  readonly x: number
  readonly y: number
  /** Operand, connector name or transition name. */
  readonly label: string
  /** Visible pins of a block, space separated as the export writes them. */
  readonly pins: string
  /** Structured Text condition of a transition, one line per source line. */
  readonly condition: string
  /** Marks the initial step of a chart. */
  readonly initial: boolean
  /** Wire or link source id. */
  readonly from: string
  /** Wire or link target id. */
  readonly to: string
  /** Pin the wire leaves, when the export names one. */
  readonly fromPin: string
  /** Pin the wire arrives on, when the export names one. */
  readonly toPin: string
}
/** A function block diagram or a chart, as the viewer draws it. */
export interface Diagram {
  readonly language: 'FBD' | 'SFC'
  readonly elements: readonly DiagramElement[]
}
/** Routine logic and comments retained from an L5X export. */
export interface Routine {
  readonly name: string
  readonly type: string
  readonly description: string
  readonly rungs: readonly Rung[]
  readonly code: string
  /** Diagram carried by an FBD or SFC routine; absent for RLL and ST. */
  readonly diagram?: Diagram
}
/** Program routines, tags and configured main routine. */
export interface Program {
  readonly name: string
  readonly main: string
  readonly description: string
  readonly routines: readonly Routine[]
  readonly tags: readonly Tag[]
}
/** Exported tag declaration and scope. */
export interface Tag {
  readonly name: string
  readonly type: string
  readonly scope: string
  readonly description: string
  readonly alias: string
  /** Array dimensions as the export writes them ("10", "4 2"); empty for a scalar. */
  readonly dimensions: string
}
/** One member of a user-defined type, or one parameter of an add-on instruction. */
export interface TypeMember {
  readonly name: string
  readonly type: string
  readonly dimensions: string
  readonly description: string
}
/** An add-on instruction parameter keeps the usage that decides which way its value flows. */
export interface AoiParameter extends TypeMember {
  readonly usage: string
}
/** Exported task scheduling and assigned programs. */
export interface Task {
  readonly name: string
  readonly type: string
  readonly rate: string
  readonly priority: string
  readonly watchdog: string
  readonly programs: readonly string[]
}
/** Exported module identity and rack position. */
export interface Module {
  readonly name: string
  readonly catalog: string
  readonly parent: string
  readonly slot: string
  readonly description: string
}
/** Read-only controller export projection for the project viewer. */
export interface Project {
  readonly name: string
  readonly processor: string
  readonly revision: string
  readonly exportRevision: string
  readonly programs: readonly Program[]
  readonly tasks: readonly Task[]
  readonly tags: readonly Tag[]
  readonly modules: readonly Module[]
  readonly aois: readonly string[]
  /** Pin names of each AOI in declaration order, so a call can label its own pins. */
  readonly aoiPins: ReadonlyMap<string, readonly string[]>
  /** Members of each user-defined type, so the tag organizer can drill into an instance. */
  readonly dataTypes: ReadonlyMap<string, readonly TypeMember[]>
  /** Parameters of each AOI, typed and ordered, keyed by upper-case name. */
  readonly aoiParameters: ReadonlyMap<string, readonly AoiParameter[]>
  readonly types: readonly string[]
  readonly exportedData: ReadonlyMap<string, ExportedDatum>
}
/** A value and datatype actually recorded in the export. */
export interface ExportedDatum { readonly value: string; readonly type: string }
/** One routine location referencing a searched symbol. */
export interface Reference { readonly program: string; readonly routine: string; readonly location: string; readonly text: string }

const children = (parent: Element | null, name: string): Element[] => parent === null ? []
  : Array.from(parent.children).filter(child => child.tagName === name)
const child = (parent: Element | null, name: string): Element | null => children(parent, name)[0] ?? null
const attr = (element: Element | null, name: string): string => element?.getAttribute(name) ?? ''
const content = (element: Element | null): string => element?.textContent.trim() ?? ''
const description = (element: Element): string => content(child(element, 'Description')) || attr(element, 'Description')
const dataKey = (scope: string, symbol: string): string => `${scope.toLowerCase()}::${symbol.toLowerCase()}`

/**
 * Resolve only values actually present in the saved export; no entry implies no value evidence.
 * @param project - Saved controller export projection.
 * @param scope - Controller or program scope containing the symbol.
 * @param symbol - Tag name to look up.
 * @returns The saved value, or undefined when the export contains no matching value.
 */
export function exportedDatum(project: Project, scope: string, symbol: string): ExportedDatum | undefined {
  return project.exportedData.get(dataKey(scope, symbol))
    ?? (scope === 'controller' ? undefined : project.exportedData.get(dataKey('controller', symbol)))
}

/** Timer structure members the export records for one TIMER tag. */
export interface TimerState {
  readonly preset: string
  readonly accum: string
  readonly enabled: boolean
  readonly timing: boolean
  readonly done: boolean
}
/**
 * Read the timer members a saved export carries, so a rung that stores `?` for
 * preset and accumulated time can still show the recorded values.
 * @param project - Saved controller export projection.
 * @param scope - Controller or program scope containing the timer tag.
 * @param symbol - Timer tag name to look up.
 * @returns Recorded timer members, or undefined when the export has no timer data.
 */
export function timerState(project: Project, scope: string, symbol: string): TimerState | undefined {
  const read = (member: string): string | undefined => exportedDatum(project, scope, `${symbol}.${member}`)?.value
  const preset = read('PRE')
  const accum = read('ACC')
  if (preset === undefined && accum === undefined) return undefined
  return { preset: preset ?? '', accum: accum ?? '', enabled: read('EN') === '1', timing: read('TT') === '1', done: read('DN') === '1' }
}

/**
 * Array dimensions as the export writes them. Element declarations carry `Dimension="0"` for a
 * scalar, so a zero is "no dimension" rather than an array of length zero.
 * @param element - Tag, member or parameter element.
 * @returns Dimensions, empty for a scalar.
 */
function dimensionsOf(element: Element): string {
  const written = attr(element, 'Dimensions') || attr(element, 'Dimension')
  return written === '0' ? '' : written
}

/**
 * Elements a diagram draws. An `Action` is drawn with its step and a `Sheet` is only a container.
 */
const DRAWABLE = new Set(['Block', 'IRef', 'ORef', 'ICon', 'OCon', 'Wire', 'Step', 'Transition', 'DirectedLink'])

/**
 * Read the nodes of a function block diagram or a chart, with the positions the export records.
 *
 * An FBD sheet nests its elements in `Sheet`; an SFC chart writes them directly under the content.
 * A wire carries no position, so it is kept as the pair of ids it joins and drawn between them.
 *
 * @param routine - Routine element.
 * @returns The diagram, or undefined for a routine that is neither FBD nor SFC.
 */
function diagramOf(routine: Element): Diagram | undefined {
  const fbd = child(routine, 'FBDContent')
  const sfc = fbd === null ? child(routine, 'SFCContent') : null
  const content = fbd ?? sfc
  if (content === null) return undefined
  const elements: DiagramElement[] = []
  for (const sheet of fbd === null ? [content] : children(content, 'Sheet')) {
    for (const node of Array.from(sheet.children)) {
      const kind = node.tagName
      if (!DRAWABLE.has(kind)) continue
      const condition = kind === 'Transition'
        ? children(child(child(node, 'Condition'), 'STContent'), 'Line').map(line => line.textContent ?? '').join('\n')
        : ''
      const wire = kind === 'Wire' || kind === 'DirectedLink'
      elements.push({
        kind,
        id: attr(node, 'ID'),
        x: Number(attr(node, 'X')) || 0,
        y: Number(attr(node, 'Y')) || 0,
        label: wire ? '' : (attr(node, 'Operand') || attr(node, 'Name')),
        pins: attr(node, 'VisiblePins'),
        condition,
        initial: attr(node, 'InitialStep') === 'true' || attr(node, 'InitialStep') === '1',
        from: attr(node, 'FromID'),
        to: attr(node, 'ToID'),
        fromPin: attr(node, 'FromParam'),
        toPin: attr(node, 'ToParam'),
      })
    }
  }
  return { language: fbd === null ? 'SFC' : 'FBD', elements }
}

/**
 * Parse a controller export without retaining XML nodes or customer source text.
 * @param xml - L5X XML text to parse.
 * @returns Parsed read-only controller export.
 */
export function parseProject(xml: string): Project {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml')
  const error = parsed.getElementsByTagName('parsererror')[0]
  if (error !== undefined) throw new Error(`Invalid XML: ${content(error)}`)
  const root = parsed.documentElement
  if (root.tagName !== 'RSLogix5000Content') throw new Error('This file is not an L5X export.')
  const controller = child(root, 'Controller')
  if (controller === null) throw new Error('The L5X export has no controller.')
  const exportedData = new Map<string, ExportedDatum>()
  const collectValues = (tag: Element, scope: string): void => {
    const decorated = children(tag, 'Data').find(data => attr(data, 'Format') === 'Decorated')
    if (decorated === undefined) return
    const limit = 60_000
    const visit = (node: Element, path: string): void => {
      if (exportedData.size >= limit) return
      const name = attr(node, 'Name')
      const index = attr(node, 'Index')
      const next = name !== '' ? `${path}.${name}` : index !== '' ? `${path}${index}` : path
      const value = node.getAttribute('Value')
      if (value !== null && value.length <= 256) exportedData.set(dataKey(scope, next), {
        value, type: attr(node, 'DataType') || attr(tag, 'DataType'),
      })
      for (const member of Array.from(node.children)) visit(member, next)
    }
    const tagName = attr(tag, 'Name')
    for (const node of Array.from(decorated.children)) visit(node, tagName)
  }
  const tagsOf = (element: Element | null, scope: string): Tag[] => children(child(element, 'Tags'), 'Tag').map((tag) => {
    collectValues(tag, scope)
    return { name: attr(tag, 'Name'), type: attr(tag, 'DataType'), scope,
      description: description(tag), alias: attr(tag, 'AliasFor'), dimensions: dimensionsOf(tag) }
  })
  const programs = children(child(controller, 'Programs'), 'Program').map((program) => {
    const name = attr(program, 'Name')
    const routines = children(child(program, 'Routines'), 'Routine').map((routine) => {
      const diagram = diagramOf(routine)
      return {
        name: attr(routine, 'Name'), type: attr(routine, 'Type'), description: description(routine),
        rungs: children(child(routine, 'RLLContent'), 'Rung').map(rung => ({
          number: attr(rung, 'Number'), comment: content(child(rung, 'Comment')) || attr(rung, 'Comment'),
          text: content(child(rung, 'Text')),
        })),
        code: children(child(routine, 'STContent'), 'Line').map(line => line.textContent).join('\n'),
        ...(diagram === undefined ? {} : { diagram }),
      }
    })
    return { name, main: attr(program, 'MainRoutineName'), description: description(program), routines, tags: tagsOf(program, name) }
  })
  const tasks = children(child(controller, 'Tasks'), 'Task').map(task => ({
    name: attr(task, 'Name'), type: attr(task, 'Type'), rate: attr(task, 'Rate'),
    priority: attr(task, 'Priority'), watchdog: attr(task, 'Watchdog'),
    programs: children(child(task, 'ScheduledPrograms'), 'ScheduledProgram').map(program => attr(program, 'Name')),
  }))
  const modules = children(child(controller, 'Modules'), 'Module').map(module => ({
    name: attr(module, 'Name'), catalog: attr(module, 'CatalogNumber'), parent: attr(module, 'ParentModule'), description: description(module),
    slot: attr(child(module, 'Ports'), 'Address') || attr(child(child(module, 'Ports'), 'Port'), 'Address'),
  }))
  const aoiDefinitions = children(child(controller, 'AddOnInstructionDefinitions'), 'AddOnInstructionDefinition')
  // EnableIn and EnableOut are drawn by the block itself, never as pins, so a call's pins start after them.
  const aoiPins = new Map(aoiDefinitions.map(definition => [attr(definition, 'Name').toUpperCase(),
    children(child(definition, 'Parameters'), 'Parameter').map(parameter => attr(parameter, 'Name'))
      .filter(name => name !== '' && name !== 'EnableIn' && name !== 'EnableOut')]))
  const dataTypes = new Map(children(child(controller, 'DataTypes'), 'DataType').map(type => [attr(type, 'Name'),
    children(child(type, 'Members'), 'Member').map(member => ({
      name: attr(member, 'Name'), type: attr(member, 'DataType'), dimensions: dimensionsOf(member), description: description(member),
    }))]))
  // The same parameters the block draws as pins, but kept with their type and usage so an instance
  // can be drilled into in the tag organizer.
  const aoiParameters = new Map(aoiDefinitions.map(definition => [attr(definition, 'Name').toUpperCase(),
    children(child(definition, 'Parameters'), 'Parameter')
      .filter(parameter => attr(parameter, 'Name') !== 'EnableIn' && attr(parameter, 'Name') !== 'EnableOut')
      .map(parameter => ({
        name: attr(parameter, 'Name'), type: attr(parameter, 'DataType'), dimensions: dimensionsOf(parameter),
        description: description(parameter), usage: attr(parameter, 'Usage'),
      }))]))
  return {
    name: attr(controller, 'Name'), processor: attr(controller, 'ProcessorType'), exportRevision: attr(root, 'SoftwareRevision'),
    revision: [attr(controller, 'MajorRev'), attr(controller, 'MinorRev')].filter(Boolean).join('.'),
    programs, tasks, tags: tagsOf(controller, 'controller'), modules, exportedData, aoiPins, dataTypes, aoiParameters,
    aois: aoiDefinitions.map(aoi => attr(aoi, 'Name')),
    types: children(child(controller, 'DataTypes'), 'DataType').map(type => attr(type, 'Name')),
  }
}

/**
 * Find literal evidence in ladder and Structured Text without claiming execution semantics.
 * @param project - Saved controller export projection.
 * @param query - Symbol text to search for in routines.
 * @returns Matching routine locations.
 */
export function findReferences(project: Project, query: string): Reference[] {
  const needle = query.trim().toLocaleLowerCase()
  if (needle === '') return []
  const hits: Reference[] = []
  for (const program of project.programs) for (const routine of program.routines) {
    if (routine.type === 'RLL') for (const rung of routine.rungs) {
      if (rung.text.toLocaleLowerCase().includes(needle)) hits.push({
        program: program.name, routine: routine.name, location: `Rung ${rung.number}`, text: rung.text,
      })
    }
    if (routine.type === 'ST') routine.code.split('\n').forEach((line, index) => {
      if (line.toLocaleLowerCase().includes(needle)) hits.push({
        program: program.name, routine: routine.name, location: `Line ${index + 1}`, text: line,
      })
    })
  }
  return hits
}

/** One parsed ladder instruction. */
export interface Instruction { readonly mnemonic: string; readonly operands: string }
/** Ordered ladder branches and instructions. */
export type LadderSegment = Instruction | { readonly paths: readonly (readonly LadderSegment[])[] }
/**
 * Decode NeutralText structure for a read-only ladder diagram. Unknown syntax keeps source text visible.
 * @param text - Text to inspect or parse.
 * @returns Parsed ladder segments, or null for unsupported text.
 */
export function ladderSegments(text: string): readonly LadderSegment[] | null {
  const source = text.trim().replace(/;$/, '')
  let cursor = 0
  const skip = (): void => { while (/\s/.test(source[cursor] ?? '')) cursor++ }
  const marker = (): 'BST' | 'NXB' | 'BND' | undefined => {
    skip()
    const value = source.slice(cursor, cursor + 3).toUpperCase()
    return value === 'BST' || value === 'NXB' || value === 'BND' ? value : undefined
  }
  const sequence = (nested: 'bst' | 'bracket' | null): LadderSegment[] | null => {
    const segments: LadderSegment[] = []
    while (cursor < source.length) {
      skip()
      if (cursor >= source.length) break
      const next = marker()
      if (next === 'NXB' || next === 'BND') return nested === 'bst' ? segments : null
      if (source[cursor] === ',' || source[cursor] === ']') return nested === 'bracket' ? segments : null
      if (next === 'BST') {
        cursor += 3
        const paths: LadderSegment[][] = []
        while (true) {
          const path = sequence('bst')
          if (path === null) return null
          paths.push(path)
          const end = marker()
          if (end === undefined) return null
          cursor += 3
          if (end === 'BND') break
          if (end !== 'NXB') return null
        }
        segments.push({ paths })
        continue
      }
      if (source[cursor] === '[') {
        cursor++
        const paths: LadderSegment[][] = []
        while (true) {
          const path = sequence('bracket')
          if (path === null) return null
          paths.push(path)
          skip()
          const separator = source[cursor]
          if (separator !== ',' && separator !== ']') return null
          cursor++
          if (separator === ']') break
        }
        segments.push({ paths })
        continue
      }
      const match = /^[A-Za-z_][\w]*\(/.exec(source.slice(cursor))
      if (match === null) return null
      const mnemonic = match[0].slice(0, -1)
      cursor += match[0].length
      const start = cursor
      let depth = 1
      while (cursor < source.length && depth > 0) {
        if (source[cursor] === '(') depth++
        if (source[cursor] === ')') depth--
        cursor++
      }
      if (depth !== 0) return null
      segments.push({ mnemonic, operands: source.slice(start, cursor - 1) })
    }
    return nested === null ? segments : null
  }
  const result = sequence(null)
  return result !== null && result.length > 0 ? result : null
}
/**
 * Only simple, serial NeutralText is diagrammed; branches keep exact source text.
 * @param text - Text to inspect or parse.
 * @returns Serial instructions, or null when the text includes unsupported branches.
 */
export function serialInstructions(text: string): Instruction[] | null {
  const segments = ladderSegments(text)
  if (segments === null || !segments.every((segment): segment is Instruction => 'mnemonic' in segment)) return null
  return [...segments]
}
