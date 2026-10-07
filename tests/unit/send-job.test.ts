import { beforeEach, describe, expect, test } from "bun:test";
import {
	RemarkableError,
	type RemarkablePort,
	type UploadDoc,
} from "../../src/adapters/ports";
import { SendFailure } from "../../src/core/errors";
import {
	type AccountAccess,
	type Fetchers,
	type JobDeps,
	type JobRecord,
	runSendJob,
} from "../../src/core/send-job";
import type { Source } from "../../src/core/source";
import {
	FakeNotifier,
	FakeStorage,
	FixedClock,
	SequentialIds,
} from "../fakes/browser";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const source: Source = { kind: "pdf-url", url: "https://example.com/a.pdf" };

class FakeRemarkable implements RemarkablePort {
	uploads: { token: string; doc: UploadDoc; folderId: string | null }[] = [];
	failWith: RemarkableError | null = null;
	fellBack = false;

	async register(): Promise<{ deviceToken: string }> {
		return { deviceToken: "t" };
	}

	async upload(token: string, doc: UploadDoc, folderId: string | null) {
		if (this.failWith) throw this.failWith;
		this.uploads.push({ token, doc, folderId });
		return { id: "doc-1", fellBackToRoot: this.fellBack };
	}

	async listFolders() {
		return [];
	}
}

class FakeAccount implements AccountAccess {
	token: string | null = "device-token";
	revoked = false;

	async deviceToken() {
		return this.token;
	}

	async isRevoked() {
		return this.revoked;
	}

	async markRevoked() {
		this.revoked = true;
	}
}

let deps: JobDeps & {
	storage: FakeStorage;
	notifier: FakeNotifier;
	remarkable: FakeRemarkable;
	account: FakeAccount;
};
let fetchers: Fetchers;
let fetched: number;

beforeEach(() => {
	fetched = 0;
	fetchers = {
		"pdf-url": async () => {
			fetched++;
			return { kind: "doc", bytes: PDF, format: "pdf" };
		},
	};
	deps = {
		storage: new FakeStorage(),
		notifier: new FakeNotifier(),
		clock: new FixedClock(),
		ids: new SequentialIds(),
		remarkable: new FakeRemarkable(),
		account: new FakeAccount(),
		get fetchers() {
			return fetchers;
		},
	};
});

const run = (destination: { id: string; name: string } | null = null) =>
	runSendJob({ source, title: "Paper", destination }, deps);

