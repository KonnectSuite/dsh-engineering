# FactoryTalk Optix NetLogic: how this bundle should carry the cheat sheet

Source: <https://github.com/FactoryTalk-Optix/NetLogic_CheatSheet> (Rockwell-maintained, ~45
markdown pages of C# NetLogic snippets). It is a reference collection, not a library: the repository
states that snippets may use non-public APIs, may break a project, and must not be used in production
as-is. Anything this bundle serves from it must say that.

## Decision

**Vendor a pinned snapshot and expose it as retrieval, not as a prompt dump.** Add one Optix tool,
`optix_netlogic`, that searches the snapshot by topic, keyword or symbol and returns the exact page
markdown (code blocks included) with its provenance. Add a short Optix skill that tells the model when
to call it.

Why not the offered GitMCP server: it is an external, unversioned service, it needs network access on
an offline engineering machine, it adds a second MCP surface to every profile, and its content can
change under a fixed tool description. A vendored snapshot is reproducible, diffable, testable, and
costs nothing until the model asks for one page.

## Layout

```
packages/optix/netlogic/
  index.json                 generated: one row per page
  pages/<slug>.md            verbatim upstream markdown, with its relative links rewritten to slugs
  SOURCE.json                { repository, commit, fetched_at, page_count }
scripts/sync-netlogic.mjs    the only writer of that tree
```

`index.json` rows:

```json
{
  "slug": "netlogic-lifecycle",
  "title": "NetLogic Lifecycle",
  "section": "Introduction",
  "topics": ["start", "stop", "lifecycle", "OnStart", "OnStop"],
  "symbols": ["OnStart", "OnStop", "OnSessionStart"],
  "risk": "normal",
  "bytes": 4213,
  "source_path": "pages/netlogic-lifecycle.md"
}
```

`risk` is `normal`, `advanced` or `unsupported`, copied from the upstream section headings
("Advanced" pages are marked unsupported by the repository itself). The tool returns the flag with the
text so a caller cannot present an unsupported snippet as documented behavior.

## The tool

```
optix_netlogic({ query?: string, slug?: string, limit?: number })
```

- no arguments: the table of contents (slug, title, section, risk, topics) — one cheap call;
- `query`: scored search over title, topics and symbols (exact symbol match first, then prefix, then
  body text); returns up to `limit` hits with a one-line reason each, not whole pages;
- `slug`: the full page, verbatim, plus `risk`, `source_path`, the upstream commit and the disclaimer.

Token budget: TOC under ~1.5k, one page typically 2–6k. The tool never returns more than one page, so
a request cannot quietly add 200k of C# to the conversation.

Result envelope (same contract as every other tool):

```
summary   "Read pages/sessions.md (normal) from the pinned NetLogic snapshot."
data      { slug, risk, commit, source_url, markdown, code_blocks: n }
coverage  { complete: false, unverified: [ "C# compiles against your Optix version", "snippet is safe for your project" ] }
next      [ optix_validate_expression | optix_read | the Studio steps ]
```

## Sync pipeline

`scripts/sync-netlogic.mjs`:

1. Resolves a commit (default: the repository's `main` HEAD, or `--commit <sha>`).
2. Downloads the tarball for that commit, refuses anything that is not the expected repository.
3. Copies `pages/*.md` into `packages/optix/netlogic/pages/`, rewriting intra-repo links to slugs.
4. Builds `index.json` from titles, section headings (the README's structure), `#`/`##` headings and
   backticked identifiers (the symbols a caller is likely to search for).
5. Writes `SOURCE.json` with the commit and `fetched_at`, so the shipped snapshot is always traceable.
6. Fails when a page is empty or a slug collides.

The same module also carries two hand-written starter templates in
`packages/optix/lib/netlogic.js` (`TEMPLATES = ["blank", "periodic", "observer", "nav", "login"]`).
They are not upstream pages: each one is the measured Rockwell idiom, reduced to the smallest class
that still shows it.

| Template | Shape | Source of the idiom |
|---|---|---|
| `nav` | runtime class bound **inside** a `PanelLoader`; caches `Owner as PanelLoader` in `Start()`, exports `Open(string screenPath)` which resolves `Project.Current.Get<ScreenType>(screenPath)` and calls `loader.ChangePanel(screen)` | `Optix_Sample_PanelLoaderChangePanelNetLogic`, `Optix_Template_NavigationButtons` |
| `login` | runtime class exporting `PerformLogin(string username, string password, out bool loginResult)`; reads the `Users` alias, calls `user.PasswordVariable.RemoteRead()` then `Session.ChangeUser(username, password)` | `Optix_Template_NavigationButtons` `LoginButtonLogic.cs` |

Both are `runtime` only (a design-time class is a set of `[ExportMethod]` helpers and does not own
background work), both pass `optix_script review` with zero critical findings, and neither contains an
absolute `/Objects/` path — the loader comes from `Owner`, the users from an alias, so a rename does
not break them.

The snapshot is committed, so the bundle never fetches at runtime. `pnpm netlogic:sync` refreshes it;
the release notes record the commit.

## Tests

- `index.json` covers every file in `pages/` and no file that is absent (generated-tree test).
- every `slug` resolves to a readable page, and every page has a non-empty title and at least one
  topic.
- `risk` is one of the three values; "Advanced" upstream pages are not `normal`.
- the tool returns the TOC with no arguments, one page for `slug`, and no more than `limit` hits for a
  query; a query with no hits returns an empty list and a suggestion, not an error.
- the disclaimer is present in every page result.

## Rollout for 0.5.0

1. `scripts/sync-netlogic.mjs` + the committed snapshot (one release, ~1 MB of markdown).
2. `optix_netlogic` in the Optix row, gated by the existing `preview`-style config (`netlogic: true`),
   mounted through the row so a read-only profile can drop it.
3. A short `packages/optix/SKILL.md` (the product has none today) that names the tool for NetLogic
   work, states the risk rule, and keeps the existing authoring tools as the write path.
4. `docs/reference/tools.md` regenerated; README tool count and the Optix row updated in the same
   change.

## What this does not do

It does not compile C#, does not deploy NetLogic into a project, and does not verify that a snippet
runs on the installed Optix version. Those stay human/Studio steps, and every result says so.
