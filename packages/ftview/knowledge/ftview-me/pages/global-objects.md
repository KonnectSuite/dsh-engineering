# Global objects: base objects, reference objects and global object displays

<!-- section: Authoring; identifiers: global object, global object display, .ggfx, base object, reference object, global object parameters -->

A **global object** is one object that many displays show, each showing the same
appearance and behavior. The object's home is a **global object display**: a
special display stored in the application's `Global Objects` folder as a `.ggfx`
file. A copy placed on a normal display is a **reference object**; the object on
the global object display is the **base object**.

This is the mechanism behind faceplates: a vendor or site standard builds the
faceplate once, places it on a global object display, and every equipment display
references it. Changing the base object changes every reference (the next time the
displays are opened, in design and at runtime), so a faceplate fix is a single edit.

## What can and cannot be a global object

- Every standard graphic object can be used on a global object display, except
  **ActiveX controls**: they cannot be created there, and a copied ActiveX control
  cannot be added.
- A global object display cannot use a wallpaper, and objects on it cannot be
  converted to wallpaper.
- Group reference objects do not offer **Flip Vertical** / **Flip Horizontal**.
- Reference objects work only inside the same application. There is no
  application-to-application global object reference.
- Library displays cannot contain global objects. A library is a source of
  finished objects and displays, not a faceplate store.
- Global object displays do not count toward the runtime's maximum number of
  activation displays, and they cannot be chosen as the startup display or picked
  from the Component Browser in a Display List Selector or Goto Display button.

## Creating the pattern

1. Create a global object display (`New Global Object Display`) and name it for the
   equipment family, for example `PIDE_Faceplate`.
2. Draw the base object on that display, with the properties and connections the
   standard requires. Leave the connections that vary from instance to instance
   unassigned; those become the parameters.
3. Open the global object display in the Graphics editor, select the base object
   and define its **parameters** (see below).
4. On a normal display, copy the base object and paste it, or drag it from the
   global object display onto the normal display. The pasted object is a reference
   object; its Properties dialog box marks it as a reference and lets you assign
   the parameter values for that instance.
5. Repeat for each instance. The reference objects' assigned values are stored in
   the normal display, not in the global object display.

The title bar of the Graphics editor tells you which kind of display you are
editing: it shows `(Global Objects)` for a global object display and `(Display)` for
a normal display. Mixing them up is the usual cause of "my change did not apply
everywhere": editing a reference object changes one instance, editing the base
object changes all of them.

## Global object parameters

Parameters are the extension of the ME parameter mechanism that makes a faceplate
configurable per instance without breaking its tag and expression links.

- A parameter is defined on the **base object** and assigned on each **reference
  object**. Each reference instance can carry a different value.
- The parameter can have a description, which should say what the parameter does
  and what tag type it expects. Fill it in: the next person sees only the
  description in the reference object's properties.
- Parameters are not passed to reference objects at runtime. They are design-time
  bindings; changing a value on a reference object rewrites that display, it is
  not a runtime argument.
- A global object parameter can be used wherever a regular parameter can be used,
  and no parameter file or parameter list is required.
- Global object parameters are not supported before Studio 5.00.00. A project
  converted from an earlier version may contain reference objects without them.

## Downloading to a terminal that does not support global objects

When creating a runtime file for an ME Station version that predates global object
support, Studio converts valid reference objects into regular objects. An
application whose references cannot be resolved (for example, the base object was
deleted) produces a validation error in the FactoryTalk Diagnostics log rather
than a silent substitution. Read the validation report before downloading; a
converted reference is no longer linked to its faceplate and will not follow future
base-object changes.

## Review checklist for a global object change

- The change was made on the base object, not on one reference object.
- Every reference object still resolves to a base object that exists.
- Parameter values were assigned per instance and the descriptions say what each
  one means.
- If the runtime target predates global object support, the conversion warnings in
  the validation report were read and accepted.
