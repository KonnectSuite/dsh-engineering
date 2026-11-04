/**
 * The CAD workspace chrome: the tool palette, the command bar, the context menu,
 * the properties panel, the layers panel and the status footer.
 *
 * These components render state the body owns and report interaction back to it;
 * they hold no remote calls, no draft logic and no geometry. Every string is a
 * locale key; every control is at least a 24 px target with an accessible title.
 *
 * @module dsh-engineering-ecad/client/EcadCad
 */

import { createElement, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import type { EcadEntity, EcadSheetModel } from '../engine/types.ts'
import type { CadSnapKind } from './cad.ts'
import type { CadToolGroup, CadToolId, CadToolSpec } from './cadTools.ts'
import { CAD_TOOLS, toolOf } from './cadTools.ts'
import { parseNumberField, validLayerName } from './edits.ts'
import { layerInk, type EcadEntityFacts, factsOf } from './scene.ts'
import { formatPoint } from './scene.ts'
import css from './EcadBody.module.css'

/** The translated string reader the slot hands down. */
export type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string

/** One glyph's geometry. */
interface IconProps {
  readonly size?: number
}

/** Wrap one icon's paths in the shared svg shell. */
function icon(children: ReactNode, size = 14): ReactElement {
  return createElement('svg', {
    className: css.icon,
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }, children)
}

/** The tool palette glyph of one tool. */
function ToolGlyph({ tool, size = 14 }: IconProps & { readonly tool: CadToolId }): ReactElement {
  switch (tool) {
    case 'select':
      return icon([createElement('path', { key: 'a', d: 'M3 2.5l8.5 5-4 1.2-1.4 4L3 2.5Z' })], size)
    case 'pan':
      return icon([
        createElement('path', { key: 'a', d: 'M8 2v12M2 8h12' }),
        createElement('path', { key: 'b', d: 'M5.5 4.5 8 2l2.5 2.5M5.5 11.5 8 14l2.5-2.5M4.5 5.5 2 8l2.5 2.5M11.5 5.5 14 8l-2.5 2.5' }),
      ], size)
    case 'zoomWindow':
      return icon([
        createElement('rect', { key: 'a', x: 2, y: 2, width: 8, height: 8, rx: 0.5, strokeDasharray: '2 1.5' }),
        createElement('path', { key: 'b', d: 'M10 10l4 4' }),
        createElement('path', { key: 'c', d: 'M12.5 9.5v3M9.5 12.5h3' }),
      ], size)
    case 'line':
      return icon([
        createElement('path', { key: 'a', d: 'M3 12.5 13 3.5' }),
        createElement('circle', { key: 'b', cx: 3, cy: 12.5, r: 1.2 }),
        createElement('circle', { key: 'c', cx: 13, cy: 3.5, r: 1.2 }),
      ], size)
    case 'polyline':
      return icon([
        createElement('path', { key: 'a', d: 'M2.5 12.5 6 5l4 5 3.5-7' }),
        createElement('circle', { key: 'b', cx: 6, cy: 5, r: 1.1 }),
        createElement('circle', { key: 'c', cx: 10, cy: 10, r: 1.1 }),
      ], size)
    case 'rectangle':
      return icon([createElement('rect', { key: 'a', x: 2.5, y: 4.5, width: 11, height: 7, rx: 0.5 })], size)
    case 'circle':
      return icon([createElement('circle', { key: 'a', cx: 8, cy: 8, r: 5.5 })], size)
    case 'arc':
      return icon([createElement('path', { key: 'a', d: 'M2.5 12.5a7 7 0 0 1 11-7' })], size)
    case 'revisionCloud':
      return icon([createElement('path', { key: 'a', d: 'M3 9.5a2 2 0 0 1 1.4-3.4A2.4 2.4 0 0 1 8 4.4a2.3 2.3 0 0 1 3.7 1.9A2 2 0 0 1 12.6 10a2.1 2.1 0 0 1-2 2H5a2 2 0 0 1-2-2Z' })], size)
    case 'leader':
      return icon([
        createElement('path', { key: 'a', d: 'M3 13 8 8l5-4' }),
        createElement('path', { key: 'b', d: 'M3 13v-3h3' }),
      ], size)
    case 'text':
      return icon([
        createElement('path', { key: 'a', d: 'M3.5 3.5h9M8 3.5v9M6 12.5h4' }),
      ], size)
    case 'block':
      return icon([
        createElement('rect', { key: 'a', x: 2.5, y: 2.5, width: 5, height: 5, rx: 0.5 }),
        createElement('rect', { key: 'b', x: 8.5, y: 8.5, width: 5, height: 5, rx: 0.5 }),
        createElement('path', { key: 'c', d: 'M8.5 5.5h2v2M5.5 8.5v2h2' }),
      ], size)
    case 'move':
      return icon([
        createElement('path', { key: 'a', d: 'M8 2v12M2 8h12' }),
        createElement('path', { key: 'b', d: 'M5.5 4.5 8 2l2.5 2.5M5.5 11.5 8 14l2.5-2.5M4.5 5.5 2 8l2.5 2.5M11.5 5.5 14 8l-2.5 2.5' }),
      ], size)
    case 'copy':
      return icon([
        createElement('rect', { key: 'a', x: 2.5, y: 2.5, width: 8, height: 8, rx: 0.5 }),
        createElement('path', { key: 'b', d: 'M5.5 5.5h8v8h-8' }),
      ], size)
    case 'rotate':
      return icon([
        createElement('path', { key: 'a', d: 'M12.5 6A5 5 0 1 0 13 9.5' }),
        createElement('path', { key: 'b', d: 'M12.5 2.5v3.5H9' }),
        createElement('circle', { key: 'c', cx: 8, cy: 8, r: 1 }),
      ], size)
    case 'scale':
      return icon([
        createElement('rect', { key: 'a', x: 2.5, y: 8.5, width: 5, height: 5, rx: 0.5 }),
        createElement('rect', { key: 'b', x: 6.5, y: 2.5, width: 7, height: 7, rx: 0.5, strokeDasharray: '2 1.5' }),
        createElement('path', { key: 'c', d: 'M8 8l4-4M9.5 4H12v2.5' }),
      ], size)
    case 'mirror':
      return icon([
        createElement('path', { key: 'a', d: 'M8 1.5v13', strokeDasharray: '2 1.5' }),
        createElement('path', { key: 'b', d: 'M6 3 2.5 8 6 13M10 3l3.5 5L10 13' }),
      ], size)
    case 'offset':
      return icon([
        createElement('path', { key: 'a', d: 'M2.5 3.5h11v9h-11z' }),
        createElement('path', { key: 'b', d: 'M5 6h6v4H5z' }),
      ], size)
    case 'trim':
      return icon([
        createElement('path', { key: 'a', d: 'M2.5 5.5h11M7 9.5h6.5' }),
        createElement('path', { key: 'b', d: 'M9 2.5 12.5 9' }),
      ], size)
    case 'extend':
      return icon([
        createElement('path', { key: 'a', d: 'M2.5 5.5h6M11 9.5h2.5' }),
        createElement('path', { key: 'b', d: 'M10 6.5 13.5 9.5 10 12.5' }),
      ], size)
    case 'erase':
      return icon([
        createElement('path', { key: 'a', d: 'M3 8.5 8.5 3l4.5 4.5L8.5 12H5L3 10V8.5Z' }),
        createElement('path', { key: 'b', d: 'M6 5.5 10.5 10' }),
        createElement('path', { key: 'c', d: 'M8.5 14h5' }),
      ], size)
  }
}

/** The undo glyph. */
function UndoIcon({ size = 14 }: IconProps): ReactElement {
  return icon([createElement('path', { key: 'a', d: 'M3 7.5h6.5a3.5 3.5 0 0 1 0 7H6' }), createElement('path', { key: 'b', d: 'M5.5 3.5 3 7.5l2.5 4' })], size)
}

/** The redo glyph. */
function RedoIcon({ size = 14 }: IconProps): ReactElement {
  return icon([createElement('path', { key: 'a', d: 'M13 7.5H6.5a3.5 3.5 0 0 0 0 7H10' }), createElement('path', { key: 'b', d: 'M10.5 3.5 13 7.5l-2.5 4' })], size)
}

/** The grid glyph. */
function GridIcon({ size = 14 }: IconProps): ReactElement {
  return icon([
    createElement('path', { key: 'a', d: 'M2.5 6h11M2.5 10h11M6 2.5v11M10 2.5v11' }),
    createElement('rect', { key: 'b', x: 2.5, y: 2.5, width: 11, height: 11, rx: 0.5 }),
  ], size)
}

/** The snap glyph, a magnet. */
function SnapIcon({ size = 14 }: IconProps): ReactElement {
  return icon([
    createElement('path', { key: 'a', d: 'M5 2.5v5a3 3 0 0 0 6 0v-5M5 2.5h2M11 2.5h-2M2.5 11.5h5M8.5 11.5h5' }),
  ], size)
}

/** The ortho glyph, a right angle. */
function OrthoIcon({ size = 14 }: IconProps): ReactElement {
  return icon([createElement('path', { key: 'a', d: 'M3.5 13V3.5h9M3.5 9.5h2.5v2.5' })], size)
}

/** The print glyph. */
function PrintIcon({ size = 14 }: IconProps): ReactElement {
  return icon([
    createElement('path', { key: 'a', d: 'M4.5 6V2.5h7V6M4.5 11.5H3a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 3 6.5h10A1.5 1.5 0 0 1 14.5 8v2a1.5 1.5 0 0 1-1.5 1.5h-1.5' }),
    createElement('rect', { key: 'b', x: 4.5, y: 10, width: 7, height: 3.5, rx: 0.5 }),
  ], size)
}

/** The download glyph, for the exports. */
function ExportIcon({ size = 14 }: IconProps): ReactElement {
  return icon([
    createElement('path', { key: 'a', d: 'M8 2.5v7.5M5 7.5 8 10.5l3-3' }),
    createElement('path', { key: 'b', d: 'M3 11.5v2h10v-2' }),
  ], size)
}

/** A padlock, opened or closed. */
function LockGlyph({ size = 12, open = false }: IconProps & { readonly open?: boolean }): ReactElement {
  return icon([
    createElement('rect', { key: 'a', x: 3.5, y: 7.5, width: 9, height: 6.5, rx: 1 }),
    createElement('path', { key: 'b', d: open ? 'M5.5 7.5V5.6a2.5 2.5 0 0 1 4.9-.7' : 'M5.5 7.5V5.6a2.5 2.5 0 0 1 5 0v1.9' }),
  ], size)
}

/** A pencil, for editing a layer. */
function PencilGlyph({ size = 12 }: IconProps): ReactElement {
  return icon([createElement('path', { key: 'a', d: 'M11 2.5l2.5 2.5-8 8H3v-2.5l8-8ZM9 4.5l2.5 2.5' })], size)
}

/** A close glyph for dismissing a notice. */
function DismissGlyph({ size = 12 }: IconProps): ReactElement {
  return icon([createElement('path', { key: 'a', d: 'M4 4l8 8M12 4l-8 8' })], size)
}

/** The eye that shows a visible layer; its struck twin marks a hidden one. */
function EyeGlyph({ size = 13, open = true }: IconProps & { readonly open?: boolean }): ReactElement {
  if (!open) {
    return icon([
      createElement('path', { key: 'a', d: 'M2 2l12 12' }),
      createElement('path', { key: 'b', d: 'M6.3 4.4A7.4 7.4 0 0 1 8 4.2c4.1 0 6.5 3.8 6.5 3.8a12 12 0 0 1-2.4 2.9M4 6.2A12.3 12.3 0 0 0 1.5 8S3.9 11.8 8 11.8c.9 0 1.7-.2 2.4-.4' }),
    ], size)
  }
  return icon([
    createElement('path', { key: 'a', d: 'M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4S1.5 8 1.5 8Z' }),
    createElement('circle', { key: 'b', cx: 8, cy: 8, r: 1.9 }),
  ], size)
}

/** Props of {@link ToolPalette}. */
export interface ToolPaletteProps {
  readonly t: Translate
  readonly active: CadToolId
  readonly editing: boolean
  /** Whether the row allows writes at all; a read-only pane shows view tools only. */
  readonly editable: boolean
  readonly onPick: (tool: CadToolId) => void
}

/** One palette group's buttons. */
function PaletteGroup({ t, group, active, editing, onPick }: ToolPaletteProps & { readonly group: CadToolGroup }): ReactElement {
  const tools = CAD_TOOLS.filter(tool => tool.group === group)
  const groupLabel = group === 'view' ? t('toolGroupView') : group === 'draw' ? t('toolGroupDraw') : t('toolGroupModify')
  return createElement(
    'div',
    { className: css.paletteGroup, role: 'group', 'aria-label': groupLabel },
    createElement('span', { className: css.paletteGroupLabel }, groupLabel),
    createElement('div', { className: css.paletteTools },
      tools.map((tool: CadToolSpec) => {
        const written = tool.writes && !editing
        const label = t(tool.labelKey)
        const hint = t(tool.hintKey)
        const shortcut = tool.shortcut === undefined ? '' : ` · ${t('toolShortcut', { key: tool.shortcut })}`
        return createElement('button', {
          key: tool.id,
          type: 'button',
          className: `${css.paletteButton}${tool.id === active ? ` ${css.toolArmed}` : ''}`,
          title: `${label} — ${hint}${shortcut}`,
          'aria-label': label,
          'aria-pressed': tool.id === active,
          'data-ecad-tool': tool.id,
          ...(written ? { disabled: true } : {}),
          onClick: () => {
            onPick(tool.id)
          },
        }, createElement(ToolGlyph, { tool: tool.id }))
      }),
    ),
  )
}

/**
 * The grouped tool palette: view, draw and modify, with the written tools
 * disabled while the pane is in view mode and absent entirely when the row's
 * writes are off.
 * @param props - active tool, write posture and the pick handler.
 */
export function ToolPalette(props: ToolPaletteProps): ReactElement {
  return createElement(
    'div',
    { className: `${css.toolRail} ${css.noPrint}`, role: 'toolbar', 'aria-label': props.t('toolPalette'), 'aria-orientation': 'vertical', 'data-ecad-palette': 'true' },
    createElement(PaletteGroup, { ...props, group: 'view' }),
    props.editable ? createElement(PaletteGroup, { ...props, group: 'draw' }) : null,
    props.editable ? createElement(PaletteGroup, { ...props, group: 'modify' }) : null,
  )
}

/** Props of {@link CommandBar}. */
export interface CommandBarProps {
  readonly t: Translate
  readonly tool: CadToolId
  readonly points: number
  readonly numeric: string
  readonly onNumeric: (value: string) => void
  readonly onApplyNumeric: () => void
  readonly onCancel: () => void
  readonly error: string | undefined
}

/**
 * The command line: what the armed tool wants next, the numeric entry it
 * accepts and the cancel action.
 * @param props - the active command and its handlers.
 */
export function CommandBar({ t, tool, points, numeric, onNumeric, onApplyNumeric, onCancel, error }: CommandBarProps): ReactElement | null {
  const spec = toolOf(tool)
  if (spec === undefined || spec.writes === false || spec.op === undefined) return null
  const numericLabel = spec.numeric === 'radius' ? t('commandNumericLabelRadius')
    : spec.numeric === 'angle' ? t('commandNumericLabelAngle')
      : spec.numeric === 'distance' ? t('commandNumericLabelDistance')
        : spec.numeric === 'factor' ? t('commandNumericLabelFactor')
          : undefined
  const stepHint = t(spec.hintKey)
  return createElement(
    'div',
    { className: `${css.commandBar} ${css.noPrint}`, role: 'group', 'aria-label': t('commandBarLabel'), 'data-ecad-command-bar': 'true' },
    createElement('span', { className: css.commandText },
      createElement('span', { className: css.commandTool }, t(spec.labelKey)),
      createElement('span', { className: css.commandMeta }, stepHint),
    ),
    points > 0 ? createElement('span', { className: css.commandMeta }, t('commandFinishHint')) : null,
    numericLabel === undefined
      ? null
      : createElement('label', { className: css.commandField },
        createElement('span', {}, numericLabel),
        createElement('input', {
          className: css.formInput,
          type: 'text',
          inputMode: 'decimal',
          value: numeric,
          'aria-label': numericLabel,
          placeholder: t('commandNumericPlaceholder'),
          onChange: (event: { target: { value: string } }) => {
            onNumeric(event.target.value)
          },
          onKeyDown: (event: { key: string; stopPropagation: () => void; preventDefault: () => void }) => {
            if (event.key !== 'Enter') return
            event.stopPropagation()
            event.preventDefault()
            onApplyNumeric()
          },
          'data-ecad-command-numeric': 'true',
        }),
        createElement('button', { type: 'button', className: css.button, title: t('commandNumericApply'), onClick: onApplyNumeric }, t('commandNumericApply')),
      ),
    createElement('span', { className: css.statusGrow }),
    error === undefined ? null : createElement('span', { className: css.formError, role: 'alert' }, error),
    createElement('div', { className: css.commandActions },
      createElement('button', { type: 'button', className: css.button, onClick: onCancel }, t('commandCancel')),
    ),
  )
}

/** One context-menu entry. */
export interface CadMenuItem {
  readonly id: string
  readonly label: string
  readonly shortcut?: string
  readonly disabled?: boolean
  readonly onSelect: () => void
  /** A separator is drawn before this item. */
  readonly separatorBefore?: boolean
}

/** Props of {@link ContextMenu}. */
export interface ContextMenuProps {
  readonly t: Translate
  readonly x: number
  readonly y: number
  readonly items: readonly CadMenuItem[]
  readonly onClose: () => void
}

/**
 * The right-click menu, anchored at the pointer inside the sheet.
 * @param props - position, items and the close action.
 */
export function ContextMenu({ t, x, y, items, onClose }: ContextMenuProps): ReactElement {
  return createElement(
    'div',
    { className: css.contextBackdrop, 'data-ecad-context-backdrop': 'true', onPointerDown: onClose },
    createElement(
      'div',
      {
        className: css.contextMenu,
        role: 'menu',
        'aria-label': t('contextMenuLabel'),
        'data-ecad-context-menu': 'true',
        style: { left: x, top: y },
        onPointerDown: (event: { stopPropagation: () => void }) => {
          event.stopPropagation()
        },
        onContextMenu: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
          event.preventDefault()
          event.stopPropagation()
        },
      },
      items.map(item => createElement(
        'div',
        { key: item.id },
        item.separatorBefore === true ? createElement('div', { className: css.contextMenuSeparator, role: 'separator' }) : null,
        createElement('button', {
          type: 'button',
          role: 'menuitem',
          className: css.contextMenuItem,
          disabled: item.disabled,
          'data-ecad-menu-item': item.id,
          onClick: () => {
            onClose()
            item.onSelect()
          },
        },
          createElement('span', { className: css.contextMenuLabel }, item.label),
          item.shortcut === undefined ? null : createElement('span', { className: css.contextMenuShortcut }, item.shortcut),
        ),
      )),
    ),
  )
}

