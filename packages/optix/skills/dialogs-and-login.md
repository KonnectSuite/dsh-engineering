# dialogs-and-login

Both are "overlay" problems: something must appear in front of the shell and then go away. Two separate
wrong answers are worth knowing before you spend an afternoon on them.

## A dialog

**Does not work:** `UICommands/OpenDialog` wired with `wire_event`. It mounts nothing when the window has no
`PanelLoader`, and a `PanelLoader` child added by the bridge is not a host. A `ParentItem` written as a
relative dynamic link once took the runtime down (page: "Server unreachable").

**Works — instantiate the Dialog as a child of the window:**

1. `optix_edit` op `create_object` `parent="UI/MainWindow"` `name="ConfirmDialog"`
   `object_type="UI/Dialogs/ConfirmCounters"` (a Dialog ObjectType carried by the project).
2. `create_variable Model/Smt/ShowConfirm` (Boolean).
3. `bind` `ConfirmDialog/Visible` ← `Model/Smt/ShowConfirm`.
4. `wire_event` on the opening button: `MouseClickEvent`, `command=SetVariable`, `variable=Model/Smt/ShowConfirm`,
   `value=true`.
5. Give the dialog's own buttons the closing handler: `command=SetVariable`, `value=false`.

The modal then renders over the shell with its title, message and buttons. Two caveats measured live: the
tag is shared by every session (so the dialog stays open in new sessions until the runtime restarts), and
closing it from the dialog's own buttons was not proven by synthetic clicks — verify it in the runtime
before claiming the close path.

## Sign-in

**Does not work:** a `Screen` created through `create_object`. It serialises as `Type: Screen` instead of
`Supertype: Screen` and renders blank when mounted through the rail. A rail item pointing at it navigates
(the tab highlights) and shows white.

**Works — an overlay inside the window:**

1. Build the card as children of `UI/MainWindow` (Rectangle backdrop, white card, title, user box, password
   box, button, status label) — a Label has no background, so the card is its own Rectangle.
2. `bind` the boxes' `Text` to `Model/Smt/LoginUser` / `LoginPass`, and the status label to `Model/Smt/LoginMessage`.
3. A runtime NetLogic with `[ExportMethod]`-free design: read the boxes (`TextBox.Text` is a plain string),
   call `Session.ChangeUser(user, password)`, write the result into `LoginMessage`, and set the overlay's
   `Visible=false` on success.
4. Users must be real: `InformationModel.MakeObject<FTOptix.Core.User>` under `Security/Users` and
   `Session.ChangePassword(name, newPassword, "")` — an empty OLD password is correct for a new account.
   `LogicObject.GetAlias("Users")` throws on a tool-created NetLogic; fall back to
   `Project.Current.Get("Security/Users")`.
5. Identity in the shell: `bind` the header label's `Text` with `raw_path="{Session}/User@BrowseName"`.

A headless preview session cannot fill a two-field form (typing into one box clears the other), so keep a
documented demo path — for example an empty form signing in the demo operator — and prove the real path in
the runtime with a person at the keyboard.
