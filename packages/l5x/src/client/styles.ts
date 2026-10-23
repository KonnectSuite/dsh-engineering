/**
 * Console styles, injected once per document.
 *
 * The browser half is built standalone, so it carries its own stylesheet instead
 * of going through the harness monorepo's CSS-modules pipeline:
 * {@link installStyles} adds one `data-plugin-css` tag the way the harness preset
 * does for every other client plugin, which keeps these styles owned,
 * inspectable and removable on the same terms. Every value comes from the shell's
 * theme tokens, so the console follows the active theme and needs no light/dark
 * pair of its own.
 */

/** Class names used by the console. */
export const classes = {
  page: 'l5x-page',
  header: 'l5x-header',
  heading: 'l5x-heading',
  toolbar: 'l5x-toolbar',
  select: 'l5x-select',
  action: 'l5x-action',
  section: 'l5x-section',
  list: 'l5x-list',
  group: 'l5x-group',
  groupName: 'l5x-group-name',
  row: 'l5x-row',
  rowMain: 'l5x-row-main',
  rowName: 'l5x-row-name',
  rowMeta: 'l5x-row-meta',
  rowActions: 'l5x-row-actions',
  empty: 'l5x-empty',
  status: 'l5x-status',
  error: 'l5x-error',
  summary: 'l5x-summary',
  filter: 'l5x-filter',
} as const

/** Stable style-tag identity for this package, also used to detect a second install. */
const STYLE_TAG_ID = 'dsh-tool-l5x/studio5000.css'

const css = `
.${classes.page}{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);overflow:hidden}
.${classes.header}{flex:none;display:flex;align-items:center;gap:8px;height:42px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l3)}
.${classes.heading}{color:var(--dsw-alias-label-primary);font-weight:600}
.${classes.summary}{padding:8px 12px;color:var(--dsw-alias-label-secondary);font-size:12px}
.${classes.summary} p{margin:4px 0;overflow-wrap:anywhere}
.${classes.filter}{box-sizing:border-box;width:100%;max-width:520px;margin-top:8px;padding:8px;border:1px solid var(--dsw-alias-border-l3);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit}
.${classes.action}:focus-visible,.${classes.select}:focus-visible,.${classes.filter}:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:2px}
.${classes.toolbar}{margin-left:auto;display:flex;align-items:center;gap:6px}
.${classes.select}{max-width:280px;height:26px;border-radius:6px;border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
.${classes.action}{height:26px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
.${classes.action}:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.${classes.action}:disabled{opacity:.4;cursor:default}
.${classes.section}{flex:none;padding:10px 12px 2px;color:var(--dsw-alias-label-secondary);font-size:11px;letter-spacing:.04em;text-transform:uppercase}
.${classes.list}{flex:1;min-height:0;overflow:auto;padding:0 6px 12px}
.${classes.group}{padding-top:6px}
.${classes.groupName}{padding:4px 6px 2px;color:var(--dsw-alias-label-secondary);font-size:11px}
.${classes.row}{display:flex;align-items:center;gap:10px;padding:6px;border-radius:8px}
.${classes.row}:hover{background:var(--dsw-alias-interactive-bg-hover)}
.${classes.rowMain}{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.${classes.rowName}{color:var(--dsw-alias-label-primary);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${classes.rowMeta}{color:var(--dsw-alias-label-secondary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${classes.rowActions}{flex:none;display:flex;align-items:center;gap:4px}
.${classes.empty}{padding:18px 12px;color:var(--dsw-alias-label-secondary)}
.${classes.status}{flex:none;padding:6px 12px;color:var(--dsw-alias-label-secondary);font-size:12px}
.${classes.error}{color:var(--dsw-alias-state-error-primary)}
`

/**
 * Add this console's stylesheet to the document, once.
 *
 * Called at bundle materialization: every module-scope side effect of a client
 * bundle runs when its factory is first materialized, not at script execution.
 */
export function installStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-tool-l5x'
  tag.dataset.pluginCss = STYLE_TAG_ID
  tag.textContent = css
  document.head.appendChild(tag)
}
