Every opened project carries a software revision and a verification state:

- softwareRevision is the Studio 5000 Logix Designer release the export declares.
- verification is observed_parse when this build has a measured profile for that revision, and untested_revision when it does not.

The practical meaning of untested_revision: the parse still succeeded, the project opened, and the read and draft tools work, but the release has not been measured against this build's ladder and instruction profiles. The review evidence records that difference instead of claiming a verification it does not have.

For documentation questions, the export software revision selects the installed-help collection:

- v36.00.00 exports answer from l5x-help-36-00.
- v37.05.00 exports answer from l5x-help-37-05.

If the host has only one of the two helps installed, a docs call for the other revision answers SOURCE_NOT_INSTALLED with the roots it searched, and the authored revision-delta pages above remain available. That is the intended degradation path: documentation loses revision-specific detail, the edit does not lose its guard rails.
