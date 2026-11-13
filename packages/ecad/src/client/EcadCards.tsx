/**
 * The ECAD conversation surfaces: one compact transcript card per ECAD tool
 * call, and the sheet-set chip in the composer dock.
 *
 * The parsing lives in {@link cardOfContent}; these components only lay the
 * parsed model out with theme tokens, so a payload that does not parse still
 * renders (the plain fallback) and never throws inside the transcript.
 *
 * @module dsh-engineering-ecad/client/cards
 */

import { createElement, useEffect, useRef, useState, type ReactElement } from 'react'
import type { Translate } from './EcadBody.tsx'
import {
  cardOfContent,
  sheetSetOf,
  sheetSetVisible,
  type EcadCandidateRow,
  type EcadCardContentBlock,
  type EcadCardError,
  type EcadChecksCard,
  type EcadCrossReferenceCard,
  type EcadFindingRow,
  type EcadGenericCard,
  type EcadOpenCard,
  type EcadRenderCard,
  type EcadScanCard,
  type EcadSheetSet,
  type EcadToolCard,
} from './toolCards.ts'
import css from './EcadCards.module.css'

/** The owner props a keyed tool view receives that this surface reads. */
export interface EcadToolCardProps {
  readonly t: Translate
  /** Wire tool name; the host passes it, and the card title follows it. */
  readonly toolName?: string
  /** `preparing`, `start` or `result`; only a settled result carries data. */
  readonly phase?: 'preparing' | 'start' | 'result'
  /** The stage block; the result stage carries `content` and `isError`. */
  readonly block?: unknown
  /** The shell's file opener, when the composition supplies one. */
  readonly openFile?: (path: string, options?: { readonly line?: number }) => void
}

/** The injected dock reader: one session-addressed sheet-set report. */
export interface EcadSheetDockInjected {
  readonly readSheetSet: (sessionId: string) => Promise<EcadSheetSet | undefined>
}

/** The props the composer dock supplies plus this face's reader. */
export interface EcadSheetDockProps extends Partial<EcadSheetDockInjected> {
  readonly t: Translate
  /** The composer's session snapshot; the dock is session-scoped. */
  readonly session?: { readonly sessionId?: string }
}

/** @returns the stage block as a record, or undefined. */
function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** @returns the content blocks the result stage carries. */
function contentOf(block: unknown): readonly EcadCardContentBlock[] | undefined {
  const content = recordOf(block)?.content
  return Array.isArray(content) ? content as readonly EcadCardContentBlock[] : undefined
}

