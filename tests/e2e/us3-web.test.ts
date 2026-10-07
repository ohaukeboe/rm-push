import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import type { JobRecord } from "../../src/core/send-job";
import { MINIMAL_PDF } from "../fakes/server";
import { type Session, startSession } from "./harness";

const WEBP = Uint8Array.fromBase64(
	"UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
);
const SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="red"/></svg>';
const PARAGRAPH =
	"<p>The quick brown fox jumps over the lazy dog while the reMarkable waits patiently for a long article to read on the train home. </p>";

const html = (body: string) =>
	new Response(
		`<!doctype html><html lang="en"><head><title>Fixture Article</title></head><body>${body}</body></html>`,
		{
			headers: { "content-type": "text/html; charset=utf-8" },
		},
	);

let s: Session;

beforeAll(async () => {
	s = await startSession();
	s.server.fixtures.set("/article.html", () =>
		html(`<header><nav><a href="/">Home</a></nav></header>
		<article><h1>Fixture Article</h1>${PARAGRAPH.repeat(8)}
		<img src="/pic.webp" alt="webp"><img src="/pic.svg" alt="svg">
		<svg width="10" height="10"><circle r="5"/></svg>${PARAGRAPH.repeat(4)}</article>`),
	);
	s.server.fixtures.set("/empty.html", () => html("<p>hi</p>"));
	s.server.fixtures.set(
		"/pic.webp",
		() => new Response(WEBP, { headers: { "content-type": "image/webp" } }),
	);
	s.server.fixtures.set(
		"/pic.svg",
		() => new Response(SVG, { headers: { "content-type": "image/svg+xml" } }),
	);
}, 60000);
afterAll(() => s?.quit());
beforeEach(() => s.server.remarkable.reset());

async function waitForJob(
	predicate: (job: JobRecord) => boolean,
): Promise<JobRecord> {
	const deadline = Date.now() + 15000;
	let latest: JobRecord | undefined;
	while (Date.now() < deadline) {
		const status = await s.message<{ recentJobs: JobRecord[] }>({
			type: "status",
		});
		latest = status.recentJobs[0];
		if (latest && predicate(latest)) return latest;
		await Bun.sleep(200);
	}
	throw new Error(`job not found; latest: ${JSON.stringify(latest)}`);
}

describe("US3 send web page", () => {
	test("article becomes an EPUB with raster images", async () => {
		await s.pair();
		const tabId = await s.openFakeTab("/article.html");
		await s.message({ type: "send-current", mode: "auto", tabId });
		await s.waitForUploads(1);
		const [upload] = s.server.remarkable.state.simpleUploads;
		expect(upload?.name).toBe("Fixture Article");
		expect(upload?.mime).toBe("application/epub+zip");

		const zip = await JSZip.loadAsync(upload?.bytes ?? new Uint8Array());
		const names = Object.keys(zip.files);
		const images = names.filter((n) =>
			/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(n),
		);
		expect(images).toHaveLength(2);
		for (const image of images) expect(image).toMatch(/\.(png|jpe?g)$/);
		const content = (
			await Promise.all(
				names
					.filter((n) => n.endsWith(".xhtml"))
					.map((n) => zip.file(n)?.async("string")),
			)
		).join("");
		expect(content).toContain("quick brown fox");
		expect(content).not.toContain("<svg");
		expect(content).not.toContain("Home</a>");
	}, 30000);

	test("page without readable content uploads nothing", async () => {
		await s.pair();
		const tabId = await s.openFakeTab("/empty.html");
		await s.message({ type: "send-current", mode: "auto", tabId });
		const job = await waitForJob((j) => j.status === "failed");
		expect(job.error).toEqual({ kind: "no-readable-content" });
		expect(s.server.remarkable.state.simpleUploads).toHaveLength(0);
	});

	test("upload page after printing shows the expected file and uploads it", async () => {
		await s.pair();
		await s.open("upload.html?reason=print&expected=Fixture%20Article.pdf");
		await s.waitForText("#instructions", /Fixture Article\.pdf/);
		const path = join(s.profileDir, "..", `printed-${Date.now()}.pdf`);
		await writeFile(path, MINIMAL_PDF);
		await s.driver.findElement({ css: "#file" }).sendKeys(path);
		await s.waitForText("#result", /✓/);
		expect(s.server.remarkable.state.simpleUploads[0]?.mime).toBe(
			"application/pdf",
		);
	});
});
