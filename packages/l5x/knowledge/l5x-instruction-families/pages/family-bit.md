Bit instructions are one family of the Logix 5000 instruction set. They are the contacts, coils and one-shot instructions that every ladder routine is built from.

The Studio 5000 Logix Designer v37.05 installed help indexes 12 topic pages in this family. The v36.00 help indexes 10 instruction entries in the same family. Both indexes are structural: l5x_docs lists the title, the section and the relative help path, and reads page text from the local help installation at call time. Nothing from the vendor pages ships in this repository.

Representative mnemonics from the family: XIC, XIO, OTE, OTL, OTU, ONS, OSR, OSF, OSFI, OSRI.

When editing without Studio, a rung that reads a bit but never drives an output will be refused: end the rung in OTE, OTL, OTU or a similar output instruction.

Call contents with collection "l5x-help-37-05" or "l5x-help-36-00" and pass the revision to list the family section in the installed help index, then search within it for the member you need.
