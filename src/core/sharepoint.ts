import type { Http, Permissions, Tabs } from "../adapters/ports";
import type { Config } from "./config";
import { SendFailure } from "./errors";
import { fetchChecked, isPdf } from "./pdf";
import type { FetchOutcome } from "./send-job";
import type { Source } from "./source";

type SharepointDoc = Extract<Source, { kind: "word-sharepoint" }>;

const SERVICE = "Microsoft SharePoint";

/**
 * The undocumented v2.0 conversion endpoint (research R5): the file's GUID
 * (`sourcedoc`) addresses the item on the site's drive directly. Verified
 * against a real OneDrive for Business account on 2026-10-07.
 */
export function sharepointExportUrl(siteUrl: string, fileGuid: string): string {
	const site = siteUrl.replace(/\/$/, "");
	return `${site}/_api/v2.0/drive/items/${encodeURIComponent(fileGuid)}/content?format=pdf`;
}

export interface SharepointDeps {
	http: Http;
	permissions: Permissions;
	config: Config;
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
		const result = await fetchChecked(
			deps.http,
			sharepointExportUrl(doc.siteUrl, doc.fileGuid),
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
