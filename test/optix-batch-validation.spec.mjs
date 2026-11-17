/**
 * The gate that decides whether a validated batch is applied.
 *
 * The defect this pins: `set_link` was unreachable through `optix_edit`. Measured live on bridge 1.0.9
 * (2026-11-17, `AryaSMTLineDemo`, linking `Alarms/Alm_FeederJam/InputValue` to `Model/Smt/ActiveFaults`),
 * `validate_ops` answers `ok: false` with the same entry in both lists —
 * `{"code":"unknown_op","message":"op 'set_link' is not validated by this bridge; it will be applied unchecked"}`
 * — and the old gate required `ok && errors.length === 0 && warnings.length === 0`, so the batch was refused
 * with `applied: 0` even though the bridge said it would apply the operation unchecked. `node/set-link` is the
 * only route that links a module-typed variable (a `bind` on a `VariableToLog` answers "VariableToLog has no
 * settable property 'Value'"), so refusing it closed off dynamic links to `VariablesToLog` entirely.
 *
 * The rule now: an `unknown_op` is the bridge naming an operation it cannot preflight, not a defect in the
 * operation. It lets the batch through and is reported as `unchecked` so the caller knows what went out
 * without a preflight. Any other error or warning still refuses.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { acceptedValidation, validationUnchecked } from "../packages/optix/lib/index.js";

const UNKNOWN_OP_MESSAGE = "op 'set_link' is not validated by this bridge; it will be applied unchecked";
/** The exact report the bridge returned for a one-operation `set_link` batch. */
const measuredSetLink = {
	ok: false,
	op_count: 1,
	strict: true,
	errors: [{ op_index: 0, code: "unknown_op", message: UNKNOWN_OP_MESSAGE }],
	warnings: [{ op_index: 0, code: "unknown_op", message: UNKNOWN_OP_MESSAGE }]
};

test("an op the bridge cannot preflight is applied unchecked, not refused", () => {
	assert.equal(acceptedValidation(measuredSetLink, 1), true);
	assert.deepEqual(validationUnchecked(measuredSetLink), [`0: ${UNKNOWN_OP_MESSAGE}`]);
});

test("a concrete defect still refuses the batch even beside an unchecked op", () => {
	const report = {
		ok: false,
		op_count: 2,
		errors: [
			{ op_index: 0, code: "unknown_op", message: UNKNOWN_OP_MESSAGE },
			{ op_index: 1, code: "unsupported_array_write", message: "Author array-valued properties in Studio directly." }
		],
		warnings: [{ op_index: 0, code: "unknown_op", message: UNKNOWN_OP_MESSAGE }]
	};
	assert.equal(acceptedValidation(report, 2), false);
	// The unchecked op is still named: it is what the bridge would have applied without a preflight.
	assert.deepEqual(validationUnchecked(report), [`0: ${UNKNOWN_OP_MESSAGE}`]);
});

test("a warning that is not an unchecked op still refuses", () => {
	assert.equal(acceptedValidation({
		ok: true,
		op_count: 1,
		errors: [],
		warnings: [{ op_index: 0, code: "ambiguous_target", message: "two nodes match this path" }]
	}, 1), false);
});

test("a clean report is accepted and reports nothing unchecked", () => {
	const clean = { ok: true, op_count: 3, errors: [], warnings: [] };
	assert.equal(acceptedValidation(clean, 3), true);
	assert.deepEqual(validationUnchecked(clean), []);
});

test("an ok:false report that names nothing is still a refusal", () => {
	// The bridge is allowed to withhold approval without explaining; that is not an unchecked op.
	assert.equal(acceptedValidation({ ok: false, op_count: 1, errors: [], warnings: [] }, 1), false);
});

test("an incomplete validation report throws rather than reading as approval", () => {
	for (const broken of [
		{ op_count: 1, errors: [], warnings: [] },
		{ ok: false, op_count: 2, errors: [], warnings: [] },
		{ ok: false, op_count: 1, errors: [], warnings: undefined }
	]) {
		assert.throws(() => acceptedValidation(broken, 1), /incomplete batch validation report/u);
	}
	assert.deepEqual(validationUnchecked(undefined), []);
	assert.deepEqual(validationUnchecked({}), []);
});
