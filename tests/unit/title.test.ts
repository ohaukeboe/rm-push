import { describe, expect, test } from "bun:test";
import { sanitizeTitle } from "../../src/core/title";

describe("sanitizeTitle", () => {
	test("trims and collapses whitespace", () => {
		expect(sanitizeTitle("  Hello \n\t  world  ")).toBe("Hello world");
	});

	test("strips control characters and forbidden characters", () => {
		expect(sanitizeTitle('a/b\\c:d*e?f"g<h>i|j\u0007k')).toBe("abcdefghijk");
	});

	test("strips trailing service suffixes and .pdf", () => {
		expect(sanitizeTitle("Report - Google Docs")).toBe("Report");
		expect(sanitizeTitle("Report - Word")).toBe("Report");
		expect(sanitizeTitle("paper.pdf")).toBe("paper");
		expect(sanitizeTitle("paper.PDF")).toBe("paper");
		expect(sanitizeTitle("Q4 Plan.docx")).toBe("Q4 Plan");
	});

	test("truncates to 120 characters", () => {
		const result = sanitizeTitle("x".repeat(300));
		expect(result).toHaveLength(120);
	});

	test("empty result becomes Untitled", () => {
		expect(sanitizeTitle("")).toBe("Untitled");
		expect(sanitizeTitle("  ///  ")).toBe("Untitled");
		expect(sanitizeTitle(".pdf")).toBe("Untitled");
	});
});
