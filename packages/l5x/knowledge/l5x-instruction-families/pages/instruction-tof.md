TOF starts timing when its rung condition goes false and sets its done bit after the preset.

The done bit is set while the rung condition is true and stays set until the off-delay expires. A rung that removes the instruction's input tag also removes the timing, so failures in this pattern usually come from the input tag changing value, not from the timer.

Revision spelling is unchanged between 36 and 37.
