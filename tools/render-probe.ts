/**
 * Render a real display through the shipped renderer, so the rasteriser path is
 * proven outside the unit harness (read-only: writes only into its output dir).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDisplay } from '../packages/ftview/src/model.ts'
import { findBrowser, renderDisplaySvg, settingsFromXml, writeRender, type RasterImage } from '../packages/ftview/src/render-svg.ts'

const file = process.argv[2]
const output = process.argv[3] ?? 'renders-probe'
if (file === undefined) throw new Error('usage: render-probe.ts <display.xml> [outputDir]')
const text = readFileSync(file, 'utf8')
const display = parseDisplay(file, text)
const settings = settingsFromXml(text)

/** Load the rasters the display references from its sibling Images folder. */
function rasters(): Map<string, RasterImage> {
  const imagesDir = join(file, '..', '..', 'Images')
  const loaded = new Map<string, RasterImage>()
  for (const object of display.objects) {
    const name = object.attributes.imageName ?? object.attributes.image
    if (name === undefined || name === '' || loaded.has(name)) continue
    for (const [extension, mime] of [['png', 'image/png'], ['jpg', 'image/jpeg'], ['bmp', 'image/bmp']] as const) {
      const candidate = join(imagesDir, `${name}.${extension}`)
      if (!existsSync(candidate)) continue
      loaded.set(name, { mime, base64: readFileSync(candidate).toString('base64') })
      break
    }
  }
  return loaded
}

const result = renderDisplaySvg(display.name, display.objects, settings, rasters())
const written = await writeRender(output, display.name, result)
console.log(JSON.stringify({ browser: findBrowser() ?? null, objects: display.objects.length, drawn: result.drawn, skipped: result.skipped, ...written, target: join(output, display.name) }, null, 2))
