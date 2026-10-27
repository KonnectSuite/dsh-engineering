/**
 * The FactoryTalk Optix product row.
 *
 * The Optix engine ships prebuilt. This entry owns the row's configuration so
 * the Plugins page can render it, resolves the volatile references the settings
 * page writes, and hands the prebuilt plugin a plain options object.
 *
 * Live authoring is off by default: the prebuilt plugin registers the read
 * tools either way, but every write is refused until `allowWrites` is on.
 */
import z from '@deepseek-ai/schemastery'
import * as optix from '../vendor/optix/lib/index.js'
import { flag, list, text } from './config.js'

export const name = 'engineering-optix'
export const inject = ['tools']

export const Config = z.object({
  bridgeUrls: z.array(z.string()).default(['http://127.0.0.1:8768']).volatile().description(
    'Loopback origins of the Studio bridge. One per entry; the bridge runs inside FactoryTalk Optix Studio.',
  ),
  bridgeToken: z.string().default('').volatile().description(
    'Bearer token configured on the Studio bridge, if it requires one.',
  ),
  allowWrites: z.boolean().default(false).volatile().description(
    'Live authoring through optix_edit and optix_action. Dry-run validation works without it.',
  ),
  allowDestructive: z.boolean().default(false).volatile().description(
    'Delete, move, reorder, retype, replace and convert operations.',
  ),
  allowInvoke: z.boolean().default(false).volatile().description(
    'Invoke exported methods on a session-safe bridge build.',
  ),
  preview: z.boolean().default(false).volatile().description(
    'Register the direct-CDP preview and screenshot tools. Needs the emulator browser open.',
  ),
  cdpUrl: z.string().default('http://127.0.0.1:9223').volatile().description(
    'Chromium DevTools endpoint used only when preview is on.',
  ),
  previewUrl: z.string().default('http://127.0.0.1:8081/').volatile().description(
    'Already-open emulator tab, matched by exact origin, path and query.',
  ),
  allowPreviewInput: z.boolean().default(false).volatile().description(
    'Pointer and keyboard input into the emulator preview. Input can change runtime values.',
  ),
  requestTimeoutMs: z.natural().min(1).max(2147483647).default(20000),
  maxResponseBytes: z.natural().min(1).default(2000000),
  maxBatchOps: z.natural().min(1).default(40),
  maxMapNodes: z.natural().min(1).default(800),
  maxMapDepth: z.natural().min(1).default(8),
  maxPreviewPixels: z.natural().min(1).default(8000000),
})

/**
 * Mount the Optix surface with resolved, plain options.
 * @param ctx - plugin context.
 * @param config - the Studio bridge, authoring gates and preview settings.
 */
export function apply(ctx, config = {}) {
  const options = () => ({
    bridgeUrls: list(config.bridgeUrls),
    bridgeToken: text(config.bridgeToken),
    allowWrites: flag(config.allowWrites),
    allowDestructive: flag(config.allowDestructive),
    allowInvoke: flag(config.allowInvoke),
    preview: flag(config.preview),
    cdpUrl: text(config.cdpUrl, 'http://127.0.0.1:9223'),
    previewUrl: text(config.previewUrl, 'http://127.0.0.1:8081/'),
    allowPreviewInput: flag(config.allowPreviewInput),
    requestTimeoutMs: config.requestTimeoutMs ?? 20000,
    maxResponseBytes: config.maxResponseBytes ?? 2000000,
    maxBatchOps: config.maxBatchOps ?? 40,
    maxMapNodes: config.maxMapNodes ?? 800,
    maxMapDepth: config.maxMapDepth ?? 8,
    maxPreviewPixels: config.maxPreviewPixels ?? 8000000,
  })
  let mounted
  // Volatile-only config changes are committed into the live references and
  // emit `loader/volatile-update` instead of re-running apply(). The prebuilt
  // plugin reads its options once, so remount it to pick up a switch change.
  const sync = () => {
    if (mounted !== undefined) void mounted.dispose()
    mounted = ctx.plugin(optix, options())
  }
  sync()
  ctx.on('loader/volatile-update', sync)
}
