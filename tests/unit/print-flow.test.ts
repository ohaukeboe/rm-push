import { describe, expect, test } from "bun:test";
import { nextStepAfterSave, printFileName } from "../../src/core/print-flow";

describe("print flow", () => {
	test("file name is the sanitized title with .pdf", () => {
		expect(printFileName("A: B / C")).toBe("A B C.pdf");
	});

	for (const status of ["saved", "replaced"] as const) {
		test(`${status} opens the upload page`, () => {
			expect(nextStepAfterSave(status, "My Page")).toEqual({
				kind: "open-upload",
				query: { reason: "print", expected: "My Page.pdf" },
			});
		});
	}

	for (const status of ["canceled", "not_saved", "not_replaced"] as const) {
		test(`${status} cancels`, () => {
			expect(nextStepAfterSave(status, "My Page")).toEqual({
				kind: "canceled",
			});
		});
	}
});
