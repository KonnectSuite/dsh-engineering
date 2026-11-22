l5x_compose_logic is the chat-only composer: it needs no L5X and no ACD, validates syntax and the instruction catalogue, and writes nothing. Use it when the answer is "here is the rung you should write" and the caller has not exported a file yet.

Two input styles are accepted:

- structured, from a named pattern or a rung specification;
- rung text, in NeutralText such as XIC(Start) XIC(Run) XIO(Stop) OTE(Run); or in Studio paste form.

Named patterns the composer knows: start_stop_latch, fault_latch, ton_delay, interlock, analog_scale, totalizer, run_hour_meter. A pattern encodes an idiomatic, tested rung shape; prefer it over hand-writing the same logic.

What it validates: rung syntax, operand count and type against the instruction catalogue, branch structure, and that the rung drives the right rail. What it does not validate: that a tag with that name exists in your project - that requires an open project and l5x_draft_rung.

Because it writes nothing, it is the safe first step in a chat that may end with a suggestion rather than a file.
