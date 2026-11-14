---
id: hmi-screen-architecture
title: Screen architecture: hierarchy, navigation and the context that never goes away
domain: hmi
level: practitioner
basis: [ISA-101, ASM Consortium, EEMUA 201]
tags: [hmi, architecture, navigation, hierarchy, alarms, popups]
applies_to: [hmi]
rules: [HMI-ARCH-01, HMI-ARCH-02, HMI-ARCH-03, HMI-ARCH-04, HMI-ARCH-05, HMI-ARCH-06]
---
## Principle

A screen is not a picture, it is a place in a system. The operator moves between places to follow a
problem from the plant down to a valve, and back up again. The architecture decides whether that movement
is two clicks or six, whether they know where they are, and whether an alarm that appeared while they
were three levels down can still reach them.

Get the architecture right and individual screens can be ordinary. Get it wrong and every screen has to
compensate for the missing map.

## Rules

- **HMI-ARCH-01** Screens form a hierarchy: level 1 plant or area overview, level 2 unit or line, level 3
  equipment detail, level 4 diagnostics and trends. Every screen states its level and its area, and
  anything the operator can change is reachable from the start screen inside three levels.
- **HMI-ARCH-02** Every screen is reachable and exitable. Navigation is present on the screen or in a
  fixed shell, the current location is indicated, and no screen is a dead end — including popups, error
  states and screens shown before a communication failure is noticed.
- **HMI-ARCH-03** Context persists: a header carries plant or area, active alarms, communication status,
  the logged-in user and time; a footer or side strip carries navigation. They stay put across screens so
  the same information is always in the same place.
- **HMI-ARCH-04** The start screen is the overview, not a splash, a menu or a login dead end. The alarm
  summary is reachable in one action from any screen, and unacknowledged alarms are visible from every
  screen — a banner, a persistent counter or a shell alarm bar.
- **HMI-ARCH-05** Commands and indications look different. A read-only state is not drawn as a button, a
  command shows the state it will produce, hazardous commands ask for confirmation, and no button
  silently re-arms itself.
- **HMI-ARCH-06** Popups are for decisions only: confirm a command, show one alarm's detail, choose a
  setpoint. They are not the primary navigation, they are dismissible, they never nest more than one
  level deep, and nothing behind them keeps changing unnoticed.

## Apply

Draw the map before the screens: name the levels, name the areas, and list the routes the operator
actually takes (start of shift, alarm response, changeover, shutdown). The routes decide the navigation,
not the table of tags. If a route needs four clicks today, the architecture is asking the operator to
memorise a menu instead of the plant.

Then check the edges, because that is where real applications fail: an alarm raised while the operator is
in a level-4 trend, a popup opened over a screen that is about to update, a communication loss while the
alarm banner is the only thing that says so. The display has to remain honest in those moments.

## Anti-patterns

A home screen that is a grid of forty identical rectangles; navigation only on the home screen; an alarm
summary that is a menu entry, not an always-visible count; popups used for the main workflow; a header
that is a different height on every screen; a login screen that hides the alarm bar behind it.

## Related

`hmi-isa101-baseline` covers the visual layer these screens carry. `hmi-standards-precedence` covers what
to do when the existing application is built differently on purpose.
