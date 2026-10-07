/**
 * Injected into the page on demand (scripting.executeScript). Runs Readability
 * on a clone of the live DOM and exposes the result for a follow-up call.
 * Never touches extension storage (the device token stays in the background).
 */
import { Readability } from "@mozilla/readability";
import type { ExtractResult } from "../core/messages";

function extract(): ExtractResult {
	const clone = document.cloneNode(true) as Document;
	const article = new Readability(clone).parse();
	if (!article?.content) return { ok: false, reason: "no-readable-content" };

	const parsed = new DOMParser().parseFromString(article.content, "text/html");
	const imageUrls: string[] = [];
	for (const image of parsed.images) {
		const src = image.getAttribute("src");
		if (!src) continue;
		try {
			const url = new URL(src, document.baseURI).href;
			if (/^(https?:|data:)/.test(url) && !imageUrls.includes(url)) {
				imageUrls.push(url);
			}
		} catch {
			// unparseable src: skip
		}
	}

	return {
		ok: true,
		title: article.title || document.title,
		byline: article.byline ?? null,
		lang: article.lang || document.documentElement.lang || null,
		html: article.content,
		baseUrl: document.baseURI,
		imageUrls: imageUrls.slice(0, 500),
	};
}

(globalThis as { __rmPushExtract?: () => ExtractResult }).__rmPushExtract =
	extract;
