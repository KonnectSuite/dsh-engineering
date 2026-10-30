/**
 * Alarm configuration review: the triggers and messages in an Alarms.xml, plus
 * the defects a reviewer can act on before a build.
 *
 * The file is the Alarm Import Export Wizard's own output, so nothing here needs
 * Studio, a controller or a terminal. Findings are static evidence only: whether a
 * trigger fires at runtime, and whether an operator understands its message, cannot
 * be proven from this document.
 *
 * @module @aryacode/dsh-engineering-ftview/alarm-report
 */

import { XMLParser } from 'fast-xml-parser'

/** One alarm trigger as the wizard writes it. */
export interface AlarmTrigger {
  readonly id: string
  readonly expression: string
  readonly label: string
  readonly type: string
  readonly messages: number
}

/** One message row, joined to its trigger. */
export interface AlarmMessage {
  readonly id: string
  readonly trigger: string
  readonly triggerValue: string
  readonly text: string
  readonly display: boolean
  readonly audio: boolean
}

/** A reviewable defect in the alarm configuration. */
export interface AlarmFinding {
  readonly rule: string
  readonly severity: 'info' | 'warning'
  readonly subject: string
  readonly detail: string
}

/** What the report states and what it cannot prove. */
export interface AlarmReport {
  readonly triggers: readonly AlarmTrigger[]
  readonly messages: readonly AlarmMessage[]
  readonly findings: readonly AlarmFinding[]
  readonly counts: {
    readonly triggers: number
    readonly messages: number
    readonly withoutMessage: number
    readonly placeholderLabels: number
    readonly blankTexts: number
    readonly duplicateExpressions: number
    readonly orphanMessages: number
  }
}

interface Node { readonly [key: string]: unknown }

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', isArray: name => name === 'trigger' || name === 'message' })

/** Read a string attribute, or an empty string when it is absent. */
function attribute(node: Node, name: string): string {
  const value = node[`@${name}`]
  return typeof value === 'string' ? value : ''
}

/** Collect the `<trigger>` and `<message>` rows from a parsed document. */
function rowsOf(xml: string): { triggers: Node[]; messages: Node[] } {
  const parsed = parser.parse(xml) as { alarms?: { alarm?: { triggers?: { trigger?: Node[] }; messages?: { message?: Node[] } } } }
  const alarm = parsed.alarms?.alarm
  return {
    triggers: alarm?.triggers?.trigger ?? [],
    messages: alarm?.messages?.message ?? [],
  }
}

/** `Label7`-style names are placeholders the wizard generates, not descriptions. */
function isPlaceholder(label: string): boolean {
  return label === '' || /^label\d*$/iu.test(label.trim())
}

/**
 * Review one Alarms.xml document.
 *
 * @param xml - The wizard XML.
 */
export function alarmReport(xml: string): AlarmReport {
  const { triggers: triggerNodes, messages: messageNodes } = rowsOf(xml)
  const perTrigger = new Map<string, number>()
  for (const message of messageNodes) {
    const trigger = attribute(message, 'trigger').replace(/^#/u, '')
    perTrigger.set(trigger, (perTrigger.get(trigger) ?? 0) + 1)
  }

  const triggers: AlarmTrigger[] = triggerNodes.map(node => {
    const id = attribute(node, 'id')
    return {
      id,
      expression: attribute(node, 'exp'),
      label: attribute(node, 'label'),
      type: attribute(node, 'type'),
      messages: perTrigger.get(id) ?? 0,
    }
  })

  const triggerIds = new Set(triggers.map(trigger => trigger.id))
  const messages: AlarmMessage[] = messageNodes.map(node => ({
    id: attribute(node, 'id'),
    trigger: attribute(node, 'trigger').replace(/^#/u, ''),
    triggerValue: attribute(node, 'trigger-value'),
    text: attribute(node, 'text'),
    display: attribute(node, 'display') !== 'false',
    audio: attribute(node, 'audio') === 'true',
  }))

  const findings: AlarmFinding[] = []
  for (const trigger of triggers) {
    if (trigger.messages === 0) {
      findings.push({
        rule: 'ALARM_TRIGGER_WITHOUT_MESSAGE',
        severity: 'warning',
        subject: trigger.id,
        detail: `Trigger ${trigger.id} (${trigger.expression === '' ? 'no expression' : trigger.expression}) has no message, so it can raise an alarm an operator cannot read.`,
      })
    }
    if (isPlaceholder(trigger.label)) {
      findings.push({
        rule: 'ALARM_PLACEHOLDER_LABEL',
        severity: 'info',
        subject: trigger.id,
        detail: `Trigger ${trigger.id} is labelled "${trigger.label === '' ? '(empty)' : trigger.label}", which is a wizard placeholder rather than a description.`,
      })
    }
  }

  const byExpression = new Map<string, string[]>()
  for (const trigger of triggers) {
    if (trigger.expression === '') continue
    byExpression.set(trigger.expression, [...(byExpression.get(trigger.expression) ?? []), trigger.id])
  }
  for (const [expression, ids] of byExpression) {
    if (ids.length < 2) continue
    findings.push({
      rule: 'ALARM_DUPLICATE_EXPRESSION',
      severity: 'warning',
      subject: expression,
      detail: `${ids.length} triggers watch the same expression ${expression} (${ids.join(', ')}), so one condition can raise several alarms.`,
    })
  }

  const orphans = messages.filter(message => !triggerIds.has(message.trigger))
  for (const message of orphans) {
    findings.push({
      rule: 'ALARM_MESSAGE_ORPHANED',
      severity: 'warning',
      subject: message.id,
      detail: `Message ${message.id} points at trigger ${message.trigger}, which is not in this configuration, so the message can never appear.`,
    })
  }
  const blanks = messages.filter(message => message.text.trim() === '')
  for (const message of blanks) {
    findings.push({
      rule: 'ALARM_MESSAGE_BLANK',
      severity: 'warning',
      subject: message.id,
      detail: `Message ${message.id} on trigger ${message.trigger} has no text, so the alarm list shows an empty row.`,
    })
  }

  return {
    triggers,
    messages,
    findings,
    counts: {
      triggers: triggers.length,
      messages: messages.length,
      withoutMessage: triggers.filter(trigger => trigger.messages === 0).length,
      placeholderLabels: triggers.filter(trigger => isPlaceholder(trigger.label)).length,
      blankTexts: blanks.length,
      duplicateExpressions: [...byExpression.values()].filter(ids => ids.length > 1).length,
      orphanMessages: orphans.length,
    },
  }
}
