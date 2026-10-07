import type { Config } from "./config";
import type { ClassifiedUrl } from "./source";

const INTERNAL_SCHEMES = [
	"about:",
	"moz-extension:",
	"view-source:",
	"chrome:",
];
const WORD_UNSUPPORTED_HOSTS = [
	"onedrive.live.com",
	"1drv.ms",
	"word.cloud.microsoft",
];
const GOOGLE_DOC_PATH = /^\/document\/(?:u\/(\d+)\/)?d\/([A-Za-z0-9_-]+)/;
// Optional sharing-link prefix (/:w:/r, /:w:/g, …), then the site path; Word uses Doc.aspx or doc2.aspx.
const SHAREPOINT_DOC =
	/^(?:\/:[a-z]:\/[a-z])?(.*?)\/_layouts\/15\/doc2?\.aspx$/i;

function isSharepointHost(host: string, suffix: string): boolean {
	return host === suffix.replace(/^\./, "") || host.endsWith(suffix);
}

/** Maps a tab or link URL to a source kind (FR-009); first match wins. */
export function classify(
	raw: string,
	config: Config,
	contentTypeHint?: string,
): ClassifiedUrl {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return { kind: "unsendable" };
	}
	if (INTERNAL_SCHEMES.includes(url.protocol)) return { kind: "unsendable" };

	const isPdfPath = url.pathname.toLowerCase().endsWith(".pdf");

	if (url.protocol === "file:") {
		return isPdfPath
			? { kind: "local-file", url: raw }
			: { kind: "unsendable" };
	}
	if (url.protocol === "data:") {
		return url.pathname.startsWith("application/pdf")
			? { kind: "pdf-url", url: raw }
			: { kind: "unsendable" };
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return { kind: "unsendable" };
	}

	if (url.origin === config.googleDocsOrigin) {
		const match = GOOGLE_DOC_PATH.exec(url.pathname);
		if (match?.[2]) {
			return match[1] === undefined
				? { kind: "google-doc", docId: match[2] }
				: {
						kind: "google-doc",
						docId: match[2],
						accountIndex: Number(match[1]),
					};
		}
	}

	if (isSharepointHost(url.hostname, config.sharepointSuffix)) {
		const match = SHAREPOINT_DOC.exec(url.pathname);
		const sourcedoc = url.searchParams.get("sourcedoc");
		if (match && sourcedoc) {
			return {
				kind: "word-sharepoint",
				siteUrl: `${url.origin}${match[1]}`,
				fileGuid: sourcedoc.replace(/[{}]/g, ""),
			};
		}
	}

	if (
		WORD_UNSUPPORTED_HOSTS.includes(url.hostname) ||
		url.hostname.endsWith(".officeapps.live.com")
	) {
		return { kind: "word-unsupported", url: raw };
	}

	if (isPdfPath || contentTypeHint === "application/pdf") {
		return { kind: "pdf-url", url: raw };
	}
	return { kind: "web", url: raw };
}
