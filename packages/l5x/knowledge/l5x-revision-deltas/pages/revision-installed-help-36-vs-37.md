Both installed help trees document the same product, but they are built by different toolchains and their structure differs. These are the measured differences, and they are why the two installed-help indexes are committed separately instead of merged:

v36.00.00 help (flat topic help):

- 6,581 topic records, one flat .htm page per record, no subdirectories for topics.
- A JSON search index (search.json) holding each page's title, url and body text; the body text is deliberately not copied into the committed index.
- A JSON table of contents (toc.json) whose ancestry gives each page its section. Instruction pages sit under "Instruction Set", then a family label such as "Compute/Math Instructions".
- 618 instruction entries with an instruction title, covering 299 distinct mnemonics under 39 family labels.

v37.05.00 help (DITA-produced help):

- 5,493 topic pages, organised as help/clinset (902 instruction pages in 46 family directories), help/rs5000 (3,579 pages in 42 section directories), help/modules (886 pages in 15 module directories), common-content (104 pages) and publications (22 pages).
- A sitemap with 5,380 URLs; it is not a complete inventory (it omits four clinset pages and 86 other content pages), so the committed index enumerates the installed files rather than the sitemap.
- DITA page titles such as "Absolute Value (ABS)"; instruction filenames encode the mnemonic, for example absolute-value--abs-.html.
- 328 instruction mnemonics recovered from page titles and filenames.

Practical consequence: a docs answer about page counts or help structure is revision-specific, and the same instruction can have two different page ids in the two collections. Search both revisions when you are describing a difference; read one revision when you are answering for a project.
