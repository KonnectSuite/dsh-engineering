/** Print one HTML file to PDF with the same browser path a generated report uses. */

import { printPdf } from '../packages/l5x/src/engine/render-ladder.ts'

const [html, pdf] = process.argv.slice(2)
if (html === undefined || pdf === undefined) {
  console.error('usage: node --import tsx scripts/print-pdf.mts <input.html> <output.pdf>')
  process.exit(2)
}
if (!(await printPdf(html, pdf))) {
  console.error(`print-pdf: no Chrome or Edge found, so ${pdf} was not written; ${html} is the printable copy.`)
  process.exit(1)
}
console.log(`print-pdf: ${pdf}`)
