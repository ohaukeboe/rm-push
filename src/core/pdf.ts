import {
	type Http,
	type HttpResult,
	NetworkError,
	type Tabs,
} from "../adapters/ports";
import {
	MAX_UPLOAD_BYTES,
	mapHttpStatus,
	networkError,
	SendFailure,
} from "./errors";
import type { FetchOutcome } from "./send-job";

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export function isPdf(contentType: string, bytes: Uint8Array): boolean {
	if (contentType.split(";")[0]?.trim().toLowerCase() === "application/pdf") {
		return true;
	}
	return PDF_MAGIC.every((byte, i) => bytes[i] === byte);
}

/** Fetches a URL and fails with a SendFailure unless the body is usable. */
export async function fetchChecked(
	http: Http,
	url: string,
	init?: RequestInit,
): Promise<HttpResult> {
	let result: HttpResult;
	try {
		result = await http.fetch(url, init);
	} catch (error) {
		if (error instanceof NetworkError) throw new SendFailure(networkError(url));
		throw error;
	}
	const error = mapHttpStatus(result.status, result.finalUrl);
	if (error) throw new SendFailure(error);
	return result;
}

export async function fetchPdf(http: Http, url: string): Promise<Uint8Array> {
	const result = await fetchChecked(http, url);
	if (!isPdf(result.contentType, result.bytes)) {
		throw new SendFailure({ kind: "not-a-pdf" });
	}
	if (result.bytes.byteLength > MAX_UPLOAD_BYTES) {
		throw new SendFailure({ kind: "too-large" });
	}
	return result.bytes;
}

/** file:// PDFs cannot be fetched by extensions; let the user pick the file. */
export async function openUploadForLocalFile(
	tabs: Tabs,
	url: string,
): Promise<FetchOutcome> {
	const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
	await tabs.openExtensionPage("upload.html", {
		reason: "file",
		expected: name,
	});
	return { kind: "handed-off" };
}
