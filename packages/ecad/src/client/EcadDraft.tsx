/**
 * The editing chrome of the drawing pane: the view/edit toggle, the edit action
 * row, and the staged-change panel with its placement form and apply outcome.
 *
 * These components render state the body owns; they hold no remote calls and no
 * draft logic of their own, so the body stays the one place that talks to the
 * host and `edits.ts` stays the one place that builds operations.
 *
 * @module dsh-engineering-ecad/client/EcadDraft
 */

import { createElement, type ReactElement } from 'react'
import type { EcadFailure } from './artifacts.ts'
import type { EcadApplyEnvelope } from './artifacts.ts'
import type { EcadDraftCounts, EcadStagedOp } from './edits.ts'
import css from './EcadBody.module.css'

/** The translated string reader the slot hands down. */
export type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string

/** Which surface the pane is presenting. */
export type EcadMode = 'view' | 'edit'

/** The value the placement form is editing. */
export interface EcadPlacementDraft {
  readonly point: readonly [number, number]
  readonly text: string
  readonly height: string
  readonly layer: string
}

/** The one reminder of what an apply produced, until the reader dismisses it. */
export interface EcadApplyOutcome {
  readonly kind: 'applied' | 'failed'
  readonly result?: EcadApplyEnvelope
  /** True when the written sheet is ready to be shown; opening it is the reader's choice. */
  readonly hasWritten?: boolean
  /** True when the written sheet is the one the pane is currently showing. */
  readonly showingWritten?: boolean
  readonly writtenNote?: string
  readonly error?: EcadFailure
}

/** One glyph's geometry. */
interface IconProps {
  readonly size?: number
}

