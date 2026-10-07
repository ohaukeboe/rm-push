import { describe, expect, test } from "bun:test";
import { SendFailure } from "../../src/core/errors";
import { fetchPdf, isPdf, openUploadForLocalFile } from "../../src/core/pdf";
import { FakeTabs } from "../fakes/browser";
import { cannedHttp } from "../fakes/http";

const PDF = new TextEncoder().encode("%PDF-1.7 ...");
const HTML = new TextEncoder().encode("<html></html>");

async function failure(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof SendFailure) return error.error;
		throw error;
	}
	throw new Error("expected failure");
}

describe("isPdf", () => {
	test("by content type or magic bytes", () => {
		expect(isPdf("application/pdf", HTML)).toBe(true);
		expect(isPdf("application/pdf; charset=binary", HTML)).toBe(true);
		expect(isPdf("application/octet-stream", PDF)).toBe(true);
		expect(isPdf("text/html", HTML)).toBe(false);
	});
});

describe("fetchPdf", () => {
	const url = "https://example.com/a.pdf";

	test("returns the bytes of a PDF", async () => {
		const http = cannedHttp({
			[url]: { contentType: "application/pdf", bytes: PDF },
		});
		expect(await fetchPdf(http, url)).toEqual(PDF);
	});

	test("non-PDF body is not-a-pdf", async () => {
		const http = cannedHttp({
			[url]: { contentType: "text/html", bytes: HTML },
		});
		expect(await failure(fetchPdf(http, url))).toEqual({ kind: "not-a-pdf" });
	});

	test("HTTP errors are mapped", async () => {
		const http = cannedHttp({ [url]: { status: 403 } });
		expect(await failure(fetchPdf(http, url))).toEqual({
			kind: "export-forbidden",
		});
		const http404 = cannedHttp({ [url]: { status: 404 } });
		expect(await failure(fetchPdf(http404, url))).toEqual({
			kind: "service-error",
			status: 404,
		});
	});

	test("unreachable is network", async () => {
		const http = cannedHttp({ [url]: "network" });
		expect(await failure(fetchPdf(http, url))).toEqual({
			kind: "network",
			host: "example.com",
		});
	});

	test("over 100 MB is too-large", async () => {
		const big = new Uint8Array(100 * 1024 * 1024 + 1);
		big.set(PDF);
		const http = cannedHttp({
			[url]: { contentType: "application/pdf", bytes: big },
		});
		expect(await failure(fetchPdf(http, url))).toEqual({ kind: "too-large" });
	});
});

describe("openUploadForLocalFile", () => {
	test("opens the upload page with the file name and hands the job off", async () => {
		const tabs = new FakeTabs();
		const outcome = await openUploadForLocalFile(
			tabs,
			"file:///home/me/My%20Paper.pdf",
		);
		expect(outcome).toEqual({ kind: "handed-off" });
		expect(tabs.opened).toEqual([
			{
				path: "upload.html",
				query: { reason: "file", expected: "My Paper.pdf" },
			},
		]);
	});
});
