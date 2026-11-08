# Migration evidence: Rockwell publications

The three publications the migration corpus is grounded on. Filenames carry the
revision and date printed in each PDF footer.

| File | Publication | Cited by |
| --- | --- | --- |
| `1756-rm085i-en-p_september-2025.pdf` | 1756-RM085I, Sep 2025 — Converting PLC-5 or SLC 500 Logic to Logix-Based Logic | instruction-map, unknown-operands, placeholder-tags, arrival-points, analog-scaling, wizard-defaults-to-audit |
| `5069-ap001a-en-p_august-2020.pdf` | 5069-AP001A, Aug 2020 — SLC to CompactLogix Programming Migration | wizard-and-revisions, pce-markers, analog-scaling, wizard-defaults-to-audit |
| `1746-rm003f-en-e_january-2022.pdf` | 1746-RM003F, Jan 2022 — SLC 500 Hardware Migration | analog-scaling, wizard-defaults-to-audit |

Load-bearing pages:

- RM085I p.28 — status conversion table, including `S:24 → S24`: the published
  origin of the `+ S24` wizard artifact the corpus treats as a plan exception.
- RM085I p.20 — conversion scales presets and accumulators; p.70 — SCL → SCP.
- RM085I pp.46–49 — indirect-address conversion and unsupported formats.
- AP001A pp.19–27 — SLC Migration Wizard walkthrough; pp.75–77 — supported
  and unsupported I/O (Appendix B).
- RM003F pp.22–25 — module replacement tables (1746-NI8 → 1769-IF8 / 5069-IF8);
  p.52 — 1746-NI8 to 5069-IF8 wiring migration.

Source: literature.rockwellautomation.com (the CDN blocks automated download;
these bytes were fetched by hand, September 2025 editions as downloaded).
