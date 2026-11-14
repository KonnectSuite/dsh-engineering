/**
 * The row entries are schemastery schemas, and schemastery has no `enum`.
 *
 * A `z.enum(...)` in `entries/optix.js` passed every test in this repository — the suites read
 * `packages/**`, not the entry that turns the row on — and the packaged bundle then failed to mount
 * with "z.enum is not a function", taking the whole Optix row with it. This test is cheap and it
 * reads the files the host actually imports.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const entries = fileURLToPath(new URL('../entries/', import.meta.url))
const files = readdirSync(entries).filter((name) => name.endsWith('.js'))

test('no entry asks schemastery for an API it does not have', () => {
	assert.ok(files.length > 0, 'the entries folder is empty')
	for (const name of files) {
		const text = readFileSync(entries + name, 'utf8')
		// The comment in entries/optix.js names the defect in prose; only a call is a defect.
		const calls = text.match(/\bz\.enum\s*\(/gu)
		assert.equal(calls === null ? 0 : calls.length, 0, name + ' calls z.enum; use z.union([z.const(...)])')
	}
})

test('the optix entry declares the preview switches with a union of consts', () => {
	const text = readFileSync(entries + 'optix.js', 'utf8')
	assert.match(text, /browser: z\.union\(\[z\.const\('attach'\), z\.const\('launch'\)\]\)/u)
	assert.match(text, /browserChannel: z\.union\(\[z\.const\('auto'\), z\.const\('chrome'\), z\.const\('msedge'\)\]\)/u)
})