/** Props of {@link CadStatusBar}. */
export interface CadStatusBarProps {
  readonly t: Translate
  readonly cursor: readonly [number, number] | undefined
  readonly selectionCount: number
  readonly snapKind: CadSnapKind | undefined
  readonly osnap: boolean
  readonly ortho: boolean
  readonly grid: boolean
  readonly sheet: string
  readonly onToggleOsnap: () => void
  readonly onToggleOrtho: () => void
  readonly onToggleGrid: () => void
}

/**
 * The drawing's footer line: cursor coordinates, sheet size, selection count and
 * the labelled drawing-aid toggles.
 * @param props - the live readings and the aid toggles.
 */
export function CadStatusBar({ t, cursor, selectionCount, snapKind, osnap, ortho, grid, sheet, onToggleOsnap, onToggleOrtho, onToggleGrid }: CadStatusBarProps): ReactElement {
  const coordinates = cursor === undefined
    ? t('statusNoCoordinates')
    : t('statusCoordinates', { x: Number(cursor[0].toFixed(3)), y: Number(cursor[1].toFixed(3)) })
  const snapLabel = snapKind === undefined ? undefined
    : snapKind === 'endpoint' ? t('snapEndpoint')
      : snapKind === 'midpoint' ? t('snapMidpoint')
        : snapKind === 'center' ? t('snapCenter')
          : snapKind === 'nearest' ? t('snapNearest')
            : t('snapGrid')
  return createElement(
    'div',
    { className: `${css.statusBar} ${css.noPrint}`, role: 'status', 'aria-label': t('statusBarLabel'), 'data-ecad-status': 'true' },
    createElement('span', { className: css.statusItem, 'data-ecad-cursor': 'true' }, coordinates),
    createElement('span', { className: css.statusItem }, t('selectionCount', { count: selectionCount })),
    snapLabel === undefined ? null : createElement('span', { className: css.statusItem, 'data-ecad-snap-label': snapKind }, t('statusSnap', { kind: snapLabel })),
    createElement('span', { className: css.statusGrow }),
    createElement('span', { className: css.statusItem }, sheet),
    createElement('button', {
      type: 'button',
      className: css.statusChip,
      'aria-pressed': osnap,
      title: t('osnapHint'),
      onClick: onToggleOsnap,
      'data-ecad-aid': 'osnap',
    }, t('statusOsnap')),
    createElement('button', {
      type: 'button',
      className: css.statusChip,
      'aria-pressed': ortho,
      title: t('orthoHint'),
      onClick: onToggleOrtho,
      'data-ecad-aid': 'ortho',
    }, t('statusOrtho')),
    createElement('button', {
      type: 'button',
      className: css.statusChip,
      'aria-pressed': grid,
      title: t('gridHint'),
      onClick: onToggleGrid,
      'data-ecad-aid': 'grid',
    }, t('statusGrid')),
  )
}

