import { beforeEach, describe, expect, test } from "bun:test";
import JSZip from "jszip";
import type { ImageCodec } from "../../src/adapters/ports";
import { SendFailure } from "../../src/core/errors";
import type { ExtractResult } from "../../src/core/messages";
import { buildReadableEpub } from "../../src/core/readable";
import { FakePermissions } from "../fakes/browser";
import { cannedHttp } from "../fakes/http";

const WEBP = new Uint8Array([82, 73, 70, 70]);
const PNG = Uint8Array.fromBase64(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
);
const TEXT = "Lorem ipsum dolor sit amet. ".repeat(20);

const article = (html: string): ExtractResult => ({
	ok: true,
	title: "Article",
	byline: null,
	lang: "en",
	html,
	baseUrl: "https://news.example/a",
	imageUrls: [],
});

let codecCalls: { mime: string; maxWidth: number; maxHeight: number }[];
const codec: ImageCodec = {
	async toRaster(_bytes, mime, maxWidth, maxHeight) {
		codecCalls.push({ mime, maxWidth, maxHeight });
		return { bytes: PNG, mime: "image/png" };
	},
};
let permissions: FakePermissions;

beforeEach(() => {
	codecCalls = [];
	permissions = new FakePermissions();
});

async function failure(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof SendFailure) return error.error;
		throw error;
	}
	throw new Error("expected failure");
}

async function imagesIn(bytes: Uint8Array): Promise<string[]> {
	const zip = await JSZip.loadAsync(bytes);
	return Object.keys(zip.files).filter((n) =>
		/\.(png|jpe?g|gif|webp|svg)$/.test(n),
	);
}

describe("buildReadableEpub", () => {
	const deps = (table = {}) => ({
		http: cannedHttp(table),
		imageCodec: codec,
		permissions,
	});

	test("failed extraction is no-readable-content", async () => {
		expect(
			await failure(
				buildReadableEpub({ ok: false, reason: "no-readable-content" }, deps()),
			),
		).toEqual({ kind: "no-readable-content" });
	});

	test("too little text is no-readable-content", async () => {
		expect(
			await failure(buildReadableEpub(article("<p>short</p>"), deps())),
		).toEqual({
			kind: "no-readable-content",
		});
	});

	test("images are fetched and rasterised when their origin is granted", async () => {
		permissions.granted.add("https://news.example/*");
		const outcome = await buildReadableEpub(
			article(`<p>${TEXT}</p><img src="/pic.webp">`),
			deps({
				"https://news.example/pic.webp": {
					contentType: "image/webp",
					bytes: WEBP,
				},
			}),
		);
		expect(outcome).toMatchObject({ kind: "doc", format: "epub" });
		expect(outcome.kind === "doc" && outcome.imagesSkipped).toBeFalsy();
		expect(codecCalls).toEqual([
			{ mime: "image/webp", maxWidth: 1620, maxHeight: 2160 },
		]);
		if (outcome.kind === "doc")
			expect(await imagesIn(outcome.bytes)).toHaveLength(1);
	});

	test("images from origins without permission are dropped and flagged", async () => {
		const http = cannedHttp({});
		const outcome = await buildReadableEpub(
			article(`<p>${TEXT}</p><img src="https://cdn.example/x.png">`),
			{ http, imageCodec: codec, permissions },
		);
		expect(http.calls).toHaveLength(0);
		expect(outcome.kind === "doc" && outcome.imagesSkipped).toBe(true);
		if (outcome.kind === "doc")
			expect(await imagesIn(outcome.bytes)).toHaveLength(0);
	});

	test("an image that fails to load is dropped without failing the job", async () => {
		permissions.granted.add("<all_urls>");
		const outcome = await buildReadableEpub(
			article(`<p>${TEXT}</p><img src="https://cdn.example/gone.png">`),
			deps({ "https://cdn.example/gone.png": { status: 404 } }),
		);
		expect(outcome.kind).toBe("doc");
		if (outcome.kind === "doc")
			expect(await imagesIn(outcome.bytes)).toHaveLength(0);
	});
});
