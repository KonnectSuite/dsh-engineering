/**
 * Probe one instruction's real DOM and computed style, to explain a paint
 * artefact (doubled label) that a screenshot alone cannot attribute.
 */
import { renderLadderFace } from './harness.mjs'

const result = await renderLadderFace({
  file: process.argv[2],
  routine: process.argv[3],
  shot: '.harness/shots/probe.png',
  probe: () => {
    const buttons = [...document.querySelectorAll('[data-l5x-instruction]')]
    const target = buttons.find(button => (button.textContent ?? '').includes('HeartbeatPulse'))
    if (target === undefined) return { error: 'no matching instruction' }
    const label = target.querySelector('[data-l5x-tag-name]')
    const style = label === null ? undefined : getComputedStyle(label)
    const box = label?.getBoundingClientRect()
    return {
      html: target.outerHTML.slice(0, 1400),
      children: [...target.children].map(child => ({
        className: child.className,
        display: getComputedStyle(child).display,
        rect: (({ x, y, width, height }) => ({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }))(child.getBoundingClientRect()),
      })),
      labelText: label?.textContent,
      labelBox: box === undefined ? null : { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
      labelStyle: style === undefined ? null : {
        fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
        lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, textShadow: style.textShadow,
        webkitTextStroke: style.webkitTextStroke,
      },
      hovered: target.matches(':hover'),
      mouse: document.querySelectorAll(':hover').length,
    }
  },
})
console.log(JSON.stringify(result.probe, undefined, 1))