/** Props of {@link PropertiesPanel}. */
export interface PropertiesPanelProps {
  readonly t: Translate
  readonly entities: readonly EcadEntity[]
  readonly model: EcadSheetModel
  readonly editing: boolean
  readonly moveDx: string
  readonly moveDy: string
  readonly rotateAngle: string
  readonly onMoveDx: (value: string) => void
  readonly onMoveDy: (value: string) => void
  readonly onRotateAngle: (value: string) => void
  readonly onStageMove: () => void
  readonly onStageRotate: () => void
  readonly onStageErase: () => void
  readonly onStageText: (entity: EcadEntity, text: string) => void
  readonly onStageLayer: (entities: readonly EcadEntity[], layer: string) => void
  readonly onStageAttribute: (ownerId: string, tag: string, value: string) => void
  readonly onAsk: () => void
  readonly onClear: () => void
}

/** The rows of one entity's read-only facts. */
function propertyRows(t: Translate, facts: EcadEntityFacts): readonly { readonly label: string; readonly value: string; readonly mono?: boolean }[] {
  return [
    { label: t('kind'), value: facts.kind, mono: true },
    { label: t('layer'), value: facts.layer },
    ...(facts.text === undefined ? [] : [{ label: t('text'), value: facts.text }]),
    ...(facts.point === undefined ? [] : [{ label: t('position'), value: formatPoint(facts.point), mono: true }]),
    ...(facts.points === undefined ? [] : [{ label: t('points'), value: String(facts.points), mono: true }]),
    ...(facts.block === undefined ? [] : [{ label: t('block'), value: facts.block }]),
    { label: t('entityId'), value: facts.id, mono: true },
  ]
}