describe("runSendJob", () => {
	test("success uploads, notifies and records the job", async () => {
		const job = await run();
		expect(job.status).toBe("succeeded");
		expect(deps.remarkable.uploads).toEqual([
			{
				token: "device-token",
				doc: { name: "Paper", bytes: PDF, kind: "pdf" },
				folderId: null,
			},
		]);
		expect(deps.notifier.notices).toHaveLength(1);
		expect(deps.notifier.notices[0]?.message).toBe(
			"Sent “Paper” to reMarkable.",
		);
		const jobs = await deps.storage.get<JobRecord[]>("session", "jobs");
		expect(jobs?.[0]).toMatchObject({
			id: job.id,
			status: "succeeded",
			sourceKind: "pdf-url",
			title: "Paper",
			startedAt: "2026-10-07T12:00:00.000Z",
			endedAt: "2026-10-07T12:00:00.000Z",
		});
	});

	test("success notification names the folder", async () => {
		await run({ id: "f", name: "Inbox" });
		expect(deps.remarkable.uploads[0]?.folderId).toBe("f");
		expect(deps.notifier.notices[0]?.message).toBe(
			"Sent “Paper” to reMarkable (folder Inbox).",
		);
	});

	test("fallback to root is reported", async () => {
		deps.remarkable.fellBack = true;
		const job = await run({ id: "gone", name: "Old" });
		expect(job.fellBackToRoot).toBe(true);
		expect(deps.notifier.notices[0]?.message).toBe(
			"Sent “Paper” to reMarkable. Folder not found, sent to top level.",
		);
	});

	test("not connected fails without fetching", async () => {
		deps.account.token = null;
		const job = await run();
		expect(job.status).toBe("failed");
		expect(job.error).toEqual({ kind: "not-connected" });
		expect(fetched).toBe(0);
		expect(deps.notifier.notices[0]?.message).toBe(
			"Connect your reMarkable account first.",
		);
		expect(deps.notifier.notices[0]?.onClickPage).toBe("options.html");
	});

	test("revoked account fails as needs-reconnect without fetching", async () => {
		deps.account.revoked = true;
		const job = await run();
		expect(job.error).toEqual({ kind: "needs-reconnect" });
		expect(fetched).toBe(0);
	});

	test("fetcher failure is recorded and notified", async () => {
		fetchers["pdf-url"] = async () => {
			throw new SendFailure({ kind: "not-a-pdf" });
		};
		const job = await run();
		expect(job.status).toBe("failed");
		expect(job.error).toEqual({ kind: "not-a-pdf" });
		expect(deps.notifier.notices[0]?.message).toBe(
			"The link did not return a PDF.",
		);
	});

	test("auth rejection marks the account revoked", async () => {
		deps.remarkable.failWith = new RemarkableError("auth-rejected");
		const job = await run();
		expect(job.error).toEqual({ kind: "needs-reconnect" });
		expect(deps.account.revoked).toBe(true);
	});

	test("reMarkable errors map to send errors", async () => {
		deps.remarkable.failWith = new RemarkableError("service", 500);
		expect((await run()).error).toEqual({
			kind: "service-error",
			status: 500,
		});
		deps.remarkable.failWith = new RemarkableError("network");
		expect((await run()).error).toEqual({
			kind: "network",
			host: "reMarkable cloud",
		});
		deps.remarkable.failWith = new RemarkableError("too-large");
		expect((await run()).error).toEqual({ kind: "too-large" });
	});

	test("canceled job has no notification", async () => {
		fetchers["pdf-url"] = async () => ({ kind: "canceled" });
		const job = await run();
		expect(job.status).toBe("canceled");
		expect(deps.notifier.notices).toHaveLength(0);
		expect(deps.remarkable.uploads).toHaveLength(0);
	});

	test("failure page is used when the error has no page of its own", async () => {
		fetchers["pdf-url"] = async () => {
			throw new SendFailure({ kind: "export-forbidden" });
		};
		await runSendJob(
			{
				source,
				title: "W",
				destination: null,
				failurePage: "upload.html?reason=word",
			},
			deps,
		);
		expect(deps.notifier.notices[0]?.onClickPage).toBe(
			"upload.html?reason=word",
		);
	});

	test("handed-off job has no notification and no upload", async () => {
		fetchers["pdf-url"] = async () => ({ kind: "handed-off" });
		const job = await run();
		expect(job.status).toBe("handed-off");
		expect(deps.notifier.notices).toHaveLength(0);
		expect(deps.remarkable.uploads).toHaveLength(0);
	});

	test("missing fetcher is unsendable-page", async () => {
		fetchers = {};
		expect((await run()).error).toEqual({ kind: "unsendable-page" });
	});

	test("keeps only the last 20 finished jobs, newest first", async () => {
		for (let i = 0; i < 25; i++) await run();
		const jobs = await deps.storage.get<JobRecord[]>("session", "jobs");
		expect(jobs).toHaveLength(20);
		expect(jobs?.[0]?.id).toBe("00000000-0000-4000-8000-000000000019");
	});

	test("concurrent jobs do not share state", async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		fetchers["pdf-url"] = async (s) => {
			if (s.url.endsWith("slow.pdf")) await gate;
			return { kind: "doc", bytes: PDF, format: "pdf" };
		};
		const slow = runSendJob(
			{
				source: { kind: "pdf-url", url: "https://e.com/slow.pdf" },
				title: "Slow",
				destination: null,
			},
			deps,
		);
		const fast = await runSendJob(
			{
				source: { kind: "pdf-url", url: "https://e.com/fast.pdf" },
				title: "Fast",
				destination: null,
			},
			deps,
		);
		release();
		const slowJob = await slow;
		expect(fast.title).toBe("Fast");
		expect(slowJob.title).toBe("Slow");
		expect(fast.id).not.toBe(slowJob.id);
		const jobs = await deps.storage.get<JobRecord[]>("session", "jobs");
		expect(jobs?.map((j) => j.title)).toEqual(["Slow", "Fast"]);
	});
});
