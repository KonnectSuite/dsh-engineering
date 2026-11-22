l5x_compare_projects answers "what changed in the logic", not "what changed in the file text". It compares two opened exports by engineering component and deliberately ignores:

- export timestamps in the file header,
- XML formatting and attribute order,
- Studio-added defaults such as built-in data types and the embedded Local module,
- release patch revision strings,
- diagram node ids and structured-text padding.

That is what makes a comparison useful: a re-export of the same project with no logic change compares equal, even though the files differ byte for byte.

Call shape: open both files, then l5x_compare_projects with both project handles (pass a baseline where the tool offers one). Read the result as a list of component-level differences: added, removed, changed routines and tags, with the changed rungs named.

Common false signals to explain rather than "fix":

- a controller property difference that only the newer Studio writes (release patch revision),
- an embedded Local module the editor added on save,
- a data type that moved because the editor reordered it.

Document the filter in the comparison output so a reviewer does not re-open the two files to verify the claim by hand.