/**
 * The INSERT id a selection's attributes belong to, when the selection can carry
 * a block attribute: an insert entity, or an attribute's flattened text, whose
 * `g` names the owning block reference.
 * @param entity - the selected entity, when there is exactly one.
 * @returns the owning insert id, or undefined.
 */
function attributeOwner(entity: EcadEntity | undefined): string | undefined {
  if (entity === undefined) return undefined
  if (entity.k === 'insert') return entity.id
  if (entity.k === 'text' && entity.g !== undefined) return entity.g
  return undefined
}

/**
 * The selection's editable properties: text content, layer, block attribute,
 * move and rotate, plus the read-only facts of the entity or the mixture.
 * Every change is staged as an operation; nothing is written here.
 * @param props - the selection, the write posture and the stage callbacks.
 */
export function PropertiesPanel(props: PropertiesPanelProps): ReactElement {
  const { t, entities, model, editing, moveDx, moveDy, rotateAngle } = props
  const single = entities.length === 1 ? entities[0] : undefined
  const selectedKey = entities.map(entity => entity.id).join('|')
  const [textDraft, setTextDraft] = useState('')
  const [layerDraft, setLayerDraft] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [valueDraft, setValueDraft] = useState('')
  // A new selection starts its editable drafts from the entity it names.
  useEffect(() => {
    setTextDraft(single !== undefined && (single.k === 'text' || single.k === 'mtext') ? single.t ?? '' : '')
    setLayerDraft(single === undefined ? '' : single.layer)
    setTagDraft('')
    setValueDraft(attributeOwner(single) === undefined ? '' : single?.t ?? '')
  }, [selectedKey])
  const kindCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entity of entities) counts.set(entity.k, (counts.get(entity.k) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [entities])
  const layers = useMemo(() => (model.layers.length === 0 ? [...new Set(entities.map(entity => entity.layer))] : model.layers.map(layer => layer.name)), [model, entities])
  const layerValue = single?.layer ?? layerDraft
  const canStageText = editing && single !== undefined && (single.k === 'text' || single.k === 'mtext') && textDraft !== (single.t ?? '')
  const canStageLayer = editing && entities.length > 0 && layerDraft !== '' && (single === undefined || layerDraft !== single.layer)
  const attributeTarget = attributeOwner(single)
  const canStageAttribute = editing && attributeTarget !== undefined && tagDraft.trim() !== '' && valueDraft !== (single?.t ?? '')
  const canStageMove = parseNumberField(moveDx) !== undefined && parseNumberField(moveDy) !== undefined
  const canStageRotate = parseNumberField(rotateAngle) !== undefined
  return createElement(
    'section',
    { className: `${css.panelSection} ${css.inspectorSection}`, 'data-ecad-properties': 'true' },
    createElement('div', { className: css.panelHeading }, t('properties')),
    createElement(
      'div',
      { className: css.inspector },
      entities.length === 0
        ? createElement('p', { className: css.inspectorHint }, t('propertiesHint'))
        : createElement(
          'div',
          null,
          entities.length > 1
            ? createElement('p', { className: css.inspectorHint }, t('propertiesHintMulti', { count: entities.length }))
            : null,
          single === undefined
            ? createElement(
              'div',
              null,
              createElement('div', { className: css.propertyRow },
                createElement('span', { className: css.propertyLabel }, t('kind')),
                createElement('span', { className: css.propertyValue }, kindCounts.map(([kind, count]) => `${kind} ×${count}`).join(', ') || t('propertiesMixedKind')),
              ),
              createElement('div', { className: css.propertyRow },
                createElement('span', { className: css.propertyLabel }, t('layer')),
                createElement('span', { className: css.propertyValue }, [...new Set(entities.map(entity => entity.layer))].join(', ') || t('propertiesMixedLayer')),
              ),
            )
            : propertyRows(t, factsOf(single)).map(row => createElement(
              'div',
              { key: row.label, className: css.propertyRow },
              createElement('span', { className: css.propertyLabel }, row.label),
              createElement('span', { className: `${css.propertyValue}${row.mono === true ? ` ${css.mono}` : ''}` }, row.value),
            )),
          // A block attribute edit names the owning INSERT and the tag; the sheet
          // model does not carry tag names, so the reader types the tag.
          attributeTarget === undefined
            ? null
            : createElement(
              'div',
              { className: css.placementForm, 'data-ecad-attribute-editor': 'true' },
              createElement('div', { className: css.panelHeading }, t('propertiesAttributeTitle')),
              createElement('p', { className: css.editHint }, t('propertiesAttributeHint')),
              createElement('label', { className: css.formRow },
                createElement('span', { className: css.formLabel }, t('propertiesTag')),
                createElement('input', {
                  className: css.formInput,
                  type: 'text',
                  value: tagDraft,
                  'aria-label': t('propertiesTag'),
                  onChange: (event: { target: { value: string } }) => {
                    setTagDraft(event.target.value)
                  },
                  'data-ecad-attribute-tag': 'true',
                }),
              ),
              createElement('label', { className: css.formRow },
                createElement('span', { className: css.formLabel }, t('propertiesValue')),
                createElement('input', {
                  className: css.formInput,
                  type: 'text',
                  value: valueDraft,
                  'aria-label': t('propertiesValue'),
                  onChange: (event: { target: { value: string } }) => {
                    setValueDraft(event.target.value)
                  },
                  'data-ecad-attribute-value': 'true',
                }),
              ),
              createElement('div', { className: css.formActions },
                createElement('button', {
                  type: 'button',
                  className: css.applyButton,
                  disabled: !canStageAttribute,
                  onClick: () => {
                    if (attributeTarget === undefined) return
                    props.onStageAttribute(attributeTarget, tagDraft.trim(), valueDraft)
                  },
                }, t('propertiesAttributeApply')),
              ),
            ),
          single !== undefined && (single.k === 'text' || single.k === 'mtext')
            ? createElement(
              'div',
              { className: css.placementForm, 'data-ecad-text-editor': 'true' },
              createElement('label', { className: css.formRow },
                createElement('span', { className: css.formLabel }, t('text')),
                createElement('input', {
                  className: css.formInput,
                  type: 'text',
                  value: textDraft,
                  'aria-label': t('text'),
                  onChange: (event: { target: { value: string } }) => {
                    setTextDraft(event.target.value)
                  },
                  'data-ecad-property-text': 'true',
                }),
              ),
              createElement('div', { className: css.formActions },
                createElement('button', {
                  type: 'button',
                  className: css.applyButton,
                  disabled: !canStageText,
                  onClick: () => {
                    if (single === undefined) return
                    props.onStageText(single, textDraft)
                  },
                }, t('propertiesTextApply')),
              ),
            )
            : null,
          editing
            ? createElement(
              'div',
              null,
              createElement('div', { className: css.propertyHeading }, t('layer')),
              createElement('label', { className: css.formRow },
                createElement('span', { className: css.formLabel }, t('layer')),
                createElement('select', {
                  className: css.formInput,
                  value: layerValue,
                  'aria-label': t('layer'),
                  onChange: (event: { target: { value: string } }) => {
                    setLayerDraft(event.target.value)
                  },
                  'data-ecad-property-layer': 'true',
                }, layers.map(name => createElement('option', { key: name, value: name }, name))),
              ),
              createElement('div', { className: css.formActions },
                createElement('button', {
                  type: 'button',
                  className: css.applyButton,
                  disabled: !canStageLayer,
                  onClick: () => {
                    props.onStageLayer(entities, layerDraft)
                  },
                }, t('propertiesLayerApply')),
              ),
              createElement('div', { className: css.propertyHeading }, t('toolMove')),
              createElement('div', { className: css.editActionsBlock },
                createElement('div', { className: css.moveFields },
                  createElement('label', { className: css.moveField },
                    createElement('span', {}, t('moveDx')),
                    createElement('input', {
                      type: 'text',
                      inputMode: 'decimal',
                      value: moveDx,
                      'aria-label': t('moveDx'),
                      onChange: (event: { target: { value: string } }) => {
                        props.onMoveDx(event.target.value)
                      },
                      'data-ecad-move-dx': 'true',
                    }),
                  ),
                  createElement('label', { className: css.moveField },
                    createElement('span', {}, t('moveDy')),
                    createElement('input', {
                      type: 'text',
                      inputMode: 'decimal',
                      value: moveDy,
                      'aria-label': t('moveDy'),
                      onChange: (event: { target: { value: string } }) => {
                        props.onMoveDy(event.target.value)
                      },
                      'data-ecad-move-dy': 'true',
                    }),
                  ),
                ),
                createElement('div', { className: css.inspectorActions },
                  createElement('button', { type: 'button', className: css.applyButton, disabled: !canStageMove, onClick: props.onStageMove, 'data-ecad-stage-move': 'true' }, t('propertiesMoveApply')),
                ),
              ),
              createElement('div', { className: css.propertyHeading }, t('toolRotate')),
              createElement('label', { className: css.formRow },
                createElement('span', { className: css.formLabel }, t('commandNumericLabelAngle')),
                createElement('input', {
                  className: css.formInput,
                  type: 'text',
                  inputMode: 'decimal',
                  value: rotateAngle,
                  'aria-label': t('commandNumericLabelAngle'),
                  onChange: (event: { target: { value: string } }) => {
                    props.onRotateAngle(event.target.value)
                  },
                  'data-ecad-rotate-angle': 'true',
                }),
              ),
              createElement('div', { className: css.formActions },
                createElement('button', { type: 'button', className: css.applyButton, disabled: !canStageRotate, onClick: props.onStageRotate, 'data-ecad-stage-rotate': 'true' }, t('propertiesRotateApply')),
              ),
              createElement('div', { className: css.inspectorActions },
                createElement('button', { type: 'button', className: css.button, onClick: props.onStageErase, 'data-ecad-stage-erase': 'true' }, t('propertiesDelete')),
              ),
            )
            : createElement('p', { className: css.editHint }, t('readOnlyHint')),
          single !== undefined && single.approx === true
            ? createElement('p', { className: css.approxNote }, single.src === undefined ? t('approximateNoteGeneric') : t('approximateNote', { src: single.src }))
            : null,
        ),
      createElement(
        'div',
        { className: css.inspectorActions },
        createElement('button', { type: 'button', className: css.button, onClick: props.onAsk }, t('propertiesAsk')),
        createElement('button', { type: 'button', className: css.button, onClick: props.onClear }, t('propertiesClear')),
      ),
    ),
  )
}

