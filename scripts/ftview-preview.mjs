#!/usr/bin/env node
/**
 * Render one FactoryTalk View display to SVG and a standalone HTML page.
 *
 * The same renderer the preview uses runs here, so this is the quickest way to
 * see an export without opening the app: point it at a display XML and open the
 * HTML, or screenshot it headlessly with `--png`.
 *
 *   node --import tsx scripts/ftview-preview.mjs "Displays/Main Screen.xml" artifacts/ftview --png
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { renderDisplay } from '../packages/ftview-viewer/src/index.ts'

const [file, outRoot = 'artifacts/ftview', ...rest] = process.argv.slice(2)
if (file === undefined) {
  console.error('usage: ftview-preview.mjs <display.xml> [outDir] [--png]')
  process.exit(2)
}
const source = readFileSync(file, 'utf8')
const svg = renderDisplay(source)
const name = basename(file).replace(/\.xml$/iu, '')
const out = resolve(outRoot)
mkdirSync(out, { recursive: true })
writeFileSync(join(out, `${name}.svg`), `${svg}\n`, 'utf8')
writeFileSync(join(out, `${name}.html`), `<!doctype html><meta charset="utf-8"><title>${name}</title><body style="margin:0;background:#202020;display:flex;align-items:center;justify-content:center;min-height:100vh">${svg}</body>\n`, 'utf8')
const size = /width="(\d+)" height="(\d+)"/u.exec(svg)
console.log(`${name}: ${svg.length} bytes, ${size?.[1] ?? '?'}x${size?.[2] ?? '?'} -> ${join(out, `${name}.svg`)}`)

if (rest.includes('--png')) {
  const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(candidate => {
    try {
      readFileSync(candidate)
      return true
    } catch {
      return false
    }
  })
  if (chrome === undefined) {
    console.error('no Chrome or Edge found for --png')
    process.exit(1)
  }
  const png = join(out, `${name}.png`)
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${size?.[1] ?? 1280},${size?.[2] ?? 1024}`,
    `--screenshot=${png}`,
    `file:///${join(out, `${name}.html`).replaceAll('\\', '/')}`,
  ], { stdio: 'ignore' })
  console.log(`screenshot -> ${png}`)
}
