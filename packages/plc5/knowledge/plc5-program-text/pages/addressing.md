# PLC-5 address grammar

A PLC-5 operand is a data-file reference. The file letter says what kind of value the
element holds, the number says which file, the element says which word or structure,
and the bit or member says which part.

## Data-file letters

| Letter | File | Element holds |
| --- | --- | --- |
| `O` | Output image | Bit-addressed process outputs. |
| `I` | Input image | Bit-addressed process inputs. |
| `S` | Status | Processor status words and bits. |
| `B` | Bit | 16-bit words addressed bitwise. |
| `T` | Timer | Timer structure: preset, accumulator, done, enable, timing. |
| `C` | Counter | Counter structure: preset, accumulator, done, overflow, underflow. |
| `R` | Control | Control structure for shifts and sequencers: length, position, done. |
| `N` | Integer | 16-bit signed integers. |
| `F` | Float | IEEE 754 floating point. |
| `D` | BCD | Binary-coded decimal values. |
| `A` | ASCII | Character data. |
| `ST` | String | Length-prefixed character strings. |
| `PD` | PID | PID control block. |
| `MG` | Message | Message control block. |
| `BT` | Block transfer | Block-transfer data area. |

A processor supports a subset; the text export shows only what the project contains.

## Address forms

```
N7:0            integer file 7, element 0
N7:10           integer file 7, element 10
B3:0/0          bit file 3, element 0, bit 0
T4:0.PRE        timer file 4, element 0, member PRE
C5:0.ACC        counter file 5, element 0, accumulator
R6:0.POS        control file 6, element 0, position
F8:1            float file 8, element 1
I:010/00        input image, rack/group digits 010, bit 00
O:013/01        output image, rack/group digits 013, bit 01
#N7:0           file operand: the address of the file/element, not its value
N7:[N10:0]      indirect: the element number comes from N10:0
```

## Rules that matter when reading a program

- **A file is a bounded array.** `N7:0` and `N7:99` are elements of one file whose
  length was declared when it was created. An address beyond the declared length is a
  defect, not a new element.
- **The bit slash is not division.** `B3:0/2` is bit 2 of word 0. The element and bit
  are separate fields.
- **Structures have members.** `T4:0` as an operand names the whole timer; `T4:0.PRE`
  names one member. A compare or move on the whole structure is unusual and means the
  exporter wrote something the instruction does not normally take.
- **The I/O digits are position, not value.** `I:010/00` is an input-image position;
  what is wired there is a project fact. The reader reports the address verbatim.
- **`#` means file, not element.** A leading `#` operand refers to a file or a range of
  elements and belongs to instructions that take a file operand (for example a block
  transfer or a file move). It is not a comment or a number sign.
- **Brackets mean an index.** The element number is computed at run time from another
  word. The census reports every bracket site; the value cannot be known statically.

## Indirect and file operands in the text export

The text export preserves the operand text as the exporter wrote it:

- `N7:[N10:0]` — indirect element address. The inner address supplies the element.
- `[N10:0]` alone — an indirect operand with no base; legal where the instruction takes
  a file address.
- `#N7:0` — file operand.
- `?` — a placeholder the exporter wrote for an operand it could not render. A `?` is
  not an address and is never silently treated as one.

The census counts these sites and reports them with their program file, rung number,
and instruction. A program with no brackets, no `#` operands, and no `?` is a program
whose operands are all statically visible, which is what a clean conversion wants.

## Addresses and the configured I/O

The configured chassis tells you which I/O addresses existed in the project's world.
The ladder tells you which of them the program actually referenced. The address grammar
does not tell you whether a reference is valid; `plc5_verify` checks the references it
can resolve against the data files the export declares, and the I/O tools answer the
rest from the `.RSP` project.