/** Props of {@link CadLayersPanel}. */
export interface CadLayersPanelProps {
  readonly t: Translate
  readonly model: EcadSheetModel
  readonly layoutEntities: readonly EcadEntity[]
  readonly hidden: ReadonlySet<string>
  readonly locked: ReadonlySet<string>
  readonly current: string | undefined
  readonly editing: boolean
  readonly onToggle: (name: string) => void
  readonly onShowAll: () => void
  readonly onHideAll: () => void
  readonly onLock: (name: string) => void
  readonly onCurrent: (name: string) => void
  /** Returns a message to show when the engine operation is not available yet. */
  readonly onCreateLayer: (name: string, color: number) => string | undefined
  readonly onRenameLayer: (from: string, to: string) => string | undefined
  readonly onSetLayerColor: (name: string, color: number) => string | undefined
}

/**
 * The drawing's layers: visibility, the current drawing layer, the selection
 * lock and — with writes on — the staged create/rename/colour operations.
 * @param props - the layer table and the handlers.
 */
export function CadLayersPanel(props: CadLayersPanelProps): ReactElement {
  const { t, model, layoutEntities, hidden, locked, current, editing } = props
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('1')
  const [editingLayer, setEditingLayer] = useState<string | undefined>(undefined)
  const [renameDraft, setRenameDraft] = useState('')
  const [colorDraft, setColorDraft] = useState('1')
  const [message, setMessage] = useState<string | undefined>(undefined)
  const counts = useMemo(() => {
    const next = new Map<string, number>()
    for (const entity of layoutEntities) {
      const key = entity.layer.toUpperCase()
      next.set(key, (next.get(key) ?? 0) + 1)
    }
    return next
  }, [layoutEntities])
  const parseColor = (raw: string): number | undefined => {
    const value = Number(raw.trim())
    return Number.isInteger(value) && value >= 1 && value <= 255 ? value : undefined
  }
  const beginEdit = (layerName: string): void => {
    setEditingLayer(layerName)
    setRenameDraft(layerName)
    setColorDraft(String(model.layers.find(layer => layer.name === layerName)?.color ?? 7))
    setMessage(undefined)
  }
  const anyHidden = model.layers.some(layer => hidden.has(layer.name.toUpperCase()))
  return createElement(
    'section',
    { className: `${css.panelSection} ${css.layersSection}`, 'data-ecad-layers': 'true' },
    createElement(
      'div',
      { className: css.panelHeading },
      t('layers'),
      createElement('span', { className: css.panelHeadingSpacer }),
      anyHidden
        ? createElement('button', { type: 'button', className: `${css.button} ${css.panelHeadingButton}`, onClick: props.onShowAll }, t('layersShowAll'))
        : null,
      createElement('button', { type: 'button', className: `${css.button} ${css.panelHeadingButton}`, onClick: props.onHideAll }, t('layerHideAll')),
    ),
    createElement(
      'div',
      { className: css.layerCurrent },
      createElement('span', {}, t('layersCurrent')),
      createElement('select', {
        className: css.formInput,
        value: current ?? '',
        'aria-label': t('layersCurrent'),
        onChange: (event: { target: { value: string } }) => {
          props.onCurrent(event.target.value)
        },
        'data-ecad-current-layer': 'true',
      }, model.layers.map(layer => createElement('option', { key: layer.name, value: layer.name }, layer.name))),
    ),
    createElement(
      'div',
      { className: css.layerList, role: 'group', 'aria-label': t('layers') },
      model.layers.map((layer) => {
        const key = layer.name.toUpperCase()
        const visible = !hidden.has(key)
        const isLocked = locked.has(key)
        const isCurrent = current === layer.name
        const title = `${visible ? t('layerHide', { layer: layer.name }) : t('layerShow', { layer: layer.name })}${layer.frozen === true ? ` · ${t('layerFrozen')}` : ''}${layer.locked === true ? ` · ${t('layerLocked')}` : ''}`
        return createElement(
          'div',
          { key: layer.name, className: css.layerRow, 'data-ecad-layer-row': layer.name },
          createElement(
            'button',
            {
              type: 'button',
              className: css.layerToggle,
              'aria-pressed': visible,
              title,
              onClick: () => {
                props.onToggle(layer.name)
              },
            },
            createElement('span', { className: css.layerEye }, createElement(EyeGlyph, { open: visible })),
            createElement('span', { className: css.swatch, style: { background: layerInk(layer) } }),
            createElement('span', { className: css.layerName }, layer.name),
            isCurrent ? createElement('span', { className: css.tabCount }, t('layerCurrentBadge')) : null,
            createElement('span', { className: css.layerCount }, String(counts.get(key) ?? 0)),
          ),
          createElement('button', {
            type: 'button',
            className: css.layerMiniButton,
            'aria-pressed': isLocked,
            title: isLocked ? t('layerUnlock', { layer: layer.name }) : t('layerLock', { layer: layer.name }),
            'aria-label': isLocked ? t('layerUnlock', { layer: layer.name }) : t('layerLock', { layer: layer.name }),
            onClick: () => {
              props.onLock(layer.name)
            },
          }, createElement(LockGlyph, { open: !isLocked })),
          editing
            ? createElement('button', {
              type: 'button',
              className: css.layerMiniButton,
              title: t('layerEdit', { layer: layer.name }),
              'aria-label': t('layerEdit', { layer: layer.name }),
              'data-ecad-layer-edit': layer.name,
              onClick: () => {
                beginEdit(layer.name)
              },
            }, createElement(PencilGlyph, {}))
            : null,
        )
      }),
    ),
    editingLayer === undefined
      ? null
      : createElement(
        'div',
        { className: css.layerForm, 'data-ecad-layer-form': 'true' },
        createElement('label', { className: css.layerFormRow },
          createElement('span', {}, t('layerName')),
          createElement('input', {
            className: css.formInput,
            type: 'text',
            value: renameDraft,
            'aria-label': t('layerName'),
            onChange: (event: { target: { value: string } }) => {
              setRenameDraft(event.target.value)
            },
            'data-ecad-layer-rename': 'true',
          }),
        ),
        createElement('label', { className: css.layerFormRow },
          createElement('span', {}, t('layerColor')),
          createElement('input', {
            className: css.formInput,
            type: 'text',
            inputMode: 'numeric',
            value: colorDraft,
            'aria-label': t('layerColor'),
            onChange: (event: { target: { value: string } }) => {
              setColorDraft(event.target.value)
            },
            'data-ecad-layer-color': 'true',
          }),
        ),
        message === undefined ? null : createElement('p', { className: css.formError, role: 'alert' }, message),
        createElement('div', { className: css.formActions },
          createElement('button', {
            type: 'button',
            className: css.applyButton,
            'data-ecad-layer-rename-apply': 'true',
            onClick: () => {
              if (!validLayerName(renameDraft)) {
                setMessage(t('layerInvalidName'))
                return
              }
              const parsed = parseColor(colorDraft)
              if (parsed === undefined) {
                setMessage(t('layerColorInvalid'))
                return
              }
              const renameMessage = editingLayer === renameDraft ? undefined : props.onRenameLayer(editingLayer, renameDraft)
              if (renameMessage !== undefined) {
                setMessage(renameMessage)
                return
              }
              const colorMessage = props.onSetLayerColor(renameDraft, parsed)
              if (colorMessage !== undefined) {
                setMessage(colorMessage)
                return
              }
              setMessage(renameMessage ?? colorMessage)
              setEditingLayer(undefined)
            },
          }, t('layerRenameApply')),
          createElement('button', {
            type: 'button',
            className: css.applyButton,
            'data-ecad-layer-color-apply': 'true',
            onClick: () => {
              const parsed = parseColor(colorDraft)
              if (parsed === undefined) {
                setMessage(t('layerColorInvalid'))
                return
              }
              const colorMessage = props.onSetLayerColor(editingLayer, parsed)
              setMessage(colorMessage)
              if (colorMessage === undefined) setEditingLayer(undefined)
            },
          }, t('layerColorApply')),
          createElement('button', { type: 'button', className: css.button, onClick: () => { setEditingLayer(undefined); setMessage(undefined) } }, t('cancel')),
        ),
      ),
    editing
      ? createElement(
        'div',
        { className: css.layerForm, 'data-ecad-layer-create': 'true' },
        createOpen
          ? createElement(
            'div',
            null,
            createElement('label', { className: css.layerFormRow },
              createElement('span', {}, t('layerName')),
              createElement('input', {
                className: css.formInput,
                type: 'text',
                value: name,
                'aria-label': t('layerName'),
                placeholder: t('layerName'),
                onChange: (event: { target: { value: string } }) => {
                  setName(event.target.value)
                },
                'data-ecad-new-layer-name': 'true',
              }),
            ),
            createElement('label', { className: css.layerFormRow },
              createElement('span', {}, t('layerColor')),
              createElement('input', {
                className: css.formInput,
                type: 'text',
                inputMode: 'numeric',
                value: color,
                'aria-label': t('layerColor'),
                onChange: (event: { target: { value: string } }) => {
                  setColor(event.target.value)
                },
                'data-ecad-new-layer-color': 'true',
              }),
            ),
            message === undefined ? null : createElement('p', { className: css.formError, role: 'alert' }, message),
            createElement('div', { className: css.formActions },
              createElement('button', {
                type: 'button',
                className: css.applyButton,
                onClick: () => {
                  if (!validLayerName(name)) {
                    setMessage(t('layerInvalidName'))
                    return
                  }
                  const parsed = parseColor(color)
                  if (parsed === undefined) {
                    setMessage(t('layerColorInvalid'))
                    return
                  }
                  const pending = props.onCreateLayer(name, parsed)
                  setMessage(pending)
                  if (pending === undefined) {
                    setCreateOpen(false)
                    setName('')
                    setColor('1')
                  }
                },
              }, t('layerCreateApply')),
              createElement('button', { type: 'button', className: css.button, onClick: () => { setCreateOpen(false); setMessage(undefined) } }, t('cancel')),
            ),
          )
          : createElement('div', { className: css.formActions }, createElement('button', { type: 'button', className: css.button, onClick: () => { setCreateOpen(true); setMessage(undefined) } }, t('layerCreate'))),
      )
      : createElement('p', { className: css.editHint }, t('layerReadOnlyHint')),
  )
}

