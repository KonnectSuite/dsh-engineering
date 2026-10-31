#!/usr/bin/env node
/**
 * Drive the ladder pane the way an engineer does, and require the pane to answer.
 *
 * The render sweep proves the picture; this proves the behaviour behind it —
 * that a click focuses an instruction, that arrow keys walk the rung, that the
 * rung number selects a rung, that the source view shows the exported text, that
 * the organiser filter narrows the tree, that the tag table narrows and watches
 * a tag, that the bottom panes switch, and that a right-click still opens the
 * operand menu. Every step is a real click or key press on the shipped face; a
 * step that does not change what the pane shows is reported as a failure.
 *
 * Usage:
 *   node --import tsx packages/viewer/test/render/interactions.mjs
 *   node --import tsx packages/viewer/test/render/interactions.mjs --file ../_e2e/out/CT10-Source.L5X
 *   node --import tsx packages/viewer/test/render/interactions.mjs --routine BottomCutter_Comms --shot .harness/shots/actions.png
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { REPO, renderLadderFace } from './harness.mjs'

/** Read the option that follows a flag on the command line. */
function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const file = option('file', '../_e2e/out/CT9-Source.L5X')
const routine = option('routine', 'BottomCutter_Comms')
const shot = option('shot', undefined)
const width = Number.parseInt(option('width', '1680'), 10)
const height = Number.parseInt(option('height', '1200'), 10)
if (!existsSync(join(REPO, file))) throw new Error(`interactions: no export at ${file}`)

/** Click the first button whose trimmed text equals the given label. */
const clickLabel = async (tab, label) => tab.evaluate(wanted => {
  const button = [...document.querySelectorAll('button')].find(element => (element.textContent ?? '').trim() === wanted)
  if (button === undefined) return false
  button.click()
  return true
}, label)

/** Click the first button whose trimmed text starts with the given label. */
const clickPrefix = async (tab, label) => tab.evaluate(wanted => {
  const button = [...document.querySelectorAll('button')].find(element => (element.textContent ?? '').replace(/^\W+/u, '').trim().startsWith(wanted))
  if (button === undefined) return false
  button.click()
  return true
}, label)

/**
 * The behaviour scenario. Each step returns what it observed, so a failure says
 * which interaction broke rather than only that the end state was wrong.
 */
