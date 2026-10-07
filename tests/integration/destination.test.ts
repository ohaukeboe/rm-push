import { beforeEach, describe, expect, test } from "bun:test";
import type { UploadDoc } from "../../src/adapters/ports";
import { createRouter, type RouterDeps } from "../../src/background/router";
import { defaultConfig } from "../../src/core/config";
import {
	FakeNotifier,
	FakePermissions,
	FakeStorage,
	FakeTabs,
	FixedClock,
	SequentialIds,
} from "../fakes/browser";
import { cannedHttp } from "../fakes/http";

const PDF = new TextEncoder().encode("%PDF-1.4");
let uploads: { folderId: string | null; doc: UploadDoc }[];
let deps: RouterDeps & { tabs: FakeTabs; storage: FakeStorage };

beforeEach(async () => {
	uploads = [];
	const storage = new FakeStorage();
	await storage.set("local", "account", {
		deviceToken: "t",
		deviceId: "d",
		connectedAt: "2026-10-07T00:00:00Z",
	});
	deps = {
		storage,
		tabs: new FakeTabs(),
		config: defaultConfig,
		clock: new FixedClock(),
		ids: new SequentialIds(),
		notifier: new FakeNotifier(),
		permissions: new FakePermissions(),
		http: cannedHttp({
			"https://e.com/a.pdf": { contentType: "application/pdf", bytes: PDF },
		}),
		scripting: {
			runExtract: async () => undefined,
			contentType: async () => "text/html",
		},
		imageCodec: { toRaster: async () => ({ bytes: PDF, mime: "image/png" }) },
		remarkable: {
			register: async () => ({ deviceToken: "t" }),
			upload: async (_t, doc, folderId) => {
				uploads.push({ doc, folderId });
				return { id: "x", fellBackToRoot: false };
			},
			listFolders: async () => [{ id: "f1", name: "Inbox", parentId: "" }],
		},
	};
	deps.tabs.active = { id: 1, url: "https://e.com/a.pdf", title: "a.pdf" };
});

describe("destination folder", () => {
	test("list-folders returns the cloud folders", async () => {
		const router = createRouter(deps);
		expect(await router.handle({ type: "list-folders" })).toEqual({
			ok: true,
			folders: [{ id: "f1", name: "Inbox", parentId: "" }],
		});
	});

	test("default folder applies; a per-send folder overrides it; null means root", async () => {
		const router = createRouter(deps);
		await router.handle({
			type: "set-default-folder",
			folder: { id: "f1", name: "Inbox" },
		});
		await router.handle({ type: "send-current", mode: "auto", tabId: 1 });
		await router.handle({
			type: "send-current",
			mode: "auto",
			tabId: 1,
			folder: { id: "f2", name: "Other" },
		});
		await router.handle({
			type: "send-current",
			mode: "auto",
			tabId: 1,
			folder: null,
		});
		await router.idle();
		expect(uploads.map((u) => u.folderId)).toEqual(["f1", "f2", null]);
	});

	test("status reports the default folder", async () => {
		const router = createRouter(deps);
		await router.handle({
			type: "set-default-folder",
			folder: { id: "f1", name: "Inbox" },
		});
		expect(await router.handle({ type: "status" })).toMatchObject({
			defaultFolder: { id: "f1", name: "Inbox" },
		});
	});
});
