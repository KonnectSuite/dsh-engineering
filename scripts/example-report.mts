/**
 * Example report v2: ladder captured from the SHIPPED viewer, document printed by Chrome.
 *
 * The previous version drew ladder with the plugin's own SVG renderer - dark, blocky, a second
 * picture of the same logic. This one mounts `packages/viewer/lib/client.js` (the exact bundle the
 * app ships), lets it render the routine, and clips the capture to the rungs, so the figure in the
 * document is the pane's own drawing.
 *
 * Structure follows the reference report: numbered sections, a caption naming program / routine /
 * rung range, tables that carry meaning, and a footer with page numbers on every page.
 *
 * This is a demonstration script, not the shipped tool: it uses the e2e harness to mount the viewer.
 *
 * Usage: node --import tsx scripts/example-report.mts <export.L5X> <outDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { loadL5x } from '../packages/l5x/src/model/parse.ts'
import { getRoutine, listRoutines } from '../packages/l5x/src/model/routines.ts'
import { findChromium } from '../packages/l5x/src/engine/render-ladder.ts'
import { renderLadderFace } from '../packages/viewer/test/render/harness.mjs'

const [exportPath, outDir] = process.argv.slice(2)
if (exportPath === undefined || outDir === undefined) {
  console.error('usage: node --import tsx scripts/example-report.mts <export.L5X> <outDir>')
  process.exit(2)
}
const out = resolve(outDir)
mkdirSync(out, { recursive: true })

const document = loadL5x(readFileSync(resolve(exportPath), 'utf8'))
const generated = new Date().toISOString().slice(0, 10)
const esc = (value: string): string => value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;')

/** One ladder figure: the viewer's own rendering of one routine, clipped to the rungs. */
async function captureRoutine(program: string, routine: string, file: string): Promise<string | undefined> {
  try {
    await renderLadderFace({
      file: exportPath,
      routine,
      diagram: false,
      requireValues: false,
      width: 1280,
      height: 1000,
      scenario: async tab => {
        // The rungs carry data-rung; the union of their boxes is the figure, without the pane chrome.
        const box = await tab.evaluate(() => {
          const rungs = [...document.querySelectorAll('[data-rung]')]
          if (rungs.length === 0) return null
          const rects = rungs
            .map(rung => [rung, rung.getBoundingClientRect()])
            .filter(([, rect]) => rect.width > 0 && rect.height > 0)
          if (rects.length === 0) return null
          const top = Math.min(...rects.map(([, rect]) => rect.top))
          const left = Math.min(...rects.map(([, rect]) => rect.left))
          const right = Math.max(...rects.map(([, rect]) => rect.right))
          const bottom = Math.max(...rects.map(([, rect]) => rect.bottom))
          return { x: Math.max(0, left - 8), y: Math.max(0, top - 8), width: right - left + 16, height: bottom - top + 16 }
        })
        if (box !== null) await tab.screenshot({ path: file, clip: box })
      },
    })
    return file
  } catch {
    return undefined
  }
}

const sections: string[] = []
const figures = new Map<string, string>()
let section = 2
let totalRungs = 0
const routines = document.programs.flatMap(program => listRoutines(document, program.name).map(info => ({ program: program.name, info })))

for (const { program, info } of routines) {
  const routine = getRoutine(document, program, info.name)
  if (routine === undefined || routine.body.type !== 'RLL' || routine.body.rungs.length === 0) continue
  totalRungs += routine.body.rungs.length
  const caption = `${program} / ${info.name} > Rungs 0–${routine.body.rungs.length - 1}`
  const file = join(out, `ladder-${sections.length + 1}.png`)
  const captured = await captureRoutine(program, info.name, file)
  const rungRows = routine.body.rungs.map(rung => `<tr><td class="num">${rung.number}</td><td>${esc(rung.comment ?? '')}</td><td><code>${esc(rung.text)}</code></td></tr>`).join('')
  sections.push(`
<section class="chapter">
  <h2><span class="n">${section}.</span> ${esc(program)} / ${esc(info.name)}</h2>
  <p class="lede">${esc(info.description || `Routine ${info.name} of program ${program}.`)}</p>
  <figure>
    <div class="cap">${esc(caption)}</div>
    ${captured === undefined ? '<p class="empty">This routine could not be rendered.</p>' : `<img src="${captured.replace(/\\/gu, '/')}" alt="${esc(caption)}">`}
    <figcaption>Rendered by the shipped project viewer — the same renderer the chat pane uses.</figcaption>
  </figure>
  <table><thead><tr><th>Rung</th><th>Comment</th><th>NeutralText</th></tr></thead><tbody>${rungRows}</tbody></table>
</section>`)
  figures.set(caption, file)
  section += 1
}