/** The one-line notice the drawing surfaces for a pending engine operation. */
export interface CadNotice {
  readonly kind: 'info' | 'warn' | 'error'
  readonly text: string
}

/** Props of {@link CadNoticeView}. */
export interface CadNoticeViewProps {
  readonly t: Translate
  readonly notice: CadNotice
  readonly onDismiss: () => void
}

/**
 * A dismissible notice over the sheet's top edge, for the messages that are not
 * a state (a pending engine operation, an export failure).
 * @param props - the notice and the dismiss action.
 */
export function CadNoticeView({ t, notice, onDismiss }: CadNoticeViewProps): ReactElement {
  const tone = notice.kind === 'warn' ? css.badgeWarn : notice.kind === 'error' ? css.noticeError : css.noticeInfo
  return createElement(
    'div',
    { className: `${css.notice} ${tone} ${css.noticeActionable}`, role: notice.kind === 'error' ? 'alert' : 'status', 'data-ecad-notice': notice.kind },
    createElement('span', { className: css.noticeText }, notice.text),
    createElement('button', { type: 'button', className: css.button, onClick: onDismiss, title: t('cancel'), 'aria-label': t('cancel') }, createElement(DismissGlyph, {})),
  )
}

/** Props of the toolbar's palette-independent drawing-aid buttons. */
export interface DrawingAidButtonsProps {
  readonly t: Translate
  readonly osnap: boolean
  readonly ortho: boolean
  readonly grid: boolean
  readonly onToggleOsnap: () => void
  readonly onToggleOrtho: () => void
  readonly onToggleGrid: () => void
}

