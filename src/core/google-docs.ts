import type { Http, Permissions } from "../adapters/ports";
import type { Config } from "./config";
import { SendFailure } from "./errors";
import { fetchChecked, isPdf } from "./pdf";
import type { Source } from "./source";

type GoogleDoc = Extract<Source, { kind: "google-doc" }>;

export function googleDocExportUrl(
	doc: Pick<GoogleDoc, "docId" | "accountIndex">,
	config: Config,
): string {
	const account =
		doc.accountIndex === undefined ? "" : `u/${doc.accountIndex}/`;
	return `${config.googleDocsOrigin}/document/${account}d/${doc.docId}/export?format=pdf`;
}

export interface GoogleDocsDeps {
	http: Http;
	permissions: Permissions;
	config: Config;
}

/** Downloads the whole document as PDF with the user's Google session (research R4). */
export async function exportGoogleDoc(
	doc: GoogleDoc,
	deps: GoogleDocsDeps,
): Promise<Uint8Array> {
	if (!(await deps.permissions.contains(deps.config.origins.google))) {
		throw new SendFailure({ kind: "permission-denied", site: "Google Docs" });
	}
	try {
		const result = await fetchChecked(
			deps.http,
			googleDocExportUrl(doc, deps.config),
		);
		if (!isPdf(result.contentType, result.bytes)) {
			throw new SendFailure({ kind: "not-a-pdf" });
		}
		return result.bytes;
	} catch (error) {
		if (error instanceof SendFailure && error.error.kind === "not-logged-in") {
			throw new SendFailure({ kind: "not-logged-in", service: "Google Docs" });
		}
		throw error;
	}
}
