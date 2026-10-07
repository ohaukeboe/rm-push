import { beforeEach, describe, expect, test } from "bun:test";
import { defaultConfig } from "../../src/core/config";
import { SendFailure } from "../../src/core/errors";
import {
	exportGoogleDoc,
	googleDocExportUrl,
} from "../../src/core/google-docs";
import { FakePermissions } from "../fakes/browser";
import { cannedHttp } from "../fakes/http";

const PDF = new TextEncoder().encode("%PDF-1.4 x");
const URL_ = "https://docs.google.com/document/d/abc/export?format=pdf";
let permissions: FakePermissions;

beforeEach(() => {
	permissions = new FakePermissions();
	for (const origin of defaultConfig.origins.google)
		permissions.granted.add(origin);
});

async function failure(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof SendFailure) return error.error;
		throw error;
	}
	throw new Error("expected failure");
}

describe("googleDocExportUrl", () => {
	test("default account", () => {
		expect(googleDocExportUrl({ docId: "abc" }, defaultConfig)).toBe(URL_);
	});

	test("keeps the account index", () => {
		expect(
			googleDocExportUrl({ docId: "abc", accountIndex: 2 }, defaultConfig),
		).toBe("https://docs.google.com/document/u/2/d/abc/export?format=pdf");
	});
});

describe("exportGoogleDoc", () => {
	const source = { kind: "google-doc" as const, docId: "abc" };
	const run = (table: Parameters<typeof cannedHttp>[0]) =>
		exportGoogleDoc(source, {
			http: cannedHttp(table),
			permissions,
			config: defaultConfig,
		});

	test("returns the exported PDF, following redirects", async () => {
		expect(
			await run({
				[URL_]: {
					finalUrl: "https://doc-0s-docs.googleusercontent.com/export/abc",
					contentType: "application/pdf",
					bytes: PDF,
				},
			}),
		).toEqual(PDF);
	});

	test("missing Google access is permission-denied", async () => {
		permissions.granted.clear();
		expect(await failure(run({}))).toEqual({
			kind: "permission-denied",
			site: "Google Docs",
		});
	});

	test("403 is export-forbidden", async () => {
		expect(await failure(run({ [URL_]: { status: 403 } }))).toEqual({
			kind: "export-forbidden",
		});
	});

	test("redirect to the Google login page is not-logged-in", async () => {
		expect(
			await failure(
				run({
					[URL_]: {
						finalUrl: "https://accounts.google.com/ServiceLogin?continue=x",
						contentType: "text/html",
					},
				}),
			),
		).toEqual({ kind: "not-logged-in", service: "Google Docs" });
		expect(await failure(run({ [URL_]: { status: 401 } }))).toEqual({
			kind: "not-logged-in",
			service: "Google Docs",
		});
	});

	test("HTML instead of a PDF is not-a-pdf", async () => {
		expect(
			await failure(
				run({
					[URL_]: { contentType: "text/html", bytes: new Uint8Array([60]) },
				}),
			),
		).toEqual({ kind: "not-a-pdf" });
	});
});
