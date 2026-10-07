import type {
	Clock,
	Ids,
	Notifier,
	RemarkablePort,
	Storage,
} from "../adapters/ports";
import { RemarkableError } from "../adapters/ports";
import { type SendError, SendFailure, userMessage } from "./errors";
import type { Folder } from "./messages";
import type { DocFormat, Source, SourceKind } from "./source";

export type FetchOutcome =
	| {
			kind: "doc";
			bytes: Uint8Array;
			format: DocFormat;
			imagesSkipped?: boolean;
	  }
	| { kind: "canceled" }
	/** The flow continues elsewhere (e.g. the upload page); no notification. */
	| { kind: "handed-off" };

export type Fetcher<K extends SourceKind> = (
	source: Extract<Source, { kind: K }>,
) => Promise<FetchOutcome>;

export type Fetchers = { [K in SourceKind]?: Fetcher<K> };

/** What the runner needs from the stored account (see core/account.ts). */
export interface AccountAccess {
	deviceToken(): Promise<string | null>;
	isRevoked(): Promise<boolean>;
	markRevoked(): Promise<void>;
}

export interface JobDeps {
	storage: Storage;
	notifier: Notifier;
	clock: Clock;
	ids: Ids;
	remarkable: RemarkablePort;
	account: AccountAccess;
	fetchers: Fetchers;
}

export type JobStatus =
	| "running"
	| "succeeded"
	| "failed"
	| "canceled"
	| "handed-off";

/** A send job without its payload; this is what is stored and shown. */
export interface JobRecord {
	id: string;
	sourceKind: SourceKind;
	title: string;
	destination: Folder | null;
	status: JobStatus;
	error?: SendError;
	startedAt: string;
	endedAt?: string;
	fellBackToRoot: boolean;
	imagesSkipped?: boolean;
}

export interface JobInput {
	/** Lets the caller return the id before the job finishes. */
	id?: string;
	source: Source;
	title: string;
	destination: Folder | null;
	/** Fails the job with this error before fetching, e.g. a missing permission. */
	preflightError?: SendError;
	/** Page a failure notification opens when the error kind has none of its own. */
	failurePage?: string;
}

const JOBS_KEY = "jobs";
const MAX_JOBS = 20;
const PAGES_FOR_ERROR: Partial<Record<SendError["kind"], string>> = {
	"not-connected": "options.html",
	"needs-reconnect": "options.html",
	"permission-denied": "options.html",
};

// Serialises read-modify-write of the job list across concurrent jobs.
const writeQueues = new WeakMap<Storage, Promise<void>>();

async function recordJob(storage: Storage, job: JobRecord): Promise<void> {
	const previous = writeQueues.get(storage) ?? Promise.resolve();
	const next = previous.then(async () => {
		const jobs = (await storage.get<JobRecord[]>("session", JOBS_KEY)) ?? [];
		await storage.set(
			"session",
			JOBS_KEY,
			[job, ...jobs.filter((j) => j.id !== job.id)].slice(0, MAX_JOBS),
		);
	});
	writeQueues.set(
		storage,
		next.catch(() => {}),
	);
	await next;
}

export async function recentJobs(storage: Storage): Promise<JobRecord[]> {
	return (await storage.get<JobRecord[]>("session", JOBS_KEY)) ?? [];
}

function toSendError(error: unknown): SendError {
	if (error instanceof SendFailure) return error.error;
	if (error instanceof RemarkableError) {
		switch (error.kind) {
			case "auth-rejected":
				return { kind: "needs-reconnect" };
			case "network":
				return { kind: "network", host: "reMarkable cloud" };
			case "too-large":
				return { kind: "too-large" };
			default:
				return { kind: "service-error", status: error.status ?? 0 };
		}
	}
	console.error("send job failed", error);
	return { kind: "service-error", status: 0 };
}

function successMessage(job: JobRecord): string {
	const folder =
		job.destination && !job.fellBackToRoot
			? ` (folder ${job.destination.name})`
			: "";
	const fallback = job.fellBackToRoot
		? " Folder not found, sent to top level."
		: "";
	return `Sent “${job.title}” to reMarkable${folder}.${fallback}`;
}

/** Runs one send: account check, fetch, upload, notify, record (data-model.md SendJob). */
export async function runSendJob(
	input: JobInput,
	deps: JobDeps,
): Promise<JobRecord> {
	const job: JobRecord = {
		id: input.id ?? deps.ids.uuid(),
		sourceKind: input.source.kind,
		title: input.title,
		destination: input.destination,
		status: "running",
		startedAt: deps.clock.now().toISOString(),
		fellBackToRoot: false,
	};

	try {
		if (input.preflightError) throw new SendFailure(input.preflightError);
		const token = await deps.account.deviceToken();
		if (token === null) throw new SendFailure({ kind: "not-connected" });
		if (await deps.account.isRevoked()) {
			throw new SendFailure({ kind: "needs-reconnect" });
		}

		const fetcher = deps.fetchers[input.source.kind] as
			| Fetcher<SourceKind>
			| undefined;
		if (!fetcher) throw new SendFailure({ kind: "unsendable-page" });
		const outcome = await fetcher(input.source);

		if (outcome.kind === "canceled" || outcome.kind === "handed-off") {
			job.status = outcome.kind;
		} else {
			const result = await deps.remarkable.upload(
				token,
				{ name: input.title, bytes: outcome.bytes, kind: outcome.format },
				input.destination?.id ?? null,
			);
			job.status = "succeeded";
			job.fellBackToRoot = result.fellBackToRoot;
			if (outcome.imagesSkipped) job.imagesSkipped = true;
		}
	} catch (error) {
		job.status = "failed";
		job.error = toSendError(error);
		if (job.error.kind === "needs-reconnect") await deps.account.markRevoked();
	}

	job.endedAt = deps.clock.now().toISOString();
	await recordJob(deps.storage, job);

	if (job.status === "succeeded") {
		await deps.notifier.notify({
			id: job.id,
			title: "Sent to reMarkable",
			message: successMessage(job),
		});
	} else if (job.status === "failed" && job.error) {
		await deps.notifier.notify({
			id: job.id,
			title: "Could not send to reMarkable",
			message: userMessage(job.error),
			onClickPage: PAGES_FOR_ERROR[job.error.kind] ?? input.failurePage,
		});
	}
	return job;
}
