import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createRemarkable } from "../../src/adapters/remarkable";
import { createRouter, type RouterDeps } from "../../src/background/router";
import { defaultConfig } from "../../src/core/config";
import type { JobRecord } from "../../src/core/send-job";
import {
	FakeNotifier,
	FakePermissions,
	FakeStorage,
	FakeTabs,
	FixedClock,
	SequentialIds,
} from "../fakes/browser";
import { bunHttp } from "../fakes/http";
import { VALID_CODE } from "../fakes/remarkable";
import { MINIMAL_PDF, startFakeServer } from "../fakes/server";

const server = startFakeServer();
server.fixtures.set(
	"/paper.pdf",
	() =>
		new Response(MINIMAL_PDF, {
			headers: { "content-type": "application/pdf" },
		}),
);
server.fixtures.set(
	"/pdf/2604.14228v2",
	() =>
		new Response(MINIMAL_PDF, {
			headers: { "content-type": "application/pdf" },
		}),
);
server.fixtures.set(
	"/page.html",
	() =>
		new Response("<html>hi</html>", {
			headers: { "content-type": "text/html" },
		}),
);
afterAll(() => server.stop());

let deps: RouterDeps & {
	tabs: FakeTabs;
	notifier: FakeNotifier;
	permissions: FakePermissions;
	storage: FakeStorage;
};
let router: ReturnType<typeof createRouter>;

beforeEach(async () => {
	await server.remarkable.reset();
	const storage = new FakeStorage();
	deps = {
		storage,
		tabs: new FakeTabs(),
		notifier: new FakeNotifier(),
		permissions: new FakePermissions(),
		http: bunHttp,
		clock: new FixedClock(),
		scripting: {
			runExtract: async () => undefined,
			contentType: async () => "text/html",
		},
		imageCodec: {
			toRaster: async () => {
				throw new Error("unused");
			},
		},
		ids: new SequentialIds(),
		config: defaultConfig,
		remarkable: createRemarkable({
			hosts: {
				authHost: server.url,
				rawHost: server.url,
				uploadHost: server.url,
			},
			storage,
			maxTransientRetries: 0,
		}),
	} as typeof deps;
	router = createRouter(deps);
});

const pairNow = () => router.handle({ type: "pair", code: VALID_CODE });
const jobs = () => deps.storage.get<JobRecord[]>("session", "jobs");

describe("send PDF", () => {
	test("send-current uploads the tab's PDF named after the tab", async () => {
		await pairNow();
		deps.tabs.active = {
			id: 7,
			url: `${server.url}/paper.pdf`,
			title: "paper.pdf",
		};
		const reply = await router.handle({
			type: "send-current",
			mode: "auto",
			tabId: 7,
		});
		expect(reply).toMatchObject({ ok: true, jobId: expect.any(String) });
		await router.idle();
		expect(server.remarkable.state.simpleUploads).toMatchObject([
			{ name: "paper", mime: "application/pdf" },
		]);
		expect(deps.notifier.notices.at(-1)?.message).toBe(
			"Sent “paper” to reMarkable.",
		);
		expect((await jobs())?.[0]?.status).toBe("succeeded");
	});

	test("disconnected send fails with not-connected opening options", async () => {
		deps.tabs.active = {
			id: 7,
			url: `${server.url}/paper.pdf`,
			title: "paper.pdf",
		};
		await router.handle({ type: "send-current", mode: "auto", tabId: 7 });
		await router.idle();
		expect((await jobs())?.[0]?.error).toEqual({ kind: "not-connected" });
		expect(deps.notifier.notices.at(-1)?.onClickPage).toBe("options.html");
		expect(server.remarkable.state.simpleUploads).toHaveLength(0);
	});

	test("unsendable tab is rejected immediately", async () => {
		await pairNow();
		deps.tabs.active = { id: 1, url: "about:newtab", title: "New Tab" };
		expect(
			await router.handle({ type: "send-current", mode: "auto", tabId: 1 }),
		).toEqual({
			ok: false,
			error: { kind: "unsendable-page" },
		});
	});

	test("upload failure is recorded with its reason", async () => {
		await pairNow();
		server.remarkable.fail("/doc/v2/files", 500);
		deps.tabs.active = {
			id: 7,
			url: `${server.url}/paper.pdf`,
			title: "p.pdf",
		};
		await router.handle({ type: "send-current", mode: "auto", tabId: 7 });
		await router.idle();
		expect((await jobs())?.[0]?.error).toEqual({
			kind: "service-error",
			status: 500,
		});
		expect(deps.notifier.notices.at(-1)?.title).toBe(
			"Could not send to reMarkable",
		);
	});

	test("send-file uploads the given bytes", async () => {
		await pairNow();
		await router.handle({
			type: "send-file",
			name: "Picked.pdf",
			bytes: MINIMAL_PDF.slice().buffer,
			mime: "application/pdf",
		});
		await router.idle();
		expect(server.remarkable.state.simpleUploads).toMatchObject([
			{ name: "Picked" },
		]);
	});

	test("local file tab opens the upload page", async () => {
		await pairNow();
		deps.tabs.active = { id: 2, url: "file:///tmp/a.pdf", title: "a.pdf" };
		await router.handle({ type: "send-current", mode: "auto", tabId: 2 });
		await router.idle();
		expect(deps.tabs.opened).toEqual([
			{ path: "upload.html", query: { reason: "file", expected: "a.pdf" } },
		]);
		expect(deps.notifier.notices).toHaveLength(0);
	});
});

