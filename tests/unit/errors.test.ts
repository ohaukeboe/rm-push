import { describe, expect, test } from "bun:test";
import {
	mapHttpStatus,
	type SendError,
	sendErrorKinds,
	userMessage,
} from "../../src/core/errors";

describe("sendErrorKinds", () => {
	test("lists every kind from the data model", () => {
		expect<string[]>([...sendErrorKinds].sort()).toEqual(
			[
				"bad-message",
				"export-forbidden",
				"invalid-code",
				"needs-reconnect",
				"network",
				"no-readable-content",
				"not-a-pdf",
				"not-connected",
				"not-logged-in",
				"permission-denied",
				"service-error",
				"source-error",
				"too-large",
				"unsendable-page",
			].sort(),
		);
	});
});

describe("mapHttpStatus", () => {
	const url = "https://example.com/file";

	test("2xx is not an error", () => {
		expect(mapHttpStatus(200, url)).toBeNull();
		expect(mapHttpStatus(204, url)).toBeNull();
	});

	test("401 is not-logged-in", () => {
		expect(mapHttpStatus(401, url)).toEqual({
			kind: "not-logged-in",
			service: "example.com",
		});
	});

	test("a redirect that ends on a login host is not-logged-in", () => {
		for (const login of [
			"https://accounts.google.com/ServiceLogin?continue=x",
			"https://login.microsoftonline.com/common/oauth2",
			"https://login.live.com/login.srf",
		]) {
			expect(mapHttpStatus(200, login)?.kind).toBe("not-logged-in");
		}
	});

	test("403 is export-forbidden", () => {
		expect(mapHttpStatus(403, url)?.kind).toBe("export-forbidden");
	});

	test("other 4xx and 5xx are source-error naming the site", () => {
		expect(mapHttpStatus(404, url)).toEqual({
			kind: "source-error",
			host: "example.com",
			status: 404,
		});
		expect(mapHttpStatus(502, url)).toEqual({
			kind: "source-error",
			host: "example.com",
			status: 502,
		});
	});
});

describe("userMessage", () => {
	const cases: [SendError, string][] = [
		[{ kind: "not-connected" }, "Connect your reMarkable account first."],
		[
			{ kind: "needs-reconnect" },
			"reMarkable rejected the connection. Pair again.",
		],
		[
			{ kind: "permission-denied", site: "Google Docs" },
			"Firefox access to Google Docs is needed. Click to grant.",
		],
		[
			{ kind: "network", host: "example.com" },
			"Could not reach example.com. Check your connection and retry.",
		],
		[{ kind: "not-a-pdf" }, "The link did not return a PDF."],
		[
			{ kind: "export-forbidden" },
			"The document's owner has disabled downloading.",
		],
		[
			{ kind: "not-logged-in", service: "Google Docs" },
			"You are not signed in to Google Docs in this browser.",
		],
		[
			{ kind: "no-readable-content" },
			"Could not find readable content on this page.",
		],
		[
			{ kind: "too-large" },
			"The document is larger than reMarkable accepts (100 MB).",
		],
		[
			{ kind: "service-error", status: 500 },
			"reMarkable's service returned an error (500). It may have changed; try updating the extension.",
		],
		[{ kind: "unsendable-page" }, "This page cannot be sent."],
		[
			{ kind: "source-error", host: "contoso.sharepoint.com", status: 400 },
			"contoso.sharepoint.com returned an error (400) while downloading the document.",
		],
		[
			{ kind: "invalid-code" },
			"That code is invalid or expired. Get a new code and try again.",
		],
	];

	for (const [error, text] of cases) {
		test(error.kind, () => {
			expect(userMessage(error)).toBe(text);
		});
	}
});
