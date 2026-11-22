The revision guard has three answer codes and one repair posture. They are deliberately different because they mean different things to the caller.

REVISION_REQUIRED (docs search, docs lookup, docs read on an installed-help collection)

- Raised when the caller names an installed-help collection but no revision.
- The tool refuses to guess the newest shard: page ids and counts differ between revisions, so a guessed answer would be semi-random.
- Fix: pass the revision, for example "37.05.00", or search the authored collections, which are revision-neutral.

INSTRUCTION_NOT_IN_REVISION (docs read, and the adapter's explicit revision check)

- Raised when the page id names an instruction (instruction-<mnemonic>) and the committed revision map documents that mnemonic only in other revisions.
- Example: read the page for an instruction the v36 help does not document with revision "36.00.00".
- The failure names the recorded revisions so the caller can re-request one of them.
- Fix: read without a revision for the plain authored text, or request a recorded revision.

REVISION_UNVERIFIED (adapter revision check only)

- Raised when the check cannot run: the revision map is missing or unreadable, the mnemonic is not in the map, or the caller named no revision.
- This is a warning, not a refusal. The page is served and the caller is told the check did not run.
- Fix: regenerate the committed corpus, or check the mnemonic with lookup.

Fail-open rule: when knowledge/instruction-versions.json is missing or malformed, the adapter logs one warning naming the artifact and the generator command, then serves instruction pages without a revision check. The documentation answer degrades; a valid offline edit is never blocked.
