OTL sets its bit true when the rung condition is true and leaves it true when the condition goes false.

A latched bit needs an explicit OTU (or a RES on a structure) to clear. Offline, check that the latch and the unlatch are both present and that the unlatch is reachable; a latch with no unlatch is a maintenance trap, and the review evidence should carry an unverified item for the intended reset path.

OTL and OTU are the standard way to hold a state across a power cycle when the tag is a controller-scoped tag in a non-safety task.
