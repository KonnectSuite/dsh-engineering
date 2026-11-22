Meaning: an operand names a tag that does not exist in the open project or in the selected scope.

The failure carries candidates: the closest tag names found in the project. Use them, do not guess a case variation.

What to check:

- controller- versus program-scoped: a tag declared in another program is not visible unless it is controller-scoped, and a controller-scoped tag with the same name as a program tag shadows it in that program.
- an alias versus its base tag: aliases resolve, but an operand that needs a writable tag may not accept an alias.
- an array tag used without an element index, or with an index outside the declared dimension.
- a member of a user-defined type: the member path is part of the tag name and is case-sensitive.

Tools that help: l5x_resolve_tag resolves one name and explains how it resolved; l5x_search_logic searches names and text in the open project; l5x_find_references shows where a tag is used; l5x_usage_map summarises read/write use.

If the tag is genuinely new, declare it with l5x_draft_tag first and validate before composing rungs that use it.
