import { describe, expect, test } from "bun:test";
import { defaultConfig } from "../../src/core/config";
import { siteAccessFor } from "../../src/core/site-access";

describe("siteAccessFor", () => {
	test("Google Docs needs the Google origins", () => {
		expect(siteAccessFor("google-doc", defaultConfig)).toEqual({
			site: "Google Docs",
			origins: ["*://docs.google.com/*", "*://*.googleusercontent.com/*"],
			optional: false,
		});
	});

	test("SharePoint needs the Microsoft origins", () => {
		expect(siteAccessFor("word-sharepoint", defaultConfig)?.origins).toEqual([
			"*://*.sharepoint.com/*",
			"*://*.svc.ms/*",
		]);
	});

	test("web pages optionally need all sites", () => {
		expect(siteAccessFor("web", defaultConfig)).toMatchObject({
			origins: ["<all_urls>"],
			optional: true,
		});
	});

	test("PDFs need nothing extra", () => {
		expect(siteAccessFor("pdf-url", defaultConfig)).toBeNull();
	});
});