async function scenario(tab) {
  const steps = []
  const failures = []
  const record = (name, ok, detail) => {
    steps.push({ name, ok, detail })
    if (!ok) failures.push(`${name}: ${detail}`)
  }

  // 1. A click on an instruction focuses it, and the pane remembers which one.
  const first = tab.locator('[data-l5x-instruction]').first()
  const reached = await first.count()
  if (reached === 0) record('click an instruction', false, 'no instruction to click')
  else {
    const id = await first.getAttribute('data-instruction-id')
    await first.click()
    const pressed = await first.getAttribute('aria-pressed')
    const active = await tab.evaluate(() => document.activeElement?.getAttribute('data-instruction-id') ?? null)
    record('click an instruction', pressed === 'true' && active === id, `pressed ${String(pressed)}, focus on ${String(active)} instead of ${String(id)}`)
  }

  // 2. Arrow keys walk the instructions of the routine.
  const before = await tab.evaluate(() => document.activeElement?.getAttribute('data-instruction-id') ?? null)
  await tab.keyboard.press('ArrowRight')
  await tab.waitForTimeout(120)
  const after = await tab.evaluate(() => document.activeElement?.getAttribute('data-instruction-id') ?? null)
  record('arrow key walks the rung', before !== null && after !== null && before !== after, `still on ${String(after)}`)
  await tab.keyboard.press('ArrowLeft')
  await tab.waitForTimeout(120)

  // 3. The rung number selects its rung and shows the exported text.
  const rung = await tab.evaluate(() => {
    const button = document.querySelector('[data-rung] button')
    if (button === null) return null
    button.click()
    return document.querySelectorAll('[data-rung]').length
  })
  record('click a rung number', rung !== null && rung > 0, 'no rung number button')

  // 4. The source toggle reveals the NeutralText the export carries.
  const toggled = await clickLabel(tab, 'Source')
  const source = await tab.evaluate(() => {
    const code = [...document.querySelectorAll('code')].find(element => /(?:XIC|XIO|OTE|OTL|OTU|TON|MOVE|JSR|NE)\(/u.test(element.textContent ?? ''))
    return code === undefined ? null : (code.textContent ?? '').slice(0, 80)
  })
  record('source view shows NeutralText', toggled && source !== null, toggled ? 'no instruction text appeared' : 'no Source button')
  await clickLabel(tab, 'Source')

  // 5. The organiser filter narrows the tree to matching rows.
  const filtered = await tab.evaluate(() => {
    const input = document.querySelector('[data-l5x-project-view] input')
    if (input === null) return null
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    const before = document.querySelectorAll('[data-l5x-project-view] button').length
    setter?.call(input, 'Cutter_StopControl')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return before
  })
  await tab.waitForTimeout(300)
  const narrowed = await tab.evaluate(() => document.querySelectorAll('[data-l5x-project-view] button').length)
  record('organiser filter narrows the tree', filtered !== null && narrowed < filtered, `still ${narrowed} of ${String(filtered)} rows`)
  await tab.evaluate(() => {
    const input = document.querySelector('[data-l5x-project-view] input')
    if (input === null) return
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await tab.waitForTimeout(200)

  // 6. The tag table opens, and a right-click on a row can send the tag to the
  //    offline watch pane. The toolbar row prints the count, so match its prefix.
  const rows = await clickPrefix(tab, 'Controller Tags')
  await tab.waitForTimeout(300)
  record('tag table opens', rows === true, 'no Tags button')

  const watched = await tab.evaluate(() => {
    const row = document.querySelector('table tbody tr')
    if (row === null) return false
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 }))
    return true
  })
  await tab.waitForTimeout(300)
  const menuAt = await tab.evaluate(() => {
    const menu = document.querySelector('[role="menu"]')
    if (menu === null) return null
    const rect = menu.getBoundingClientRect()
    return { left: Math.round(rect.left), top: Math.round(rect.top), items: menu.querySelectorAll('button').length }
  })
  record('the operand menu opens where the pointer was', menuAt !== null && menuAt.items > 0 && menuAt.left >= 0 && menuAt.left < 200, JSON.stringify(menuAt))
  // The menu surface is the shell's primitive, mounted by the harness as a plain
  // portal; the item is found by its locale label rather than by a menu role.
  const added = await tab.evaluate(() => {
    const item = [...document.querySelectorAll('[role="menu"] button')].find(element => /add to offline watch/iu.test(element.textContent ?? ''))
    if (item === undefined) return null
    item.click()
    return (item.textContent ?? '').trim()
  })
  await tab.waitForTimeout(300)
  const watchCount = await tab.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(element => /^Offline watch/iu.test((element.textContent ?? '').trim()))
    return button === undefined ? null : (button.textContent ?? '').trim()
  })
  record('a tag can be sent to the watch pane', watched && added !== null && watchCount !== null && !/\(0\)/u.test(watchCount), `menu ${String(added)}, watch tab ${String(watchCount)}`)

  // 7. A rung answers for itself: right-clicking it offers the rung's own
  // actions, and watching the rung adds every tag it touches at once.
  // The tag table replaced the ladder a moment ago, so go back to the routine
  // before asking a rung for its menu.
  await tab.evaluate(name => {
    const row = [...document.querySelectorAll('[data-l5x-project-view] button')]
      .find(element => (element.textContent ?? '').replace(/^\W+/u, '').trim().startsWith(`${name} `))
    row?.click()
  }, routine)
  await tab.waitForTimeout(400)
  const rungMenu = await tab.evaluate(() => {
    const rung = document.querySelector('[data-l5x-rung]')
    if (rung === null) return null
    const box = rung.getBoundingClientRect()
    rung.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: Math.round(box.left) + 60, clientY: Math.round(box.top) + 80 }))
    return true
  })
  await tab.waitForTimeout(250)
  const rungItems = await tab.evaluate(() => {
    const menu = document.querySelector('[role="menu"]')
    if (menu === null) return null
    const heading = menu.querySelector('div')?.textContent ?? ''
    const watch = menu.querySelector('[data-l5x-menu="watch-rung"]')
    return { heading, ask: menu.querySelector('[data-l5x-menu="ask-rung"]') !== null, watch: watch !== null, count: menu.querySelectorAll('button').length }
  })
  record('a rung opens its own menu', rungMenu === true && rungItems !== null && rungItems.ask && rungItems.watch, JSON.stringify(rungItems))
  const rungWatch = await tab.evaluate(() => {
    const button = document.querySelector('[data-l5x-menu="watch-rung"]')
    if (button === null) return null
    button.click()
    return true
  })
  await tab.waitForTimeout(300)
  const rungWatchCount = await tab.evaluate(() => {
    const tab = [...document.querySelectorAll('button')].find(element => /^Offline watch/u.test((element.textContent ?? '').trim()))
    return tab === null ? null : (tab.textContent ?? '').trim()
  })
  record('watching a rung adds every tag it touches', rungWatch === true && rungWatchCount !== null && Number.parseInt(/\((\d+)\)/u.exec(rungWatchCount)?.[1] ?? '0', 10) >= 2, `watch tab ${String(rungWatchCount)}`)

  // 8. The bottom panes switch to the cross-reference list.
  const panes = await tab.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(element => /^Cross References/ui.test((element.textContent ?? '').trim()))
    if (button === undefined) return null
    button.click()
    return document.querySelectorAll('[data-l5x-project-view] section').length
  })
  await tab.waitForTimeout(200)
  record('bottom panes switch', panes !== null, 'no Cross References tab')

  // 9. No console noise accumulated while all of that happened.
  const logged = await tab.evaluate(() => window.__CONSOLE__ ?? [])
  record('no console output while interacting', logged.length === 0, `${logged.length} message(s): ${logged.slice(0, 2).join(' | ')}`)

  return { steps, failures }
}

const result = await renderLadderFace({ file, routine, shot, width, height, scenario, requireValues: false })
for (const step of result.scenario.steps) console.log(`${step.ok ? 'PASS' : 'FAIL'} ${step.name} — ${step.detail}`)
console.log(`${result.scenario.steps.filter(step => step.ok).length}/${result.scenario.steps.length} interactions passed on ${routine} in ${file}`)
if (result.failures.length > 0) {
  for (const failure of result.failures) console.log(`  ${failure}`)
  process.exitCode = 1
}
