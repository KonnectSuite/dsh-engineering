import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeDxfText, decodeMText, normalizeLabel, singleLine, textWidthEm } from '../src/engine/text.ts'

test('decodeDxfText decodes the percent control codes', () => {
  assert.equal(decodeDxfText('45%%d'), '45°')
  assert.equal(decodeDxfText('%%p0.05'), '±0.05')
  assert.equal(decodeDxfText('%%c12'), 'Ø12')
  assert.equal(decodeDxfText('50%%%'), '50%')
  assert.equal(decodeDxfText('%%uUNDER%%u'), 'UNDER')
  assert.equal(decodeDxfText('%%oOVER%%o'), 'OVER')
  assert.equal(decodeDxfText('PLAIN'), 'PLAIN')
})

test('decodeDxfText keeps an unknown escape literal instead of dropping it', () => {
  assert.equal(decodeDxfText('100%%x200'), '100%%x200')
  assert.equal(decodeDxfText('trailing%%'), 'trailing%%')
})

test('decodeMText removes formatting and keeps the readable text', () => {
  assert.equal(decodeMText('first\\Psecond'), 'first\nsecond')
  assert.equal(decodeMText('{\\fArial|b1;bold} plain'), 'bold plain')
  assert.equal(decodeMText('a\\~b'), 'a b')
  assert.equal(decodeMText('a\\\\b'), 'a\\b')
  assert.equal(decodeMText('a\\{b\\}c'), 'a{b}c')
  assert.equal(decodeMText('\\H2.5x;tall'), 'tall')
  assert.equal(decodeMText('\\C1;red'), 'red')
  assert.equal(decodeMText('\\S1/2; inch'), '1/2 inch')
  assert.equal(decodeMText('\\S1^2;'), '1/2')
  assert.equal(decodeMText('\\A1;centered'), 'centered')
  assert.equal(decodeMText('{}'), '')
})

test('decodeMText then decodes percent codes inside the result', () => {
  assert.equal(decodeMText('\\P%%d'), '\n°')
})

test('normalizeLabel and singleLine normalise whitespace and trailing punctuation', () => {
  assert.equal(normalizeLabel('  SHEET   NUMBER: '), 'SHEET NUMBER')
  assert.equal(normalizeLabel('SHEET_NUMBER'), 'SHEET_NUMBER')
  assert.equal(singleLine('  a\n\tb  '), 'a b')
})

test('textWidthEm counts wide glyphs as one em', () => {
  assert.equal(textWidthEm('AB'), 1.2)
  assert.ok(Math.abs(textWidthEm('字') - 1) < 1e-9)
  assert.equal(textWidthEm(''), 0)
})
