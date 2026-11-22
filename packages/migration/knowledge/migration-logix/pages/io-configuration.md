# I/O: chassis, modules, and the three inventories

I/O is where the migration leaves the file system and meets the machine. The tools
can read what a project records about I/O; they cannot know what is physically wired.
Keep three inventories separate and never let one stand in for another.

## The three inventories

1. **The configured inventory.** What the project declares: a 1746 chassis with cards
   (SLC), or 1771 chassis, adapters, and racks (PLC-5). This is what the file says.
2. **The referenced inventory.** Which rack/slot/bit addresses the ladder actually
   reads and writes. A perfectly configured card that no rung touches is spare parts;
   a referenced slot that is not configured is a defect or a block-transfer area.
3. **The physical inventory.** What is mounted, wired, and powered. Only a person with
   the drawings and the cabinet knows this one.

The bundle reports the first two. `migration_assess` and the PLC-5 I/O tools produce
them; the docs for the PLC-5 row call the referenced set "program-only racks" when the
program addresses I/O that the chassis configuration does not declare. That usually
means block transfers or Dataway devices behind an adapter, and it is exactly the case
where a naive "convert the configuration" plan loses points.

## Keeping the chassis

For SLC 500, a 1746 chassis can stay in the field behind a 1747-AENTR bridge: the
existing cards keep their wiring, and the Logix controller sees them as remote I/O
over EtherNet/IP. The advantages are real — no re-termination, no new drawings for
every point — but the bridge is a new device with its own configuration and its own
scan time. Record the decision as `io_strategy` in the plan and verify the bridge's
module catalog against the cards actually installed.

For PLC-5, remote I/O racks can be kept behind a 1756-DHRIO or similar bridge, or
replaced. Block transfers are the hard part: a BTW/BTR pair that moved a block of data
from a 1771 module does not survive as a bridge configuration alone. The replacement
is either the module's Logix equivalent (produced/consumed tags) or a redesign; see the
instruction mapping page for the `BTW`/`BTR` row.

## Replacing the modules

Replacing I/O means new module configuration, new tag names, and rewritten addresses.
It also means new field wiring, or at least new terminations. The migration plan should
carry the replacement as work with an owner, not as a wizard checkbox. Analog modules
are the usual source of surprises: a legacy analog card has its own raw-count scaling,
and the Logix module has a different one. The wizard cannot know the engineering units;
`WIZARD_ANALOG_DEFAULT` is the audit rule that flags a converted analog channel still
carrying the default scaling.

## Rules that catch real defects

- `LEGACY_CHASSIS_DECLARED` — the wizard output still declares the legacy chassis
  module. That is fine for a bridge strategy and wrong for a replacement strategy;
  either way it needs a decision, not an accident.
- `MODULE_NAME_ILLEGAL` — a module name the Logix controller will not accept.
- `MODULE_UNNAMED` — a module that exists but has no name, which makes every later
  reference ambiguous.
- `WIZARD_ARTIFACT` — a conversion artifact (for example a `+ S24` byte-swap token in
  an operand) left in the output; it must be rewritten from the legacy rung.

## What to verify before commissioning

1. Every configured slot has a physical card, and every physical card is configured.
2. Every referenced address resolves to a module tag or an alias.
3. Every analog channel has the intended raw range and engineering units.
4. The bridge or replacement has a measured scan time, and the sequence still meets
   its timing requirement with it.
5. Fault and inhibit behaviour is explicit for every module the program depends on.

The tools answer 1 and 2 from the files. 3, 4, and 5 are engineering evidence.
