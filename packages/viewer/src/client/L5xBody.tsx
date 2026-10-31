/** Offline Logix project browser: navigation, rung evidence, and context actions. */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentPreviewProps } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { exportedDatum, findReferences, ladderSegments, parseProject, type ExportedDatum, type LadderSegment, type Module, type Program, type Project, type Routine, type Rung, type Tag, timerState, type TimerState } from './model.ts'
import { instructionPins } from './instructions.ts'
import { inspectProject } from './inspection.ts'
import type { L5xPreviewKey } from './locales.ts'
import css from './L5xBody.module.css'

export interface L5xBodyInjected {
  readonly read: (address: string, signal: AbortSignal) => Promise<{ readonly xml: string; readonly version: string }>
  readonly ask: (address: string, context: string) => boolean
}
export type L5xBodyProps = Pick<DocumentPreviewProps, 'resourceAddress' | 'content' | 'scrollportRef'> & PropsLocale<'sidebarL5x'> & L5xBodyInjected
type Loaded = { readonly revision: number; readonly project: Project; readonly version: string }
type Choice = { readonly program: string; readonly routine: string }
type FocusedInstruction = {
  readonly id: string
  readonly rung: string
  readonly mnemonic: string
  readonly operands: string
  readonly symbol?: string
}
/** The organiser row a context menu was opened on, when it was not the ladder. */
type ContextTarget =
  | { readonly kind: 'routine'; readonly program: string; readonly routine: string }
  | { readonly kind: 'program'; readonly program: string }
  | { readonly kind: 'module'; readonly module: string }
type ContextItem = {
  readonly x: number
  readonly y: number
  readonly text: string
  readonly symbol?: string
  readonly instruction?: FocusedInstruction
  /** Set when the menu was opened on the rung itself, not on one of its parts. */
  readonly rung?: number
  /** Set when the menu was opened on an organiser row rather than on the ladder. */
  readonly target?: ContextTarget
}
type Inspector = { readonly kind: 'tag'; readonly tag: Tag } | { readonly kind: 'module'; readonly module: Module } | undefined
type BottomPane = 'diagnostics' | 'search' | 'watch'
type TagView = 'controller' | 'program'

function operandParts(operands: string): string[] {
  const parts: string[] = []
  let start = 0
  let depth = 0
  for (let index = 0; index < operands.length; index++) {
    if ('([{'.includes(operands[index] ?? '')) depth++
    if (')]}'.includes(operands[index] ?? '')) depth--
    if (operands[index] === ',' && depth === 0) { parts.push(operands.slice(start, index).trim()); start = index + 1 }
  }
  parts.push(operands.slice(start).trim())
  return parts
}
function displayOperands(mnemonic: string, operands: string): string[] {
  const parts = operandParts(operands)
  return mnemonic.toUpperCase() === 'JSR' && parts[1] === '0' ? [parts[0] ?? ''] : parts
}

const operandKeys: Record<string, readonly L5xPreviewKey[]> = {
  MOV: ['operand.source', 'operand.destination'], MOVE: ['operand.source', 'operand.destination'], COP: ['operand.source', 'operand.destination', 'operand.length'], CPS: ['operand.source', 'operand.destination', 'operand.length'],
  TON: ['operand.timer', 'operand.preset', 'operand.accum'], TOF: ['operand.timer', 'operand.preset', 'operand.accum'], RTO: ['operand.timer', 'operand.preset', 'operand.accum'], RES: ['operand.timer'],
  ADD: ['operand.a', 'operand.b', 'operand.destination'], SUB: ['operand.a', 'operand.b', 'operand.destination'], MUL: ['operand.a', 'operand.b', 'operand.destination'], DIV: ['operand.a', 'operand.b', 'operand.destination'],
  EQU: ['operand.sourceA', 'operand.sourceB'], EQ: ['operand.sourceA', 'operand.sourceB'], NEQ: ['operand.sourceA', 'operand.sourceB'], NE: ['operand.sourceA', 'operand.sourceB'],
  GRT: ['operand.sourceA', 'operand.sourceB'], GT: ['operand.sourceA', 'operand.sourceB'], LES: ['operand.sourceA', 'operand.sourceB'], LT: ['operand.sourceA', 'operand.sourceB'],
  GEQ: ['operand.sourceA', 'operand.sourceB'], GE: ['operand.sourceA', 'operand.sourceB'], LEQ: ['operand.sourceA', 'operand.sourceB'], LE: ['operand.sourceA', 'operand.sourceB'],
  JSR: ['operand.routine', 'operand.parameter'],
  /* Migrated PLC-5 and SLC instructions, which is where a bare index reads worst. */
  FLL: ['operand.source', 'operand.destination', 'operand.length'], FIL: ['operand.source', 'operand.destination', 'operand.control', 'operand.length', 'operand.position'],
  OSR: ['operand.storage'], OSF: ['operand.storage'], CTU: ['operand.counter', 'operand.preset', 'operand.accum'], CTD: ['operand.counter', 'operand.preset', 'operand.accum'],
  CLR: ['operand.destination'], MSG: ['operand.message'],
}
const terminalInstructions = new Set(['OTE', 'OTL', 'OTU', 'JSR', 'MOV', 'MOVE', 'COP', 'CPS', 'CLR', 'FLL', 'FIL', 'RES', 'MSG', 'GSV', 'SSV', 'TON', 'TOF', 'RTO', 'ADD', 'SUB', 'MUL', 'DIV', 'CTU', 'CTD'])

interface OperandDetail { readonly text: string; readonly tag?: Tag; readonly datum?: ExportedDatum }
interface TagIndex { readonly controller: ReadonlyMap<string, Tag>; readonly program: ReadonlyMap<string, Tag> }
function operandDetail(project: Project, tags: TagIndex, expression: string): OperandDetail {
  const text = expression.trim()
  const root = /^[A-Za-z_][\w:]*/u.exec(text)?.[0]?.toLowerCase()
  const tag = root === undefined ? undefined : tags.program.get(root) ?? tags.controller.get(root)
  const datum = tag === undefined ? undefined : exportedDatum(project, tag.scope, text)
    ?? (tag.alias !== '' ? exportedDatum(project, tag.scope, tag.alias + text.slice(tag.name.length)) : undefined)
  return { text, ...(tag === undefined ? {} : { tag }), ...(datum === undefined ? {} : { datum }) }
}
function instructionSymbols(mnemonic: string, operands: string): string[] {
  if (mnemonic.toUpperCase() === 'JSR') return []
  return operandParts(operands).filter(part => /^[A-Za-z_][\w:]*/u.test(part))
}

