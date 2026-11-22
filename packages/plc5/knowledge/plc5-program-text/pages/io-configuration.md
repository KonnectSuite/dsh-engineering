# I/O configuration: chassis, adapters, and program-only racks

A PLC-5 project records its I/O as a set of chassis and adapters on a remote I/O
link. The ladder addresses those racks. Reading both is what makes an I/O review
trustworthy, and keeping them distinct is what stops a migration from dropping
unconfigured points.

## What the project records

- **Chassis.** A 1771 chassis (or a compatible rack) with a rack number and a number
  of slots.
- **Adapters and scanners.** The modules that put a chassis on the remote I/O link, and
  the processor-side scanner that owns the link.
- **Racks declared.** The rack numbers the configuration says exist.
- **Program references.** Every `I:` and `O:` address the ladder reads or writes.

The `.RSP` readers (`plc5_io_config` and `plc5_io_census`) report the first and last
here; the text-export readers report only what the export carries. Neither can report
the point cards in the slots: the project records the chassis and adapters, not the
card catalogs.

## Configured versus referenced

The mismatch between configured racks and referenced racks is the most useful signal in
an I/O review:

| Configured | Referenced | Meaning |
| --- | --- | --- |
| Yes | Yes | Ordinary point. |
| Yes | No | Configured but unused; spare or missing logic. |
| No | Yes | **Program-only rack.** The ladder addresses I/O the configuration does not declare. |
| No | No | Nothing; do not infer a device from the file. |

A program-only rack is usually one of:

- a block-transfer area (the `BTW`/`BTR` pair addresses a module's data, not the image),
- a Dataway device or an adapter's local expansion,
- a stale reference left behind when a module was removed,
- a hand-edited configuration that never matched the machine.

Each case has a different fix, and `plc5_io_census` cannot choose between them. It can
only report the referenced-but-not-configured set honestly, so the engineer looks.

## Reading remote I/O correctly

- The rack number in an address is the logical rack on the link, not a physical
  position in the cabinet.
- The I/O group is a slice of the rack's image; its width depends on the modules in the
  rack. The same rack number can present 16-bit and 32-bit groups side by side.
- Analog modules may appear as several image words or as a block-transfer area. The
  address alone does not say which; the configuration and the ladder's instructions do.
- A rack declared in the configuration but never referenced can still hold points the
  HMI reads directly. When an HMI is in scope, count those before retiring the rack.

## Limits you must read before trusting the census

The census is a reflection of what the files say. It cannot:

- list the cards in the slots,
- read register contents inside packed data streams,
- tell you whether a remote link is actually wired,
- state whether a controller is running,
- see I/O that was never addressed by the program (there may be points the HMI owns).

The row's coverage block names these limits on every I/O answer. That is not noise: a
census that silently omitted the cards would be worse than no census.

## Before an I/O decision

1. Compare configured and referenced racks; list every mismatch.
2. For each mismatch, classify it: block transfer, Dataway/expansion, stale, or
   undocumented.
3. Check the HMI scope decision against the racks you plan to retire.
4. If the plan keeps a chassis, verify the bridge or adapter supports the cards
   actually installed - the project does not know their catalog numbers.
5. Record the I/O decision in the migration plan (`io_strategy`) before conversion, so
   the conversion output can be judged against it.
