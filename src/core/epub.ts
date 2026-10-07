import { render } from "teapub";

const REMOVED_ELEMENTS = [
	"script",
	"style",
	"link",
	"meta",
	"iframe",
	"frame",
	"form",
	"input",
	"button",
	"select",
	"textarea",
	"noscript",
	"object",
	"embed",
	"svg",
	"canvas",
	"video",
	"audio",
	"source",
	"template",
];
const REMOVED_ATTRIBUTES = new Set(["srcset", "sizes", "style"]);
const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const USABLE_URL = /^(https?:|data:)/i;

function absolute(url: string, base: string): string | null {
	try {
		return new URL(url, base).href;
	} catch {
		return null;
	}
}

/**
 * Cleans Readability output for an EPUB: removes active content, resolves
 * relative URLs and lists the images to embed, in document order.
 */
export function sanitizeArticleHtml(
	html: string,
	baseUrl: string,
): { html: string; imageUrls: string[] } {
	const doc = new DOMParser().parseFromString(
		`<!doctype html><html><body>${html}</body></html>`,
		"text/html",
	);
	const body = doc.body;
	for (const element of body.querySelectorAll(REMOVED_ELEMENTS.join(","))) {
		element.remove();
	}

	for (const element of body.querySelectorAll("*")) {
		for (const attribute of [...element.attributes]) {
			const name = attribute.name.toLowerCase();
			if (
				name.startsWith("on") ||
				REMOVED_ATTRIBUTES.has(name) ||
				!XML_NAME.test(attribute.name)
			) {
				element.removeAttribute(attribute.name);
			}
		}
	}

	for (const link of body.querySelectorAll("a[href]")) {
		const href = absolute(link.getAttribute("href") ?? "", baseUrl);
		if (href && USABLE_URL.test(href)) link.setAttribute("href", href);
		else link.removeAttribute("href");
	}

	const imageUrls: string[] = [];
	for (const image of body.querySelectorAll("img")) {
		const src = absolute(image.getAttribute("src") ?? "", baseUrl);
		if (!image.getAttribute("src") || !src || !USABLE_URL.test(src)) {
			image.remove();
			continue;
		}
		image.setAttribute("src", src);
		if (!imageUrls.includes(src)) imageUrls.push(src);
	}

	const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.nodeValue)
			node.nodeValue = node.nodeValue.replace(CONTROL_CHARS, "");
	}

	return { html: body.innerHTML, imageUrls };
}

export interface EpubImage {
	bytes: Uint8Array;
	mime: "image/png" | "image/jpeg";
}

export interface EpubInput {
	title: string;
	byline: string | null;
	lang: string | null;
	html: string;
	/** Keyed by the exact `src` used in `html`; images not in the map are removed. */
	images: Map<string, EpubImage>;
	modified?: Date;
}

type LangCode = NonNullable<Parameters<typeof render>[0]["lang"]>;

function langCode(lang: string | null): LangCode {
	const match = /^([a-z]{2})(?:[-_]|$)/i.exec(lang ?? "");
	return (match?.[1]?.toLowerCase() ?? "en") as LangCode;
}

/** Packages one article as an EPUB 3 file. */
export async function buildEpub(input: EpubInput): Promise<Uint8Array> {
	return render({
		title: input.title,
		author: input.byline ?? undefined,
		lang: langCode(input.lang),
		modified: input.modified,
		sections: [{ title: input.title, content: input.html }],
		images: new Map(
			[...input.images].map(([src, image]) => [
				src,
				{ data: image.bytes, mime: image.mime },
			]),
		),
		missingImage: "remove",
	});
}
