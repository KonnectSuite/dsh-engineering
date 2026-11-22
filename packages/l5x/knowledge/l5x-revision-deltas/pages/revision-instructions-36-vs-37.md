The committed instruction-versions.json records, per mnemonic, every help revision that documents it. Comparing the two installed help trees yields three useful groups:

Documented in both 36.00.00 and 37.05.00: the everyday ladder set - XIC, XIO, OTE, OTL, OTU, ONS, TON, TOF, CTU, CTD, ABS, ADD, SUB, MUL, DIV, COP, FLL, JSR, SBR, RET, MSG and the comparison instructions.

Documented in 36.00.00 only: the ASCII serial port instructions ABL, ACB, ACL, AHL, ARD, ARL, AWA and AWT. They are real instructions for controllers with a serial port, and the l5x_run_checks rule SERIAL_PORT_INSTRUCTION_UNSUPPORTED refuses them for controllers without one (the 5069 family and the 1756-L8 controllers). The current help no longer documents them, but programs that use them still exist, so the revision map keeps them.

Documented in 37.05.00 only: instructions introduced or documented after revision 36, including DCAF, ISINF and ISNAN. A project at revision 36 that contains one of these is a real finding: either the export was mislabelled or the program was written by a newer release.

Instruction count difference: 299 distinct mnemonics in the v36 flat help versus 328 in the v37 clinset help. The difference is not only new instructions - the two helps file different sub-topic pages under instruction titles, so count differences alone never prove a new instruction exists.

Reproduce the grouping with: read {id: "instruction-versions.json"} is not a page; instead use the adapter revision check, or inspect the committed knowledge/instruction-versions.json in the package.
