Array (file) shift instructions are one family of the Logix 5000 instruction set. They shift or queue array contents on each false-to-true transition of their rung condition.

The Studio 5000 Logix Designer v37.05 installed help indexes 7 topic pages in this family. The v36.00 help indexes 6 instruction entries in the same family. Both indexes are structural: l5x_docs lists the title, the section and the relative help path, and reads page text from the local help installation at call time. Nothing from the vendor pages ships in this repository.

Representative mnemonics from the family: BSL, BSR, FFL, FFU, LFL, LFU.

When editing without Studio, the position and length operands of FFL/LFL style queues trip people up; read the operand list with l5x_list_instructions before drafting, and remember a shift executes only while the rung condition is true.

Call contents with collection "l5x-help-37-05" or "l5x-help-36-00" and pass the revision to list the family section in the installed help index, then search within it for the member you need.
