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
const SITE = "https://contoso.sharepoint.com/sites/Team";
const GUID = "1A2B3C4D-0000-1111-2222-333344445555";
const LOOKUP = `${SITE}/_api/web/GetFileById('${GUID}')?$select=ServerRelativeUrl`;
const EXPORT =
	"https://contoso.sharepoint.com/_api/v2.0/sites/contoso.sharepoint.com:/sites/Team:/drive/root:/Plans/Q4%20Plan.docx:/content?format=PDF";
const json = (value: unknown) => ({
	contentType: "application/json",
	bytes: new TextEncoder().encode(JSON.stringify(value)),
});

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
	test("path is relative to the default document library", () => {
		expect(
			sharepointExportUrl(
				SITE,
				"/sites/Team/Shared Documents/Plans/Q4 Plan.docx",
			),
		).toBe(EXPORT);
	});

	test("personal OneDrive for Business site", () => {
		expect(
			sharepointExportUrl(
				"https://contoso-my.sharepoint.com/personal/me_contoso_com",
				"/personal/me_contoso_com/Documents/a.docx",
			),
		).toBe(
			"https://contoso-my.sharepoint.com/_api/v2.0/sites/contoso-my.sharepoint.com:/personal/me_contoso_com:/drive/root:/a.docx:/content?format=PDF",
		);
	});
});

describe("exportSharepointWord", () => {
	test("looks up the file path, then downloads the PDF conversion", async () => {
		const result = await run({
			[LOOKUP]: json({
				ServerRelativeUrl: "/sites/Team/Shared Documents/Plans/Q4 Plan.docx",
			}),
			[EXPORT]: {
				finalUrl: "https://euc-mediap.svc.ms/transform/pdf?provider=spo",
				contentType: "application/pdf",
				bytes: PDF,
			},
		});
		expect(result).toEqual(PDF);
	});

	test("accepts the verbose OData shape", async () => {
		const result = await run({
			[LOOKUP]: json({
				d: {
					ServerRelativeUrl: "/sites/Team/Shared Documents/Plans/Q4 Plan.docx",
				},
			}),
			[EXPORT]: { contentType: "application/pdf", bytes: PDF },
		});
		expect(result).toEqual(PDF);
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
					[LOOKUP]: {
						finalUrl: "https://login.microsoftonline.com/x",
						contentType: "text/html",
					},
				}),
			),
		).toEqual({ kind: "not-logged-in", service: "Microsoft SharePoint" });
	});

	test("403 on the export is export-forbidden", async () => {
		expect(
			await failure(
				run({
					[LOOKUP]: json({
						ServerRelativeUrl:
							"/sites/Team/Shared Documents/Plans/Q4 Plan.docx",
					}),
					[EXPORT]: { status: 403 },
				}),
			),
		).toEqual({ kind: "export-forbidden" });
	});

	test("unexpected lookup response is service-error", async () => {
		expect(await failure(run({ [LOOKUP]: json({ nope: 1 }) }))).toEqual({
			kind: "service-error",
			status: 200,
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