/** The sheet glyph every card leads with. */
function DrawingIcon(): ReactElement {
  return createElement(
    'svg',
    { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true', focusable: 'false' },
    createElement('path', {
      d: 'M3.5 2h6l3 3v9h-9z',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinejoin: 'round',
    }),
    createElement('path', { d: 'M6 6.5h4M6 8.5h4M6 10.5h2.5', stroke: 'currentColor', strokeWidth: 1, strokeLinecap: 'round' }),
  )
}

/** The badge tone classes, spelled out so the stylesheet pairing check can see them. */
const TONE_CLASS: Readonly<Record<string, string>> = {
  warn: css.badge_warn,
  error: css.badge_error,
  success: css.badge_success,
  business: css.badge_business,
}

/** One small state badge. */
function badge(t: Translate, text: string, tone?: 'warn' | 'error' | 'success' | 'business'): ReactElement {
  const toneClass = tone === undefined ? '' : ` ${TONE_CLASS[tone] ?? ''}`
  return createElement('span', { className: `${css.badge}${toneClass}` }, text)
}

/** One label/value row. */
function field(label: string, value: string, options?: { readonly wide?: boolean; readonly mono?: boolean }): ReactElement {
  const valueClass = options?.mono === true ? ` ${css.fieldValueMono}` : ''
  const classes = options?.wide === true ? `${css.field} ${css.fieldWide}` : css.field
  return createElement(
    'div',
    { className: classes },
    createElement('span', { className: css.fieldLabel }, label),
    createElement('span', { className: `${css.fieldValue}${valueClass}`, title: value }, value),
  )
}

/** The card header: glyph, title, one-line summary and trailing badges. */
function header(title: string, summary: string, badges: readonly ReactElement[]): ReactElement {
  return createElement(
    'div',
    { className: css.header },
    createElement('span', { className: css.icon }, createElement(DrawingIcon, {})),
    createElement(
      'span',
      { className: css.titleWrap },
      createElement('span', { className: css.title }, title),
      summary === '' ? null : createElement('span', { className: css.summary, title: summary }, summary),
    ),
    badges.length === 0 ? null : createElement('span', { className: css.badges }, ...badges),
  )
}

/** A bordered body holding the card's rows and lists. */
function body(children: readonly (ReactElement | null)[]): ReactElement {
  return createElement('div', { className: css.body }, ...children.filter(entry => entry !== null))
}

/** The one action row: open the drawing, or a hint when the shell gave no opener. */
function openAction(t: Translate, path: string | undefined, openFile: EcadToolCardProps['openFile'], written = false): ReactElement | null {
  if (path === undefined) return null
  const label = written ? t('cardOpenWritten') : t('cardOpenDrawing')
  const onOpen = openFile
  if (onOpen === undefined || typeof onOpen !== 'function') {
    return createElement('div', { className: css.actionRow }, createElement('span', { className: css.hint }, t('cardOpenHint', { path })))
  }
  return createElement(
    'div',
    { className: css.actionRow },
    createElement('button', {
      type: 'button',
      className: css.openButton,
      onClick: () => {
        try {
          onOpen(path)
        } catch {
          // The shell's opener is the only route; a refusal leaves the path readable.
        }
      },
    }, label),
  )
}

/** The failure body of a tool that returned its error envelope. */
function errorBlock(error: EcadCardError, t: Translate): ReactElement {
  return createElement(
    'div',
    { className: css.errorBlock, role: 'alert' },
    createElement('div', { className: css.errorHead },
      createElement('span', { className: css.errorCode }, error.code),
      createElement('span', { className: css.errorText }, error.message === '' ? t('cardToolError') : error.message)),
    error.fix === undefined ? null : createElement('div', { className: css.errorFix }, error.fix),
    error.candidates.length === 0
      ? null
      : createElement('ul', { className: css.candidateList }, ...error.candidates.map((candidate, index) => createElement('li', { key: `${index}-${candidate}`, className: css.candidateValue }, candidate))),
  )
}

/** One severity swatch plus its label. */
function severityLabel(t: Translate, severity: EcadFindingRow['severity']): string {
  return severity === 'critical' ? t('cardCritical') : severity === 'warning' ? t('cardWarning') : t('cardInfo')
}

/** The severity swatch classes, spelled out so the stylesheet pairing check can see them. */
const SEVERITY_CLASS: Readonly<Record<EcadFindingRow['severity'], string>> = {
  critical: css.severity_critical,
  warning: css.severity_warning,
  info: css.severity_info,
}

/** The candidate status classes; an `ok` row needs no tone. */
const CANDIDATE_STATUS_CLASS: Readonly<Record<string, string>> = {
  ok: '',
  duplicate: css.status_duplicate,
  'one-sided': css.status_oneSided,
  unresolved: css.status_unresolved,
}

/** @returns the findings card body. */
function checksBody(card: EcadChecksCard, t: Translate): readonly (ReactElement | null)[] {
  return [
    ...card.findings.map((finding, index) => createElement(
      'div',
      { key: `${index}-${finding.rule}-${finding.message}`, className: css.finding },
      createElement('span', { className: `${css.severity} ${SEVERITY_CLASS[finding.severity]}` }, severityLabel(t, finding.severity)),
      createElement('span', { className: css.findingRule }, finding.rule),
      createElement('span', { className: css.findingText, title: finding.message }, finding.message),
      finding.sheet === undefined ? null : createElement('span', { className: css.findingSheet, title: finding.sheet }, finding.sheet),
    )),
    card.total > card.findings.length
      ? createElement('div', { className: css.more }, t('cardMoreFindings', { count: card.total - card.findings.length }))
      : null,
    card.scope === undefined ? null : createElement('div', { className: css.scope }, card.scope),
  ]
}

/** @returns the candidates card body. */
function crossReferenceBody(card: EcadCrossReferenceCard, t: Translate): readonly (ReactElement | null)[] {
  return [
    ...card.rows.map((row: EcadCandidateRow, index) => createElement(
      'div',
      { key: `${index}-${row.kind}-${row.value}`, className: css.candidate },
      createElement('span', { className: css.candidateValue, title: row.value }, row.value),
      createElement('span', { className: css.candidateKind }, row.kind),
      createElement('span', { className: `${css.candidateStatus} ${CANDIDATE_STATUS_CLASS[row.status] ?? ''}` }, row.status),
      createElement('span', { className: css.candidateMeta }, `${t('cardConfidence')} ${Math.round(row.confidence * 100)}%`),
      createElement('span', { className: css.candidateMeta }, t('cardOccurrences', { count: row.occurrences })),
      row.note === undefined ? null : createElement('span', { className: css.candidateNote }, row.note),
    )),
    card.total > card.rows.length
      ? createElement('div', { className: css.more }, t('cardMoreCandidates', { count: card.total - card.rows.length }))
      : null,
  ]
}

/** @returns the rendered open card. */
function openCardView(card: EcadOpenCard, t: Translate, openFile: EcadToolCardProps['openFile']): ReactElement {
  const badges: ReactElement[] = [badge(t, card.format.toUpperCase(), 'business')]
  if (card.converted) badges.push(badge(t, card.dwgWarnings === 0 ? t('cardDwgConverted') : t('cardDwgWarnings', { count: card.dwgWarnings }), card.dwgWarnings === 0 ? 'business' : 'warn'))
  if (card.truncated) badges.push(badge(t, t('cardTruncated'), 'warn'))
  const rows: (ReactElement | null)[] = [
    card.path === undefined ? null : field(t('cardDrawing'), card.path, { wide: true, mono: true }),
    card.entities === undefined ? null : field(t('cardEntities'), String(card.entities)),
    card.layouts === undefined ? null : field(t('cardLayouts'), String(card.layouts)),
    card.unsupported === undefined ? null : field(t('cardUnsupported'), String(card.unsupported)),
    card.approximate === undefined ? null : field(t('cardApproximate'), String(card.approximate)),
    card.titleBlock ? field(t('cardTitleBlock'), t('cardTitleBlockRead')) : null,
    openAction(t, card.path, openFile),
  ]
  return createElement('div', { className: css.card, 'data-ecad-card': 'open', 'data-tool': 'ecad_open' },
    header(t('cardTitleOpen'), card.summary, badges),
    body(rows))
}

/** @returns the rendered scan card. */
function scanCardView(card: EcadScanCard, t: Translate, openFile: EcadToolCardProps['openFile']): ReactElement {
  const badges: ReactElement[] = []
  if (card.truncated) badges.push(badge(t, t('cardTruncated'), 'warn'))
  const formats = t('cardFormats', { dxf: card.formats.dxf, dwg: card.formats.dwg })
  return createElement('div', { className: css.card, 'data-ecad-card': 'scan', 'data-tool': 'ecad_scan' },
    header(t('cardTitleScan'), card.summary, badges),
    body([
      card.indexPath === undefined ? null : field(t('cardIndex'), card.indexPath, { wide: true, mono: true }),
      card.sheets === undefined ? null : field(t('cardSheets'), String(card.sheets)),
      card.sets === undefined ? null : field(t('cardSets'), String(card.sets)),
      field(t('cardFormatsLabel'), formats),
      card.unsupported === undefined ? null : field(t('cardUnsupported'), String(card.unsupported)),
      card.skipped > 0 ? field(t('cardSkipped'), String(card.skipped)) : null,
      card.indexPath === undefined ? null : openAction(t, card.indexPath, openFile),
    ]))
}

/** @returns the rendered checks card. */
function checksCardView(card: EcadChecksCard, t: Translate): ReactElement {
  return createElement('div', { className: css.card, 'data-ecad-card': 'checks', 'data-tool': 'ecad_checks' },
    header(t('cardTitleChecks'), card.summary, [
      badge(t, t('cardCriticalCount', { count: card.critical }), card.critical > 0 ? 'error' : undefined),
      badge(t, t('cardWarningCount', { count: card.warning }), card.warning > 0 ? 'warn' : undefined),
      badge(t, t('cardInfoCount', { count: card.info })),
    ]),
    body(checksBody(card, t)))
  }

/** @returns the rendered cross-reference card. */
function crossReferenceCardView(card: EcadCrossReferenceCard, t: Translate): ReactElement {
  const badges: ReactElement[] = []
  if (card.duplicate > 0) badges.push(badge(t, t('cardDuplicateCount', { count: card.duplicate }), 'warn'))
  if (card.unresolved > 0) badges.push(badge(t, t('cardUnresolvedCount', { count: card.unresolved }), 'warn'))
  if (card.oneSided > 0) badges.push(badge(t, t('cardOneSidedCount', { count: card.oneSided })))
  return createElement('div', { className: css.card, 'data-ecad-card': 'crossReference', 'data-tool': 'ecad_cross_reference' },
    header(t('cardTitleCrossReference'), card.summary, badges),
    body(crossReferenceBody(card, t)))
}

/** @returns the rendered render card. */
function renderCardView(card: EcadRenderCard, t: Translate): ReactElement {
  const size = card.characters === undefined ? undefined : `${Math.max(1, Math.round(card.characters / 1024))} KB`
  return createElement('div', { className: css.card, 'data-ecad-card': 'render', 'data-tool': 'ecad_render' },
    header(t('cardTitleRender'), card.summary, [
      ...(card.truncated ? [badge(t, t('cardTruncated'), 'warn')] : []),
    ]),
    body([
      card.path === undefined ? null : field(t('cardDrawing'), card.path, { wide: true, mono: true }),
      card.layout === undefined ? null : field(t('cardLayout'), card.layout),
      card.svgPath === undefined ? null : field(t('cardSvg'), card.svgPath, { wide: true, mono: true }),
      card.entities === undefined ? null : field(t('cardDrawn'), `${card.supported} / ${card.entities}`),
      size === undefined ? null : field(t('cardSize'), size),
      card.unsupported === undefined ? null : field(t('cardUnsupported'), String(card.unsupported)),
      card.approximate === undefined ? null : field(t('cardApproximate'), String(card.approximate)),
      createElement('div', { className: css.actionRow }, createElement('span', { className: css.hint }, t('cardRenderHint'))),
    ]))
}

/** @returns the rendered generic or fallback card. */
function genericCardView(card: EcadGenericCard, toolName: string, t: Translate): ReactElement {
  const title = toolName === '' ? t('cardTitleTool', { tool: 'ECAD' }) : t('cardTitleTool', { tool: toolName })
  return createElement('div', { className: css.card, 'data-ecad-card': 'generic', 'data-tool': toolName },
    header(title, card.summary, []),
    body([
      card.error === undefined ? null : errorBlock(card.error, t),
      ...card.fields.map((entry, index) => createElement(
        'div',
        { key: `${index}-${entry.name}`, className: css.field },
        createElement('span', { className: css.fieldLabel }, entry.name),
        createElement('span', { className: `${css.fieldValue} ${css.fieldValueMono}`, title: entry.value }, entry.value),
      )),
      card.error === undefined && card.fields.length === 0 && card.text !== ''
        ? createElement('pre', { className: css.fallback }, card.text)
        : null,
    ]))
}

/** Render one parsed card. */
function cardView(card: EcadToolCard, toolName: string, t: Translate, openFile: EcadToolCardProps['openFile']): ReactElement {
  switch (card.kind) {
    case 'open': return openCardView(card, t, openFile)
    case 'scan': return scanCardView(card, t, openFile)
    case 'checks': return checksCardView(card, t)
    case 'crossReference': return crossReferenceCardView(card, t)
    case 'render': return renderCardView(card, t)
    case 'generic': return genericCardView(card, toolName, t)
  }
}

/**
 * One ECAD tool call as its compact transcript card.
 *
 * A call that has not settled renders its title and a running note; a settled
 * result renders the parsed card, or the plain fallback when the payload cannot
 * be read. The card replaces the generic tool row, so it draws its own surface
 * with the host's tokens.
 * @param props - the tool owner props this surface reads, plus the dictionary.
 * @returns the card row.
 */
export function EcadToolCardView({ t, toolName, phase, block, openFile }: EcadToolCardProps): ReactElement {
  const name = toolName ?? ''
  if (phase !== 'result') {
    const title = t(titleKeyOf(name), { tool: name })
    return createElement('div', { className: `${css.card} ${css.cardRunning}`, 'data-ecad-card': 'running', 'data-tool': name },
      header(title, '', []),
      createElement('div', { className: css.runningLabel }, t(phase === 'preparing' ? 'cardPreparing' : 'cardRunning')))
  }
  const card = cardOfContent(name, contentOf(block), recordOf(block)?.isError === true)
  return cardView(card, name, t, openFile)
}

/** @returns the dictionary key for one tool's card title. */
export function titleKeyOf(toolName: string): string {
  switch (toolName) {
    case 'ecad_open': return 'cardTitleOpen'
    case 'ecad_scan': return 'cardTitleScan'
    case 'ecad_checks': return 'cardTitleChecks'
    case 'ecad_cross_reference': return 'cardTitleCrossReference'
    case 'ecad_render': return 'cardTitleRender'
    default: return 'cardTitleTool'
  }
}

/**
 * The composer dock's sheet-set chip: how many drawings the session workspace
 * holds, whether the workspace profile is confirmed, and whether the ECAD row
 * may write. It renders nothing until a report arrives, nothing for a session
 * with no drawing, and nothing when the Remote bridge is absent or the report
 * fails, so it can never block or unbalance the composer.
 * @param props - the composer's session snapshot, the dictionary and the reader.
 * @returns the chip row, or null.
 */
export function EcadSheetDock({ t, session, readSheetSet }: EcadSheetDockProps): ReactElement | null {
  const sessionId = typeof session?.sessionId === 'string' && session.sessionId !== '' ? session.sessionId : undefined
  const [set, setSet] = useState<EcadSheetSet | undefined>(undefined)
  const readerRef = useRef(readSheetSet)
  readerRef.current = readSheetSet
  useEffect(() => {
    setSet(undefined)
    if (sessionId === undefined) return
    const reader = readerRef.current
    if (reader === undefined) return
    let live = true
    void Promise.resolve()
      .then(() => reader(sessionId))
      .then((value) => {
        if (live) setSet(value)
      })
      .catch(() => {
        if (live) setSet(undefined)
      })
    return () => {
      live = false
    }
  }, [sessionId])
  if (!sheetSetVisible(set)) return null
  const chips: ReactElement[] = [
    createElement('span', { key: 'drawings', className: css.dockChipStrong }, t('dockDrawings', { count: set.drawings })),
  ]
  if (set.dwg > 0) chips.push(createElement('span', { key: 'dwg', className: css.dockChip }, t('dockDwg', { count: set.dwg })))
  if (set.profileConfirmed !== undefined) {
    chips.push(createElement('span', { key: 'profile', className: css.dockChip }, set.profileConfirmed ? t('dockProfileConfirmed') : t('dockProfileDefault')))
  }
  if (set.writes !== undefined) {
    chips.push(createElement('span', { key: 'writes', className: css.dockChip }, set.writes ? t('dockWritesOn') : t('dockWritesOff')))
  }
  if (set.truncated) chips.push(createElement('span', { key: 'truncated', className: css.dockChip }, t('cardTruncated')))
  const label = t('dockLabel', { count: set.drawings, dwg: set.dwg })
  return createElement(
    'div',
    { className: css.dockRow, 'data-ecad-dock': 'sheet-set', 'aria-label': label, title: label },
    createElement('span', { className: css.dockIcon, 'aria-hidden': 'true' }, createElement(DrawingIcon, {})),
    ...chips.flatMap((chip, index) => (index === 0 ? [chip] : [createElement('span', { key: `sep-${index}`, className: css.dockSep, 'aria-hidden': 'true' }, '·'), chip])),
  )
}
