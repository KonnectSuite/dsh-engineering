/**
 * The FactoryTalk Optix product row.
 *
 * The Optix engine ships prebuilt. This entry owns the row's configuration so
 * the Plugins page can render it, resolves the volatile references the settings
 * page writes, and hands the prebuilt plugin a plain options object.
 *
 * Authoring ships on by default. The prebuilt plugin registers the tools, and
 * each capability can be switched off from the row's config form.
 */
import z from '@deepseek-ai/schemastery'
import { dirname, join } from 'node:path'
import * as optix from '../vendor/optix/lib/index.js'
import * as netlogic from './netlogic.js'
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
  allowWrites: z.boolean().default(true).volatile().description(
    'Live authoring through optix_edit and optix_action. Dry-run validation works without it.',
  ),
  allowDestructive: z.boolean().default(true).volatile().description(
    'Delete, move, reorder, retype, replace and convert operations.',
  ),
  allowInvoke: z.boolean().default(true).volatile().description(
    'Invoke exported methods on a session-safe bridge build.',
  ),
  preview: z.boolean().default(true).volatile().description(
    'Register the preview, screenshot and OCR tools. The plugin starts its own browser unless you set browser to attach.',
  ),
  browser: z.enum(['attach', 'launch']).default('launch').volatile().description(
    'launch starts a Chrome or Edge for the preview itself; attach connects to a browser you started with --remote-debugging-port.',
  ),
  browserChannel: z.enum(['auto', 'chrome', 'msedge']).default('auto').volatile().description(
    'Which installed browser to start in launch mode. auto tries Chrome then Edge.',
  ),
  browserPath: z.string().default('').volatile().description(
    'Full path to a browser executable, for a install that is not in the usual location. Empty uses browserChannel.',
  ),
  browserHeadless: z.boolean().default(false).volatile().description(
    'Start the preview browser without a window. Leave off so the engineer can watch the emulator being read.',
  ),
  cdpUrl: z.string().default('http://127.0.0.1:9223').volatile().description(
    'Chromium DevTools endpoint, used only when browser is attach.',
  ),
  previewUrl: z.string().default('http://127.0.0.1:8081/').volatile().description(
    'Already-open emulator tab, matched by exact origin, path and query.',
  ),
  allowPreviewInput: z.boolean().default(true).volatile().description(
    'Pointer and keyboard input into the emulator preview. Input can change runtime values.',
  ),
  ocrExecutable: z.string().default('').volatile().description(
    'Full path to tesseract.exe for optix_ocr. Leave empty to keep OCR unregistered.',
  ),
  ocrLanguage: z.string().default('eng').volatile().description(
    'Tesseract language code or + separated list, for example eng or eng+deu.',
  ),
  ocrTessdataDirectory: z.string().default('').volatile().description(
    'Folder holding the .traineddata files. Empty derives tessdata beside tesseract.exe.',
  ),
  netlogic: z.boolean().default(true).volatile().description(
    'Register the pinned NetLogic cheat-sheet reader (optix_netlogic) and the FactoryTalk Optix skill. Off removes one tool and its guidance.',
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
  const options = () => {
    const ocrExecutable = text(config.ocrExecutable)
    return {
      bridgeUrls: list(config.bridgeUrls),
      bridgeToken: text(config.bridgeToken),
      allowWrites: flag(config.allowWrites),
      allowDestructive: flag(config.allowDestructive),
      allowInvoke: flag(config.allowInvoke),
      preview: flag(config.preview),
      browser: text(config.browser) || 'launch',
      browserChannel: text(config.browserChannel) || 'auto',
      browserPath: text(config.browserPath),
      browserHeadless: flag(config.browserHeadless),
      cdpUrl: text(config.cdpUrl) || 'http://127.0.0.1:9223',
      previewUrl: text(config.previewUrl) || 'http://127.0.0.1:8081/',
      allowPreviewInput: flag(config.allowPreviewInput),
      ocr: ocrExecutable === '' ? null : {
        executable: ocrExecutable,
        language: text(config.ocrLanguage, 'eng'),
        tessdataDirectory: text(config.ocrTessdataDirectory) || join(dirname(ocrExecutable), 'tessdata'),
      },
      requestTimeoutMs: config.requestTimeoutMs ?? 20000,
      maxResponseBytes: config.maxResponseBytes ?? 2000000,
      maxBatchOps: config.maxBatchOps ?? 40,
      maxMapNodes: config.maxMapNodes ?? 800,
      maxMapDepth: config.maxMapDepth ?? 8,
      maxPreviewPixels: config.maxPreviewPixels ?? 8000000,
    }
  }
  let mounted
  let netlogicMounted
  // Volatile-only config changes are committed into the live references and
  // emit `loader/volatile-update` instead of re-running apply(). The prebuilt
  // plugin reads its options once, so remount it to pick up a switch change.
  const sync = () => {
    if (mounted !== undefined) void mounted.dispose()
    mounted = ctx.plugin(optix, options())
    // The NetLogic reader is this repository's own entry: it is a separate plugin
    // so the row's `netlogic` switch can drop one tool and its guidance without
    // touching the prebuilt engine.
    if (netlogicMounted !== undefined) {
      void netlogicMounted.dispose()
      netlogicMounted = undefined
    }
    if (flag(config.netlogic)) netlogicMounted = ctx.plugin(netlogic)
  }
  sync()
  ctx.on('loader/volatile-update', sync)
}
