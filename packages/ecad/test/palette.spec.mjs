import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aciPaletteCss, aciToCss, aciToRgb, rgbToCss } from '../src/engine/palette.ts'

test('the fixed ACI entries match the AutoCAD palette', () => {
  assert.deepEqual(aciToRgb(1), [255, 0, 0])
  assert.deepEqual(aciToRgb(2), [255, 255, 0])
  assert.deepEqual(aciToRgb(3), [0, 255, 0])
  assert.deepEqual(aciToRgb(4), [0, 255, 255])
  assert.deepEqual(aciToRgb(5), [0, 0, 255])
  assert.deepEqual(aciToRgb(6), [255, 0, 255])
  assert.deepEqual(aciToRgb(7), [255, 255, 255])
  assert.deepEqual(aciToRgb(8), [128, 128, 128])
  assert.deepEqual(aciToRgb(9), [192, 192, 192])
})

test('the hue groups follow the 24 hues × 10 shades layout', () => {
  assert.deepEqual(aciToRgb(10), [255, 0, 0])
  assert.deepEqual(aciToRgb(11), [255, 127, 127])
  assert.deepEqual(aciToRgb(12), [165, 0, 0])
  assert.deepEqual(aciToRgb(13), [165, 82, 82])
  assert.deepEqual(aciToRgb(14), [127, 0, 0])
  assert.deepEqual(aciToRgb(16), [76, 0, 0])
  assert.deepEqual(aciToRgb(18), [38, 0, 0])
  assert.deepEqual(aciToRgb(20), [255, 63, 0])
  assert.deepEqual(aciToRgb(30), [255, 127, 0])
  assert.deepEqual(aciToRgb(40), [255, 191, 0])
  assert.deepEqual(aciToRgb(50), [255, 255, 0])
  assert.deepEqual(aciToRgb(130), [0, 255, 255])
  assert.deepEqual(aciToRgb(240), [255, 0, 63])
})

test('the grey tail and out-of-range clamping are defined', () => {
  assert.deepEqual(aciToRgb(250), [51, 51, 51])
  assert.deepEqual(aciToRgb(255), [255, 255, 255])
  assert.deepEqual(aciToRgb(256), [255, 255, 255])
  assert.deepEqual(aciToRgb(-5), [0, 0, 0])
  assert.deepEqual(aciToRgb(9999), [255, 255, 255])
  assert.equal(aciPaletteCss().length, 257)
})

test('ACI 7 flips to black on a light background and stays white on a dark one', () => {
  assert.equal(aciToCss(7, { lightBackground: true }), '#000000')
  assert.equal(aciToCss(7, { lightBackground: false }), '#FFFFFF')
  assert.equal(aciToCss(1, { lightBackground: true }), '#FF0000')
  assert.equal(aciToCss(5), '#0000FF')
  assert.equal(rgbToCss([18, 52, 86]), '#123456')
  assert.equal(rgbToCss([300, -1, 0]), '#FF0000')
})
