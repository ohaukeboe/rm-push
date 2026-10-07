import type { Http, Permissions, Tabs } from "../adapters/ports";
import type { Config } from "./config";
import { SendFailure } from "./errors";
import { fetchChecked, isPdf } from "./pdf";
import type { FetchOutcome } from "./send-job";
import type { Source } from "./source";

type SharepointDoc = Extract<Source, { kind: "word-sharepoint" }>;

const SERVICE = "Microsoft SharePoint";

/**
 * The undocumented v2.0 conversion endpoint (research R5). The path is
 * relative to the site's default document library, the first folder after
 * the site path.
 */
export function sharepointExportUrl(
	siteUrl: string,
	serverRelativeUrl: string,
): string {
	const site = new URL(siteUrl);
	const sitePath = site.pathname.replace(/\/$/, "");
	const inSite = serverRelativeUrl.startsWith(`${sitePath}/`)
		? serverRelativeUrl.slice(sitePath.length + 1)
		: serverRelativeUrl.replace(/^\//, "");
	const inLibrary = inSite
		.split("/")
		.slice(1)
		.map(encodeURIComponent)
		.join("/");
	return `${site.origin}/_api/v2.0/sites/${site.hostname}:${sitePath}:/drive/root:/${inLibrary}:/content?format=PDF`;
}

export interface SharepointDeps {
	http: Http;
	permissions: Permissions;
	config: Config;
}

function serverRelativeUrlOf(body: Uint8Array): string | null {
	try {
		const parsed = JSON.parse(new TextDecoder().decode(body)) as {
			ServerRelativeUrl?: unknown;
			d?: { ServerRelativeUrl?: unknown };
		};
		const value = parsed.ServerRelativeUrl ?? parsed.d?.ServerRelativeUrl;
		return typeof value === "string" ? value : null;
	} catch {
		return null;
	}
}

/** Converts a SharePoint / OneDrive for Business Word document to PDF with the user's session. */
export async function exportSharepointWord(
	doc: SharepointDoc,
	deps: SharepointDeps,
): Promise<Uint8Array> {
	if (!(await deps.permissions.contains(deps.config.origins.microsoft))) {
		throw new SendFailure({ kind: "permission-denied", site: SERVICE });
	}
	try {
		const lookup = await fetchChecked(
			deps.http,
			`${doc.siteUrl}/_api/web/GetFileById('${doc.fileGuid}')?$select=ServerRelativeUrl`,
			{ headers: { Accept: "application/json;odata=nometadata" } },
		);
		const path = serverRelativeUrlOf(lookup.bytes);
		if (!path) {
			throw new SendFailure({ kind: "service-error", status: lookup.status });
		}
		const result = await fetchChecked(
			deps.http,
			sharepointExportUrl(doc.siteUrl, path),
		);
		if (!isPdf(result.contentType, result.bytes)) {
			throw new SendFailure({ kind: "not-a-pdf" });
		}
		return result.bytes;
	} catch (error) {
		if (error instanceof SendFailure && error.error.kind === "not-logged-in") {
			throw new SendFailure({ kind: "not-logged-in", service: SERVICE });
		}
		throw error;
	}
}

/** Word hosts without a cookie-based export: guide the user to download a PDF. */
export async function openWordFallback(tabs: Tabs): Promise<FetchOutcome> {
	await tabs.openExtensionPage("upload.html", { reason: "word" });
	return { kind: "handed-off" };
}
