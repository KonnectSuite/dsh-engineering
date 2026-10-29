/**
 * Render a real display through the shipped renderer, so the rasteriser path is
 * proven outside the unit harness (read-only: writes only into its output dir).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDisplay } from '../packages/ftview/src/model.ts'
import { findBrowser, renderDisplaySvg, settingsFromXml, writeRender } from '../packages/ftview/src/render-svg.ts'

const file = process.argv[2]
const output = process.argv[3] ?? 'renders-probe'
if (file === undefined) throw new Error('usage: render-probe.ts <display.xml> [outputDir]')
const text = readFileSync(file, 'utf8')
const display = parseDisplay(file, text)
const settings = settingsFromXml(text)
const result = renderDisplaySvg(display.name, display.objects, settings)
const written = await writeRender(output, display.name, result)
console.log(JSON.stringify({ browser: findBrowser() ?? null, objects: display.objects.length, drawn: result.drawn, skipped: result.skipped, ...written, target: join(output, display.name) }, null, 2))
