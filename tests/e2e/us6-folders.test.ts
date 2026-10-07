import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { register, remarkable } from "rmapi-js";
import type { JobRecord } from "../../src/core/send-job";
import { VALID_CODE } from "../fakes/remarkable";
import { MINIMAL_PDF } from "../fakes/server";
import { type Session, startSession } from "./harness";

let s: Session;

beforeAll(async () => {
	s = await startSession();
	s.server.fixtures.set(
		"/paper.pdf",
		() =>
			new Response(MINIMAL_PDF, {
				headers: { "content-type": "application/pdf" },
			}),
	);
}, 60000);
afterAll(() => s?.quit());
beforeEach(() => s.server.remarkable.reset());

async function cloud() {
	const hosts = {
		authHost: s.server.url,
		rawHost: s.server.url,
		uploadHost: s.server.url,
	};
	return remarkable(
		await register(VALID_CODE, { authHost: s.server.url }),
		hosts,
	);
}

async function sendAndWait(tabId: number): Promise<JobRecord> {
	const reply = await s.message<{ jobId: string }>({
		type: "send-current",
		mode: "auto",
		tabId,
	});
	const deadline = Date.now() + 15000;
	while (Date.now() < deadline) {
		const status = await s.message<{ recentJobs: JobRecord[] }>({
			type: "status",
		});
		const job = status.recentJobs.find((j) => j.id === reply.jobId);
		if (job) return job;
		await Bun.sleep(200);
	}
	throw new Error(`job ${reply.jobId} did not finish`);
}

describe("US6 destination folders", () => {
	test("default folder chosen in options receives the document", async () => {
		const api = await cloud();
		const inbox = await api.putFolder("Inbox");
		await s.pair();
		await s.open("options.html");
		await s.waitForText("#default-folder", /Inbox/);
		await s.driver
			.findElement({ css: `#default-folder option[value="${inbox.id}"]` })
			.click();
		await s.waitForText("#folder-saved", /Saved/);

		const tabId = await s.openFakeTab("/paper.pdf");
		const job = await sendAndWait(tabId);
		expect(job.status).toBe("succeeded");
		const items = await api.listItems(true);
		expect(items.find((i) => i.visibleName === "paper")?.parent).toBe(inbox.id);
	}, 30000);

	test("deleted default folder falls back to the top level with a notice", async () => {
		const api = await cloud();
		const gone = await api.putFolder("Gone");
		await s.pair();
		await s.message({
			type: "set-default-folder",
			folder: { id: gone.id, name: "Gone" },
		});
		await api.delete(gone);

		const tabId = await s.openFakeTab("/paper.pdf");
		const job = await sendAndWait(tabId);
		expect(job.status).toBe("succeeded");
		expect(job.fellBackToRoot).toBe(true);
		expect(s.server.remarkable.state.simpleUploads).toMatchObject([
			{ name: "paper" },
		]);
	}, 30000);
});
