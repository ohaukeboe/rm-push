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
import type { JobRecord } from "../../src/core/send-job";
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
	s.server.fixtures.set(
		"/pdf/2604.14228v2",
		() =>
			new Response(MINIMAL_PDF, {
				headers: { "content-type": "application/pdf" },
			}),
	);
	s.server.fixtures.set(
		"/links.html",
		() =>
			new Response('<html><body><a href="/paper.pdf">Paper</a></body></html>', {
				headers: { "content-type": "text/html" },
			}),
	);
}, 60000);
afterAll(() => s?.quit());
beforeEach(() => s.server.remarkable.reset());

async function latestJob(): Promise<JobRecord | undefined> {
	const status = await s.message<{ recentJobs: JobRecord[] }>({
		type: "status",
	});
	return status.recentJobs[0];
}

async function waitForJob(
	predicate: (job: JobRecord) => boolean,
): Promise<JobRecord> {
	const deadline = Date.now() + 15000;
	while (Date.now() < deadline) {
		const job = await latestJob();
		if (job && predicate(job)) return job;
		await Bun.sleep(200);
	}
	throw new Error(
		`job not found; latest: ${JSON.stringify(await latestJob())}`,
	);
}

describe("US2 send PDF", () => {
	test("send while disconnected fails with not-connected", async () => {
		await s.open("options.html");
		const tabId = await s.openFakeTab("/paper.pdf");
		await s.message({ type: "send-current", mode: "auto", tabId });
		const job = await waitForJob((j) => j.status === "failed");
		expect(job.error).toEqual({ kind: "not-connected" });
	});

	test("PDF open in a tab is uploaded, named after the tab", async () => {
		await s.pair();
		const tabId = await s.openFakeTab("/paper.pdf");
		const reply = await s.message<{ ok: boolean }>({
			type: "send-current",
			mode: "auto",
			tabId,
		});
		expect(reply.ok).toBe(true);
		await s.waitForUploads(1);
		const [upload] = s.server.remarkable.state.simpleUploads;
		expect(upload?.name).toBe("paper");
		expect(upload?.mime).toBe("application/pdf");
		expect(upload?.bytes).toEqual(MINIMAL_PDF);
	});

	test("PDF whose URL has no .pdf extension is uploaded as a PDF (arXiv)", async () => {
		await s.pair();
		const tabId = await s.openFakeTab("/pdf/2604.14228v2");
		await s.message({ type: "send-current", mode: "auto", tabId });
		await s.waitForUploads(1);
		const [upload] = s.server.remarkable.state.simpleUploads;
		expect(upload?.mime).toBe("application/pdf");
		expect(upload?.bytes).toEqual(MINIMAL_PDF);
	});

	test("linked PDF from the context menu is uploaded", async () => {
		await s.pair();
		const tabId = await s.openFakeTab("/links.html");
		await s.message({
			type: "e2e-menu-click",
			click: {
				menuItemId: "send-link",
				linkUrl: `${s.server.url}/paper.pdf`,
				linkText: "Linked paper",
			},
			tabId,
		});
		await s.waitForUploads(1);
		expect(s.server.remarkable.state.simpleUploads[0]?.name).toBe(
			"Linked paper",
		);
	});

	test("cloud failure is reported with its reason", async () => {
		await s.pair();
		s.server.remarkable.fail("/doc/v2/files", 500);
		const tabId = await s.openFakeTab("/paper.pdf");
		await s.message({ type: "send-current", mode: "auto", tabId });
		const job = await waitForJob((j) => j.status === "failed");
		expect(job.error).toEqual({ kind: "service-error", status: 500 });
	}, 30000);

	test("upload page sends a picked file", async () => {
		await s.pair();
		const path = join(s.profileDir, "..", `picked-${Date.now()}.pdf`);
		await writeFile(path, MINIMAL_PDF);
		await s.open("upload.html?reason=file");
		await s.driver.findElement({ css: "#file" }).sendKeys(path);
		await s.waitForText("#result", /✓/);
		expect(s.server.remarkable.state.simpleUploads[0]?.name).toMatch(
			/^picked-\d+$/,
		);
	});
});
