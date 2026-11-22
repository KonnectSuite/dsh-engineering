---
title: Known gaps and what is not proved
order: 150
purpose: The claims this release does not make, by product, so no reader mistakes beta for finished.
audience: Reviewers and release engineers
---

## Every component is beta

Every row and support component in this bundle is **beta**, and every component records a `stabilityNote` saying what is not proved. Beta means the surface is tested and usable; it does not mean every vendor version, controller family or host combination has been measured.

## MotionWorks IEC

The repository records live evidence for the MotionWorks IEC 3 Pro 3.x line (`3.0.3–3.7.5`) against a staged copy of a real project on 2026-10-23, but that evidence was recorded on a host with the IDE. This host has no MotionWorks IEC install with a reachable bridge, so on this machine the compile, live-IDE and profile paths are unproved and fixture-tested only. Other IDE versions, controller families, downloads and the real-workspace write path are unmeasured.

## FactoryTalk View

One ME export has been measured. The alarm decoder covers 34 of 66 applications on the recorded host, tag decoding 64 of 66, with the reason written into export warnings. The Studio import step, other ME versions and a second application are unmeasured. SE is a documentation source, not a product row.

## Studio 5000 L5X

The recorded SDK verification is a 37.11 build with zero errors plus a neutral-text paste; the current host has Studio 5000 v37.05.00 and SDK 2.02.00, and the build is re-verified locally as part of this work. Instruction, revision and controller coverage beyond the recorded case is unmeasured. FBD and SFC execution semantics are not exercised. `l5x_export_acd_to_l5x` output can be refused on re-import.

## Optix and NetLogic

Two steps stay manual: compiling the bridge class and running StartBridge. A save is not a build, and a rendered screen is a preview of the saved project. The bridge has been exercised on Studio 1.8.1.27 with a system .NET 8 and on a 1.7.4.32 emulator.

## Legacy migration and PLC-5

Migration's instruction map covers 58 mnemonics with citations; uncovered instructions are review items. The wizard cannot emit newer than it ships, so a build proof needs a retarget first. PLC-5 was measured on one `.RSP` through both paths; data-file values, point cards and online state are outside the row.

## SLC 500

The row is new. Its `.SLC` text grammar and its automation boundary are covered by repository fixtures, including a redacted transcript, but a full project read from an owner-licensed RSLogix 500 session is still the evidence that closes real-project coverage. The row ships off, writes nothing and never goes online.

## ECAD

The product row is retired; the read-only drawing preview stays. Electrical authoring is AryaCAD Electrical's job, not the bundle's.

## Evidence and the repository

The authoritative list is the capability page (`docs/capabilities.md`) plus each product page's Limits section. Generated figures that are stale against the current release - for example screenshots from the previous preset layout - are replaced by the release that changes them. The generated tool reference excludes the 32 vendored Optix tools by design, so a missing Optix row there is not a missing tool.
