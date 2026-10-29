import { readFileSync, writeFileSync } from 'node:fs'

const path = 'packages/ftview/SKILL.md'
let text = readFileSync(path, 'utf8')

const oldChecks = '`Gfx-ME*.xsd` and lists findings, including `DRAFT_OVERLAP` when this draft places an object partly\n  over a neighbour.'
const newChecks = '`Gfx-ME*.xsd` and lists findings, including `DRAFT_OVERLAP` for overlapping placements.'
const oldRender = '- `ftview_render` draws a display to SVG and, when Chrome or Edge exists, PNG: look before importing.'
const newRender = '- `ftview_render` draws a display to SVG and, when Chrome or Edge exists, PNG: look before importing.\n  Pass `source: "draft"` to see staged edits before `ftview_apply`.'

if (!text.includes(oldChecks)) throw new Error('checks line not found')
if (!text.includes(oldRender)) throw new Error('render line not found')
text = text.replace(oldChecks, newChecks).replace(oldRender, newRender)
writeFileSync(path, text, 'utf8')

const body = text.replace(/^---[\s\S]*?---\n/u, '')
console.log('body chars', body.length)
