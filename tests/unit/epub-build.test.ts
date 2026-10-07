import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import { buildEpub } from "../../src/core/epub";

const PNG = Uint8Array.fromBase64(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
);

async function build(
	images = new Map([
		["https://e.com/a.png", { bytes: PNG, mime: "image/png" as const }],
	]),
) {
	const bytes = await buildEpub({
		title: "My Article",
		byline: "Ann Author",
		lang: "en-US",
		html: '<p>Hello</p><img src="https://e.com/a.png"><img src="https://e.com/missing.png">',
		images,
		modified: new Date("2026-10-07T12:00:00Z"),
	});
	return { bytes, zip: await JSZip.loadAsync(bytes) };
}

describe("buildEpub", () => {
	test("mimetype is the first entry, stored uncompressed", async () => {
		const { bytes } = await build();
		// Local file header: name at offset 30, compression method at offset 8.
		const name = new TextDecoder().decode(bytes.slice(30, 38));
		expect(name).toBe("mimetype");
		expect(bytes[8]).toBe(0);
		expect(new TextDecoder().decode(bytes.slice(38, 58))).toBe(
			"application/epub+zip",
		);
	});

	test("has container, OPF metadata and a nav document", async () => {
		const { zip } = await build();
		const container = await zip.file("META-INF/container.xml")?.async("string");
		expect(container).toBeDefined();
		const opfPath = /full-path="([^"]+)"/.exec(container ?? "")?.[1] ?? "";
		const opf = (await zip.file(opfPath)?.async("string")) ?? "";
		expect(opf).toContain("<dc:identifier");
		expect(opf).toContain("<dc:title>My Article</dc:title>");
		expect(opf).toContain("<dc:language>en</dc:language>");
		expect(opf).toContain('property="dcterms:modified">2026-10-07T12:00:00Z');
		expect(opf).toMatch(/properties="nav"/);
	});

	test("every image reference resolves to a manifest file; missing images are removed", async () => {
		const { zip } = await build();
		const contents = await Promise.all(
			Object.keys(zip.files)
				.filter((n) => n.endsWith(".xhtml") && !n.includes("nav"))
				.map((n) => zip.file(n)?.async("string")),
		);
		const xhtml = contents.join("");
		expect(xhtml).toContain("Hello");
		expect(xhtml).not.toContain("missing.png");
		const srcs = [...xhtml.matchAll(/<img[^>]*src="([^"]+)"/g)].map(
			(m) => m[1],
		);
		expect(srcs).toHaveLength(1);
		const names = Object.keys(zip.files);
		for (const src of srcs) {
			expect(
				names.some((n) => n.endsWith(src?.replace(/^\.\.?\//, "") ?? "")),
			).toBe(true);
		}
	});

	test("content documents are well-formed XHTML", async () => {
		const { zip } = await build();
		for (const name of Object.keys(zip.files).filter((n) =>
			n.endsWith(".xhtml"),
		)) {
			const text = (await zip.file(name)?.async("string")) ?? "";
			const doc = new DOMParser().parseFromString(
				text,
				"application/xhtml+xml",
			);
			expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
		}
	});

	test("unknown language falls back to en", async () => {
		const bytes = await buildEpub({
			title: "T",
			byline: null,
			lang: "klingon",
			html: "<p>x</p>",
			images: new Map(),
		});
		const zip = await JSZip.loadAsync(bytes);
		const opf = Object.keys(zip.files).find((n) => n.endsWith(".opf")) ?? "";
		expect(await zip.file(opf)?.async("string")).toContain(
			"<dc:language>en</dc:language>",
		);
	});
});
