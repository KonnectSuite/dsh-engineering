/**
 * The diagram face's end-to-end cases: real Chrome, the shipped bundle, the committed fixture.
 *
 * `diagram-face.spec.mjs` judges the drawing from synthetic geometry in Node. This file judges the
 * whole path the shell uses — mount `packages/viewer/lib/client.js`, read the export through the
 * document-preview contract, click the routine in the organizer — and then asserts on the SVG that
 * arrived in the pane: one box per block, step and transition, one line per wire and link, the block's
 * pins and the transition's condition legible.
 *
 * Usage: node packages/viewer/test/render/diagrams.mjs
 */
import { renderLadderFace } from './harness.mjs'

const FILE = 'packages/viewer/test/fixtures/diagrams.L5X'

/** Count the drawing that reached the pane, and collect what it says. */
const inspect = async tab => await tab.evaluate(() => {
  const svg = document.querySelector('[data-l5x-project-view] svg')
  if (svg === null) {
    const status = document.querySelector('[data-l5x-project-view]')?.textContent ?? ''
    return { error: `no diagram rendered; pane says: ${status.slice(0, 120)}` }
  }
  return {
    rects: svg.querySelectorAll('rect').length,
    lines: svg.querySelectorAll('line').length,
    text: svg.textContent ?? '',
    label: svg.getAttribute('aria-label') ?? '',
    buttons: [...document.querySelectorAll('[data-l5x-project-view] button')].map(button => (button.textContent ?? '').trim()),
  }
})

/**
 * One diagram routine.
 * @param routine - Routine to open.
 * @param expect - Counts and the strings that have to be legible.
 * @returns Case result with failures.
 */
async function diagramCase(routine, expect) {
  const result = await renderLadderFace({
    file: FILE,
    routine,
    diagram: true,
    scenario: async (tab) => {
      const found = await inspect(tab)
      const failures = []
      if (found.error !== undefined) return { failures: [found.error], found }
      if (found.rects !== expect.rects) failures.push(`expected ${expect.rects} boxes, drew ${found.rects}`)
      if (found.lines !== expect.lines) failures.push(`expected ${expect.lines} lines, drew ${found.lines}`)
      for (const text of expect.text) {
        if (!found.text.includes(text)) failures.push(`"${text}" is not legible on the drawing`)
      }
      // A diagram has no NeutralText, so the pane has to offer its XML instead.
      if (!found.buttons.includes('Copy routine L5X')) failures.push('the pane offers no way to copy the routine XML')
      return { failures, found }
    },
    width: 1280,
    height: 900,
  })
  return { routine, ...result }
}

const cases = await Promise.all([
  // Four boxes: two references, the block, one output reference. Three wires join them.
  diagramCase('Fb', { rects: 4, lines: 3, text: ['add1', 'SourceA', 'SourceB', 'Dest', 'r3'] }),
  // Three boxes: two steps and the transition. Two links join them, and the condition is drawn.
  diagramCase('Chart', { rects: 3, lines: 2, text: ['Step_1', 'Tran_1', 'Step_2', 'Timer.DN'] }),
])

let failed = false
for (const item of cases) {
  const failures = [...(item.failures ?? [])]
  const state = failures.length === 0 ? 'ok  ' : 'FAIL'
  if (failures.length > 0) failed = true
  const found = item.scenario?.found
  console.log(`${state} ${item.routine}: ${found?.rects ?? '?'} box(es), ${found?.lines ?? '?'} line(s)${failures.length === 0 ? '' : ` — ${failures.join('; ')}`}`)
}
process.exitCode = failed ? 1 : 0
