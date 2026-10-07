import { describe, expect, test } from "bun:test";
import { defaultConfig, loadConfig } from "../../src/core/config";

describe("loadConfig", () => {
	test("uses production defaults without overrides", () => {
		expect(loadConfig(undefined)).toEqual({
			remarkable: null,
			googleDocsOrigin: "https://docs.google.com",
			sharepointSuffix: ".sharepoint.com",
			origins: {
				google: ["*://docs.google.com/*", "*://*.googleusercontent.com/*"],
				microsoft: ["*://*.sharepoint.com/*", "*://*.svc.ms/*"],
				allSites: ["<all_urls>"],
			},
			e2eHooks: false,
		});
	});

	test("defaults apply when no build-time config is defined", () => {
		expect(loadConfig()).toEqual(defaultConfig);
	});

	test("overrides replace individual fields", () => {
		const hosts = {
			authHost: "http://127.0.0.1:1",
			rawHost: "http://127.0.0.1:1",
			uploadHost: "http://127.0.0.1:1",
		};
		const config = loadConfig({ remarkable: hosts });
		expect(config.remarkable).toEqual(hosts);
		expect(config.googleDocsOrigin).toBe("https://docs.google.com");
	});
});
