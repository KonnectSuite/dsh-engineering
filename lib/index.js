/**
 * Host half of the engineering bundle.
 *
 * The bundle's work happens in its patch (`cordis.patch.yml`: the tool policy
 * and the product rows) and in its client face (`./client`). This entry exists
 * because a client bundle is discovered through a *mounted* package row, and a
 * row mounts a package root. It registers nothing of its own.
 */
export function apply() {}
