Raw analog input tags are integers or reals that need scaling before the process logic can use them. The safe shape is: convert, scale, clamp, then use.

A minimal scale of a 4-20 mA input needs the raw range, the engineering range and a clamp. A short invalid intermediate is worse than none: stage the whole scale as one compute expression, never as half-typed math.

The offline-friendly shape, which validates against the instruction catalogue:

    XIC(ChannelValid) CPT(ScaleOutput,(RawChannel - 6240) * (100.0 / 24960.0));
    XIC(ChannelValid) LIMIT(0.0,ScaleOutput,100.0,ScaleClamped);

Notes:

- clamp before the value reaches the process: an out-of-range raw value silently produces a plausible number otherwise;
- put the raw minimum, raw maximum and engineering range in the rung comment or the tag description; an offline reviewer cannot infer 6240 from 4 mA;
- check the source tag's type: a DINT raw input with a REAL destination needs the conversion the catalogue will check;
- named pattern analog_scale in l5x_compose_rung builds the scale-and-clamp form.

If the process uses an engineering unit structure or a process object, use the object's own scaling rather than reimplementing it; a second scale path is a maintenance defect.
