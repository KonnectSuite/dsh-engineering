# Optix dialogs

A dialog is the one place an operator confirms something that cannot be undone. In Optix a dialog is not a
screen and not a popup drawn on top of the runtime: it is a **`Dialog` object type** in the project, opened by
Studio's own UI command and closed by another one. No NetLogic and no absolute pointer are involved.

`optix_ui { action: "dialog" }` writes that type, its two buttons and the button that opens it, then reads the
model back. `mode: "plan"` writes nothing.

| action | what it answers |
| --- | --- |
| `plan` | the five phases, every operation, the geometry, and `exists` for the folder, the type and the trigger |
| `apply` | validates each phase against the model the earlier phases left, then writes it, with a health re-check per operation |
| `audit` (with `optix_design_check`) | `VIEW-DLG-01` reports a destructive command that is not behind a confirm dialog |

## What one dialog is

```
UI/Dialogs/DshConfirmDelete     type: Dialog, Modal 1
├── DlgTitle      Label   "Delete this recipe?"
├── DlgMessage    Label   "The recipe is removed from this machine. This cannot be undone."
├── DlgCancel     Button  "Keep"    → MouseClick → UICommands.CloseDialog
└── DlgConfirm    Button  "Delete"  → MouseClick → UICommands.CloseDialog
```

and the trigger, on the screen that owns the command:

```
UI/Screens/Recipes/BtnDeleteRecipe  Button  → MouseClick → UICommands.OpenDialog
                                                Dialog=/Objects/<Project>/UI/Dialogs/DshConfirmDelete;AliasNode=
```

The `Dialog` argument is the **project-absolute** `/Objects/<Project>/…` path — that is the form Studio's own
`OpenDialog` command takes. (This is the opposite of a property `Value`, which is project-relative; see
[the theme](optix-theme.md).)

## The five phases

A dialog cannot be written in one batch. Studio creates a `Dialog` type's children only after the type exists, so
a batch that creates the type and fills it cannot validate (`unresolved_parent` on `UI/Dialogs/<Name>/DlgTitle`).
`optix_ui` therefore plans phases and validates each against the model the earlier ones left:

| phase | what it writes | why it is separate |
| --- | --- | --- |
| `folder` | `create_folder UI/Dialogs` when missing | the type needs its parent |
| `type` | `create_type … base_type: "Dialog"`, `Width`, `Height`, `Modal 1` | the type must exist before its children |
| `content` | two labels and up to two buttons with text and boxes | the children can only be created once the type exists |
| `wire` | `MouseClick → CloseDialog` on each button | the buttons must exist to be wired |
| `trigger` | the button on the calling screen and `OpenDialog` with the dialog path | the dialog must exist to be named |

Only the `folder` phase validates in `mode: "plan"`; the later phases are reported `validated: false`, and
`apply` validates each one just before writing it, reporting `refused_phase` when the model is not what the plan
expected.

## A second apply restates, it does not duplicate

`create_widget` on a name that already exists is refused (`already_exists`), so when the type is already there the
`content` phase keeps only the text and geometry writes and the `wire` and `trigger` phases are empty. A second
`apply` is a repair of the wording and the boxes — it does not add a second button, a second handler, or a second
`OpenDialog`.

Measured on the live bridge (`AryaOptixTemplate`, bridge 1.0.9):

| run | result |
| --- | --- |
| first `apply` | `applied 35`, phases `folder 1 / type 4 / content 25 / wire 2 / trigger 3` |
| second `apply` | `applied 24`, phases `folder 0 skipped / type 3 applied / content 21 applied / wire 0 skipped`, no `trigger` phase |

Read back after the first run: `UI/Dialogs/DshConfirmDelete` children `Width, Height, Modal, DlgTitle, DlgMessage,
DlgCancel, DlgConfirm`, and `UI/Screens/UiProbe/BtnDeleteRecipe` exists and opens it.

## What it does not do

- It does not import the template library's `ConfirmationDialog`; that widget brings its own context type and
  method invocation, and a project that wants it should clone it into the Templates library and use it there.
- It does not decide which commands are destructive. Pass `destructive: true` when the dialog exists because a
  command cannot be undone; `optix_design_check`'s `VIEW-DLG-01` reports a destructive command that has no
  dialog in front of it.
- It does not open the dialog by itself in a proof; the click proof is the runtime's job (`optix_nav verify`
  proves a panel changed, and a dialog is proven the same way once the project is saved and built).

## Proving it

`node scripts/test.mjs --only optix-dialogs` runs the pure plan (8 tests: the five phase names, the `CloseDialog`
wiring, the trigger's `OpenDialog` arguments, the readable title, the restating second plan, and the refusals).

`node test/optix-live-dialog.mjs` (manual, needs a bridge) plans and applies `DshConfirmDelete` against a real
project and reads the type and the trigger back; `node test/optix-live-dialog.mjs apply` writes it. Then press
Ctrl+S and Ctrl+Shift+B in Studio with the emulator stopped, start the runtime with
`optix_emulator { action: "start" }`, and click the trigger — the dialog is the runtime's proof.
