# Knowledge plane contract (v1)

This directory is a **source library**, not a workspace package: it has no
`package.json` and nothing imports it across package boundaries. Its single
source file is copied into each consuming product package by
`scripts/sync-knowledge-lib.mjs`, because the release rules forbid `workspace:`
specifiers and the tarball ships no `packages/` tree (see
`docs/decisions/knowledge-plane.md`).

## Layout

```
packages/knowledge/
  CONTRACT.md              this file
  src/core.ts              the whole v1 library (types, BM25, exact layer, docs tool factory)
  src/html.ts              help-page HTML -> readable text (product adapters may extend)

scripts/sync-knowledge-lib.mjs   copies src/*.ts into consumers; --check compares bytes
packages/<product>/knowledge/<collection>/index.json   committed index (metadata only)
packages/<product>/knowledge/<collection>/pages/*.md   committed authored bodies, if any
packages/<product>/src/docs.ts                         product adapter, exports the docs tool
packages/<product>/src/knowledge/core.ts               generated copy; never hand-edit
```

Runtime resolution is relative to the compiled file: `lib/docs.js` resolves
`new URL('../knowledge/', import.meta.url)` -> `packages/<product>/knowledge/` in
the repo and `vendor/<product>/knowledge/` in the tarball. `scripts/assemble.mjs`
must therefore copy the `knowledge` payload directory (it is added there).

## Licensing rule

- Vendor help pages are **never** chosen into `pages/*.md` at build time.
- Committed indexes carry identifiers/titles/sections and `path` only.
- `read` for an `installed-help` collection parses the locally installed help
  at call time. If the install is missing, the action returns
  `SOURCE_NOT_INSTALLED` with the searched roots and the fix.
- `authored` pages are our own words and ship.
- `status` must state the posture and the installed root it found (or null).

## Index schema (committed JSON)

```ts
interface KnowledgeIndex {
  schema: 1
  collection: string            // stable id, e.g. "l5x-help-37-05" or "migration-logix"
  title: string                 // human title
  source: 'authored' | 'installed-help'
  revisions: string[]           // revisions this collection applies to, e.g. ["37.05.00"]
  pageCount: number
  pages: KnowledgePageEntry[]
  aliases?: Record<string, string>   // identifier -> page id
}

interface KnowledgePageEntry {
  id: string                    // stable, description-shaped, unique within collection
  title: string
  section?: string
  path?: string                 // relative help path for installed-help collections
  body?: string                 // relative file under the collection dir, authored only, e.g. "pages/io.md"
  identifiers?: string[]        // exact lookup terms (instruction mnemonics, tag names, rule ids)
  revision?: string             // page-level override; default the collection revision
}
```

No timestamps, absolute paths, hostnames or build dates. Two clean builds from
the same inputs must produce byte-identical files (codepoint sorting, `\n`
endings, JSON.stringify with 2 spaces and a trailing newline).

## Tool surface (one docs tool per product)

Name: `l5x_docs`, `ftview_docs`, `migration_docs`, `plc5_docs`, `slc500_docs`.
Five actions, no others:

| action | args | returns |
|---|---|---|
| `contents` | `{ collection? }` | collections with title/pageCount/source/revisions/status, or that collection's section TOC |
| `search` | `{ query, collection?, revision?, limit? }` | `hits`: max 8, each `{id, title, collection, section?, score, snippet, revision?}` |
| `read` | `{ id, collection?, revision? }` | one page: `{id, title, collection, text, source, truncated}` max 8000 chars |
| `status` | `{}` | per-collection `{status: 'ready'|'index-only'|'absent', installedRoot: string|null, pageCount}` plus revisions |
| `lookup` | `{ term, collection? }` | exact identifier matches `{id, title, collection, identifiers, revisions}` |

Invalid action -> `INVALID_ACTION`; missing/unknown page -> `NOT_FOUND` with the
closest ids; empty query -> `QUERY_REQUIRED`; search always returns `hits` with
`total`, and a no-match answer is a successful empty result naming `contents`.
Every envelope is JSON: `{ ok: true, action, ... }` on success and
`{ ok: false, action, error: { code, message, fix } }` on failure.

### Revision semantics

- `search`/`lookup` accept a `revision`. Omitted revision must not silently use
  the newest shard: if the call has no revision and no project/revision
  argument, search covers the collections whose `revisions` is not a
  version-specific help shard (authored collections) and answers
  `REVISION_REQUIRED` only when the caller asked a version-specific collection.
- `read` of a page whose `revision` differs from the requested revision returns
  `INSTRUCTION_NOT_IN_REVISION` (not a silent 404).
- A page with no revision information returns `REVISION_UNVERIFIED` only on
  the explicit revision-check action of the product adapter; plain `read` is
  allowed and states `revision: null`.
- The product adapter decides which installed help root maps to which revision;
  the core never guesses a path.

## Retrieval (BM25 + exact layer)

- Tokenize: lowercase, ASCII alphanumerics plus `_`, split on everything else;
  keep tokens 2..64 chars; drop a 12-word stop list.
- Build term frequencies from `title` (weight 3), `identifiers` (weight 3),
  `section` (weight 2), body text when authored (weight 1). Installed-help
  indexes have no body text: search covers title/identifiers/section only.
- BM25: `k1 = 1.2`, `b = 0.75`, idf = `ln(1 + (N - df + 0.5)/(df + 0.5))`,
  4-decimal rounding for output scores; floor negative idf contributions at 0.
- Exact layer: a query token equal (case-insensitive) to any page identifier or
  alias always includes that page in the result and marks it `exact: true`.
  Exact hits are ranked with the BM25 hits by score, with an exact flag only as
  the tie-break; being exact does not outrank a better textual match. Ordering:
  score desc, then exact desc, then `id` codepoint asc.
