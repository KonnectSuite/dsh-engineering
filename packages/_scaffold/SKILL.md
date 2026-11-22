---
name: scaffold-example
description: Skeleton skill for a copyable component. RENAME the skill and rewrite this file for the real product.
whenToUse: Use when wiring a new component into the engineering bundle, not when working on a plant project.
---

# Scaffold example skill

This file is a template. The copied component must replace it with a real skill
that follows the same shape as the other product skills in this repository:

- state what the component reads and what it needs installed;
- state the order of work (inspect, then act, then verify);
- name the evidence gate and say what it does not prove;
- point at the shared backup tree and warn against editing installed vendor
  files.

## What the skeleton proves

Nothing about a real product. The skeleton ships off, registers no live tool and
must stay out of `components.json`, `cordis.patch.yml`, `entries/` and the
assembler's payload list until it is wired. The copied component's skill is
checked by the manifest (`skill.name`, `skill.file`, `skill.budget`).
