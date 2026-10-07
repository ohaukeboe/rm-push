import type { Config } from "./config";
import type { ClassifiedUrl } from "./source";

export interface SiteAccess {
	/** Name shown to the user, e.g. in "Firefox access to <site> is needed". */
	site: string;
	origins: string[];
	/** True when the feature still works without it (e.g. web pages without images). */
	optional: boolean;
}

/** Optional host permissions a source kind needs (research R8). */
export function siteAccessFor(
	kind: ClassifiedUrl["kind"],
	config: Config,
): SiteAccess | null {
	switch (kind) {
		case "google-doc":
			return {
				site: "Google Docs",
				origins: config.origins.google,
				optional: false,
			};
		case "word-sharepoint":
			return {
				site: "Microsoft SharePoint",
				origins: config.origins.microsoft,
				optional: false,
			};
		case "web":
			return {
				site: "all websites (for page images)",
				origins: config.origins.allSites,
				optional: true,
			};
		default:
			return null;
	}
}
