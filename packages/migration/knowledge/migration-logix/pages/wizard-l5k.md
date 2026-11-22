# Running the migration wizard and auditing the .L5K

The vendor migration wizard converts an RSLogix 500 or RSLogix 5 project into a
Studio 5000 Logix project. It does the mechanical work and leaves the decisions in the
output as text. This page is about the text: what the wizard writes, what the linter
checks, and why the repair happens on a copy.

## The wizard's output is a claim, not a result

The wizard cannot know your intent, your I/O strategy, or your acceptance criteria. It
writes a `.L5K` text export that contains:

- a controller declaration with a target revision,
- module declarations for the configured chassis,
- programs and routines translated rung by rung,
- placeholder tags for modules and data it could not map,
- markers for instructions and constructs it could not translate.

Treat the `.L5K` as the wizard's best guess, preserve it, and lint a copy. That way the
original is still available when a repair turns out to be wrong.

## The linter rules

`l5k_lint` reads the `.L5K` text and reports findings with a severity, a line, and a
fix. The rules are:

| Rule | Severity | What it catches |
| --- | --- | --- |
| `TRAILING_COMMA` | error | An attribute list ends with a comma before `)`. Studio rejects that attribute syntax; it often comes from a partial edit. |
| `ROUTINE_PAREN` | warning | A routine header ends with a stray `)`, the remains of an old block header. |
| `DUPLICATE_TAG` | error | A tag is declared twice. The first declaration wins and the second is invisible. |
| `TAG_NAME_TOO_LONG` | error | A tag name over 40 characters. Logix will not accept it. |
| `PLACEHOLDER_TAG` | warning | A tag stands in for a module the wizard could not map. Choose the replacement before commissioning. |
| `INDIRECT_ADDRESS` | warning | A rung indexes an array with another tag. Logix cannot express the legacy indirect form directly. |
| `REVISION_BELOW_TARGET` | info | The controller revision is below the target. Our build gate needs 37 or newer; below that the file can only be verified as imported. |
| `ROUTINE_UNBALANCED` | error | The count of open `ROUTINE` blocks does not match `END_ROUTINE`; the file is truncated or malformed. |

Errors are defects: fix them before Studio sees the file. Warnings are work: each one
needs an exception in the plan. Info findings are context, not defects.

## Why the repair happens on a copy

The linter is read-only. The repair is a person editing a copy of the `.L5K` and
importing that. Keeping the wizard output intact means a later comparison can still
show what the wizard actually produced, and an audit can tell a wizard bug from a
human typo. Name the copies so the lineage is obvious: `project.wizard.l5k` is the
untouched output, `project.import.l5k` is the repaired file that Studio imports.

## The usual defects

- **Trailing comma in an attribute list.** Usually one line of an edit that removed an
  attribute and left the separator. The fix is local; the risk is that the same edit
  left another list malformed.
- **Tag named with the legacy file address and truncated.** The wizard combines the
  file name and element; long legacy symbols produce names over 40 characters. Rename
  deliberately rather than letting a later editor truncate them at random.
- **Module placeholder tags.** Tags like `Local_C_1` stand in for cards the wizard could
  not map. They import, and they fail at runtime. Every placeholder needs a decision.
- **Revision below the build gate.** A project imported at revision 36 can be exported
  and compared, but an offline build cannot prove it. The plan must say which gate
  applies.

## Order of work after the wizard

1. Save the wizard output and keep it read-only.
2. Run `l5k_lint` on it and record every error and warning.
3. Repair errors on a copy, re-lint until no errors remain.
4. Import the repaired file, export the `.L5X`, keep it.
5. Run `migration_compare` against the legacy side and record what moved.
6. Send every marker, placeholder, and indirect address to `migration_resolve`.
7. Prove each rewrite by build or test, then update the plan.

That is the lint and import stages of the eight-stage plan; the wizard does its work in
the convert stage, and nothing about it is evidence until the later gates run.
