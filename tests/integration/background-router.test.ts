import { beforeEach, describe, expect, test } from "bun:test";
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

let deps: RouterDeps;
let tabs: FakeTabs;

beforeEach(() => {
	tabs = new FakeTabs();
	deps = {
		storage: new FakeStorage(),
		tabs,
		config: defaultConfig,
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
		notifier: new FakeNotifier(),
		permissions: new FakePermissions(),
		http: {
			fetch: async () => {
				throw new Error("unused");
			},
		},
		ids: new SequentialIds(),
		remarkable: {
			register: async () => ({ deviceToken: "t" }),
			upload: async () => ({ id: "d", fellBackToRoot: false }),
			listFolders: async () => [],
		},
	};
});

describe("router", () => {
	test("rejects invalid messages", async () => {
		const { handle } = createRouter(deps);
		for (const raw of [undefined, {}, { type: "nope" }, { type: "pair" }]) {
			expect(await handle(raw)).toEqual({
				ok: false,
				error: { kind: "bad-message" },
			});
		}
	});

	test("status on empty storage", async () => {
		const { handle } = createRouter(deps);
		expect(await handle({ type: "status" })).toEqual({
			ok: true,
			connection: "disconnected",
			connectedAt: null,
			defaultFolder: null,
			current: null,
			recentJobs: [],
		});
	});

	test("status describes the active tab", async () => {
		tabs.active = {
			id: 3,
			url: "https://example.com/paper.pdf",
			title: "paper.pdf",
		};
		const { handle } = createRouter(deps);
		expect(await handle({ type: "status" })).toMatchObject({
			ok: true,
			current: { sourceKind: "pdf-url", title: "paper" },
		});
	});
});