/**
 * The drawing aids the toolbar shows beside the view controls: snap, ortho and
 * grid, each a labelled 24 px toggle.
 * @param props - the aid state and toggles.
 */
export function DrawingAidButtons({ t, osnap, ortho, grid, onToggleOsnap, onToggleOrtho, onToggleGrid }: DrawingAidButtonsProps): ReactElement {
  return createElement(
    'div',
    { className: css.toolbarGroup, role: 'group', 'aria-label': t('drawingAids') },
    createElement('button', { type: 'button', className: `${css.button} ${css.iconButton}`, title: t('osnapHint'), 'aria-label': t('osnap'), 'aria-pressed': osnap, onClick: onToggleOsnap }, createElement(SnapIcon, {})),
    createElement('button', { type: 'button', className: `${css.button} ${css.iconButton}`, title: t('orthoHint'), 'aria-label': t('statusOrtho'), 'aria-pressed': ortho, onClick: onToggleOrtho }, createElement(OrthoIcon, {})),
    createElement('button', { type: 'button', className: `${css.button} ${css.iconButton}`, title: t('gridHint'), 'aria-label': t('statusGrid'), 'aria-pressed': grid, onClick: onToggleGrid }, createElement(GridIcon, {})),
  )
}

/** The toolbar's sheet actions: print and the two exports. */
export interface SheetActionButtonsProps {
  readonly t: Translate
  readonly disabled: boolean
  readonly onPrint: () => void
  readonly onExportSvg: () => void
  readonly onExportPng: () => void
}

