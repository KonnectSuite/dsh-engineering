/**
 * Audit the wizard defaults that survive in an imported L5X export.
 *
 * The Studio migration wizard converts a legacy project to its own defaults,
 * not to the legacy project's settings: analog channels land on the 0-20
 * engineering-unit range, the old chassis stays declared beside its
 * replacement, modules come through unnamed, and a byte-swap token (`+ S24`)
 * is injected where the legacy instruction addressed a byte-swapped word.
 * None of these fail an import, and none are visible in a build verdict —
 * they change what the machine measures and how the addresses behave.
 *
 * This module reads the export text only: no Studio, no controller, and no
 * claim that a channel reads like the legacy one until it is calibrated.
 *
 * @module dsh-engineering-migration/engine/wizard-audit
 */

/** One wizard-default finding. */
export interface WizardFinding {
  readonly rule: string
  readonly severity: 'critical' | 'warning' | 'info'
  readonly count: number
  readonly detail: string
}

/** The audit of one imported export. */
export interface WizardAudit {
  readonly modules: number
  readonly rungs: number
  readonly analogChannels: number
  readonly findings: readonly WizardFinding[]
}

/** A module Name Studio accepts: letters, digits and underscores, not starting with a digit. */
const LEGAL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u

/** Catalog numbers of the legacy chassis families the wizard leaves declared. */
const LEGACY_CHASSIS = /^174[67]/u

/** One `<Module>` element, opening tag and body together. */
const MODULE_BLOCK = /<Module\b[\s\S]*?<\/Module>/gu

/** Attribute value out of an opening tag. */
function attribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'u'))
  return match?.[1] ?? ''
}

/**
 * Audit one imported L5X text for the defaults the wizard leaves in place.
 *
 * @param text - decoded L5X export text.
 * @returns module and rung counts plus one finding per wizard-default rule that fired.
 */
export function wizardDefaultsAudit(text: string): WizardAudit {
  const blocks = text.match(MODULE_BLOCK) ?? []
  const unnamed: string[] = []
  const illegal: string[] = []
  const legacyChassis: string[] = []
  const wizardChannels: string[] = []
  let analogChannels = 0

  for (const block of blocks) {
    const tag = block.slice(0, block.indexOf('>') + 1)
    const name = attribute(tag, 'Name')
    const catalog = attribute(tag, 'CatalogNumber')
    const label = name === '' ? (catalog === '' ? '(unnamed module)' : `${catalog} (unnamed)`) : name
    if (name === '') unnamed.push(label)
    else if (!LEGAL_NAME.test(name)) illegal.push(`Name="${name}"`)
    if (LEGACY_CHASSIS.test(catalog)) legacyChassis.push(`${catalog}${name === '' ? '' : ` as ${name}`}`)

    for (const channel of block.split('<Channel').slice(1)) {
      analogChannels += 1
      const range = channel.match(/\bName\s*=\s*"Range"\s+Value\s*=\s*"(\d+)"/u)?.[1]
      const high = channel.match(/\bName\s*=\s*"HighEngineering"\s+Value\s*=\s*"([\d.]+)"/u)?.[1]
      if (range === '4' && high !== undefined && Number(high) === 100) wizardChannels.push(label)
    }
  }

  const findings: WizardFinding[] = []
  if (illegal.length > 0) {
    findings.push({
      rule: 'MODULE_NAME_ILLEGAL',
      severity: 'critical',
      count: illegal.length,
      detail: `Module Name(s) ${illegal.join(', ')} carry characters Studio refuses at import (a colon is the usual cause); the label belongs in the module Description.`,
    })
  }
  if (legacyChassis.length > 0) {
    findings.push({
      rule: 'LEGACY_CHASSIS_DECLARED',
      severity: 'warning',
      count: legacyChassis.length,
      detail: `Legacy chassis module(s) ${[...new Set(legacyChassis)].join(', ')} are still declared beside their replacements; delete them once the replacement wiring is proven.`,
    })
  }
  if (wizardChannels.length > 0) {
    findings.push({
      rule: 'WIZARD_ANALOG_DEFAULT',
      severity: 'warning',
      count: wizardChannels.length,
      detail: `${wizardChannels.length} analog channel(s) across ${[...new Set(wizardChannels)].length} module(s) sit at the wizard default 0-20 engineering units with a full scale of 100; set Range, Low/High Engineering and the scaling to what the sensor and the HMI expect.`,
    })
  }
  if (unnamed.length > 0) {
    findings.push({
      rule: 'MODULE_UNNAMED',
      severity: 'info',
      count: unnamed.length,
      detail: `${unnamed.length} module(s) come through unnamed (${[...new Set(unnamed)].slice(0, 6).join(', ')}${unnamed.length > 6 ? ', …' : ''}); name them before the tag references get written.`,
    })
  }
  const artifacts = (text.match(/\+\s*S24\b/gu) ?? []).length
  if (artifacts > 0) {
    findings.push({
      rule: 'WIZARD_ARTIFACT',
      severity: 'warning',
      count: artifacts,
      detail: `${artifacts} site(s) carry the wizard's "+ S24" byte-swap token in an operand address; it is not a tag. Record each as a plan exception of kind wizard_artifact and rewrite the address from the legacy rung.`,
    })
  }
  const markers = (text.match(/\bPCE\s*\(/gu) ?? []).length
  const unknownRungs = (text.match(/<RungInfo\b[^>]*>\s*<!\[CDATA\[[\s\S]*?\]\]>/gu) ?? [])
    .filter(rung => !/<\?xml[^>]*\?>/.test(rung) && rung.includes('?')).length
  if (markers > 0 || unknownRungs > 0) {
    findings.push({
      rule: 'RESIDUAL_MARKERS',
      severity: 'warning',
      count: markers + unknownRungs,
      detail: `${markers} PCE marker(s) and ${unknownRungs} rung(s) with a "?" operand are still unanswered; run migration_resolve, then re-export before a build verdict.`,
    })
  }

  const rungs = (text.match(/<RungInfo\b/gu) ?? []).length
  return { modules: blocks.length, rungs, analogChannels, findings }
}
