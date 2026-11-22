An interlock is a condition that prevents an action, and the best interlock is one a reviewer can find without opening the HMI.

Shape: put every prevent condition on the same rung as the output, and document each one.

    XIC(StartCmd) XIO(StopCmd) XIC(Permissive1) XIC(Permissive2) OTE(RunCmd);

Better for diagnosis, one rung per permissive feeding a single permission bit:

    XIC(Permissive1) XIC(Permissive2) OTE(CanRun);
    XIC(StartCmd) XIC(CanRun) XIC(RunCmd) ... OTE(RunCmd);

The second shape costs one rung and tells the next person which permissive is missing. That is worth it whenever the interlock can be tripped independently of the start command.

Rules:

- no hidden permissive inside a compare that also scales a value;
- no permissive inside a one-shot (it becomes untestable);
- bypasses and overrides are explicit tags with names containing BYPASS or OVERRIDE, never a literal forced true;
- a safety interlock is not bypassed in a standard task; l5x_run_checks reports safety writes and placement findings.

Named pattern: interlock composes the single-permission-bit form.
