import { defineConfig } from 'vitest/config'

/**
 * The ftview suites write to real folders and a few rungs spawn a headless browser,
 * so a parallel run on a busy machine can push an individual test past the 5 s
 * default even when it is fast in isolation. The budget below is deliberately
 * generous: a genuine hang still fails, but file contention does not.
 */
export default defineConfig({
  test: {
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
