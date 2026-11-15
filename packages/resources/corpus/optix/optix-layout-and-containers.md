---
id: optix-layout-and-containers
title: Layout is margins and alignment, not canvas coordinates
domain: optix
level: practitioner
basis: [creating-projects/graphic-objects/layout/Graphic-objects-layout.html, creating-projects/graphic-objects/layout/Set-margins.html, creating-projects/graphic-objects/layout/Dock-an-object.html, creating-projects/graphic-objects/layout/Move-an-object.html, creating-projects/graphic-objects/layout/Resize-an-object.html, creating-projects/graphic-objects/layout/Change-objects-order.html, creating-projects/graphic-objects/layout/Create-a-responsive-user-interface.html, creating-projects/graphic-objects/predefined/Size-conventions.html, creating-projects/graphic-objects/predefined/Containers.html, Reference/FTOptix-UI/ObjectTypes/Container.html, Reference/FTOptix-UI/ObjectTypes/GridLayout.html, Reference/FTOptix-UI/ObjectTypes/ColumnLayout.html, Reference/FTOptix-UI/ObjectTypes/RowLayout.html, Reference/FTOptix-UI/ObjectTypes/ScaleLayout.html, Reference/FTOptix-UI/ObjectTypes/Window.html, Reference/FTOptix-UI/DataTypes/HorizontalAlignment.html, Reference/FTOptix-UI/DataTypes/VerticalAlignment.html, best-practices/responsive_design_use_case_awareness.html, best-practices/ui_objects.html]
tags: [layout, containers, alignment, z-order, responsive]
applies_to: [optix]
rules: [OPTIX-LAYOUT-01, OPTIX-LAYOUT-02, OPTIX-LAYOUT-03, OPTIX-LAYOUT-04]
---
## Principle
An object's position is not a coordinate on a canvas: it is a pair of margins against its parent's edges plus
an alignment. `Set-margins.html` states the contract — a margin is the space between the object edge and the
parent edge — and the alignment decides what the margins mean: Left and Right pin one edge, Center keeps the
object centred, and Stretch derives the size from the container instead of from the object. A screen drawn by
dragging with the mouse stores the margins that happened to be right for the window it was drawn in; the same
margins on a narrower viewport push a child past its parent or collapse a label to nothing.

That failure is silent in the editor and visible only on the device. A child that extends outside its parent
is not clipped in a way the review notices; text that no longer fits either wraps where WordWrap is on or is
cut where it is off. Because layout is computed from Size, Position and Order, an interface that must serve a
1920x1080 desktop and a 1280x800 panel is solved with containers, not by rescaling a drawing.

Z order is part of that contract. Order is the object's position in the Project tree: an object lower in the
tree sits higher on the Z axis, so it draws over its earlier siblings and receives the click first. Hit
testing follows the same order, which is why a full-size transparent panel added late silently swallows every
click intended for the buttons underneath.

## Rules
- **OPTIX-LAYOUT-01** Every child stays inside its parent: left margin plus width plus right margin never
  exceeds the parent width, and top plus height plus bottom never exceeds the parent height, at every viewport
  the project targets; a child that overflows, or whose stored margins and size disagree with its alignment,
  is a defect even when the overflow is invisible in the design window.
- **OPTIX-LAYOUT-02** The container is chosen from the resize behaviour and not from habit: a Grid layout with
  `Columns` and `Rows` as `number`, `numberfr` or `auto` for tabular placement, a Horizontal or Vertical
  layout with `ContentAlignment`, `Wrap` and the two gaps for a flowing row or column, a Scale layout with
  `FillMode` (Fit or Stretch), `OriginalWidth`, `OriginalHeight` and `FontScaling` for a fixed-aspect symbol;
  inside any of these a child does not also carry a pinned `Width`/`Height` unless a fixed size is the
  requirement, and on a plain Container alignment plus margins cover the case.
- **OPTIX-LAYOUT-03** Z order and hit test are designed, not inherited from drawing order: siblings overlap
  only where the overlap is the design and the upper object is named for its role, every overlay that must
  not take clicks sets `HitTestVisible` to False, and a stacking fix is made with bring-forward, send-to-back
  or a tree move rather than by re-creating the objects.
- **OPTIX-LAYOUT-04** The design box is one recorded decision per deployment — a 1920x1080 desktop window or
  a 1280x800 operator panel — fixed in `Width`/`Height` (or `FullScreen`) of the Window before any screen is
  drawn; a second device is served by the UI Session `ScaleFactor` or by a second Screen type behind a Panel
  loader selected from the window width, and an operator-panel screen shows its full active page without
  scrollbars, with `ScrollView` reserved for secondary content.

## Apply
Read before drawing. `optix_read` `{action:"map", path:"UI", depth:3}` returns the container tree and each
node's geometry, and `{action:"node"}` on a suspect container gives its margins, alignment and `HitTestVisible`
in one call; `{action:"type_schema", type:"GridLayout"}` confirms the property names and the accepted
`Columns` syntax before a value is staged.

Build with the container the behaviour needs. `optix_edit` `create_widget` with `widget_type` `GridLayout`,
`RowLayout`, `ColumnLayout` or `ScaleLayout` places the container, then `set_property` fills `Columns`
(for example `"1fr 2fr"` or `"auto 1fr auto"`), `Rows`, `HorizontalGap` and `VerticalGap`. Children are moved
in with `{"op":"move","path":"<child>","new_parent":"<container>"}` and sized with `set_property` on margins
(`LeftMargin`, `TopMargin`, `RightMargin`, `BottomMargin`) rather than on `Width`/`Height`; a plain Container
child takes `HorizontalAlignment` as one of `Left`, `Right`, `Center`, `Stretch` and `VerticalAlignment` as
`Top`, `Bottom`, `Center`, `Stretch`, where Stretch means the size is the container minus the margins.

Stack, do not duplicate. `optix_edit` `{"op":"reorder","path":"<object>","position":"front"}` and the same op
with `position` `"back"` move an object in the tree, which is what changes draw and hit-test order; an
overlay that must ignore the pointer gets `set_property` `HitTestVisible` False; a transparent shield keeps
True because it must absorb the click.

Prove the two box sizes. `optix_screen` accepts explicit `width` and `height`; the start window is sized with
`set_property` on `Width`/`Height` or `FullScreen`, and a smaller device is served by the UI Session
`ScaleFactor` (1 = design size, 2 = twice), not a second copy of the screens. A responsive build follows the
documented recipe: one Screen type per breakpoint, a NetLogic returning small/medium/large from the window
width, and a Panel loader with a key-value converter mapping that value to the screen types.

Close with evidence. `optix_design_check` reports the children that leave their parent and the unintended
sibling overlaps, with `OPTIX-LAYOUT-01` and `OPTIX-LAYOUT-03` in the findings, so the acceptance list is the
finding list. `optix_screenshot` at the target window size and again at the smaller one is the proof the
layout holds; a capture at design size alone proves nothing.