describe("PDF tab whose URL has no .pdf (e.g. arXiv)", () => {
	const arxiv = () => ({
		id: 9,
		url: `${server.url}/pdf/2604.14228v2`,
		title: "Dive into Claude Code - 2604.14228v2",
	});

	// Firefox's PDF viewer refuses script injection, so the probe returns null.
	beforeEach(() => {
		deps.scripting = {
			runExtract: async () => {
				throw new Error("Missing host permission for the tab");
			},
			contentType: async () => null,
		};
		router = createRouter(deps);
	});

	test("status labels it as a PDF", async () => {
		deps.tabs.active = arxiv();
		expect(await router.handle({ type: "status", tabId: 9 })).toMatchObject({
			current: { sourceKind: "pdf-url" },
		});
	});

	test("send uploads the PDF, named after the tab", async () => {
		await pairNow();
		deps.tabs.active = arxiv();
		await router.handle({ type: "send-current", mode: "auto", tabId: 9 });
		await router.idle();
		expect(server.remarkable.state.simpleUploads).toMatchObject([
			{ name: "Dive into Claude Code - 2604.14228v2", mime: "application/pdf" },
		]);
	});

	test("a blocked tab that is not a PDF is unsendable-page", async () => {
		await pairNow();
		deps.tabs.active = { id: 9, url: `${server.url}/page.html`, title: "Page" };
		await router.handle({ type: "send-current", mode: "auto", tabId: 9 });
		await router.idle();
		expect((await jobs())?.[0]?.error).toEqual({ kind: "unsendable-page" });
	});

	test("a tab reporting application/pdf is a PDF", async () => {
		deps.scripting = {
			runExtract: async () => undefined,
			contentType: async () => "application/pdf",
		};
		router = createRouter(deps);
		deps.tabs.active = arxiv();
		expect(await router.handle({ type: "status", tabId: 9 })).toMatchObject({
			current: { sourceKind: "pdf-url" },
		});
	});

	test("an injectable HTML page stays a web page", async () => {
		deps.tabs.active = { id: 9, url: `${server.url}/page.html`, title: "Page" };
		deps.scripting = {
			runExtract: async () => undefined,
			contentType: async () => "text/html",
		};
		router = createRouter(deps);
		expect(await router.handle({ type: "status", tabId: 9 })).toMatchObject({
			current: { sourceKind: "web" },
		});
	});
});

describe("linked PDF from the context menu", () => {
	const tab = { id: 3, url: "https://other.example/article", title: "Article" };

	test("link on an origin without permission is permission-denied", async () => {
		await pairNow();
		await router.menuClicked(
			{ menuItemId: "send-link", linkUrl: `${server.url}/paper.pdf` },
			tab,
		);
		await router.idle();
		expect((await jobs())?.[0]?.error).toEqual({
			kind: "permission-denied",
			site: "all websites",
		});
		expect(deps.notifier.notices.at(-1)?.onClickPage).toBe("options.html");
	});

	test("link with permission is uploaded, named after the link text", async () => {
		await pairNow();
		deps.permissions.granted.add("<all_urls>");
		await router.menuClicked(
			{
				menuItemId: "send-link",
				linkUrl: `${server.url}/paper.pdf`,
				linkText: "The Paper",
			},
			tab,
		);
		await router.idle();
		expect(server.remarkable.state.simpleUploads).toMatchObject([
			{ name: "The Paper" },
		]);
	});

	test("link that is not a PDF is not-a-pdf", async () => {
		await pairNow();
		deps.permissions.granted.add("<all_urls>");
		await router.menuClicked(
			{ menuItemId: "send-link", linkUrl: `${server.url}/page.html` },
			tab,
		);
		await router.idle();
		expect((await jobs())?.[0]?.error).toEqual({ kind: "not-a-pdf" });
	});
});
