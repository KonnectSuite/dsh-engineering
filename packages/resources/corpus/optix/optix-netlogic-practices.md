---
id: optix-netlogic-practices
title: NetLogic practices the runtime rewards
domain: optix
level: specialist
basis: [FactoryTalk Optix]
tags: [netlogic, csharp, lifecycle, threading]
applies_to: [optix]
rules: [OPTIX-NL-03, OPTIX-NL-04, OPTIX-NL-05, OPTIX-NL-06, OPTIX-NL-07, OPTIX-NL-08, OPTIX-NL-09, OPTIX-NL-10, OPTIX-NL-11, OPTIX-NL-12]
---
## Principle

A NetLogic compiles long before it behaves. The failures that reach an operator are silent ones:
a timer that stopped at the first exception, an observer that outlived its page, a `Start()` that
blocked the page load, a class quietly bound to no node. `optix_script` now reviews the source for
these, and `action: "review"` runs the same checks without writing anything; the rules below say what
it looks for and why. Each rule names the pinned cheat-sheet page it comes from, so the reasoning is
checkable rather than asserted.

## Lifecycle (`netlogic-lifecycle`)

- **OPTIX-NL-03** Dispose in `Stop()` whatever `Start()` started. A `PeriodicTask` that is not
  disposed keeps ticking after the page is gone.
- The lifecycle page documents a two-second threshold on `Start()` and a cascade when a page carries
  many NetLogics: resolve nodes and read configuration in `Start()`, but do not loop or block there.
- Some projects load a page repeatedly. `Start()` must therefore be safe to run again.

## Threading (`threading`)

- **OPTIX-NL-05** Resolve nodes once in `Start()` and keep the handles in fields. A
  `Project.Current.GetVariable(...)` inside a tick walks the model on the timer thread - the hot path
  the threading guide warns about.
- **OPTIX-NL-06** Never block: no `Thread.Sleep`, `.Wait()`, `.Result`, `GetAwaiter().GetResult()`,
  and no `async void`. These starve the thread pool the runtime shares with the UI and drivers.
- Writes to variables are safe from a task thread. Touching widgets, panels or other UI objects from a
  task thread is not: do it on the dispatcher, or let a binding react to the variable instead.

## Error isolation and observability (`log-output`)

- **OPTIX-NL-04** Wrap the tick body in `try/catch`. An exception that escapes a `PeriodicTask` ends
  the timer for the session, and the screen keeps showing the last value - the classic
  "looks right, frozen" failure.
- **OPTIX-NL-07** Never write an empty `catch`. Log it.
- **OPTIX-NL-11** Log something. `Log.Info/Warning/Error(category, message)` with the class name as
  category is what makes `Optix Studio Output` and the emulator log usable; `Log.Node(node)` prints a
  node path when the failing node is not obvious.
- **OPTIX-NL-12** Keep a node path in one constant (or read through `LogicObject`/`Owner`) instead of
  scattering string literals: a project move breaks literals silently.

## Observers (`register-observers`)

- **OPTIX-NL-08** Every `+=` needs its `-=` in `Stop()`. A subscription that outlives the class keeps
  the object alive and fires handlers after the page closed.
- Keep the handler small and non-throwing: it runs on the thread that changed the variable.

## Design time versus runtime (`netlogic-lifecycle`)

- **OPTIX-NL-09** Studio does not fire `Start()` for a design-time NetLogic, so background work in one
  never runs and hides in the build. A design class is `[ExportMethod]` helpers only; background work
  belongs to a runtime class attached to the object whose lifetime it needs.
- **OPTIX-NL-10** The class name must equal the NetLogic node name: that equality *is* the binding.
  A renamed class is a node with no logic, which compiles fine.

## Runtime-only concerns

- A PLC or fieldbus write from a timer needs a guard against overwriting an operator's command: write
  only when the value differs or the mode is automatic.
- Batch related writes in one tick rather than many small ones; the OPC UA client sees each write.
- Long work belongs in a task with cancellation, not in the tick, and `Stop()` should cancel it.

## Apply

1. `optix_script { action: "add", template: "periodic" }` starts from the safe shape: cached handles,
   `try/catch`, `Log.Error`, dispose in `Stop()`.
2. Write the behaviour into `Tick` and resolve new nodes in `Start`.
3. `optix_script { action: "review", name }` must answer `clean` (`review` warnings are acceptable only
   with a reason; `block` means fix it).
4. Build in Studio, then prove it at runtime: a value that changes on a bound screen is the only
   evidence the class is loaded and running.
