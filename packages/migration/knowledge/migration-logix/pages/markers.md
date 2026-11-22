# Structured-text markers and the conversion census

Not every legacy construct has a Logix text form the wizard can write. Where it
cannot translate something with confidence, it leaves a marker: a placeholder
instruction, a comment, or an empty rung that says "this used to be something else".
Markers are not harmless notes. A marker is a hole in the program's behaviour, and
each one is a decision the migration has to make explicitly.

## What a marker is

A marker is a piece of wizard output whose content cannot run as written. There are
three families the migration row cares about:

- **Instruction markers.** The wizard writes a placeholder instruction (often with a
  `PCE`-style label) in place of an instruction it could not translate. The legacy
  operands are usually preserved in the marker text, so the rewrite can be done from
  the marker and the original rung together.
- **Structured-text markers.** A legacy region that was documented or authored as
  structured text (or could not be expressed as ladder) is left as a marker the Logix
  side must fill with a structured-text routine. The census reports it so the plan can
  carry a typing and testing task, not a silent deletion.
- **Empty-rung markers.** A rung whose only content is a marker. This one is special:
  Studio's build audit reports `RxCMP_E_AUDIT_OUTPUTS` for a rung that produces no
  outputs, so an empty marker rung fails the build. It must be deleted or given the
  real instruction before import is considered done.

## The census is the checklist

`migration_resolve` produces the census: every marker site with its routine, rung, and
the legacy text it replaced. The census is the only honest count of how much work the
wizard deferred. Treat it as the migration's TODO list:

- Each instruction marker resolves to a Logix instruction plus a proof of equivalence.
- Each structured-text marker resolves to a typed, reviewed routine (or a ladder
  equivalent the engineer prefers).
- Each empty-rung marker resolves to a real instruction or is deleted with a recorded
  reason, because it will otherwise fail the build audit.

A marker count that goes to zero without a resolution record is not progress; it is a
deletion that nobody can audit later.

## What not to do with markers

- Do not delete a marker to make the lint clean. The lint is about text; the marker is
  about behaviour.
- Do not translate a marker from memory. The marker text names the legacy instruction;
  read the legacy rung from the assessment or the original export.
- Do not accept a marker that names a construct the target CPU cannot do. That is a
  redesign decision for the plan, not a rung rewrite.

## Markers and the acceptance gates

A project with unresolved markers cannot be accepted as migrated, whatever the
comparison says. The comparison stage can match routines and rungs while the markers
remain, because it compares structure; the engineer stage is where each marker gets a
resolution and a proof. The plan records the marker sites as exceptions; the report
carries them with their resolution so the owner can read one list.

The PLC-5 row has a related but different census: a binary `.RSP` container is read
through the vendor automation server, and the text-export tools census instructions,
indirect operands, and unknown operands in a `.PC5` text export. Both rows share the
principle: census the deferred work, then resolve it with evidence.
