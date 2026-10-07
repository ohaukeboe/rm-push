import { afterAll, expect, test } from "bun:test";
import { createRemarkable } from "../../src/adapters/remarkable";
import { createRouter } from "../../src/background/router";
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
import { startFakeServer } from "../fakes/server";

const server = startFakeServer();
const TEN_MB = new Uint8Array(10 * 1024 * 1024);
TEN_MB.set(new TextEncoder().encode("%PDF-1.4\n"));
server.fixtures.set(
	"/big.pdf",
	() =>
		new Response(TEN_MB, { headers: { "content-type": "application/pdf" } }),
);
afterAll(() => server.stop());

// SC-003 allows 15 s on broadband; locally we demand far less to leave room for the network.
test("a 10 MB PDF goes from tab to cloud in under 5 s", async () => {
	const storage = new FakeStorage();
	const tabs = new FakeTabs();
	tabs.active = { id: 1, url: `${server.url}/big.pdf`, title: "big.pdf" };
	const router = createRouter({
		storage,
		tabs,
		config: defaultConfig,
		clock: new FixedClock(),
		ids: new SequentialIds(),
		notifier: new FakeNotifier(),
		permissions: new FakePermissions(),
		http: bunHttp,
		scripting: {
			runExtract: async () => undefined,
			contentType: async () => "text/html",
		},
		imageCodec: {
			toRaster: async () => ({ bytes: TEN_MB, mime: "image/png" }),
		},
		remarkable: createRemarkable({
			hosts: {
				authHost: server.url,
				rawHost: server.url,
				uploadHost: server.url,
			},
			storage,
			maxTransientRetries: 0,
		}),
	});
	await router.handle({ type: "pair", code: VALID_CODE });

	const started = performance.now();
	await router.handle({ type: "send-current", mode: "auto", tabId: 1 });
	await router.idle();
	const elapsed = performance.now() - started;

	const jobs = await storage.get<JobRecord[]>("session", "jobs");
	expect(jobs?.[0]?.status).toBe("succeeded");
	expect(server.remarkable.state.simpleUploads[0]?.bytes.byteLength).toBe(
		TEN_MB.byteLength,
	);
	expect(elapsed).toBeLessThan(5000);
});
