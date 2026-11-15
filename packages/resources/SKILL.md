# Engineering standards

Use this skill whenever you write, change or review control code or HMI screens — before you author, not
after.

## First move

Decide what kind of request this is before calling anything.

- **A new build, standard or template.** Read the standards and the brief first. Our packaged templates
  exist so the shell does not have to be invented: list them from the product's own tool, not from disk.
- **An existing project.** The operator named it, or the work is inside it. Then the project is the
  subject: read it, bounded, and say what you read.
- **A real capability question** (which version is installed, is a bridge answering). Ask, or make one
  bounded check and state the reason.

Do not inventory the machine, the workspace or the operator's profile to work out what to build — no
directory listings, no recursive searches for project files, no install-folder globs. An inventory is
not a brief (`CRAFT-ORD-01`). Read `craft-engagement-order` for the order and the exceptions.

## Read first

- `engineering_reference` with no arguments lists the corpus. Search it for the language and the domain
  you are about to touch (`iec state machine`, `rockwell naming`, `view alarm`, `hmi touch target`,
  `hmi contrast`, `craft fault`), then read the page. Each page carries rule IDs; cite the ID when you
  report a finding. The `hmi` domain carries the product-neutral numbers behind a screen decision —
  target size, label, contrast, shared palette — and applies to View and Optix alike. For an Optix
  screen, `optix-application-recipe`, `optix-navigation-patterns`, `optix-widget-patterns` and `optix-design-resources` distil the
  shell-and-loader scheme, the composite-first rule and Rockwell's published sample projects.
- Any HMI or SCADA screen work starts from the product-neutral baseline, not from the product: read
  `hmi-isa101-baseline` (situational awareness, neutral canvas, reserved state colours, data over
  decoration) and `hmi-screen-architecture` (levels, reachability, persistent context, start screen,
  alarm access, popups) before you draft. `hmi-standards-precedence` decides who wins when the baseline
  disagrees with the plant. On a Rockwell plant, `hmi-rockwell-process-style-guide` is the vendor layer
  above the generic baseline — the four display levels, the template header and button bars, the fixed
  palette with its hex values and Rockwell's touch geometry and command/navigation rules.
- When a project or export is open, call `engineering_profile` **before** writing. It reports the naming,
  idioms and visual conventions the plant already uses, with evidence and a confidence level. Follow the
  profile where it is confident; where it is low, say so and ask.
- Precedence, highest first: what the operator asked for, the project's own documented standard or theme,
  a convention the existing screens follow consistently (that is what the profile measures), the vendor
  guidance the platform is built on (for Rockwell, its published process HMI style guide), and then this
  corpus. A deliberate house style wins over the baseline; record the waiver and the rule it waived
  instead of bending the baseline silently (`HMI-PREC-01`, `HMI-PREC-02`). Ask rather than guess when the
  layers conflict in a way that would change what the operator has to do (`HMI-PREC-03`).

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
