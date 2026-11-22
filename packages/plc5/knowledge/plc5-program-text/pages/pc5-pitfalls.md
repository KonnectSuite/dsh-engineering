# Text export pitfalls: binaries, truncation, and stray bytes

A text export is easy to read and easy to damage. These are the failures the text
tools expect, and the honest error each one produces.

## The file is actually a binary project

A `.RSP` project is a compound-file container, not text. Its first bytes are the
compound-file magic `D0 CF 11 E0`. If a file named `.pc5` starts with that magic, the
export was never produced: someone renamed the project file or copied the wrong
artifact. The reader fails with `SOURCE_NOT_INSTALLED` and a fix that says to export
the program as text first. It does not attempt a best-effort decode; a binary decoded
as text produces plausible garbage, which is the worst possible answer.

## The extension is not a text format

Passing `.L5X`, `.RSS`, `.ACH`, `.RSP`, or a `.docx` to a text-export reader fails with
`UNSUPPORTED_FORMAT`, naming the extension it saw. Those formats belong to other tools:
the migration row reads `.RSS`/`.ACH`/`.SLC`/`.RSP`, Studio reads `.L5X`, and the
PLC-5 binary readers read `.RSP`. A text reader that guessed would hide the wrong-file
mistake.

## The export is truncated

A missing `END`, a `PROGRAM_FILE` with no `END_PROGRAM_FILE`, or a rung line cut in the
middle of a token all mean the file was saved while being written or copied
incompletely. Symptoms:

- verify reports a structure error and the line where the file ends,
- the last rung has unbalanced parentheses,
- the data-file table is empty although the ladder references data files.

Do not patch the text by hand to make it parse. Regenerate the export from the
project. A hand-repaired export no longer demonstrates what the project contains.

## Line endings and encoding

- The reader accepts `\n` and `\r\n` line endings and strips a UTF-8 byte-order mark.
- Non-UTF-8 bytes are reported as an encoding problem on the first affected line; they
  are not silently mapped to guessed characters. A legacy export in a Windows code page
  should be converted to UTF-8 before it is committed.
- NUL bytes anywhere in the file mean it is binary, not text.

## Comments and blank lines

Whole-line `;` comments are ignored by every reader. They are useful for carrying a
human note into version control, but nothing in the census counts them: a comment that
documents a dead rung does not make the rung disappear. Blank lines are ignored as
well. A `;` inside an instruction's quoted string is part of the string, not a comment.

## Duplicate and out-of-order rungs

A rung number that repeats in one program file, or a number lower than its predecessor,
is a warning rather than a hard error. Both occur when an export is assembled from
pieces or edited by hand. The digest reports gaps and the verify verdict reports the
warning, because a consumer that assumes rung numbers are unique and increasing would
misreport the program's order.

## Duplicate program files and data files

Two program files with the same number, or two data files with the same type and
number, are structure errors. The last declaration would silently shadow the first;
`plc5_verify` reports both and `plc5_pc5` shows them where they occur.

## Unknown mnemonics and `?` operands

- An instruction token whose mnemonic is not in the reader's catalogue is reported as
  an unknown mnemonic by the inventory; it is not counted as a known family.
- An operand written as `?` is a placeholder the exporter inserted for something it
  could not render. The indirect census counts it; the verify verdict treats it as
  unresolved. A `?` is never treated as an address.

## The diff trap

Two exports that differ only in line endings or a comment should diff clean; the tools
normalize line endings and ignore comments. Two exports that differ in the order of
instructions inside a rung are genuinely different and will show as a changed rung.
If a diff reports every rung changed, check that both files came from the same project
and the same exporter version before investigating the program.
