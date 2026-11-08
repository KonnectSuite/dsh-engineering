# Rockwell evidence: Logix-side publications

The Logix-side publications the rockwell corpus is grounded on. Filenames
carry the revision and date printed in each PDF footer.

| File | Publication | Cited by |
| --- | --- | --- |
| `1756-rm018a-en-p_september-2025.pdf` | 1756-RM018A, Sep 2025 — Logix 5000 Controllers General Instructions (supersedes 1756-RM003Z, Sep 2024) | fault-and-alarm-words, tag-naming, aoi-and-udt; the current revision of the 1756-RM003 citation carried by instruction-map and the instruction knowledge base |
| `1756-pm014o-en-p_september-2024.pdf` | 1756-PM014O, Sep 2024 — Major, Minor, and I/O Faults (supersedes PM014N, Mar 2022) | fault-and-alarm-words |
| `1756-pm008j-en-p_july-2022.pdf` | 1756-PM008J, Jul 2022 — Logix 5000 Controllers Ladder Diagram Programming Manual (supersedes PM008I, Mar 2022) | program-structure; the rung rules `run_checks` enforces |
| `1756-pm001-en-e_common-procedures-hub.pdf` | 1756-PM001 (undated) — Common Procedures hub: links to the whole Logix PM collection | acquisition list, below |

Load-bearing pages:

- RM018A — per-instruction major-fault tables (fault type and code, e.g. array
  out of bounds = type 4 code 20), watchdog behavior, the `.ER` bit, SCL/scaling
  instructions, GSV/SSV.
- PM014O — major-fault chapters: array out-of-range prescan faults (type 4)
  and the internal prescan fault handler, task watchdog expiry (type 6),
  reading `major_fault_record` with GSV, the Major Faults tab.
- PM008J p.14 — "the last instruction on the rung must be an output
  instruction"; branch nesting to six levels; rung-condition-in/out semantics;
  OTE/OTL/OTU/ONS output instructions.

Acquisition list (from the PM001 hub, ranked for this suite): PM019 Import/Export
(L5X/ACD import behavior — what aborts an import); PM015 Information and Status
(GSV/SSV, status file); PM005 Tasks, Programs, and Routines; PM010 Add-On
Instructions; PM004 I/O and Tag Data; PM011 Produced and Consumed Tags;
PM012 Messages.

Source: literature.rockwellautomation.com (the CDN blocks automated download;
these bytes were fetched by hand).