export function L5xBody(props: L5xBodyProps): ReactNode {
  const { resourceAddress, content, t, read, ask, scrollportRef } = props
  const request = content.kind === 'renderer' ? content : undefined
  const [loaded, setLoaded] = useState<Loaded>()
  const [failure, setFailure] = useState<string>()
  const [choice, setChoice] = useState<Choice | null>()
  const [query, setQuery] = useState('')
  const [showReferences, setShowReferences] = useState(false)
  const [context, setContext] = useState<ContextItem>()
  const [chatUnavailable, setChatUnavailable] = useState(false)
  const [organizerQuery, setOrganizerQuery] = useState('')
  const [tabs, setTabs] = useState<Choice[]>([])
  const [inspector, setInspector] = useState<Inspector>()
  const [bottomPane, setBottomPane] = useState<BottomPane>('search')
  const [watch, setWatch] = useState<string[]>([])
  const [rungLimit, setRungLimit] = useState(80)
  const [showSource, setShowSource] = useState(false)
  const [tagView, setTagView] = useState<TagView>()
  const [tagFilter, setTagFilter] = useState('')
  const [targetRung, setTargetRung] = useState<string>()
  const [focused, setFocused] = useState<FocusedInstruction>()
  const [focusedRung, setFocusedRung] = useState<string>()
  const isAcd = resourceAddress.toLocaleLowerCase().endsWith('.acd')
  useEffect(() => {
    if (request === undefined || isAcd) return
    const controller = new AbortController()
    setLoaded(undefined)
    setFailure(undefined)
    setChoice(undefined)
    setTabs([])
    setInspector(undefined)
    setTagView(undefined)
    setFocused(undefined)
    setFocusedRung(undefined)
    void read(resourceAddress, controller.signal).then(({ xml, version }) => {
      if (controller.signal.aborted) return
      const project = parseProject(xml)
      setLoaded({ revision: request.revision, project, version })
      request.loaded(version)
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setFailure(error instanceof Error ? error.message : t('invalid'))
      request.failed()
    })
    return () => { controller.abort() }
  }, [request?.revision, resourceAddress, read, isAcd])
  useEffect(() => {
    if (context === undefined) return
    const close = () => { setContext(undefined) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [context])
  const project = loaded !== undefined && loaded.revision === request?.revision ? loaded.project : undefined
  const firstProgram = project?.programs[0]
  const firstRoutine = firstProgram?.routines.find(routine => routine.name === firstProgram.main) ?? firstProgram?.routines[0]
  const current = choice === null ? undefined : choice ?? (firstProgram !== undefined && firstRoutine !== undefined
    ? { program: firstProgram.name, routine: firstRoutine.name } : undefined)
  const selected = project?.programs.find(program => program.name === current?.program)
    ?.routines.find(routine => routine.name === current?.routine)
  const selectedProgram = project?.programs.find(program => program.name === current?.program)
  const tagIndex = useMemo<TagIndex>(() => ({
    controller: new Map(project?.tags.map(tag => [tag.name.toLowerCase(), tag]) ?? []),
    program: new Map(selectedProgram?.tags.map(tag => [tag.name.toLowerCase(), tag]) ?? []),
  }), [project, selectedProgram])
  useEffect(() => {
    if (targetRung === undefined) return
    const frame = requestAnimationFrame(() => {
      Array.from(document.querySelectorAll<HTMLElement>('[data-l5x-project-view] [data-rung]'))
        .find(element => element.dataset.rung === targetRung)?.scrollIntoView({ block: 'center' })
      setTargetRung(undefined)
    })
    return () => { cancelAnimationFrame(frame) }
  }, [targetRung, current?.program, current?.routine, rungLimit])
  const detailFor = (value: string): OperandDetail | undefined => project === undefined
    ? undefined : operandDetail(project, tagIndex, value)
  const describeOperand = (value: string): string => detailFor(value)?.tag?.description ?? ''
  /** Pins of an AOI call, read from the definition the export carries, so its own parameter names label the block. */
  const pinsFor = (mnemonic: string): readonly string[] | undefined => project?.aoiPins.get(mnemonic) ?? project?.aoiPins.get(mnemonic.toUpperCase())
  const resolveTimer = (value: string): TimerState | undefined => project === undefined
    ? undefined : timerState(project, selectedProgram?.name ?? 'controller', value)
  const focusedOperands = focused === undefined ? [] : displayOperands(focused.mnemonic, focused.operands)
    .map(operand => detailFor(operand)).filter((item): item is OperandDetail => item !== undefined)
  const references = useMemo(() => project === undefined ? [] : findReferences(project, query), [project, query])
  const findings = useMemo(() => project === undefined ? [] : inspectProject(project), [project])
  const scheduled = useMemo(() => new Set(project?.tasks.flatMap(task => task.programs.map(name => name.toLowerCase())) ?? []), [project])
  const visibleTabs = tabs.length > 0 ? tabs : current === undefined ? [] : [current]
  const select = (program: Program, routine: Routine) => {
    const next = { program: program.name, routine: routine.name }
    setChoice(next)
    setTagView(undefined)
    setTabs((previous) => {
      const opened = previous.length === 0 && current !== undefined ? [current] : previous
      return opened.some(tab => tab.program === next.program && tab.routine === next.routine) ? opened : [...opened, next]
    })
    setInspector(undefined)
    setFocused(undefined)
    setFocusedRung(undefined)
    setRungLimit(80)
    setContext(undefined)
  }
  const find = (symbol: string) => { setQuery(symbol); setShowReferences(true); setBottomPane('search'); setContext(undefined) }
  const selectReference = (programName: string, routineName: string, location: string) => {
    const program = project?.programs.find(item => item.name === programName)
    const routine = program?.routines.find(item => item.name === routineName)
    if (program !== undefined && routine !== undefined) {
      select(program, routine)
      const rungNumber = /^Rung (.+)$/u.exec(location)?.[1]
      if (rungNumber !== undefined) {
        const index = routine.rungs.findIndex(rung => rung.number === rungNumber)
        if (index >= 80) setRungLimit(Math.ceil((index + 1) / 80) * 80)
        setTargetRung(rungNumber)
      }
    }
  }
  const closeTab = (tab: Choice) => {
    const remaining = visibleTabs.filter(item => item.program !== tab.program || item.routine !== tab.routine)
    setTabs(remaining)
    if (current?.program === tab.program && current.routine === tab.routine) {
      setChoice(remaining.at(-1) ?? null)
      setFocused(undefined)
      setFocusedRung(undefined)
    }
  }
  const addWatch = (symbol: string) => {
    const name = symbol.trim()
    if (name !== '') setWatch(previous => previous.includes(name) ? previous : [...previous, name])
    setBottomPane('watch')
    setContext(undefined)
  }
  const openTags = (scope: TagView, symbol = '') => {
    setTagView(scope)
    setTagFilter(symbol)
    setInspector(undefined)
    setFocused(undefined)
    setFocusedRung(undefined)
  }
  const focusInstruction = (instruction: FocusedInstruction) => {
    setFocused(instruction)
    setFocusedRung(instruction.rung)
    setInspector(undefined)
  }
  const focusRung = (number: string) => {
    setFocused(undefined)
    setFocusedRung(number)
    setInspector(undefined)
  }
  const contextFor = (event: React.MouseEvent, text: string, symbol?: string, instruction?: FocusedInstruction, rung?: number, target?: ContextTarget): void => {
    event.preventDefault()
    if (instruction !== undefined) setFocused(instruction)
    setContext({ x: event.clientX, y: event.clientY, text,
      ...(symbol === undefined ? {} : { symbol }),
      ...(instruction === undefined ? {} : { instruction }),
      ...(rung === undefined ? {} : { rung }),
      ...(target === undefined ? {} : { target }) })
  }
  /**
   * Every symbol a rung mentions, in rung order. A rung's own text is the only
   * source that stays correct when the export's tag table is incomplete, so this
   * reads the same segments the ladder draws rather than the tag index.
   */
  const rungSymbols = (number: number): string[] => {
    const rung = selected?.rungs.find(item => item.number === number)
    if (rung === undefined) return []
    const segments = ladderSegments(rung.text)
    if (segments === null) return []
    const found: string[] = []
    const walk = (list: readonly LadderSegment[]): void => {
      for (const segment of list) {
        if ('paths' in segment) { for (const path of segment.paths) walk(path); continue }
        for (const operand of displayOperands(segment.mnemonic, segment.operands)) {
          const symbol = operand.trim()
          if (symbol === '' || symbol === '?' || /^-?\d/u.test(symbol)) continue
          found.push(symbol)
        }
      }
    }
    walk(segments)
    return [...new Set(found)]
  }
  if (request === undefined) return null
  if (isAcd) return <div className={css.status} role="status">{t('acd')}
    <button type="button" onClick={() => {
      setChatUnavailable(!ask(resourceAddress, 'Check whether the Logix Designer SDK is installed. If available, prepare a new offline L5X export from this ACD for review. Do not overwrite the ACD, connect online, download, or modify controller state.'))
    }}>{t('exportAcd')}</button>
    {chatUnavailable && <p>{t('chatUnavailable')}</p>}
  </div>
  if (failure !== undefined) return <div className={css.status} role="alert">{failure} <button type="button" onClick={request.reload}>{t('retry')}</button></div>
  if (project === undefined) return <div className={css.status} role="status">{t('loading')}</div>
  const filter = organizerQuery.trim().toLowerCase()
  const matches = (name: string): boolean => filter === '' || name.toLowerCase().includes(filter)
  const programMatches = (program: Program): boolean => matches(program.name)
    || program.routines.some(routine => matches(routine.name))
    || program.tags.some(tag => matches(tag.name))
  const orderedRoutines = (program: Program): Routine[] => [...program.routines].sort((left, right) =>
    left.name === program.main ? -1 : right.name === program.main ? 1 : left.name.localeCompare(right.name))
  const treeProgram = (program: Program): ReactNode => <details key={program.name} className={css.nested} open={filter !== '' || program.name === current?.program}>
    <summary title={program.description} onContextMenu={(event) => { contextFor(event, program.name, undefined, undefined, undefined, { kind: 'program', program: program.name }) }}>{program.name}<small>{program.routines.length}</small></summary>
    {(filter === '' || program.tags.some(tag => matches(tag.name))) && <button type="button" className={css.leafButton}
      onClick={() => { setChoice({ program: program.name, routine: program.main || program.routines[0]?.name || '' }); openTags('program', filter) }}>
      {t('programTags')} <small>{program.tags.length}</small>
    </button>}
    {orderedRoutines(program).filter(routine => matches(program.name) || matches(routine.name)).map(routine => <button type="button"
      className={current?.program === program.name && current.routine === routine.name ? css.selected : css.leafButton}
      key={routine.name} onClick={() => { select(program, routine) }} onContextMenu={(event) => { contextFor(event, `${program.name}/${routine.name}`, undefined, undefined, undefined, { kind: 'routine', program: program.name, routine: routine.name }) }}>
      <span className={css.routineIcon}>{routine.type === 'RLL' ? '≡' : routine.type === 'ST' ? '{ }' : '◇'}</span>{routine.name} <small>{routine.type}</small>
    </button>)}
    {program.routines.length === 0 && <span className={css.leaf}>{t('noRoutines')}</span>}
  </details>
  const unscheduled = project.programs.filter(program => !scheduled.has(program.name.toLowerCase()))
  const moduleNames = new Set(project.modules.map(module => module.name.toLowerCase()))
  // A module name is not unique in an export: the same catalog appears under each
  // network, so a React key is the chassis path plus the seat the module sits in.
  const treeModule = (module: Module, ancestors: readonly string[] = [], seat = '0'): ReactNode => {
    const key = `${seat}:${module.name}`
    const descendants = project.modules.filter(childModule => childModule.parent.toLowerCase() === module.name.toLowerCase()
      && !ancestors.includes(childModule.name.toLowerCase()) && childModule.name !== module.name)
    const shown = descendants.filter(childModule => matches(childModule.name) || matches(childModule.catalog) || filter === '')
    if (shown.length === 0) return <button type="button" className={css.leafButton} key={key}
      onClick={() => { setInspector({ kind: 'module', module }) }} title={module.catalog}
      onContextMenu={(event) => { contextFor(event, module.name, undefined, undefined, undefined, { kind: 'module', module: module.name }) }}>{module.name} <small>{module.catalog}</small></button>
    return <details key={key} className={css.nested} open={filter !== '' ? true : undefined}>
      <summary title={module.catalog} onContextMenu={(event) => { contextFor(event, module.name, undefined, undefined, undefined, { kind: 'module', module: module.name }) }}>{module.name}<small>{module.catalog}</small></summary>
      <button type="button" className={css.leafButton} onClick={() => { setInspector({ kind: 'module', module }) }}>{t('inspect')}</button>
      {shown.map((childModule, index) => treeModule(childModule, [...ancestors, module.name.toLowerCase()], `${seat}.${index}`))}
    </details>
  }
  const rootModules = project.modules.filter(module => module.parent === '' || !moduleNames.has(module.parent.toLowerCase()) || module.parent === module.name)
  const selectedRung = selected?.rungs.find(rung => rung.number === focusedRung)
  return <div className={css.root} data-l5x-project-view>
    <div className={css.toolbar}>
      <span className={css.productMark}>{t('productMark')} <b>{t('workspaceMark')}</b></span>
      <strong>{project.name}</strong><span>{project.processor} · {t('revision', { revision: project.revision })}</span>
      <span className={css.offline}>{t('offline')}</span>
      <button type="button" onClick={() => { setChatUnavailable(!ask(resourceAddress, `Review the offline L5X export for ${project.name}. Start with the current routine ${current?.program ?? ''}/${current?.routine ?? ''}. Use the L5X engineering plugin tools and cite the export identity and source locations.`)) }}>{t('ask')}</button>
      <button type="button" onClick={request.reload}>{t('reloadFile')}</button>
    </div>
    <div className={css.sourceBar}><span>{t('offlineSource')}</span><span title={loaded?.version}>{t('sourceVersion')}: {loaded?.version.slice(0, 12) ?? '—'}…</span><span>{t('exportRevision')}: {project.exportRevision || '—'}</span><span>{t('manualImport')}</span></div>
    {chatUnavailable && <div className={css.notice} role="status">{t('chatUnavailable')}</div>}
    <div className={css.layout}>
      <aside className={css.tree} aria-label={t('controller')}>
        <div className={css.treeHeading}>{t('organizer')}<span>{project.name}</span></div>
        <input className={css.organizerSearch} value={organizerQuery}
          onChange={(event) => { setOrganizerQuery(event.target.value) }}
          placeholder={t('organizerSearch')} aria-label={t('organizerSearch')} />
        <div className={css.treeScroll} key={filter}>
          <details open className={css.controllerRoot}><summary>{t('controller')} {project.name}</summary>
            {(filter === '' || project.tags.some(tag => matches(tag.name))) && <button type="button" className={css.leafButton}
              onClick={() => { openTags('controller', filter) }}>{t('tags')} <small>{project.tags.length}</small></button>}
            {filter === '' && <><div className={css.unexportedLeaf} title={t('notExported')}>{t('controllerFault')}</div>
              <div className={css.unexportedLeaf} title={t('notExported')}>{t('powerUp')}</div></>}
            <details open className={css.nested}><summary>{t('tasks')}</summary>
              {project.tasks.filter(task => matches(task.name) || task.programs.some((name) => {
                const program = project.programs.find(item => item.name === name); return program !== undefined && programMatches(program)
              })).map(task => <details key={task.name} className={css.nested} open={filter !== '' || task.programs.includes(current?.program ?? '')}>
                <summary title={`${task.type} · ${task.rate}`}>{task.name}<small>{task.rate ? `${task.rate} ${t('milliseconds')}` : task.type}</small></summary>
                {task.programs.map(name => project.programs.find(program => program.name === name))
                  .filter((program): program is Program => program !== undefined && programMatches(program)).map(treeProgram)}
              </details>)}
              {(filter === '' || unscheduled.some(programMatches)) && <details className={css.nested} open={filter !== '' ? true : undefined}><summary>{t('unscheduled')}</summary>
                {unscheduled.filter(programMatches).map(treeProgram)}
                {unscheduled.length === 0 && <span className={css.leaf}>{t('none')}</span>}
              </details>}
            </details>
            {filter === '' && <><div className={css.unexportedLeaf} title={t('notExported')}>{t('motionGroups')}</div>
              <div className={css.unexportedLeaf} title={t('notExported')}>{t('alarmManager')}</div>
              <div className={css.unexportedLeaf} title={t('notExported')}>{t('assets')}</div>
              <div className={css.unexportedLeaf} title={t('notExported')}>{t('logicalModel')}</div></>}
            <details className={css.nested} open={filter !== '' ? true : undefined}><summary>{t('modules')} ({project.modules.length})</summary>
              {rootModules.filter(module => filter === '' || matches(module.name) || matches(module.catalog)
                || project.modules.some(childModule => childModule.parent === module.name
                  && (matches(childModule.name) || matches(childModule.catalog))))
                .map((module, index) => treeModule(module, [], String(index)))}
            </details>
            <details className={css.nested} open={filter !== '' ? true : undefined}><summary>{t('aois')} ({project.aois.length})</summary>{project.aois.filter(matches).map(name => <div className={css.leaf} key={name}>{name}</div>)}</details>
            <details className={css.nested} open={filter !== '' ? true : undefined}><summary>{t('types')} ({project.types.length})</summary>{project.types.filter(matches).map(name => <div className={css.leaf} key={name}>{name}</div>)}</details>
          </details>
        </div>
      </aside>
      <section className={css.editor}>
        <div className={css.tabStrip}>{tagView !== undefined && <div className={css.activeTab}><button type="button">{tagView === 'controller' ? t('tags') : `${current?.program} / ${t('programTags')}`}</button><button type="button" className={css.closeTab} onClick={() => { setTagView(undefined) }} aria-label={t('closeTab')}>×</button></div>}{visibleTabs.map(tab => <div className={tagView === undefined && tab.program === current?.program && tab.routine === current.routine ? css.activeTab : css.tab} key={`${tab.program}/${tab.routine}`}>
          <button type="button" onClick={() => { setTagView(undefined); setChoice(tab); setInspector(undefined); setFocused(undefined); setFocusedRung(undefined); setRungLimit(80) }}>{tab.program} / {tab.routine}</button>
          <button type="button" className={css.closeTab} onClick={() => { closeTab(tab) }} aria-label={`${t('closeTab')} ${tab.routine}`}>×</button>
        </div>)}</div>
        <div className={css.editorTools}><strong>{tagView === undefined ? `${current?.program} / ${selected?.name ?? t('noSelection')}` : tagView === 'controller' ? t('tags') : `${current?.program} / ${t('programTags')}`}</strong><span>{tagView === undefined ? selected?.type ?? '—' : t('offlineValues')}</span>
          <span className={css.toolSpacer} />
          <button type="button" onClick={() => { setShowSource(value => !value) }} aria-pressed={showSource}>{t('source')}</button>
          <button type="button" onClick={() => { setChatUnavailable(!ask(resourceAddress, `Explain and review the offline routine ${current?.program}/${current?.routine} in the current L5X export. Use the L5X engineering plugin tools for references and checks. Do not change a controller.`)) }}>{t('askRoutine')}</button>
        </div>
        {tagView === undefined && focused !== undefined && <div className={css.focusBar} role="status">
          <span className={css.focusBadge}>{t('focusedInstruction')}</span>
          <strong>{focused.mnemonic}</strong><code>{focused.operands}</code><span>{t('rung')} {focused.rung}</span>
          <span className={css.focusValue}>{focused.symbol !== undefined && <><code>{focused.symbol}</code> · </>}{t('exportedValue')}: {focused.symbol === undefined ? t('noExportedValue') : detailFor(focused.symbol)?.datum?.value ?? t('noExportedValue')}</span>
          <button type="button" disabled={focused.symbol === undefined} onClick={() => { if (focused.symbol !== undefined) find(focused.symbol) }}>{t('references')}</button>
          <button type="button" disabled={focused.symbol === undefined} onClick={() => { if (focused.symbol !== undefined) addWatch(focused.symbol) }}>{t('addWatch')}</button>
          <button type="button" onClick={() => { setFocused(undefined); setFocusedRung(undefined) }} aria-label={t('clearFocus')}>×</button>
        </div>}
        {tagView === undefined && focused === undefined && focusedRung !== undefined && <div className={css.focusBar} role="status">
          <span className={css.focusBadge}>{t('focusedRung')}</span><strong>{t('rung')} {focusedRung}</strong>
          <code>{selectedRung?.comment || selectedRung?.text}</code>
          <button type="button" onClick={() => { void navigator.clipboard.writeText(selectedRung?.text ?? '') }}>{t('copyRung')}</button>
          <button type="button" onClick={() => { setFocusedRung(undefined) }} aria-label={t('clearFocus')}>×</button>
        </div>}
        <main className={css.main} ref={scrollportRef}>
          {tagView !== undefined ? <TagTable tags={tagView === 'controller' ? project.tags : selectedProgram?.tags ?? []}
            filter={tagFilter} setFilter={setTagFilter} onContext={contextFor} onWatch={addWatch} onFind={find}
            getDatum={tag => exportedDatum(project, tag.scope, tag.name)} t={t} />
            : selected === undefined ? <div className={css.status}>{t('noSelection')}</div> : <>
              {selected.description !== '' && <p className={css.description}>{selected.description}</p>}
              {selected.type === 'RLL' && (selected.rungs.length === 0 ? <div className={css.status}>{t('noRungs')}</div> : <>
                {selected.rungs.slice(0, rungLimit).map(rung => <RungView key={rung.number} rung={rung}
                  showSource={showSource} describeOperand={describeOperand} detailFor={detailFor} resolveTimer={resolveTimer} pinsFor={pinsFor}
                  focused={focused} focusedRung={focusedRung}
                  onFocusRung={focusRung}
                  onFocusInstruction={focusInstruction} onContext={contextFor} t={t} />)}
                {selected.rungs.length > rungLimit && <button type="button" className={css.loadMore} onClick={() => { setRungLimit(limit => limit + 80) }}>{t('loadMore')} ({selected.rungs.length - rungLimit})</button>}
              </>)}
              {selected.type === 'ST' && <pre className={css.structured} onContextMenu={(event) => { contextFor(event, selected.code) }}>{selected.code}</pre>}
              {selected.type !== 'RLL' && selected.type !== 'ST' && <div className={css.status}>{t('unsupported')} ({selected.type})</div>}
            </>}
        </main>
      </section>
      <aside className={css.inspector} aria-label={t('inspect')}>
        <div className={css.inspectorHeading}>{t('inspect')}</div>
        {focused !== undefined && tagView === undefined ? <div className={css.propertyList}>
          <strong>{focused.mnemonic}({focused.operands})</strong>
          <span>{current?.program} / {current?.routine} · {t('rung')} {focused.rung}</span>
          <span className={css.inspectorCaution}>{t('exportedValueScope')}</span>
          <div className={css.operandDetails}>{focusedOperands.map((operand, index) => <div key={index}>
            <code>{operand.text}</code>
            <strong>{operand.datum?.value ?? (/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/u.test(operand.text)
              ? operand.text : t('noExportedValue'))}</strong>
            <span>{operand.datum?.type ?? operand.tag?.type ?? t('literal')} · {operand.tag?.scope ?? '—'}</span>
            {operand.tag?.description && <p>{operand.tag.description}</p>}
          </div>)}</div>
          <button type="button" className={css.actionButton} onClick={() => {
            setChatUnavailable(!ask(resourceAddress, `Explain ${focused.mnemonic}(${focused.operands}) at ${current?.program}/${current?.routine} rung ${focused.rung} in this offline L5X. Identify operand scope, cross references, and evidence. Do not assume exported values are live.`))
          }}>{t('askInstruction')}</button>
          {focused.symbol !== undefined && <button type="button" className={css.actionButton} onClick={() => {
            setChatUnavailable(!ask(resourceAddress, `Read the current value of ${focused.symbol} only if the installed read-only live diagnostic tool supports its type and controller path. Report the observed timestamp and limitations. Do not write data, force, download, or change controller mode.`))
          }}>{t('askLiveRead')}</button>}
        </div>
          : focusedRung !== undefined && tagView === undefined ? <div className={css.propertyList}>
            <strong>{t('rung')} {focusedRung}</strong>
            <span>{current?.program} / {current?.routine}</span>
            <p>{selectedRung?.comment || t('noDescription')}</p>
            <code>{selectedRung?.text}</code>
          </div>
            : inspector?.kind === 'tag' ? <div className={css.propertyList}><strong>{inspector.tag.name}</strong>
              <span>{t('type')}: {inspector.tag.type}</span><span>{t('scope')}: {inspector.tag.scope}</span>
              <span>{t('exportedValue')}: {exportedDatum(project, inspector.tag.scope, inspector.tag.name)?.value ?? t('noExportedValue')}</span>
              {inspector.tag.alias !== '' && <span>{t('alias')}: {inspector.tag.alias}</span>}
              <p>{inspector.tag.description || t('noDescription')}</p></div>
              : inspector?.kind === 'module' ? <div className={css.propertyList}><strong>{inspector.module.name}</strong>
                <span>{t('type')}: {inspector.module.catalog}</span><span>{t('parent')}: {inspector.module.parent || '—'}</span>
                <span>{t('slot')}: {inspector.module.slot || '—'}</span><p>{inspector.module.description || t('noDescription')}</p></div>
                : <div className={css.propertyList}><strong>{selected?.name ?? project.name}</strong>
                  <span>{t('type')}: {selected?.type ?? project.processor}</span><span>{t('programs')}: {selectedProgram?.name ?? '—'}</span>
                  {selected?.type === 'RLL' && <span>{t('rungCount')}: {selected.rungs.length}</span>}
                  {selectedProgram !== undefined && <span>{t('mainRoutine')}: {selectedProgram.main || '—'}</span>}
                  <p>{selected?.description || selectedProgram?.description || t('noDescription')}</p></div>}
        <div className={css.inspectorHeading}>{t('aryaActions')}</div>
        <button type="button" className={css.actionButton} onClick={() => { setChatUnavailable(!ask(resourceAddress, `Review ${current?.program}/${current?.routine} in the offline L5X using the engineering plugin. Explain the logic and cite source rungs.`)) }}>{t('explainRoutine')}</button>
        <button type="button" className={css.actionButton} onClick={() => { setChatUnavailable(!ask(resourceAddress, `Propose an offline edit to ${current?.program}/${current?.routine} in this L5X. Show the before/after and validation evidence. Do not connect online or download.`)) }}>{t('askChange')}</button>
        <p className={css.inspectorHelp}>{t('agentEdits')}</p>
      </aside>
    </div>
    <section className={css.bottomPanel}>
      <div className={css.bottomTabs}>
        <button type="button" className={bottomPane === 'search' ? css.bottomActive : ''} onClick={() => { setBottomPane('search') }}>{t('references')} {query !== '' && `(${references.length})`}</button>
        <button type="button" className={bottomPane === 'watch' ? css.bottomActive : ''} onClick={() => { setBottomPane('watch') }}>{t('offlineWatch')} ({watch.length})</button>
        <button type="button" className={bottomPane === 'diagnostics' ? css.bottomActive : ''} onClick={() => { setBottomPane('diagnostics') }}>{t('reviewHints')} ({findings.length})</button>
      </div>
      <div className={css.bottomContent}>
        {bottomPane === 'diagnostics' && <><p className={css.panelNote}>{t('reviewHintScope')}</p>
          {findings.length === 0 ? <p className={css.empty}>{t('noFindings')}</p> : findings.slice(0, 100).map((finding, index) =>
            <div className={css.finding} key={`${finding.code}/${finding.location}/${index}`}>
              <span className={finding.severity === 'warning' ? css.warning : css.info}>{finding.severity}</span><strong>{finding.location}</strong><span>{finding.message}</span><code>{finding.evidence}</code>
            </div>)}
          {findings.length > 100 && <p className={css.empty}>{t('moreFindings')} ({findings.length - 100})</p>}</>}
        {bottomPane === 'search' && <><label className={css.searchLabel}>{t('find')}<input value={query} onChange={(event) => { setQuery(event.target.value); setShowReferences(true) }} placeholder={t('findPlaceholder')} /></label>
          {showReferences && query !== '' && <p className={css.panelNote}>{t('referenceScope')}</p>}
          {showReferences && query !== '' && (references.length === 0 ? <p className={css.empty}>{t('noResults')}</p> : references.slice(0, 200).map((reference, index) =>
            <button type="button" key={`${reference.program}/${reference.routine}/${reference.location}/${index}`} className={css.reference}
              onClick={() => { selectReference(reference.program, reference.routine, reference.location) }}
              onContextMenu={(event) => { contextFor(event, reference.text, query) }}>
              <strong>{reference.program} / {reference.routine}</strong><span>{reference.location}</span><code>{reference.text}</code>
            </button>))}{references.length > 200 && <p className={css.empty}>{t('moreResults')} ({references.length - 200})</p>}</>}
        {bottomPane === 'watch' && <><p className={css.panelNote}>{t('watchScope')}</p>
          {watch.length === 0 ? <p className={css.empty}>{t('watchEmpty')}</p> : <table className={css.watchTable}><thead><tr><th>{t('name')}</th><th>{t('scope')}</th><th>{t('type')}</th><th>{t('exportedValue')}</th><th>{t('context')}</th></tr></thead><tbody>{watch.map((symbol) => {
            const detail = detailFor(symbol)
            return <tr key={symbol}><th>{symbol}</th><td>{detail?.tag?.scope ?? '—'}</td><td>{detail?.datum?.type ?? detail?.tag?.type ?? '—'}</td><td className={css.noValue}>{detail?.datum?.value ?? t('noExportedValue')}</td><td className={css.tagActions}>
              <button type="button" onClick={() => { find(symbol) }}>{t('references')}</button>
              <button type="button" onClick={() => { setChatUnavailable(!ask(resourceAddress, `Read the current value of ${symbol} only if the installed read-only live diagnostic tool supports its type and controller path. Report the observed timestamp and limitations. Do not write data, force, download, or change controller mode.`)) }}>{t('askLiveRead')}</button>
              <button type="button" onClick={() => { setWatch(previous => previous.filter(item => item !== symbol)) }} aria-label={`${t('removeWatch')} ${symbol}`}>×</button></td></tr>
          })}</tbody></table>}</>}
      </div>
    </section>
    {context !== undefined && createPortal(<MenuSurface className={css.menu} role="menu" style={{ left: context.x, top: context.y }} onPointerDown={(event) => { event.stopPropagation() }}>
      {context.target !== undefined && <div className={css.menuHeading}>{context.target.kind === 'routine' ? `${context.target.program}/${context.target.routine}` : context.target.kind === 'program' ? context.target.program : context.target.module}</div>}
      {context.target?.kind === 'routine' && <button type="button" role="menuitem" className={css.menuItem} data-l5x-menu="ask-routine" onClick={() => {
        setChatUnavailable(!ask(resourceAddress, `Explain routine ${context.target?.kind === 'routine' ? context.target.routine : ''} of program ${context.target?.kind === 'routine' ? context.target.program : ''} in this offline L5X export: what it does, what it calls, which tags it reads and writes, and what the export recorded about them. Do not present a saved value as the controller's current state.`))
        setContext(undefined)
      }}>{t('askRoutine')}</button>}
      {context.target?.kind === 'routine' && (current?.program !== context.target.program || current.routine !== context.target.routine) && <button type="button" role="menuitem" className={css.menuItem} onClick={() => {
        const program = project?.programs.find(item => item.name === (context.target?.kind === 'routine' ? context.target.program : ''))
        const routine = program?.routines.find(item => item.name === (context.target?.kind === 'routine' ? context.target.routine : ''))
        if (program !== undefined && routine !== undefined) select(program, routine)
        setContext(undefined)
      }}>{t('openRoutine')}</button>}
      {context.target?.kind === 'program' && <button type="button" role="menuitem" className={css.menuItem} data-l5x-menu="ask-program" onClick={() => {
        setChatUnavailable(!ask(resourceAddress, `Explain program ${context.target?.kind === 'program' ? context.target.program : ''} in this offline L5X export: its routines, the tags it owns, how its scans are scheduled, and what the export recorded. Do not present a saved value as the controller's current state.`))
        setContext(undefined)
      }}>{t('askProgram')}</button>}
      {context.target?.kind === 'module' && <button type="button" role="menuitem" className={css.menuItem} data-l5x-menu="ask-module" onClick={() => {
        setChatUnavailable(!ask(resourceAddress, `Explain the I/O module ${context.target?.kind === 'module' ? context.target.module : ''} in this offline L5X export: its catalog, slot, parent chassis, the controller tags that alias its points, and what the export recorded. Do not connect to the controller.`))
        setContext(undefined)
      }}>{t('askModule')}</button>}
      {context.instruction !== undefined && <div className={css.menuHeading}>{context.instruction.mnemonic} · {t('rung')} {context.instruction.rung}</div>}
      {context.rung !== undefined && context.instruction === undefined && <div className={css.menuHeading}>{t('rung')} {context.rung} · {current?.program}/{current?.routine}</div>}
      {context.rung !== undefined && context.instruction === undefined && <button type="button" role="menuitem" className={css.menuItem} data-l5x-menu="ask-rung" onClick={() => {
        setChatUnavailable(!ask(resourceAddress, `Explain rung ${context.rung} of ${current?.program}/${current?.routine} in this offline L5X export. Its NeutralText is:\n${context.text}\nName every symbol it touches, say which values the export recorded, and do not present a saved value as the controller's current state.`))
        setContext(undefined)
      }}>{t('askRung')}</button>}
      {context.rung !== undefined && context.instruction === undefined && <button type="button" role="menuitem" className={css.menuItem} data-l5x-menu="watch-rung" onClick={() => {
        const symbols = rungSymbols(context.rung ?? -1)
        setWatch(previous => [...previous, ...symbols.filter(symbol => !previous.includes(symbol))])
        setBottomPane('watch')
        setContext(undefined)
      }}>{t('watchRung')}</button>}
      {context.rung !== undefined && context.instruction === undefined && <button type="button" role="menuitem" className={css.menuItem} onClick={() => {
        setShowSource(!showSource)
        setContext(undefined)
      }}>{showSource ? t('hideNeutralText') : t('showNeutralText')}</button>}
      {context.rung !== undefined && context.instruction === undefined && <button type="button" role="menuitem" className={css.menuItem} onClick={() => {
        setChatUnavailable(!ask(resourceAddress, `Propose a new rung comment for rung ${context.rung} of ${current?.program}/${current?.routine} in this L5X export, in the voice the surrounding comments already use. Show the exact before/after text and where it would be written. Do not connect online or download.`))
        setContext(undefined)
      }}>{t('editRungComment')}</button>}
      {context.instruction === undefined && context.rung === undefined && context.target === undefined && <button type="button" role="menuitem" className={css.menuItem} onClick={() => {
        setChatUnavailable(!ask(resourceAddress, `Context: ${context.text}`))
        setContext(undefined)
      }}>{t('ask')}</button>}
      {context.instruction !== undefined && <button type="button" role="menuitem" className={css.menuItem} onClick={() => {
        setChatUnavailable(!ask(resourceAddress, `Explain ${context.text} at ${current?.program}/${current?.routine} rung ${context.instruction?.rung} using the offline L5X engineering tools. Identify symbols, scope, and evidence. Do not assume exported values are live.`))
        setContext(undefined)
      }}>{t('askInstruction')}</button>}
      {context.instruction?.mnemonic.toUpperCase() === 'JSR' && selectedProgram?.routines.some(routine =>
        routine.name === displayOperands('JSR', context.instruction?.operands ?? '')[0]) && <button
        type="button" role="menuitem" className={css.menuItem} onClick={() => {
          const called = selectedProgram.routines.find(routine => routine.name === displayOperands('JSR', context.instruction?.operands ?? '')[0])
          if (called !== undefined) select(selectedProgram, called)
          setContext(undefined)
        }}>{t('openCalledRoutine')}</button>}
      {context.rung === undefined && <button type="button" role="menuitem" className={css.menuItem} onClick={() => { find(context.symbol ?? context.text) }}>{t('references')}</button>}
      {context.symbol !== undefined && <button type="button" role="menuitem" className={css.menuItem}
        onClick={() => { addWatch(context.symbol ?? '') }}>{t('addWatch')}</button>}
      {context.symbol !== undefined && <button type="button" role="menuitem" className={css.menuItem} onClick={() => {
        setChatUnavailable(!ask(resourceAddress, `Read the current value of ${context.symbol} only if the installed read-only live diagnostic tool supports its type and controller path. Report timestamp and limitations; do not write, force, download, or change controller mode.`))
        setContext(undefined)
      }}>{t('askLiveRead')}</button>}
      {context.symbol !== undefined && <button type="button" role="menuitem" className={css.menuItem} onClick={() => {
        void navigator.clipboard.writeText(context.symbol ?? '')
        setContext(undefined)
      }}>{t('copyOperand')}</button>}
      {context.rung === undefined && <button type="button" role="menuitem" className={css.menuItem} onClick={() => { void navigator.clipboard.writeText(context.text); setContext(undefined) }}>{context.instruction === undefined ? t('copy') : t('copyInstruction')}</button>}
      {context.instruction !== undefined && <button type="button" role="menuitem" className={css.menuItem} onClick={() => {
        void navigator.clipboard.writeText(selected?.rungs.find(rung => rung.number === context.instruction?.rung)?.text ?? context.text)
        setContext(undefined)
      }}>{t('copyRung')}</button>}
      {context.rung !== undefined && context.instruction === undefined && <button type="button" role="menuitem" className={css.menuItem} onClick={() => {
        void navigator.clipboard.writeText(context.text)
        setContext(undefined)
      }}>{t('copyRung')}</button>}
      <button type="button" role="menuitem" className={css.menuItem} onClick={() => {
        setChatUnavailable(!ask(resourceAddress, `Propose an offline change for ${context.text}${context.instruction === undefined ? '' : ` at ${current?.program}/${current?.routine} rung ${context.instruction.rung}`} in this L5X export. Show the exact before/after and validation evidence. Do not connect online or download.`))
        setContext(undefined)
      }}>{t('askChange')}</button>
    </MenuSurface>, document.body)}
  </div>
}

function TagTable({ tags, filter, setFilter, onContext, onWatch, onFind, getDatum, t }: {
  readonly tags: readonly Tag[]
  readonly filter: string
  readonly setFilter: (value: string) => void
  readonly onContext: (event: React.MouseEvent, text: string, symbol?: string) => void
  readonly onWatch: (symbol: string) => void
  readonly onFind: (symbol: string) => void
  readonly getDatum: (tag: Tag) => ExportedDatum | undefined
  readonly t: PropsLocale<'sidebarL5x'>['t']
}): ReactNode {
  const needle = filter.trim().toLowerCase()
  const visible = tags.filter(tag => needle === '' || tag.name.toLowerCase().includes(needle) || tag.type.toLowerCase().includes(needle)).slice(0, 250)
  return <div className={css.tagTableView}>
    <div className={css.tagTableToolbar}><label>{t('find')} <input value={filter} onChange={(event) => { setFilter(event.target.value) }} placeholder={t('findTag')} /></label><span>{visible.length} / {tags.length}</span><span>{t('exportedValueScope')}</span></div>
    <table className={css.tagTable}><thead><tr><th>{t('name')}</th><th>{t('exportedValue')}</th><th>{t('type')}</th><th>{t('alias')}</th><th>{t('description')}</th><th>{t('context')}</th></tr></thead>
      <tbody>{visible.map(tag => <tr key={`${tag.scope}/${tag.name}`} onContextMenu={(event) => { onContext(event, tag.name, tag.name) }}>
        <th title={tag.scope}>{tag.name}</th><td className={css.noValue}>{getDatum(tag)?.value ?? t('noExportedValue')}</td><td>{tag.type}</td><td>{tag.alias}</td><td title={tag.description}>{tag.description}</td>
        <td className={css.tagActions}><button type="button" onClick={() => { onWatch(tag.name) }}>{t('addWatch')}</button><button type="button" onClick={() => { onFind(tag.name) }}>{t('references')}</button></td>
      </tr>)}</tbody></table>
    {tags.length > 250 && <p className={css.panelNote}>{t('filterMore')}</p>}
  </div>
}

interface PinRow {
  readonly label: string
  readonly text: string
  readonly value: string
  readonly title: string
  readonly flags?: readonly { readonly label: string; readonly on: boolean }[]
}
const booleanMnemonics = ['XIC', 'XIO', 'OTE', 'OTL', 'OTU']
const timerMnemonics = ['TON', 'TOF', 'RTO']
/**
 * Lay one instruction out the way Studio 5000 lays out a function block: a label,
 * the operand, and the recorded value on the right. A timer preset or accumulator
 * the export stored as `?` is filled from the timer structure the export carries.
 * @param mnemonic - Instruction mnemonic as the export writes it.
 * @param operands - Comma separated operand text.
 * @param detailFor - Operand evidence lookup the caller owns.
 * @param resolveTimer - Timer member lookup the caller owns.
 * @param t - Locale binder for pin labels.
 * @returns One row per operand, in export order.
 */
function pinRows(mnemonic: string, operands: string, detailFor: (value: string) => OperandDetail | undefined,
  resolveTimer: (value: string) => TimerState | undefined,
  pinsFor: (mnemonic: string) => readonly string[] | undefined, t: PropsLocale<'sidebarL5x'>['t']): PinRow[] {
  const upper = mnemonic.toUpperCase()
  // An AOI call answers from its own parameters first: a project may define an AOI named like a built-in.
  const keys: readonly string[] | undefined = pinsFor(upper) ?? operandKeys[upper] ?? instructionPins[upper]
  const parts = displayOperands(mnemonic, operands)
  const timer = timerMnemonics.includes(upper) ? resolveTimer(parts[0] ?? '') : undefined
  const rows = parts.map((operand, index) => {
    const raw = operand.trim()
    const missing = raw === '' || raw === '?'
    const resolved = index === 1 && missing && timer !== undefined ? timer.preset
      : index === 2 && missing && timer !== undefined ? timer.accum : raw
    const key = keys?.[index]
    const datum = resolved === '' || resolved === '?' ? undefined : detailFor(resolved)?.datum
    const literal = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/u.test(resolved)
    return {
      label: key === undefined ? `${t('operand.operand')} ${index + 1}` : key.startsWith('operand.') ? t(key as L5xPreviewKey) : key,
      text: resolved === '' || resolved === '?' ? t('noExportedValue') : resolved,
      value: datum?.value ?? (literal ? resolved : ''),
      title: resolved === '' || resolved === '?'
        ? t('exportedValueScope')
        : datum === undefined ? resolved : `${resolved} · ${t('exportedValue')}: ${datum.value} ${t('exportedValueScope')}`,
    }
  })
  if (timer === undefined) return rows
  const flags = [{ label: 'EN', on: timer.enabled }, { label: 'TT', on: timer.timing }, { label: 'DN', on: timer.done }]
  return rows.map((row, index) => index === 0 ? { ...row, flags } : row)
}
/**
 * Width of an instruction's comment column, in pixels.
 *
 * The same number is `.instructionComment`'s width and `.instruction`'s
 * minimum width in `L5xBody.module.css`: the comment is drawn above the glyph
 * without taking room in the row, so the cell has to be at least as wide as it
 * or two neighbouring comments would overprint each other.
 */
const COMMENT_WIDTH = 140
/**
 * Characters that fit in {@link COMMENT_WIDTH} at the pane's comment size.
 *
 * A wrapping estimate only; it decides the reserved band, and the band is what
 * keeps a comment from reaching the wire above the next row.
 */
const COMMENT_CHARS = 27
/**
 * Break an instruction description into the narrow column Studio 5000 uses above
 * a glyph, so the rung can reserve exactly the height the text needs.
 * @param text - Description text.
 * @param width - Characters per line.
 * @returns Wrapped lines; empty when there is no description.
 */
function commentLines(text: string, width: number): string[] {
  const trimmed = text.trim()
  if (trimmed === '') return []
  const lines: string[] = []
  for (const word of trimmed.split(/\s+/u)) {
    const last = lines.at(-1)
    if (last !== undefined && last.length + 1 + word.length <= width) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  return lines
}
/**
 * Height a rung must reserve above the wire for one instruction description.
 * @param describeOperand - Description lookup the caller owns.
 * @param segment - Instruction to measure.
 * @returns Pixel height between the comment floor and the ceiling of the band.
 */
function commentBand(describeOperand: (value: string) => string, segment: LadderSegment): number {
  const symbol = instructionSymbols(segment.mnemonic, segment.operands)[0]
  const lines = commentLines(describeOperand(symbol ?? segment.operands), COMMENT_CHARS)
  return Math.max(24, Math.min(190, Math.round(lines.length * 12.4 + 10)))
}
/**
 * Tallest comment band across an instruction tree, including nested branches.
 *
 * One band per rung, shared by every row: rows then sit on a uniform pitch and
 * a branch's first row shares the wire of the row it branches from, which is
 * what keeps every glyph in a rung on the wire it belongs to.
 *
 * @param segments - Segments of one path.
 * @param describeOperand - Description lookup the caller owns.
 * @returns The band height every path of this rung shares.
 */
function rungBand(segments: readonly LadderSegment[], describeOperand: (value: string) => string): number {
  return segments.reduce((tallest, segment) => 'paths' in segment
    ? segment.paths.reduce((inner, branch) => Math.max(inner, rungBand(branch, describeOperand)), tallest)
    : Math.max(tallest, commentBand(describeOperand, segment)), 24)
}

function RungView({ rung, showSource, describeOperand, detailFor, resolveTimer, pinsFor, focused, focusedRung, onFocusRung, onFocusInstruction, onContext, t }: {
  readonly rung: Rung
  readonly showSource: boolean
  readonly describeOperand: (value: string) => string
  readonly detailFor: (value: string) => OperandDetail | undefined
  readonly resolveTimer: (value: string) => TimerState | undefined
  readonly pinsFor: (mnemonic: string) => readonly string[] | undefined
  readonly focused: FocusedInstruction | undefined
  readonly focusedRung: string | undefined
  readonly onFocusRung: (number: string) => void
  readonly onFocusInstruction: (instruction: FocusedInstruction) => void
  readonly onContext: (event: React.MouseEvent, text: string, symbol?: string, instruction?: FocusedInstruction, rung?: number) => void
  readonly t: PropsLocale<'sidebarL5x'>['t']
}): ReactNode {
  const segments = ladderSegments(rung.text)
  const band = segments === null ? 24 : rungBand(segments, describeOperand)
  return <section className={`${css.rung} ${focusedRung === rung.number ? css.focusedRung : ''}`} data-rung={rung.number}
    data-l5x-rung={rung.number} style={{ '--l5x-band': `${band}px` } as CSSProperties}
    onContextMenu={(event) => { onContext(event, rung.text, undefined, undefined, rung.number) }}>
    <button type="button" className={css.rungNumber} aria-pressed={focusedRung === rung.number && focused === undefined}
      aria-label={`${t('focusRung')} ${rung.number}`} onClick={() => { onFocusRung(rung.number) }}
      onContextMenu={(event) => { event.stopPropagation(); onFocusRung(rung.number); onContext(event, rung.text, undefined, undefined, rung.number) }}>{rung.number}</button>
    <div className={css.rungBody}>
      {rung.comment !== '' && <div className={css.comment} data-l5x-rung-comment>{rung.comment}</div>}
      {segments === null ? <code className={css.neutral}>{rung.text}</code> :
        <div className={css.rail}><LadderPath segments={segments} path={rung.number} rung={rung.number}
          depth={0} resolveTimer={resolveTimer} pinsFor={pinsFor}
          describeOperand={describeOperand} detailFor={detailFor} focused={focused}
          onFocusInstruction={onFocusInstruction} onContext={onContext} t={t} /></div>}
      {showSource && <code className={css.source}>{rung.text}</code>}
    </div>
  </section>
}

function LadderPath({ segments, path, rung, depth, describeOperand, detailFor, resolveTimer, pinsFor, focused, onFocusInstruction, onContext, t }: {
  readonly segments: readonly LadderSegment[]
  readonly path: string
  readonly rung: string
  readonly depth: number
  readonly describeOperand: (value: string) => string
  readonly detailFor: (value: string) => OperandDetail | undefined
  readonly resolveTimer: (value: string) => TimerState | undefined
  readonly pinsFor: (mnemonic: string) => readonly string[] | undefined
  readonly focused: FocusedInstruction | undefined
  readonly onFocusInstruction: (instruction: FocusedInstruction) => void
  readonly onContext: (event: React.MouseEvent, text: string, symbol?: string, instruction?: FocusedInstruction, rung?: number) => void
  readonly t: PropsLocale<'sidebarL5x'>['t']
}): ReactNode {
  return <div className={`${css.path} ${depth > 0 ? css.nestedPath : ''}`}>{segments.map((segment, index) => 'paths' in segment
    ? <div className={css.branch} key={`branch-${path}-${index}`}>{segment.paths.map((branchSegments, pathIndex) =>
      <div className={css.branchPath} key={`branch-path-${path}-${index}-${pathIndex}`}>
        <LadderPath segments={branchSegments} path={`${path}/${index}/${pathIndex}`} rung={rung}
          depth={depth + 1} resolveTimer={resolveTimer} pinsFor={pinsFor}
          describeOperand={describeOperand} detailFor={detailFor} focused={focused}
          onFocusInstruction={onFocusInstruction} onContext={onContext} t={t} />
      </div>)}</div>
    : (() => {
      const id = `${path}/${index}`
      const upper = segment.mnemonic.toUpperCase()
      const isBoolean = booleanMnemonics.includes(upper)
      const symbol = instructionSymbols(segment.mnemonic, segment.operands)[0]
      const instruction: FocusedInstruction = { id, rung, mnemonic: segment.mnemonic, operands: segment.operands,
        ...(symbol === undefined ? {} : { symbol }) }
      const detail = symbol === undefined ? undefined : detailFor(symbol)
      const selected = focused?.id === id
      const description = describeOperand(symbol ?? segment.operands)
      const rows = isBoolean ? [] : pinRows(segment.mnemonic, segment.operands, detailFor, resolveTimer, pinsFor, t)
      return <button type="button" data-l5x-instruction data-instruction-id={id} aria-pressed={selected}
        aria-label={`${segment.mnemonic} ${segment.operands}${description === '' ? '' : ` — ${description}`}`}
        className={`${css.instruction} ${isBoolean ? '' : css.functionBlock} ${index === segments.length - 1 && terminalInstructions.has(upper) ? css.outputInstruction : ''} ${selected ? css.focusedInstruction : ''}`} key={id}
        onFocus={() => { onFocusInstruction(instruction) }}
        onClick={() => { onFocusInstruction(instruction) }}
        onKeyDown={(event) => {
          const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
          if (!keys.includes(event.key)) return
          const buttons = Array.from(event.currentTarget.closest('[data-l5x-project-view]')?.querySelectorAll<HTMLButtonElement>('button[data-l5x-instruction]') ?? [])
          const position = buttons.indexOf(event.currentTarget)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
            : Math.max(0, Math.min(buttons.length - 1, position + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1)))
          event.preventDefault()
          buttons[next]?.focus()
        }}
        onContextMenu={(event) => {
          event.stopPropagation()
          event.currentTarget.focus()
          onContext(event, `${segment.mnemonic}(${segment.operands})`, symbol, instruction)
        }}>
        {description !== '' && <span className={css.instructionComment} data-l5x-instruction-comment title={description}>{description}</span>}
        {isBoolean ? <span className={css.glyph} aria-hidden="true">
          <i className={css.wireLead} />
          {upper.startsWith('X') ? <i className={`${css.contact} ${upper === 'XIO' ? css.negated : ''}`} />
            : <i className={css.coil}>{upper === 'OTL' ? t('latchGlyph') : upper === 'OTU' ? t('unlatchGlyph') : ''}</i>}
          <i className={css.wireLead} />
        </span>
          : <span className={css.blockCard} data-l5x-block><strong>{segment.mnemonic}</strong>
            {rows.map((row, rowIndex) => <span key={`${id}-pin-${rowIndex}`} data-l5x-operand-row>
              <small data-l5x-operand-label>{row.label}</small>
              <code data-l5x-operand title={row.title} onClick={(event) => {
                event.stopPropagation()
                event.currentTarget.closest('button')?.focus()
                onFocusInstruction(instruction)
              }} onContextMenu={(event) => {
                event.stopPropagation()
                event.currentTarget.closest('button')?.focus()
                onContext(event, `${segment.mnemonic}(${segment.operands})`, symbol, instruction)
              }}>{row.text}</code>
              <span className={css.pinTail}>
                {row.flags?.map(flag => <i key={`${id}-pin-${rowIndex}-${flag.label}`} className={flag.on ? css.flagOn : css.flagOff}>{flag.label}</i>)}
                {row.value !== '' && <b data-l5x-operand-value title={row.title}><i aria-hidden="true">◀</i>{row.value}</b>}
              </span>
            </span>)}</span>}
        {isBoolean && <span className={css.tagBlock}>
          <code className={css.tagName} data-l5x-tag-name title={detail?.tag?.description ?? segment.operands}>{segment.operands}</code>
          {detail?.tag?.alias ? <span className={css.tagAlias} data-l5x-operand-alias title={t('alias')}>{detail.tag.alias}</span> : null}
          {detail?.datum !== undefined && <span className={css.tagValue} data-l5x-operand-value title={t('exportedValueScope')}><i aria-hidden="true">◀</i>{detail.datum.value}</span>}
        </span>}
        <span className={css.instructionTooltip} role="tooltip"><strong>{segment.mnemonic}({segment.operands})</strong>
          <span>{t('rung')} {rung}</span>
          {detail?.tag !== undefined && <span>{t('scope')}: {detail.tag.scope} · {t('type')}: {detail.datum?.type ?? detail.tag.type}</span>}
          <span>{t('exportedValue')}: {detail?.datum?.value ?? t('noExportedValue')}</span>
          {detail?.tag?.description && <span>{detail.tag.description}</span>}
        </span>
      </button>
    })())}</div>
}