/** Plus, for arming the annotation tool. */
function PlusIcon({ size = 14 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M8 3.5v9M3.5 8h9' }))
}

/** The close glyph, for removing one staged change. */
function DismissIcon({ size = 12 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M4 4l8 8M12 4l-8 8' }))
}

/** The check glyph, for a verified write. */
function CheckIcon({ size = 12 }: IconProps): ReactElement {
  return createElement('svg', { className: css.icon, width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    createElement('path', { d: 'M3.2 8.6 6.4 11.8 12.8 4.6' }))
}

/** Props of {@link EditModeToggle}. */
export interface EditModeToggleProps {
  readonly mode: EcadMode
  readonly onChange: (mode: EcadMode) => void
  readonly t: Translate
}

/**
 * The quiet view/edit switch. Rendered only when the host reports writes on.
 * @param props - current mode and the change handler.
 */
export function EditModeToggle({ mode, onChange, t }: EditModeToggleProps): ReactElement {
  return createElement(
    'div',
    { className: css.modeSwitch, role: 'group', 'aria-label': t('editBarLabel'), 'data-ecad-mode-switch': 'true' },
    createElement('button', {
      type: 'button',
      className: `${css.modeButton}${mode === 'view' ? ` ${css.modeButtonActive}` : ''}`,
      'aria-pressed': mode === 'view',
      onClick: () => {
        onChange('view')
      },
      title: t('viewMode'),
    }, t('viewMode')),
    createElement('button', {
      type: 'button',
      className: `${css.modeButton}${mode === 'edit' ? ` ${css.modeButtonActive}` : ''}`,
      'aria-pressed': mode === 'edit',
      onClick: () => {
        onChange('edit')
      },
      title: t('editModeHint'),
    }, t('editMode'),
    ),
  )
}

/** Props of {@link EditBar}. */
export interface EditBarProps {
  readonly t: Translate
  readonly tool: 'text' | undefined
  readonly onToggleText: () => void
  readonly stagedCount: number
  readonly applying: boolean
  readonly canApply: boolean
  readonly applyDisabledReason: string | undefined
  readonly onApply: () => void
  readonly onClear: () => void
}

/**
 * The edit-only action row under the toolbar: place, review the count, apply.
 * @param props - the tool, the draft summary and the actions.
 */
export function EditBar({ t, tool, onToggleText, stagedCount, applying, canApply, applyDisabledReason, onApply, onClear }: EditBarProps): ReactElement {
  return createElement(
    'div',
    { className: css.editBar, role: 'group', 'aria-label': t('editBarLabel') },
    createElement('div', { className: css.editBarGroup },
      createElement('button', {
        type: 'button',
        className: `${css.button} ${css.primaryButton}${tool === 'text' ? ` ${css.toolArmed}` : ''}`,
        'aria-pressed': tool === 'text',
        title: t('addTextToolHint'),
        onClick: onToggleText,
      }, createElement(PlusIcon, {}), t('addTextTool')),
    ),
    createElement('span', { className: css.editBarMeta },
      stagedCount === 0
        ? t('noDraft')
        : t('stagedCount', { count: stagedCount }),
    ),
    createElement('span', { className: css.toolbarSpacer }),
    createElement('div', { className: css.editBarGroup },
      createElement('button', {
        type: 'button',
        className: css.button,
        disabled: stagedCount === 0 || applying,
        onClick: onClear,
      }, t('clearDraft')),
      createElement('button', {
        type: 'button',
        className: css.applyButton,
        disabled: !canApply || applying,
        title: applyDisabledReason,
        onClick: onApply,
        'data-ecad-apply': 'true',
      },
      createElement('span', { className: css.applyLabelLong }, applying ? t('applying') : t('apply')),
      createElement('span', { className: css.applyLabelShort }, applying ? t('applying') : t('applyShort'))),
    ),
  )
}

/** Props of {@link PlacementForm}. */
export interface PlacementFormProps {
  readonly t: Translate
  readonly value: EcadPlacementDraft
  readonly layers: readonly string[]
  readonly invalidHeight: boolean
  readonly onChange: (field: 'text' | 'height' | 'layer', value: string) => void
  readonly onStage: () => void
  readonly onCancel: () => void
}

/**
 * The compact annotation form opened by a placement click.
 * @param props - the form value, the layer list and the actions.
 */
export function PlacementForm({ t, value, layers, invalidHeight, onChange, onStage, onCancel }: PlacementFormProps): ReactElement {
  return createElement(
    'form',
    {
      className: css.placementForm,
      onSubmit: (event: { preventDefault: () => void }) => {
        event.preventDefault()
        onStage()
      },
      'data-ecad-placement-form': 'true',
    },
    createElement('div', { className: css.panelHeading }, t('pendingPlacement', { point: `${value.point[0]}, ${value.point[1]}` })),
    createElement('label', { className: css.formRow },
      createElement('span', { className: css.formLabel }, t('text')),
      createElement('input', {
        className: css.formInput,
        type: 'text',
        value: value.text,
        placeholder: t('text'),
        'aria-label': t('text'),
        onChange: (event: { target: { value: string } }) => {
          onChange('text', event.target.value)
        },
        autoFocus: true,
        'data-ecad-placement-text': 'true',
      }),
    ),
    createElement('label', { className: css.formRow },
      createElement('span', { className: css.formLabel }, t('height')),
      createElement('input', {
        className: css.formInput,
        type: 'text',
        inputMode: 'decimal',
        value: value.height,
        'aria-label': t('height'),
        'aria-invalid': invalidHeight,
        onChange: (event: { target: { value: string } }) => {
          onChange('height', event.target.value)
        },
        'data-ecad-placement-height': 'true',
      }),
    ),
    createElement('label', { className: css.formRow },
      createElement('span', { className: css.formLabel }, t('layer')),
      createElement('select', {
        className: css.formInput,
        value: value.layer,
        'aria-label': t('layer'),
        onChange: (event: { target: { value: string } }) => {
          onChange('layer', event.target.value)
        },
        'data-ecad-placement-layer': 'true',
      }, layers.map(name => createElement('option', { key: name, value: name }, name))),
    ),
    invalidHeight ? createElement('p', { className: css.formError, role: 'alert' }, t('heightHint')) : null,
    createElement('div', { className: css.formActions },
      createElement('button', { type: 'submit', className: css.applyButton, disabled: value.text.trim() === '' || invalidHeight || value.layer === '' }, t('stagePlacement')),
      createElement('button', { type: 'button', className: css.button, onClick: onCancel }, t('cancel')),
    ),
  )
}

/** Props of {@link ApplyOutcomePanel}. */
export interface ApplyOutcomePanelProps {
  readonly t: Translate
  readonly outcome: EcadApplyOutcome
  readonly onDismiss: () => void
  readonly onOpenWritten: () => void
  readonly onBackToSource: () => void
}

/**
 * What one apply produced: the written path, verification counters and, for a
 * DWG source, the round-trip comparison. A failure prints code/message/fix.
 *
 * The source stays on screen until the reader opens the written drawing: the
 * write itself never swaps the view.
 * @param props - the outcome and its recourses.
 */
export function ApplyOutcomePanel({ t, outcome, onDismiss, onOpenWritten, onBackToSource }: ApplyOutcomePanelProps): ReactElement {
  if (outcome.kind === 'failed') {
    const error = outcome.error
    return createElement(
      'div',
      { className: `${css.applyOutcome} ${css.applyFailed}`, role: 'alert', 'data-ecad-apply-outcome': 'failed' },
      createElement('div', { className: css.panelHeading }, t('applyFailedTitle')),
      error === undefined ? null : createElement('code', { className: css.stateCode }, `${t('errorCode')}: ${error.code}`),
      error === undefined ? null : createElement('p', { className: css.stateBody }, error.message),
      error === undefined ? null : createElement('p', { className: css.stateBody }, `${t('errorFix')}: ${error.fix}`),
      createElement('div', { className: css.draftActions }, createElement('button', { type: 'button', className: css.button, onClick: onDismiss }, t('dismissResult'))),
    )
  }
  const result = outcome.result
  if (result === undefined) return createElement('div', { className: css.applyOutcome }, createElement('div', { className: css.panelHeading }, t('appliedTitle')))
  const verification = result.verification
  const roundTrip = result.dwgRoundTrip
  const changeTotal = Object.values(result.changes ?? {}).reduce((total, count) => total + count, 0)
  const problems = verification?.problems ?? []
  const notes = [...(result.notes ?? []), ...(verification?.notes ?? [])]
  return createElement(
    'div',
    { className: `${css.applyOutcome} ${verification?.ok === true ? css.applyOk : css.applyWarn}`, 'data-ecad-apply-outcome': 'applied' },
    createElement('div', { className: css.panelHeading }, t('appliedTitle')),
    createElement('p', { className: css.outputPath, title: result.outputPath }, t('outputPath'), ': ', createElement('code', {}, result.outputPath)),
    createElement('p', { className: css.applySummary }, t('applyNetSummary', {
      changes: t(changeTotal === 1 ? 'changeOne' : 'changeMany', { count: changeTotal }),
      verified: verification?.ok === true ? t('verified') : t('notVerified'),
    })),
    verification === undefined ? null : createElement(
      'div',
      { className: css.counterGroup, 'aria-label': t('verification') },
      createElement('div', { className: css.counterRow },
        createElement('span', {}, t('verification')),
        createElement('span', { className: css.counterValue }, `${Object.values(verification.applied ?? {}).reduce((total, count) => total + count, 0)} / ${Object.values(verification.expected ?? {}).reduce((total, count) => total + count, 0)}`),
      ),
      ...Object.entries(verification.dropped ?? {}).map(([kind, count]) => createElement('div', { key: `drop-${kind}`, className: css.counterRow },
        createElement('span', {}, `${t('verificationDropped')}: ${kind}`),
        createElement('span', { className: css.counterValue }, String(count)),
      )),
      problems.length === 0 ? null : createElement('div', { className: css.warnBlock, role: 'status' },
        createElement('span', { className: css.warnTitle }, t('verificationProblems')),
        createElement('ul', { className: css.warnList }, problems.map(problem => createElement('li', { key: problem }, problem))),
      ),
      notes.length === 0 ? null : createElement('div', { className: css.noteBlock },
        createElement('span', { className: css.warnTitle }, t('verificationNotes')),
        createElement('ul', { className: css.warnList }, notes.map(note => createElement('li', { key: note }, note))),
      ),
    ),
    roundTrip === undefined ? null : createElement(
      'div',
      { className: `${css.counterGroup} ${roundTrip.ok ? '' : css.warnBlock}`, 'data-ecad-dwg-round-trip': 'true' },
      createElement('div', { className: css.counterRow },
        createElement('span', {}, t('dwgRoundTrip')),
        createElement('span', { className: `${css.counterValue} ${roundTrip.ok ? css.okText : css.warnText}` }, roundTrip.ok ? createElement(CheckIcon, {}) : t('notVerified')),
      ),
      createElement('p', { className: css.applySummary }, roundTrip.ok ? t('roundTripOk') : t('roundTripDiff', { added: roundTrip.added, removed: roundTrip.removed, changed: roundTrip.changed })),
      roundTrip.hardChanges !== undefined && roundTrip.hardChanges > 0
        ? createElement('p', { className: css.applySummary }, t('roundTripHardChanges', { count: roundTrip.hardChanges }))
        : null,
      roundTrip.metadataChanges !== undefined && roundTrip.metadataChanges > 0
        ? createElement('p', { className: css.applySummary }, t('roundTripMetadataChanges', { count: roundTrip.metadataChanges }))
        : null,
      roundTrip.truncated ? createElement('p', { className: css.applySummary }, t('roundTripTruncated')) : null,
      roundTrip.warnings.length === 0 ? null : createElement(
        'details',
        { className: css.warnBlock },
        createElement('summary', {}, t('roundTripWarnings', { count: roundTrip.warnings.length })),
        createElement('ul', { className: css.warnList }, roundTrip.warnings.map(warning => createElement('li', { key: warning }, warning))),
      ),
    ),
    outcome.writtenNote === undefined ? null : createElement('p', { className: css.applySummary }, outcome.writtenNote),
    outcome.hasWritten === true && outcome.showingWritten !== true
      ? createElement('div', { className: css.draftActions }, createElement('button', {
        type: 'button',
        className: css.applyButton,
        onClick: onOpenWritten,
        'data-ecad-open-written': 'true',
      }, t('openWritten')))
      : null,
    outcome.showingWritten === true
      ? createElement('div', { className: css.draftActions }, createElement('button', { type: 'button', className: css.button, onClick: onBackToSource }, t('backToSource')))
      : null,
    createElement('div', { className: css.draftActions }, createElement('button', { type: 'button', className: css.button, onClick: onDismiss }, t('dismissResult'))),
  )
}

/** Props of {@link DraftPanel}. */
export interface DraftPanelProps {
  readonly t: Translate
  readonly staged: readonly EcadStagedOp[]
  readonly counts: EcadDraftCounts
  readonly layoutName: string
  readonly placement: EcadPlacementDraft | undefined
  readonly layers: readonly string[]
  readonly invalidHeight: boolean
  readonly onPlacementChange: (field: 'text' | 'height' | 'layer', value: string) => void
  readonly onStagePlacement: () => void
  readonly onCancelPlacement: () => void
  readonly onRemove: (key: string) => void
  readonly outcome: EcadApplyOutcome | undefined
  readonly onDismissOutcome: () => void
  readonly onOpenWritten: () => void
  readonly onBackToSource: () => void
}

/**
 * The staged-change list and the annotation form, in the side panel.
 * @param props - the draft, the pending placement and the outcome.
 */
export function DraftPanel({ t, staged, counts, layoutName, placement, layers, invalidHeight, onPlacementChange, onStagePlacement, onCancelPlacement, onRemove, outcome, onDismissOutcome, onOpenWritten, onBackToSource }: DraftPanelProps): ReactElement {
  const summarize = (item: EcadStagedOp): string => {
    const op = item.op
    if (op.op === 'addText') return t('stageTextSummary', { text: op.text, point: `${op.p[0]}, ${op.p[1]}` })
    if (op.op === 'move') return t('stageMoveSummary', { id: op.ids[0] ?? '', dx: op.dx, dy: op.dy })
    if (op.op === 'erase') return t('stageEraseSummary', { id: op.ids[0] ?? '' })
    return op.op
  }
  const kindLabel = (kind: EcadStagedOp['op']['op']): string => (kind === 'addText' ? t('opAddText') : kind === 'move' ? t('opMove') : t('opErase'))
  return createElement(
    'section',
    { className: `${css.panelSection} ${css.draftSection}`, 'data-ecad-draft': 'true' },
    createElement('div', { className: css.panelHeading },
      t('stagedOps'),
      createElement('span', { className: css.panelHeadingSpacer }),
      staged.length === 0 ? null : createElement('span', { className: css.tabCount }, t('stagedCount', { count: staged.length })),
    ),
    placement === undefined ? null : createElement(PlacementForm, {
      t,
      value: placement,
      layers,
      invalidHeight,
      onChange: onPlacementChange,
      onStage: onStagePlacement,
      onCancel: onCancelPlacement,
    }),
    createElement(
      'div',
      { className: css.draftList, role: 'list', 'aria-label': t('stagedOps') },
      staged.length === 0
        ? createElement('p', { className: css.inspectorHint }, t('noDraft'))
        : staged.map((item) => {
          const summary = summarize(item)
          return createElement('div', { key: item.key, className: css.draftItem, role: 'listitem' },
            createElement('span', { className: css.draftKind }, kindLabel(item.op.op)),
            createElement('span', { className: css.draftSummary, title: summary }, summary),
            createElement('button', {
              type: 'button',
              className: `${css.button} ${css.iconButton}`,
              title: t('removeOp', { summary }),
              'aria-label': t('removeOp', { summary }),
              onClick: () => {
                onRemove(item.key)
              },
            }, createElement(DismissIcon, {})),
          )
        }),
    ),
    createElement('p', { className: css.draftHint }, layoutName === '' ? t('draftSeveralLayouts') : t('draftLayoutHint', { layout: layoutName })),
    staged.length === 0 ? null : createElement('div', { className: css.draftCounts },
      counts.addText === 0 ? null : createElement('span', {}, `${counts.addText} ${t('addTextTool')}`),
      counts.move === 0 ? null : createElement('span', {}, `${counts.move} ${t('moveAction')}`),
      counts.erase === 0 ? null : createElement('span', {}, `${counts.erase} ${t('eraseAction')}`),
    ),
    outcome === undefined ? null : createElement(ApplyOutcomePanel, {
      t,
      outcome,
      onDismiss: onDismissOutcome,
      onOpenWritten,
      onBackToSource,
    }),
  )
}

/** Props of the written-drawing banner above the sheet. */
export interface WrittenBannerProps {
  readonly t: Translate
  readonly path: string
  readonly onBackToSource: () => void
}

/**
 * A written drawing is shown with its own banner; the source stays one click away.
 * @param props - the written path and the way back.
 */
export function WrittenBanner({ t, path, onBackToSource }: WrittenBannerProps): ReactElement {
  return createElement(
    'div',
    { className: css.writtenBanner, role: 'status', 'data-ecad-written-banner': 'true' },
    createElement(CheckIcon, {}),
    createElement('span', { className: css.noticeText }, t('viewingWritten', { path })),
    createElement('button', { type: 'button', className: css.button, onClick: onBackToSource }, t('backToSource')),
  )
}
