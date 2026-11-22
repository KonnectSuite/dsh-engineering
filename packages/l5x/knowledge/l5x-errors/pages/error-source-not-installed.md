Meaning: the read targeted an installed-help page, the collection's adapter resolved no local help root, so the page body cannot be read on this host.

What the failure carries: the collection id, the revision that was requested, and error.roots - every filesystem root the adapter searched. That list is the useful part: it tells an administrator exactly which path is missing.

What is still available: the committed index. status reports the collection as index-only, and contents can list its sections and page titles. Only the page body read is unavailable, because shipping vendor page bodies is not allowed.

Fixes:

- Install the matching Studio 5000 Logix Designer help on this host.
- If help is installed in a non-standard place, set the adapter's root override for the revision (L5X_HELP_ROOT_V37_05 or L5X_HELP_ROOT_V36_00).
- If you only need our explanation, search the authored collections instead; they answer without any installation.

Expected default roots: Program Files (x86)/Rockwell Software/Studio 5000/Logix Designer/ENU/v37/Bin/Help/ENU/rs5000 for 37.05, with the same path under Program Files as a fallback, and v36 for 36.00.
