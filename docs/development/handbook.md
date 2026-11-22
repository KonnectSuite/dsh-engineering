# The engineering handbook

`docs/handbook/engineering-handbook.{html,docx,pdf}` is generated from the
Markdown pages in `docs/handbook/src/`. The Markdown is the only content model:
there is no Python section list to edit, no second outline to keep in step.
Never hand-edit the built artifacts; edit a page and rebuild.

## Source pages

Each page is one `*.md` file with front matter:

```markdown
---
title: What this bundle is
order: 10
purpose: Explain what the bundle adds and how rows and components fit together.
audience: Readers new to the bundle
---

## A section

Body text with **bold**, `code`, lists, fenced code and pipe tables.
```

- `title` is the page heading in every format and the table-of-contents label.
- `order` is a positive integer; it must be unique, and the files are presented
  in that order. Leave gaps (10, 20, 30 …) so a page can be inserted later
  without renumbering the set.
- `purpose` is the one-line statement shown under the heading.
- `audience` says who the page is for; it does not have to be unique.
- The body uses a small Markdown subset: `##`–`####` headings, paragraphs,
  bullet and numbered lists, fenced code, pipe tables, **bold** and `code`.
  HTML, images and nested lists are not part of the model.

The pages are written in our own words and describe what the repository does
now. Do not paste vendor manual text; link the product page or the documentation
tool instead. State unverified behaviour as unverified, and never invent a
measurement. The product pages, `docs/capabilities.md`, the research files and
the tool reference are the sources of record.

## Building

```sh
pnpm docs:handbook          # python scripts/gen-handbook.py — all three formats
python scripts/gen-handbook.py --formats html,docx   # PDF needs a browser
python scripts/gen-handbook.py --out-dir /tmp/handbook   # render somewhere else
python scripts/gen-handbook.py --check      # fail when sources or artifacts drifted
```

The generator needs Python 3.9+ and `python-docx` for the DOCX; the HTML format
alone works without `python-docx`. The PDF is rendered by
`scripts/print-pdf.mts`, which needs Chrome or Edge on the host. If the browser
cannot start (for example in a locked-down sandbox), the generator says so and
still writes the HTML and DOCX; print the HTML from a desktop browser or rerun
the build on a host where headless Chrome/Edge can start.

`--check` validates the front matter and orders, requires all three artifacts,
and fails when the HTML `handbook-source-hash` meta tag or the DOCX
`source-hash:` keyword disagrees with the current Markdown, or when the PDF is
older than the newest source page. It is cheap: wire it into the docs gate when
the handbook is part of a release.

The HTML and DOCX are deterministic: the source hash is stable and the DOCX core
properties use a fixed epoch, so two builds of unchanged Markdown produce the
same bytes. The PDF depends on the browser and is not byte-compared.

## Adding or changing a page

1. Add `docs/handbook/src/NN-slug.md` with the front matter above.
2. Write the page from the current repository facts; name the product page or
   tool the reader should use next.
3. Run `pnpm docs:handbook`, then `python scripts/gen-handbook.py --check`.
4. Run `node --import tsx --test test/handbook.spec.mjs`; the spec checks front
   matter, order, required coverage, artifacts and determinism.

The handbook is part of the package documentation surface: when a product page
changes a fact the handbook states (a count, an install requirement, a known
gap), update the handbook page in the same change.