/**
 * Print and export, next to the other document actions.
 * @param props - the actions and their availability.
 */
export function SheetActionButtons({ t, disabled, onPrint, onExportSvg, onExportPng }: SheetActionButtonsProps): ReactElement {
  return createElement(
    'div',
    { className: css.toolbarGroup },
    createElement('button', { type: 'button', className: `${css.button} ${css.iconButton}`, title: t('printHint'), 'aria-label': t('print'), disabled, onClick: onPrint, 'data-ecad-print': 'true' }, createElement(PrintIcon, {})),
    createElement('button', { type: 'button', className: `${css.button} ${css.iconButton}`, title: t('exportSvgHint'), 'aria-label': t('exportSvg'), disabled, onClick: onExportSvg, 'data-ecad-export-svg': 'true' }, createElement(ExportIcon, {})),
    createElement('button', { type: 'button', className: `${css.button} ${css.iconButton}`, title: t('exportPngHint'), 'aria-label': t('exportPng'), disabled, onClick: onExportPng, 'data-ecad-export-png': 'true' }, createElement(ExportIcon, {})),
  )
}

/** The undo/redo pair the toolbar and the command bar share. */
export interface UndoRedoButtonsProps {
  readonly t: Translate
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly onUndo: () => void
  readonly onRedo: () => void
}

/**
 * Undo and redo over the staged draft.
 * @param props - availability and the handlers.
 */
export function UndoRedoButtons({ t, canUndo, canRedo, onUndo, onRedo }: UndoRedoButtonsProps): ReactElement {
  return createElement(
    'div',
    { className: css.toolbarGroup },
    createElement('button', { type: 'button', className: `${css.button} ${css.iconButton}`, title: t('undoHint'), 'aria-label': t('undo'), disabled: !canUndo, onClick: onUndo, 'data-ecad-undo': 'true' }, createElement(UndoIcon, {})),
    createElement('button', { type: 'button', className: `${css.button} ${css.iconButton}`, title: t('redoHint'), 'aria-label': t('redo'), disabled: !canRedo, onClick: onRedo, 'data-ecad-redo': 'true' }, createElement(RedoIcon, {})),
  )
}