- Scope floor: when an exact match exists the query answers; otherwise a search
  answers only when at least 3/5 of its distinct query tokens occur somewhere
  in the selected pages. Below that the query is out of scope for this corpus
  and the answer is the empty no-match envelope, not the weakest BM25 page
  (`MIN_MATCHED_TERM_FRACTION = 0.6`). This is what keeps a small authored
  corpus from answering questions about other products with five weak hits.
- Determinism: score desc, then exact flag, then `id` codepoint asc, stable
  across runs; snippets are the first match window, at most 200 chars,
  whitespace collapsed.
- HARD CAP: `limit` default 5, max 8, minimum 1.

## Runtime contract (v1)

`createDocsTool(config)` is pure and synchronous: it validates the config and
returns the tool definition without touching the filesystem, so a boot-time
entry or a tool-reference generator can call it. Corpus reads happen inside
`execute`, once per call, which keeps an answer equal to what is committed and
installed now.

The returned value is a normal harness `ToolDefinition`:

- `name`, `description`, `parameters` (JSON Schema, `required: ['action']`);
- `output.schema` is `{ type: 'object', additionalProperties: true }` and
  `output.render(args, value)` returns one text block holding
  `JSON.stringify(value, null, 2)`;
- `execute(args, exec)` -- **args is the first positional argument**, `exec` the
  second; the core ignores `exec`. It returns the envelope object itself
  (`{ ok: true, ... }` or `{ ok: false, ... }`), not a `{ content: [...] }`
  wrapper; the registry calls `output.render` on the returned value. `execute`
  never throws: every failure comes back as an envelope. There is no session
  state; two calls with the same corpus and arguments give identical JSON.

A node:test eval script can therefore drive the real tool with
`await tool.execute({ action: 'search', query: 'ton' }, {})`; the core exports
no separate search/read helper because `execute` is already the pure entry
point. `readKnowledgeIndex(directory)` and `tokenize(text)` are exported for
tests that need the loader or the tokenizer directly.

## Deviations from the v1 text above (recorded when the library landed)

These are deliberate additions the implementation makes; consumers and the
generated tool reference must match them.

1. `lookup` with no matching identifier returns `NOT_FOUND` with the closest
   identifiers in `error.candidates` (the successful-empty-result rule above is
   stated for `search` only; an exact lookup with no match is a failure).
2. An unexpected exception is caught and returned as
   `{ ok: false, action, error: { code: 'INTERNAL', message, fix } }` so a tool
   call never throws out of `execute`. `INTERNAL` is not one of the six
   contract codes and should not be generated deliberately.
3. Failure envelopes add `candidates` (closest names), `roots` (searched install
   roots) and `revisions` (recorded revisions) only when they carry a value;
   `SOURCE_NOT_INSTALLED` always carries `roots`, possibly `[]`.
4. The contract lists `REVISION_UNVERIFIED` only for an explicit revision-check
   action of a product adapter; v1 defines no such action, so the core never
   emits that code.
5. `read` trims the page text and truncates at 8000 characters with
   `truncated: true`. A read that names no revision reports
   `revision: null` when neither the page nor the call records one.
6. `read` of an installed-help page without a revision uses the page's own
   `revision`, else the collection's single revision; a collection with several
   revisions and a page with no override answers `REVISION_REQUIRED`.
7. When two collections carry the same page id, `read` prefers the candidate
   whose revision matches the requested revision instead of the first one.
8. A page id that exists but whose recorded authored `body` file is missing is
   `NOT_FOUND`, and the collection reports `index-only` in `status`. An authored
   page that records no body at all reads back as its title, section and
   identifiers.
9. `search` with a query that tokenizes to nothing (only stop words or one
   character) is `QUERY_REQUIRED`, not an empty success.
10. `contents` for one collection returns the collection summary plus `sections`
    grouped in first-appearance order; pages without a section group under
    `section: null`.
11. `status` resolves an installed-help root only when the collection records
    exactly one revision; with several it reports `installedRoot: null` until a
    version-specific call resolves one, because the core will not guess which
    version is installed.
12. `config.currentRevision()` may fill an omitted revision; a throwing adapter
    hook is treated as "no revision". A malformed or missing `index.json` makes
    the collection `absent` in `status` and excludes it from search and
    `contents` instead of failing the whole tool.

## Copy rule

`scripts/sync-knowledge-lib.mjs` copies `packages/knowledge/src/core.ts` and
`src/html.ts` to `<consumer>/src/knowledge/`. Consumers: `l5x`, `ftview`,
`migration`, `plc5`, `slc`. `--check` exits 1 listing stale copies with hashes.
A stale copy is a test failure (`test/knowledge-packaging.spec.mjs`, owned by the
Lead). Never edit a copied file; edit the source and run the sync script.

## Product adapter requirements

`packages/<product>/src/docs.ts` must:

1. import `{ createDocsTool }` from `./knowledge/core.js`;
2. export `export function docsTools(ctx: unknown): ToolDefinition[]` (or the
   package's established tool-factory style) returning exactly one tool;
3. pass `collections` with `root: '<collection-id>'` relative to the package's
   `knowledge/` dir;
4. pass `installedResolver`/`readInstalledPage` when the collection maps to a
   vendor help install; the resolver returns `null` (never a guessed path) when
   the install is absent;
5. keep all user-facing copy in English and in the product's established fix
   style; no emoji, no placeholders like `<todo>`.

The Lead wires the tool into `entries/<product>.js`, `components.json`,
`scripts/gen-tool-reference.ts` and the README tables; teammates must NOT edit
those root files.
