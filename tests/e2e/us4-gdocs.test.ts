import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import type { JobRecord } from "../../src/core/send-job";
import { googleDocsHandler } from "../fakes/docs";
import { MINIMAL_PDF } from "../fakes/server";
import { type Session, startSession } from "./harness";

let s: Session;

beforeAll(async () => {
	s = await startSession();
	s.server.handlers.push(googleDocsHandler);
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

describe("US4 Google Docs", () => {
	test("open doc is exported as PDF and named after the document", async () => {
		await s.pair();
		const tabId = await s.openFakeTab("/document/d/abc/edit");
		const status = await s.message<{ current: { sourceKind: string } }>({
			type: "status",
			tabId,
		});
		expect(status.current.sourceKind).toBe("google-doc");
		await s.message({ type: "send-current", mode: "auto", tabId });
		await s.waitForUploads(1);
		const [upload] = s.server.remarkable.state.simpleUploads;
		expect(upload?.name).toBe("abc Doc");
		expect(upload?.bytes).toEqual(MINIMAL_PDF);
	});

	test("export disabled by the owner is export-forbidden", async () => {
		await s.pair();
		const tabId = await s.openFakeTab("/document/d/forbidden/edit");
		await s.message({ type: "send-current", mode: "auto", tabId });
		const job = await waitForJob((j) => j.status === "failed");
		expect(job.error).toEqual({ kind: "export-forbidden" });
	});
});
