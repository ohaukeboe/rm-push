import { beforeEach, describe, expect, test } from "bun:test";
import { defaultConfig } from "../../src/core/config";
import { SendFailure } from "../../src/core/errors";
import {
	exportSharepointWord,
	openWordFallback,
	sharepointExportUrl,
} from "../../src/core/sharepoint";
import { FakePermissions, FakeTabs } from "../fakes/browser";
import { cannedHttp } from "../fakes/http";

const PDF = new TextEncoder().encode("%PDF-1.4 x");
const SITE = "https://contoso-my.sharepoint.com/personal/me_contoso_no";
const GUID = "8810A250-0678-4934-9FFE-338012CAA8AC";
// Verified against a real OneDrive for Business account (2026-10-07).
const EXPORT = `${SITE}/_api/v2.0/drive/items/${GUID}/content?format=pdf`;

let permissions: FakePermissions;
beforeEach(() => {
	permissions = new FakePermissions();
	for (const origin of defaultConfig.origins.microsoft)
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

const source = {
	kind: "word-sharepoint" as const,
	siteUrl: SITE,
	fileGuid: GUID,
};
const run = (table: Parameters<typeof cannedHttp>[0]) =>
	exportSharepointWord(source, {
		http: cannedHttp(table),
		permissions,
		config: defaultConfig,
	});

describe("sharepointExportUrl", () => {
	test("converts the item by its GUID on the site's drive", () => {
		expect(sharepointExportUrl(SITE, GUID)).toBe(EXPORT);
	});

	test("tolerates a trailing slash on the site", () => {
		expect(sharepointExportUrl(`${SITE}/`, GUID)).toBe(EXPORT);
	});
});

describe("exportSharepointWord", () => {
	test("downloads the PDF conversion in one request", async () => {
		const http = cannedHttp({
			[EXPORT]: {
				finalUrl: "https://euc-mediap.svc.ms/transform/pdf?provider=spo",
				contentType: "application/pdf",
				bytes: PDF,
			},
		});
		expect(
			await exportSharepointWord(source, {
				http,
				permissions,
				config: defaultConfig,
			}),
		).toEqual(PDF);
		expect(http.calls).toEqual([EXPORT]);
	});

	test("missing Microsoft access is permission-denied", async () => {
		permissions.granted.clear();
		expect(await failure(run({}))).toEqual({
			kind: "permission-denied",
			site: "Microsoft SharePoint",
		});
	});

	test("login redirect is not-logged-in to Microsoft SharePoint", async () => {
		expect(
			await failure(
				run({
					[EXPORT]: {
						finalUrl: "https://login.microsoftonline.com/x",
						contentType: "text/html",
					},
				}),
			),
		).toEqual({ kind: "not-logged-in", service: "Microsoft SharePoint" });
	});

	test("403 is export-forbidden", async () => {
		expect(await failure(run({ [EXPORT]: { status: 403 } }))).toEqual({
			kind: "export-forbidden",
		});
	});

	test("other HTTP errors name SharePoint, not reMarkable", async () => {
		expect(await failure(run({ [EXPORT]: { status: 400 } }))).toEqual({
			kind: "source-error",
			host: "contoso-my.sharepoint.com",
			status: 400,
		});
	});
});

describe("openWordFallback", () => {
	test("opens the upload page with Word instructions", async () => {
		const tabs = new FakeTabs();
		expect(await openWordFallback(tabs)).toEqual({ kind: "handed-off" });
		expect(tabs.opened).toEqual([
			{ path: "upload.html", query: { reason: "word" } },
		]);
	});
});
