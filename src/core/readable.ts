import type { Http, ImageCodec, Permissions } from "../adapters/ports";
import { buildEpub, type EpubImage, sanitizeArticleHtml } from "./epub";
import { SendFailure } from "./errors";
import type { ExtractResult } from "./messages";
import { fetchChecked } from "./pdf";
import type { FetchOutcome } from "./send-job";

/** Pages with less text than this are treated as having no article. */
const MIN_TEXT_LENGTH = 200;
const MAX_IMAGE_WIDTH = 1620;
const MAX_IMAGE_HEIGHT = 2160;
const IMAGE_CONCURRENCY = 6;

export interface ReadableDeps {
	http: Http;
	imageCodec: ImageCodec;
	permissions: Permissions;
}

function textLength(html: string): number {
	const doc = new DOMParser().parseFromString(html, "text/html");
	return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim().length;
}

function originPattern(url: string): string {
	const { protocol, hostname } = new URL(url);
	return `${protocol}//${hostname}/*`;
}

async function loadImage(
	url: string,
	deps: ReadableDeps,
): Promise<EpubImage | null> {
	try {
		const result = await fetchChecked(deps.http, url);
		const mime = result.contentType.split(";")[0]?.trim() || "image/*";
		return await deps.imageCodec.toRaster(
			result.bytes,
			mime,
			MAX_IMAGE_WIDTH,
			MAX_IMAGE_HEIGHT,
		);
	} catch {
		return null;
	}
}

/** Turns the extracted article into an EPUB with rasterised images (research R7). */
export async function buildReadableEpub(
	extract: ExtractResult,
	deps: ReadableDeps,
): Promise<FetchOutcome> {
	if (!extract.ok || textLength(extract.html) < MIN_TEXT_LENGTH) {
		throw new SendFailure({ kind: "no-readable-content" });
	}
	const { html, imageUrls } = sanitizeArticleHtml(
		extract.html,
		extract.baseUrl,
	);

	const allowed: string[] = [];
	for (const url of imageUrls) {
		if (
			url.startsWith("data:") ||
			(await deps.permissions.contains([originPattern(url)]))
		) {
			allowed.push(url);
		}
	}

	const images = new Map<string, EpubImage>();
	for (let i = 0; i < allowed.length; i += IMAGE_CONCURRENCY) {
		const batch = allowed.slice(i, i + IMAGE_CONCURRENCY);
		const loaded = await Promise.all(batch.map((url) => loadImage(url, deps)));
		batch.forEach((url, j) => {
			const image = loaded[j];
			if (image) images.set(url, image);
		});
	}

	const bytes = await buildEpub({
		title: extract.title,
		byline: extract.byline,
		lang: extract.lang,
		html,
		images,
	});
	return {
		kind: "doc",
		bytes,
		format: "epub",
		imagesSkipped: allowed.length < imageUrls.length,
	};
}
