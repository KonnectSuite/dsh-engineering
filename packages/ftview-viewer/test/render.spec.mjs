import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { renderDisplay, parseXml } from '../src/index.ts'

const DISPLAY = `<?xml version="1.0"?>
<display width="800" height="600" backColor="#C6C6C6">
  <objects>
    <panel name="Header" left="0" top="0" width="800" height="60" backColor="#002952" borderStyle="none"/>
    <text name="Title" left="20" top="10" width="400" height="40" caption="Line overview" fontFamily="Arial" fontSize="20" bold="true">
      <caption caption="Line overview" fontFamily="Arial" fontSize="20" bold="true" color="white" alignment="middleLeft"/>
    </text>
    <group name="G" left="100" top="100">
      <momentaryButton name="Start" left="0" top="0" width="120" height="50" backStyle="solid" borderStyle="raised" borderWidth="2" currentStateId="0">
        <states>
          <state stateId="0" backColor="#B0B0B0" borderColor="silver">
            <caption caption="Start" fontFamily="Arial" fontSize="12" color="black" alignment="middleCenter"/>
          </state>
        </states>
      </momentaryButton>
    </group>
    <numericDisplay name="Speed" left="300" top="200" width="120" height="30" expression="LineSpeed" backColor="white" borderStyle="solid"/>
    <image name="Logo" left="600" top="500" width="100" height="50" imageName="logo.bmp"/>
  </objects>
</display>`

test('parses the display tree', () => {
  const display = parseXml(DISPLAY)
  assert.equal(display.tag, 'display')
  assert.equal(display.attributes.width, '800')
  const objects = display.children.find(child => child.tag === 'objects')
  assert.ok(objects)
  assert.equal(objects.children.length, 5)
})

test('renders background, captions, groups and state colours', () => {
  const svg = renderDisplay(DISPLAY)
  assert.match(svg, /^<svg xmlns=/u)
  assert.match(svg, /viewBox="0 0 800 600"/u)
  assert.match(svg, /fill="#c6c6c6"/u)
  assert.match(svg, />Line overview</u)
  assert.match(svg, />Start</u)
  assert.match(svg, /fill="#b0b0b0"/u)
  assert.match(svg, /translate\(100,100\)/u)
})

test('draws an image from the export by default and a placeholder when it cannot resolve', () => {
  const svg = renderDisplay(DISPLAY)
  assert.match(svg, /<image [^>]*href="Images\/logo\.bmp"/u)
  const placeholder = renderDisplay(DISPLAY, { imageHref: () => undefined })
  assert.match(placeholder, /image logo\.bmp/u)
  const withHref = renderDisplay(DISPLAY, { imageHref: name => `data:image/bmp;base64,${name}` })
  assert.match(withHref, /<image [^>]*href="data:image\/bmp;base64,logo\.bmp"/u)
})

test('renders a tag value instead of the placeholder', () => {
  const svg = renderDisplay(DISPLAY, { tagValues: { LineSpeed: 42.5 } })
  assert.match(svg, />42\.5</u)
})

test('renders the real Laminator display when the export is present', () => {
  const file = 'C:/Users/Admin/AppData/Local/Temp/ftvx_laminator_v2_20261027/Displays/Main Screen.xml'
  if (!existsSync(file)) return
  const svg = renderDisplay(readFileSync(file, 'utf8'))
  assert.ok(svg.length > 5000, `expected a populated SVG, got ${svg.length} bytes`)
  assert.ok(svg.includes('</svg>'))
  const captions = svg.match(/<text /gu)?.length ?? 0
  assert.ok(captions > 10, `expected captions, got ${captions}`)
})
