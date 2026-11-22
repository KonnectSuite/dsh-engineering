# The knowledge plane

Every product that has a documentation surface answers from the same small
retrieval core. This page is the shared contract: what a collection is, what the
five actions do, and what a caller can rely on. Product pages own their
collections and their help sources.

## One source, many compiled copies

`packages/knowledge/` is a source library with no `package.json`. Its
`src/core.ts` and `src/html.ts` are copied into each consuming package at
`packages/<product>/src/knowledge/` by
`scripts/sync-knowledge-lib.mjs`; `--check` compares the copies byte for byte and
fails when one is stale. The decision and its packaging reasons are recorded in
[the knowledge-plane ADR](../decisions/knowledge-plane.md).

## Collections

A collection is a directory under `packages/<product>/knowledge/<collection>/`
with an `index.json` and, for authored collections, `pages/*.md`:

```
packages/l5x/knowledge/instructions-37/index.json
packages/l5x/knowledge/instructions-37/pages/...
```

`index.json` carries `schema: 1`, the collection id and title, its `source`
(`authored` or `installed-help`), the hardware revisions it covers, a page
count, its pages and aliases. A page entry records `id`, `title`, `section`,
`path`, `body` (authored only), `identifiers` and `revision`.

Two provenances, two shipping postures:

- **authored** — written for the bundle, shipped inside the tarball. The body
  travels with the index and `read` answers from it.
- **installed-help** — a structural index of the help that ships with the
  vendor software on this machine. Only identifiers, titles, sections and
  relative paths are committed; `read` parses the installed help page at call
  time and never copies vendor prose into the repository or tarball. When the
  installation is absent, the answer is `SOURCE_NOT_INSTALLED` with a fix.

## The five actions

Every documentation tool (`l5x_docs`, `ftview_docs`, `migration_docs`,
`plc5_docs`, `slc500_docs`) takes an `action` and answers with one envelope:

| Action | Answers |
|---|---|
| `contents` | the collections and their table of contents; no query needed |
| `search` | up to 8 hits (`limit`, default 5) for a query, each with page id, title, section, collection, revision and a snippet |
| `read` | exactly one page, by id, at most 8,000 characters |
| `status` | per-collection readiness (`ready`, `index-only`, `absent`), page counts, revisions and the detected `installedRoot` |
| `lookup` | exact identifier or alias matches, first; used for instruction mnemonics, tags, error codes |

Success is `{ ok: true, action, ... }`. Failure is
`{ ok: false, action, error: { code, message, fix } }` with one of
`INVALID_ACTION`, `QUERY_REQUIRED`, `NOT_FOUND`, `SOURCE_NOT_INSTALLED`,
`REVISION_REQUIRED` or `INSTRUCTION_NOT_IN_REVISION`.

## What search guarantees

- Ordering is **deterministic**: score descending, then exact flag, then page id
  in code-point order. Scores are rounded to four decimals.
- The exact layer always includes an identifier or alias that matches the query
  verbatim and marks it `exact: true`; it ranks with the other hits by score, so
  a page that is genuinely about the question is not pushed behind a wide hub
  page that merely carries the same word as an identifier.
- A query that matches fewer than 3/5 of its own terms anywhere in the selected
  pages is treated as out of scope: `search` answers with the empty no-match
  envelope and points at `contents`, rather than returning five weak BM25 hits.
- Ranking is BM25 (`k1 = 1.2`, `b = 0.75`) with title and identifier matches
  weighted above section, and section above body.
- Snippets are at most 200 characters; `search` never returns page bodies.
- No clock, no randomness, no absolute path: running the generator twice
  produces byte-identical indexes.

## Revision awareness

L5X collections are revision-specific. A caller that asks a revision-sensitive
question without naming a revision gets `REVISION_REQUIRED`; a caller that asks
for an instruction outside the named revision gets
`INSTRUCTION_NOT_IN_REVISION`. An installation that cannot be read never blocks
an offline edit: the guard warns and continues, and only the documentation
answer degrades.

## Licensing posture

Authored pages are MIT-licensed original text. Installed-help indexes contain
vendor identifiers and TOC metadata only; page bodies are read from the local
installation and are never redistributed. Third-party notices are updated in
the same change whenever a source is added.
