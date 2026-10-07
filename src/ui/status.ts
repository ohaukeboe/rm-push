/** Shared view-model helpers for the popup and upload page. */
import { sendMessage } from "../adapters/browser/runtime";
import { type SendError, userMessage } from "../core/errors";
import type { Folder } from "../core/messages";
import type { JobRecord } from "../core/send-job";
import type { ClassifiedUrl } from "../core/source";

export type Reply<T = object> =
	| ({ ok: true } & T)
	| { ok: false; error: SendError };

export interface Status {
	connection: "disconnected" | "connected" | "needs-reconnect";
	connectedAt: string | null;
	defaultFolder: Folder | null;
	current: {
		sourceKind: ClassifiedUrl["kind"];
		title: string;
		missingOrigins?: string[];
		site?: string;
	} | null;
	recentJobs: JobRecord[];
}

export async function getStatus(tabId?: number): Promise<Status | null> {
	const reply = await sendMessage<Reply<Status>>({ type: "status", tabId });
	return reply.ok ? reply : null;
}

export const SOURCE_LABELS: Record<string, string> = {
	"pdf-url": "PDF",
	"google-doc": "Google Doc",
	"word-sharepoint": "Word document",
	"word-unsupported": "Word document",
	"local-file": "Local PDF",
	web: "Web page",
};

export function describeJob(job: JobRecord): string {
	switch (job.status) {
		case "succeeded":
			return `✓ ${job.title}${job.fellBackToRoot ? " (sent to top level)" : ""}${
				job.imagesSkipped
					? " (images skipped: grant access to all websites to include them)"
					: ""
			}`;
		case "failed":
			return `✗ ${job.title}: ${job.error ? userMessage(job.error) : "failed"}`;
		case "canceled":
			return `– ${job.title}: canceled`;
		case "handed-off":
			return `→ ${job.title}: continue in the upload tab`;
		default:
			return `… ${job.title}`;
	}
}

/** Polls status until the job with `jobId` is recorded as finished. */
export async function waitForJob(
	jobId: string,
	timeoutMs = 120_000,
): Promise<JobRecord | null> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const status = await getStatus();
		const job = status?.recentJobs.find((j) => j.id === jobId);
		if (job) return job;
		await new Promise((r) => setTimeout(r, 400));
	}
	return null;
}
