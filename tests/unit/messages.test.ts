import { describe, expect, test } from "bun:test";
import { parseExtractResult, parseRequest } from "../../src/core/messages";

const folder = { id: "f1", name: "Inbox" };
const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;

describe("parseRequest accepts", () => {
	const valid: unknown[] = [
		{ type: "status" },
		{ type: "pair", code: "abcdefgh" },
		{ type: "disconnect" },
		{ type: "list-folders" },
		{ type: "set-default-folder", folder },
		{ type: "set-default-folder", folder: null },
		{ type: "send-current", mode: "auto" },
		{ type: "send-current", mode: "print", folder },
		{ type: "send-current", mode: "auto", folder: null },
		{
			type: "send-file",
			name: "a.pdf",
			bytes: pdfBytes,
			mime: "application/pdf",
		},
		{
			type: "send-file",
			name: "a.epub",
			bytes: pdfBytes,
			mime: "application/epub+zip",
			folder,
		},
	];
	for (const message of valid) {
		test(JSON.stringify(message), () => {
			const result = parseRequest(message);
			expect(result.ok).toBe(true);
		});
	}
});

describe("parseRequest rejects", () => {
	const invalid: unknown[] = [
		null,
		"status",
		{},
		{ type: "unknown" },
		{ type: "pair" },
		{ type: "pair", code: 12345678 },
		{ type: "set-default-folder" },
		{ type: "set-default-folder", folder: { id: 1 } },
		{ type: "send-current", mode: "fast" },
		{ type: "send-file", name: "a", bytes: "xx", mime: "application/pdf" },
		{ type: "send-file", name: "a", bytes: pdfBytes, mime: "text/plain" },
	];
	for (const message of invalid) {
		test(JSON.stringify(message), () => {
			expect(parseRequest(message)).toEqual({
				ok: false,
				error: { kind: "bad-message" },
			});
		});
	}

	test("send-file over 100 MB is too-large", () => {
		const big = new ArrayBuffer(100 * 1024 * 1024 + 1);
		expect(
			parseRequest({
				type: "send-file",
				name: "big.pdf",
				bytes: big,
				mime: "application/pdf",
			}),
		).toEqual({ ok: false, error: { kind: "too-large" } });
	});
});

describe("parseExtractResult", () => {
	const good = {
		ok: true as const,
		title: "T",
		byline: null,
		lang: "en",
		html: "<p>hi</p>",
		baseUrl: "https://example.com/a",
		imageUrls: ["https://example.com/i.png", "data:image/png;base64,AA=="],
	};

	test("accepts a valid result", () => {
		expect(parseExtractResult(good)).toEqual(good);
	});

	test("passes through a failure", () => {
		expect(
			parseExtractResult({ ok: false, reason: "no-readable-content" }),
		).toEqual({ ok: false, reason: "no-readable-content" });
	});

	const noContent = { ok: false, reason: "no-readable-content" } as const;

	test("malformed result is no-readable-content", () => {
		expect(parseExtractResult(undefined)).toEqual(noContent);
		expect(parseExtractResult({ ...good, html: 5 })).toEqual(noContent);
	});

	test("html over 20 MB is rejected", () => {
		expect(
			parseExtractResult({ ...good, html: "x".repeat(20 * 1024 * 1024 + 1) }),
		).toEqual(noContent);
	});

	test("more than 500 images is rejected", () => {
		expect(
			parseExtractResult({
				...good,
				imageUrls: Array.from({ length: 501 }, (_, i) => `https://e.com/${i}`),
			}),
		).toEqual(noContent);
	});

	test("non http(s)/data image URL is rejected", () => {
		expect(
			parseExtractResult({ ...good, imageUrls: ["file:///etc/passwd"] }),
		).toEqual(noContent);
	});
});
