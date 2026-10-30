import { describe, expect, it } from 'vitest'
import { alarmReport } from '../src/alarm-report.ts'

/** A small configuration with one of each defect the report looks for. */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<alarms version="1.0">
  <alarm history-size="128">
    <triggers>
      <trigger id="T1" type="value" exp="{[Cutter]Alarm_Word.0}" label="Cutter guard open"/>
      <trigger id="T2" type="value" exp="{[Cutter]Alarm_Word.1}" label="Label2"/>
      <trigger id="T3" type="value" exp="{[Cutter]Alarm_Word.0}" label="Cutter guard open again"/>
    </triggers>
    <messages>
      <message id="M1" trigger="#T1" trigger-value="1" text="Cutter guard open — stop the line" display="true" audio="false"/>
      <message id="M2" trigger="#T2" trigger-value="1" text="  " display="true" audio="false"/>
      <message id="M9" trigger="#T7" trigger-value="1" text="Ghost" display="true" audio="false"/>
    </messages>
  </alarm>
</alarms>`

describe('alarmReport', () => {
  it('joins messages to triggers and counts them', () => {
    const report = alarmReport(XML)
    expect(report.counts.triggers).toBe(3)
    expect(report.counts.messages).toBe(3)
    expect(report.triggers[0]).toMatchObject({ id: 'T1', messages: 1, expression: '{[Cutter]Alarm_Word.0}' })
    expect(report.triggers[1]?.messages).toBe(1)
    expect(report.triggers[2]?.messages).toBe(0)
  })

  it('flags a trigger with no message', () => {
    const report = alarmReport(XML)
    const finding = report.findings.find(entry => entry.rule === 'ALARM_TRIGGER_WITHOUT_MESSAGE')
    expect(finding?.subject).toBe('T3')
    expect(finding?.detail).toContain('has no message')
  })

  it('flags wizard placeholder labels without calling a real label a defect', () => {
    const report = alarmReport(XML)
    const subjects = report.findings.filter(entry => entry.rule === 'ALARM_PLACEHOLDER_LABEL').map(entry => entry.subject)
    expect(subjects).toEqual(['T2'])
    expect(report.counts.placeholderLabels).toBe(1)
  })

  it('flags two triggers watching one expression', () => {
    const report = alarmReport(XML)
    const finding = report.findings.find(entry => entry.rule === 'ALARM_DUPLICATE_EXPRESSION')
    expect(finding?.detail).toContain('T1, T3')
    expect(report.counts.duplicateExpressions).toBe(1)
  })

  it('flags an orphaned message and blank text', () => {
    const report = alarmReport(XML)
    const orphan = report.findings.find(entry => entry.rule === 'ALARM_MESSAGE_ORPHANED')
    expect(orphan?.subject).toBe('M9')
    expect(orphan?.detail).toContain('T7')
    const blank = report.findings.find(entry => entry.rule === 'ALARM_MESSAGE_BLANK')
    expect(blank?.subject).toBe('M2')
    expect(report.counts.orphanMessages).toBe(1)
    expect(report.counts.blankTexts).toBe(1)
  })

  it('reports a clean configuration with no findings', () => {
    const clean = XML
      .replace('<trigger id="T2" type="value" exp="{[Cutter]Alarm_Word.1}" label="Label2"/>', '<trigger id="T2" type="value" exp="{[Cutter]Alarm_Word.1}" label="E-stop pressed"/>')
      .replace('<trigger id="T3" type="value" exp="{[Cutter]Alarm_Word.0}" label="Cutter guard open again"/>', '<trigger id="T3" type="value" exp="{[Cutter]Alarm_Word.2}" label="Gate open"/>')
      .replace('<message id="M2" trigger="#T2" trigger-value="1" text="  " display="true" audio="false"/>', '<message id="M2" trigger="#T2" trigger-value="1" text="E-stop pressed" display="true" audio="false"/>')
      .replace('<message id="M9" trigger="#T7" trigger-value="1" text="Ghost" display="true" audio="false"/>', '<message id="M3" trigger="#T3" trigger-value="1" text="Gate open" display="true" audio="false"/>')
    expect(alarmReport(clean).findings).toEqual([])
  })
})