const moduleRows = document.modules.map(module => `<tr><td>${esc(module.name)}</td><td>${esc(module.catalogNumber)}</td><td>${esc(module.parentModule)}</td></tr>`).join('')
const tagRows = document.tags.map(tag => `<tr><td>${esc(tag.scope)}</td><td>${esc(tag.name)}</td><td>${esc(tag.dataType)}</td><td>${esc(tag.description ?? '')}</td></tr>`).join('')
const programNames = document.programs.map(program => program.name).join(', ')
const taskList = document.tasks.map(task => `${task.name} (${task.type}${task.rate === undefined || task.rate === '' ? '' : `, ${task.rate}`})`).join(', ')

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(document.controller.name)} — engineering report</title>
<style>
@page { size: letter; margin: 20mm 18mm 22mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #111; background: #fff; font: 11.5px/1.55 "Segoe UI", system-ui, sans-serif; }
h1 { font: 600 26px/1.2 Georgia, "Times New Roman", serif; margin: 0 0 10px; }
h2 { font: 600 16px/1.3 Georgia, "Times New Roman", serif; margin: 0 0 6px; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
h2 .n { color: #b45309; margin-right: 6px; }
.title { page-break-after: always; padding-top: 40mm; }
.title .kicker { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: #b45309; margin-bottom: 10px; }
.title .meta { margin-top: 28px; display: grid; grid-template-columns: 150px 1fr; gap: 4px 14px; font-size: 11.5px; }
.title .meta dt { color: #666; }
.title .meta dd { margin: 0; }
.title p.lead { margin-top: 26px; font-size: 12.5px; color: #333; max-width: 62ch; }
.chapter { page-break-before: always; }
.lede { color: #333; margin: 8px 0 12px; }
figure { margin: 12px 0 16px; border: 1px solid #ddd; border-radius: 3px; overflow: hidden; }
figure .cap { background: #f6f6f5; border-bottom: 1px solid #ddd; padding: 5px 8px; font-size: 10.5px; color: #555; }
figure img { display: block; width: 100%; height: auto; }
figcaption { font-size: 10px; color: #666; padding: 6px 8px; }
table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 10.5px; }
th, td { text-align: left; vertical-align: top; padding: 4px 6px; border-bottom: 1px solid #e5e5e5; }
th { background: #f6f6f5; font-weight: 600; }
td.num { width: 34px; color: #666; }
code { font: 10px ui-monospace, Consolas, monospace; }
.empty { color: #888; font-style: italic; padding: 10px; }
ul.facts { margin: 8px 0 0 18px; padding: 0; }
ul.facts li { margin: 2px 0; }
</style></head><body>

<div class="title">
  <div class="kicker">Engineering report</div>
  <h1>${esc(document.controller.name)}</h1>
  <p class="lead">${esc(document.controller.description || 'A Studio 5000 project, documented from its offline L5X export.')}</p>
  <dl class="meta">
    <dt>Controller</dt><dd>${esc(document.controller.name || 'not named')}</dd>
    <dt>Controller type</dt><dd>${esc(document.controller.processorType || 'not declared')}</dd>
    <dt>Revision</dt><dd>${esc(`${document.controller.majorRev}.${document.controller.minorRev}`)}</dd>
    <dt>Programs</dt><dd>${esc(programNames)}</dd>
    <dt>Tasks</dt><dd>${esc(taskList || 'none declared')}</dd>
    <dt>Generated</dt><dd>${esc(generated)}</dd>
  </dl>
</div>

<section>
  <h2><span class="n">1.</span> Project overview</h2>
  <p class="lede">This export declares ${document.programs.length} program(s) running ${taskList === '' ? 'with no declared task' : `under ${esc(taskList)}`}, ${routines.length} routine(s) and ${totalRungs} ladder rung(s). It is documented from the export only: nothing here was read from a running controller.</p>
  <ul class="facts">
    ${document.programs.map(program => `<li><strong>${esc(program.name)}</strong> — main routine <code>${esc(program.mainRoutine || 'not declared')}</code>${program.safety ? ' · SAFETY' : ''}${program.description === '' ? '' : ` — ${esc(program.description)}`}</li>`).join('')}
  </ul>
</section>

${sections.join('\n')}

<section class="chapter">
  <h2><span class="n">${section}.</span> I/O summary</h2>
  <table><thead><tr><th>Module</th><th>Catalog</th><th>Parent</th></tr></thead><tbody>${moduleRows || '<tr><td colspan="3" class="empty">The export declares no I/O modules.</td></tr>'}</tbody></table>
</section>

<section class="chapter">
  <h2><span class="n">${section + 1}.</span> Tag database</h2>
  <table><thead><tr><th>Scope</th><th>Name</th><th>Type</th><th>Description</th></tr></thead><tbody>${tagRows || '<tr><td colspan="4" class="empty">The export declares no tags.</td></tr>'}</tbody></table>
</section>

</body></html>
`

const htmlPath = join(out, 'report.html')
writeFileSync(htmlPath, html, 'utf8')
console.log(`html: ${htmlPath} (${html.length} bytes)`)

const executablePath = findChromium()
if (executablePath === undefined) {
  console.log('no Chromium found; HTML only')
  process.exit(0)
}
const browser = await chromium.launch({ executablePath, headless: true })
try {
  const page = await browser.newPage()
  await page.goto(`file:///${htmlPath.replace(/\\/gu, '/')}`, { waitUntil: 'load' })
  const pdfPath = join(out, 'report.pdf')
  await page.pdf({
    path: pdfPath,
    format: 'Letter',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;font:9px 'Segoe UI',sans-serif;color:#666;padding:0 18mm;display:flex;justify-content:space-between;"><span>Generated by AryaCode Engineering · from ${esc(document.controller.name)} (${esc(document.controller.processorType)})</span><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    margin: { top: '18mm', bottom: '20mm', left: '18mm', right: '18mm' },
  })
  console.log(`pdf: ${pdfPath}`)
  const pngPath = join(out, 'report-pages.png')
  await page.setViewportSize({ width: 1000, height: 1300 })
  await page.screenshot({ path: pngPath, fullPage: true })
  console.log(`png: ${pngPath}`)
} finally {
  await browser.close()
}
