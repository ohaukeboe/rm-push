import { describe, expect, test } from "bun:test";
import { classify } from "../../src/core/classify";
import { defaultConfig } from "../../src/core/config";

const c = (url: string, hint?: string) => classify(url, defaultConfig, hint);

describe("classify", () => {
	test("internal pages are not sendable", () => {
		for (const url of [
			"about:newtab",
			"moz-extension://abc/popup.html",
			"view-source:https://example.com",
			"chrome://browser/content/browser.xhtml",
		]) {
			expect(c(url)).toEqual({ kind: "unsendable" });
		}
	});

	test("unparseable URL is not sendable", () => {
		expect(c("not a url")).toEqual({ kind: "unsendable" });
	});

	test("Google Docs document", () => {
		expect(
			c("https://docs.google.com/document/d/AbC_12-x/edit?tab=t.0"),
		).toEqual({ kind: "google-doc", docId: "AbC_12-x" });
		expect(c("https://docs.google.com/document/u/1/d/AbC/edit")).toEqual({
			kind: "google-doc",
			docId: "AbC",
			accountIndex: 1,
		});
	});

	test("Google Docs origin comes from config", () => {
		const config = {
			...defaultConfig,
			googleDocsOrigin: "http://127.0.0.1:8787",
		};
		expect(
			classify("http://127.0.0.1:8787/document/d/abc/edit", config),
		).toEqual({ kind: "google-doc", docId: "abc" });
	});

	test("SharePoint Word document", () => {
		expect(
			c(
				"https://contoso.sharepoint.com/sites/Team/_layouts/15/Doc.aspx?sourcedoc=%7B1A2B3C4D-0000-1111-2222-333344445555%7D&file=Plan.docx&action=default",
			),
		).toEqual({
			kind: "word-sharepoint",
			siteUrl: "https://contoso.sharepoint.com/sites/Team",
			fileGuid: "1A2B3C4D-0000-1111-2222-333344445555",
		});
	});

	test("SharePoint personal (OneDrive for Business) site", () => {
		expect(
			c(
				"https://contoso-my.sharepoint.com/personal/me_contoso_com/_layouts/15/doc.aspx?sourcedoc={abc}",
			),
		).toEqual({
			kind: "word-sharepoint",
			siteUrl: "https://contoso-my.sharepoint.com/personal/me_contoso_com",
			fileGuid: "abc",
		});
	});

	test("SharePoint suffix comes from config", () => {
		const config = { ...defaultConfig, sharepointSuffix: "127.0.0.1" };
		expect(
			classify(
				"http://127.0.0.1:8787/sites/T/_layouts/15/Doc.aspx?sourcedoc={g}",
				config,
			),
		).toEqual({
			kind: "word-sharepoint",
			siteUrl: "http://127.0.0.1:8787/sites/T",
			fileGuid: "g",
		});
	});

	test("Word hosts without direct export", () => {
		for (const url of [
			"https://onedrive.live.com/edit?id=X&resid=Y",
			"https://1drv.ms/w/s!abc",
			"https://word.cloud.microsoft/open/onedrive/?docId=1",
			"https://euc-word-edit.officeapps.live.com/we/wordeditorframe.aspx",
		]) {
			expect(c(url)).toEqual({ kind: "word-unsupported", url });
		}
	});

	test("PDF by path or content type", () => {
		expect(c("https://example.com/paper.PDF")).toEqual({
			kind: "pdf-url",
			url: "https://example.com/paper.PDF",
		});
		expect(c("https://example.com/download?id=1", "application/pdf")).toEqual({
			kind: "pdf-url",
			url: "https://example.com/download?id=1",
		});
		expect(c("data:application/pdf;base64,JVBERi0=")).toEqual({
			kind: "pdf-url",
			url: "data:application/pdf;base64,JVBERi0=",
		});
	});

	test("local PDF file", () => {
		expect(c("file:///home/me/a.pdf")).toEqual({
			kind: "local-file",
			url: "file:///home/me/a.pdf",
		});
		expect(c("file:///home/me/a.txt")).toEqual({ kind: "unsendable" });
	});

	test("other web pages", () => {
		expect(c("https://example.com/article")).toEqual({
			kind: "web",
			url: "https://example.com/article",
		});
		expect(c("https://docs.google.com/spreadsheets/d/x/edit")).toEqual({
			kind: "web",
			url: "https://docs.google.com/spreadsheets/d/x/edit",
		});
	});
});
