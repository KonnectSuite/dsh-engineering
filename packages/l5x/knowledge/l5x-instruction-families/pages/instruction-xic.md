XIC is the normally-open contact: it passes the rung condition when its bit is true.

Operands: one BOOL tag, or a member of a structure. The tag can be an array element, in which case the operand names the element index. Offline, the common error is addressing an element outside the array - the parser accepts it when the tag resolves, but the reference tools can show whether the index is in range.

XIC never writes a tag. A rung built only from XIC and XIO will be refused with RUNG_NO_OUTPUT.
