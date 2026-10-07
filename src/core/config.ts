/** Hosts the reMarkable client talks to; null means the rmapi-js defaults. */
export interface RemarkableHosts {
	authHost: string;
	rawHost: string;
	uploadHost: string;
}

export interface Config {
	remarkable: RemarkableHosts | null;
	googleDocsOrigin: string;
	sharepointSuffix: string;
	/** Optional host permissions needed per feature (manifest optional_host_permissions). */
	origins: {
		google: string[];
		microsoft: string[];
		allSites: string[];
	};
	/** Accept test-only messages (E2E builds only). */
	e2eHooks: boolean;
}

export const defaultConfig: Config = {
	remarkable: null,
	googleDocsOrigin: "https://docs.google.com",
	sharepointSuffix: ".sharepoint.com",
	origins: {
		google: ["*://docs.google.com/*", "*://*.googleusercontent.com/*"],
		microsoft: ["*://*.sharepoint.com/*", "*://*.svc.ms/*"],
		allSites: ["<all_urls>"],
	},
	e2eHooks: false,
};

export function loadConfig(
	overrides: Partial<Config> | undefined = typeof __CONFIG__ === "undefined"
		? undefined
		: __CONFIG__,
): Config {
	return { ...defaultConfig, ...overrides };
}
