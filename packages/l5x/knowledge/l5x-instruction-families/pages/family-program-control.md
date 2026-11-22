Program control instructions are one family of the Logix 5000 instruction set. They change which routine or rung is evaluated next.

The Studio 5000 Logix Designer v37.05 installed help indexes 16 topic pages in this family. The v36.00 help indexes 13 instruction entries in the same family. Both indexes are structural: l5x_docs lists the title, the section and the relative help path, and reads page text from the local help installation at call time. Nothing from the vendor pages ships in this repository.

Representative mnemonics from the family: JSR, SBR, RET, JMP, LBL, MCR, AFI, NOP, TND.

When editing without Studio, JSR needs the called routine to exist and its SBR to open the first rung; SBR outside first rung and JSR without a return operand are both refused.

Call contents with collection "l5x-help-37-05" or "l5x-help-36-00" and pass the revision to list the family section in the installed help index, then search within it for the member you need.
