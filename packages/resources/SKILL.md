# Engineering standards

Use this skill whenever you write, change or review control code or HMI screens — before you author, not
after.

## Read first

- `engineering_reference` with no arguments lists the corpus. Search it for the language and the domain
  you are about to touch (`iec state machine`, `rockwell naming`, `view alarm`, `hmi touch target`,
  `hmi contrast`, `craft fault`), then read the page. Each page carries rule IDs; cite the ID when you
  report a finding. The `hmi` domain carries the product-neutral numbers behind a screen decision —
  target size, label, contrast, shared palette — and applies to View and Optix alike.
- When a project or export is open, call `engineering_profile` **before** writing. It reports the naming,
  idioms and visual conventions the plant already uses, with evidence and a confidence level. Follow the
  profile where it is confident; where it is low, say so and ask.

## Order of work

1. Read the profile (existing project) or the standard pages (new work).
2. Author the change with the project's own names and visual language.
3. `engineering_review` on the draft. Fix findings you agree with; explain the ones you do not.
4. Then run the product's own validation (`draft_validate`, `ftview_validate`, `mw_compile`).

## Honesty rules

- A profile is evidence, not authority: quote the counts and the source path when you rely on it.
- A rule ID is this bundle's opinion. Never present it as a standards clause or a certification.
- Do not reproduce standards text; link the page instead.
- If the corpus or a profile is unavailable, say which one and continue with the product's own checks.
