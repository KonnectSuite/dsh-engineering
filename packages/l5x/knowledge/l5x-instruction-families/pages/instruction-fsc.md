FSC searches an array for elements matching a condition and reports the position of the first match.

The instruction needs the array, the length, the position tag and a control structure. Search state is held in the control structure: the search is incremental, not atomic, so it can take several scans and the position meaning changes between the search and the match result.

Editing offline, keep the control structure tag stable across edits; replacing it resets a search in progress.
