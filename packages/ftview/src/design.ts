/**
 * Design checks for a FactoryTalk View export.
 *
 * These are the rules from the `view` domain of the engineering corpus that can
 * be decided from the export alone: touch-target size (`VIEW-HPM-02`), a control
 * with no caption (`VIEW-HPM-01`), contrast of text on its own background
 * (`VIEW-COLOR-01`) and displays nothing navigates to (`VIEW-NAV-01`). Every
 * finding names the rule it comes from so a review can cite the page.
 *
 * @module dsh-engineering-ftview/design
 */

import { isPressTarget } from './catalog.ts'
import type { Finding } from './checks.ts'
import type { Application, DisplayFile } from './model.ts'

/** Object types that move an operator off the current display. */
const EXIT_TYPES = new Set(['gotobutton', 'closebutton', 'returnbutton'])

/** Minimum comfortable touch target in pixels. */
const TOUCH_MINIMUM = 44

/** Contrast ratio a small text label needs to be legible. */
const CONTRAST_MINIMUM = 4.5

const NAMED: Readonly<Record<string, string>> = {
  white: '#ffffff', black: '#000000', silver: '#c0c0c0', gray: '#808080', grey: '#808080',
  red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff',
  magenta: '#ff00ff', maroon: '#800000', navy: '#000080', teal: '#008080', olive: '#808000',
}

/** Parse a colour to `#rrggbb`, or undefined. */
function colour(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const text = value.trim().toLowerCase()
  if (NAMED[text] !== undefined) return NAMED[text]
  if (/^#[0-9a-f]{6}$/u.test(text)) return text
  if (/^#[0-9a-f]{8}$/u.test(text)) return `#${text.slice(3)}`
  if (/^#[0-9a-f]{3}$/u.test(text)) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`
  return undefined
}

/** Relative luminance of one colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map(index => {
    const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const [r = 0, g = 0, b = 0] = channels
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Contrast ratio between two colours. */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Number attribute, or undefined. */
function numberAttribute(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Run the design checks.
 *
 * @param app - The scanned application.
 * @returns Findings in rule order.
 */
/** Canvas of a full-screen display; popups are sized on purpose and are excluded. */
function canvasOf(display: DisplayFile): { width: number; height: number } | undefined {
  const settings = display.objects.find(object => object.type.toLowerCase() === 'displaysettings')
  if (settings === undefined) return undefined
  if ((settings.attributes.displayType ?? '').toLowerCase() !== 'replace') return undefined
  const width = numberAttribute(settings.attributes.width)
  const height = numberAttribute(settings.attributes.height)
  if (width === undefined || height === undefined) return undefined
  return { width, height }
}

export function designFindings(app: Application): Finding[] {
  const findings: Finding[] = []
  const targets = new Set<string>()
  for (const display of app.displays) {
    for (const object of display.objects) {
      const attributes = object.attributes
      if (object.type === 'gotoButton') {
        const target = attributes.display?.trim()
        if (target !== undefined && target !== '') targets.add(target)
      }
      if (!isPressTarget(object.type)) continue
      const touch = attributes.touch !== 'false'
      const width = numberAttribute(attributes.width)
      const height = numberAttribute(attributes.height)
      if (touch && width !== undefined && height !== undefined && Math.min(width, height) < TOUCH_MINIMUM) {
        findings.push({
          rule: 'VIEW-HPM-02',
          severity: 'warning',
          message: `${object.type} ${object.name ?? '(unnamed)'} in ${display.name} is ${width}×${height}; the target minimum is ${TOUCH_MINIMUM}px.`,
          evidence: { display: display.name, object: object.name, width, height },
        })
      }
      const caption = attributes.caption?.trim() ?? ''
      if (caption === '' && attributes.imageName === undefined) {
        findings.push({
          rule: 'VIEW-HPM-01',
          severity: 'info',
          message: `${object.type} ${object.name ?? '(unnamed)'} in ${display.name} has no caption in its base attributes.`,
          evidence: { display: display.name, object: object.name },
        })
      }
    }
    for (const object of display.objects) {
      const fore = colour(object.attributes.color ?? object.attributes.foreColor)
      const back = colour(object.attributes.backColor)
      if (fore === undefined || back === undefined) continue
      if (!['text', 'numericDisplay', 'numericInput', 'stringDisplay', 'stringInput'].includes(object.type)) continue
      const ratio = contrastRatio(fore, back)
      if (ratio < CONTRAST_MINIMUM) {
        findings.push({
          rule: 'VIEW-COLOR-01',
          severity: 'warning',
          message: `${object.type} ${object.name ?? '(unnamed)'} in ${display.name} has contrast ${ratio.toFixed(2)}:1 (${fore} on ${back}); the minimum is ${CONTRAST_MINIMUM}:1.`,
          evidence: { display: display.name, object: object.name, foreground: fore, background: back, ratio: Number(ratio.toFixed(2)) },
        })
      }
    }
  }
  for (const display of app.displays) {
    if (display.name === 'Main Screen' || display.name === 'Main') continue
    if (!targets.has(display.name)) {
      findings.push({
        rule: 'VIEW-NAV-01',
        severity: 'info',
        message: `No gotoButton names ${display.name}; check that it is reachable from the navigation.`,
        evidence: { display: display.name },
      })
    }
  }
  for (const display of app.displays) {
    if (display.name === 'Main Screen' || display.name === 'Main') continue
    if (!targets.has(display.name)) continue
    const exits = display.objects.filter(object => EXIT_TYPES.has(object.type.toLowerCase()))
    if (exits.length > 0) continue
    findings.push({
      rule: 'VIEW-NAV-02',
      severity: 'warning',
      message: `Something navigates to ${display.name} and it holds no gotoButton or closeButton, so an operator who lands there cannot leave.`,
      evidence: { display: display.name, exit_controls: 0 },
    })
  }
  const canvases = app.displays
    .map(display => ({ display, size: canvasOf(display) }))
    .filter((entry): entry is { display: DisplayFile; size: { width: number; height: number } } => entry.size !== undefined)
  if (canvases.length > 1) {
    const counts = new Map<string, number>()
    for (const entry of canvases) {
      const key = `${entry.size.width}x${entry.size.height}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const [common] = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    if (common !== undefined && common[1] > 1) {
      const [commonSize, commonCount] = common
      for (const entry of canvases) {
        const key = `${entry.size.width}x${entry.size.height}`
        if (key === commonSize) continue
        findings.push({
          rule: 'VIEW-LAYOUT-02',
          severity: 'info',
          message: `${entry.display.name} is ${entry.size.width}x${entry.size.height} while ${commonCount} other full-screen display(s) are ${commonSize}; a different canvas scales or letterboxes on the same panel.`,
          evidence: {
            display: entry.display.name,
            width: entry.size.width,
            height: entry.size.height,
            common: commonSize,
            common_count: commonCount,
          },
        })
      }
    }
  }

  return findings
}
