# Runtime and transfer: creating the .mer and getting it onto a terminal

<!-- section: Runtime; identifiers: MER, MED, Create Runtime Application, ValidationResults, ME Transfer Utility, terminal, download -->

Authoring ends when the application is compiled into a **runtime file** with the
`.mer` extension. The runtime file is what a PanelView Plus, MobileView or other
ME Station terminal runs. Downloading it is a separate step with its own tool: the
**ME Transfer Utility**.

## Creating the runtime file

In Studio, choose **Application > Create Runtime Application** and specify the
output `.mer` path and the **target ME Station version**.

- Choose the target version deliberately. A `.mer` built for a later ME Station
  cannot run on an earlier one, and converting it back to a `.med` only sets
  whether the terminal or a later Studio may open it.
- The create operation runs the project's validation. Unsupported features and
  unresolved references appear in a report; when there are errors, the `.mer` is
  not created. Warnings do not block creation but can cause runtime problems.
- Errors and warnings are written to `<application name>ValidationResults.txt` in
  the same folder as the `.mer`. Read it before downloading; an empty Studio dialog
  is not proof that validation passed.
- Test-running the application in the current Studio versions can behave
  differently from the targeted ME Station version. For anything version-sensitive,
  test on the target or a matching test terminal.
- PanelView Plus 7 Standard and PanelView Plus 6 Compact targets enforce their
  display and alarm limits when the `.mer` is created, not at download. A project
  that violates them fails creation.

## Languages and security at creation time

- If the application has more than one runtime language, the language wizard runs
  at creation and requires a default language. Missing translations show the
  default language at runtime, not an error, so a "wrong language" report often
  means a missing translation, not a broken runtime file.
- When the project uses Windows-linked FactoryTalk security, each linked Windows
  account is verified at creation. A domain account that cannot be resolved (the
  domain is unreachable, or the trust is broken) is written as a blank account
  name, and that user's terminal logins then fail. Fix the trust, open the project,
  and recreate the `.mer`; editing the runtime file is not possible.
- A `.med` created from a `.mer` can later be converted again, subject to the
  conversion options chosen at creation (always allow, never allow, or password
  protected). Keep the `.med` under source control; the `.mer` is a build output.

## Using the ME Transfer Utility

The ME Transfer Utility copies `.mer` files and TrueType font files between the
authoring PC and a terminal over the terminal's communication path. On the PC it
uses the FactoryTalk Linx communication tree, and it requires a FactoryTalk Linx
driver for the terminal's connection.

What the utility does:

- **Download** a `.mer` to a terminal. It can set the downloaded application to run
  automatically after the download and after the terminal restarts.
- **Upload** a `.mer` from a terminal back to the PC, for comparison or archiving.
- **Compare** the terminal's application with the application on disk, so you can
  see whether the terminal is actually running the build you shipped.
- **Transfer fonts** — `.ttf` and `.ttc` TrueType font files — because a display
  that uses a font the terminal does not have will not render as designed.
- **Download several applications one at a time**, and it can start a download
  while another application is running on the terminal.

What the utility does not do: it does not compile, it does not validate, and it does
not merge applications. If a download fails, the cause is in the `.mer` creation
output, the communication path, or the terminal's storage; re-running the transfer
without reading the validation report repeats the same failure.

## Runtime folders on the terminal

The terminal stores the downloaded application in its own runtime folder and keeps
the fonts alongside. A factory reset or a firmware update can remove both the
application and the added fonts. After replacing a terminal, repeat the font
transfer as well as the application download; a missing font is usually noticed as
a layout shift or a substituted font, not as an error.

## Deployment checklist

- `.mer` created for the correct ME Station version, with no validation errors.
- `<application name>ValidationResults.txt` read and its warnings accepted.
- Languages: default chosen, translations present for every configured language.
- Security: Windows-linked accounts resolve; blank account names absent from the
  validation output.
- Fonts transferred after the application.
- Compare completed and green: the terminal runs the build that was tested.
