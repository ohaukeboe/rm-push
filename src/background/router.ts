import {
	type Clock,
	type Http,
	type Ids,
	type ImageCodec,
	type Notifier,
	type Permissions,
	RemarkableError,
	type RemarkablePort,
	type Scripting,
	type Storage,
	type TabInfo,
	type Tabs,
} from "../adapters/ports";
import {
	accountAccess,
	connectionState,
	disconnect,
	loadAccount,
	pair,
} from "../core/account";
import { classify } from "../core/classify";
import type { Config } from "../core/config";
import { type SendError, SendFailure } from "../core/errors";
import { exportGoogleDoc } from "../core/google-docs";
import {
	type Folder,
	parseExtractResult,
	parseRequest,
	type Request,
} from "../core/messages";
import { fetchPdf, openUploadForLocalFile } from "../core/pdf";
import { loadPrefs, setDefaultFolder } from "../core/prefs";
import { nextStepAfterSave, printFileName } from "../core/print-flow";
import { buildReadableEpub } from "../core/readable";
import {
	type Fetchers,
	type JobInput,
	recentJobs,
	runSendJob,
} from "../core/send-job";
import { exportSharepointWord, openWordFallback } from "../core/sharepoint";
import { siteAccessFor } from "../core/site-access";
import type { ClassifiedUrl, Source } from "../core/source";
import { sanitizeTitle } from "../core/title";

export interface RouterDeps {
	storage: Storage;
	tabs: Tabs;
	config: Config;
	remarkable: RemarkablePort;
	clock: Clock;
	ids: Ids;
	notifier: Notifier;
	permissions: Permissions;
	http: Http;
	scripting: Scripting;
	imageCodec: ImageCodec;
}

export interface MenuClick {
	menuItemId: string | number;
	linkUrl?: string;
	linkText?: string;
}

export const MENU_IDS = {
	sendLink: "send-link",
	sendPage: "send-page",
	sendPagePrint: "send-page-print",
	uploadFile: "upload-file",
} as const;

type Reply =
	| ({ ok: true } & Record<string, unknown>)
	| { ok: false; error: SendError };

type Handlers = {
	[T in Request["type"]]?: (
		request: Extract<Request, { type: T }>,
	) => Promise<Reply>;
};

const fail = (error: SendError): Reply => ({ ok: false, error });

/** The popup passes its window's active tab; without it, use the active tab. */
export async function targetTab(
	tabs: Tabs,
	tabId: number | undefined,
): Promise<TabInfo | null> {
	return tabId === undefined ? tabs.activeTab() : tabs.get(tabId);
}

function originPattern(url: string): string {
	const { protocol, hostname } = new URL(url);
	return `${protocol}//${hostname}/*`;
}

function fileNameTitle(url: string): string {
	try {
		return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
	} catch {
		return "";
	}
}

export function createRouter(deps: RouterDeps) {
	const running = new Set<Promise<unknown>>();
	const account = accountAccess(deps.storage);

	const fetchers: Fetchers = {
		"pdf-url": async (source) => {
			try {
				return {
					kind: "doc",
					bytes: await fetchPdf(deps.http, source.url),
					format: "pdf",
				};
			} catch (error) {
				// A guessed PDF that is not one is a page we cannot read at all.
				if (
					source.guessed &&
					error instanceof SendFailure &&
					error.error.kind === "not-a-pdf"
				) {
					throw new SendFailure({ kind: "unsendable-page" });
				}
				throw error;
			}
		},
		"google-doc": async (source) => ({
			kind: "doc",
			bytes: await exportGoogleDoc(source, deps),
			format: "pdf",
		}),
		"word-sharepoint": async (source) => ({
			kind: "doc",
			bytes: await exportSharepointWord(source, deps),
			format: "pdf",
		}),
		"word-unsupported": () => openWordFallback(deps.tabs),
		"local-file": (source) => openUploadForLocalFile(deps.tabs, source.url),
		"web-reflow": async (source) => {
			let raw: unknown;
			try {
				raw = await deps.scripting.runExtract(source.tabId);
			} catch {
				raw = undefined;
			}
			return buildReadableEpub(parseExtractResult(raw), deps);
		},
		"web-print": async (source) => {
			const tab = await deps.tabs.get(source.tabId);
			const title = tab?.title ?? "";
			const status = await deps.tabs.saveAsPdf(printFileName(title));
			const step = nextStepAfterSave(status, title);
			if (step.kind === "canceled") return step;
			await deps.tabs.openExtensionPage("upload.html", step.query);
			return { kind: "handed-off" };
		},
		file: async (source) => ({
			kind: "doc",
			bytes: source.bytes,
			format: source.format,
		}),
	};

	async function resolveDestination(
		folder: Folder | null | undefined,
	): Promise<Folder | null> {
		if (folder !== undefined) return folder;
		return (await loadPrefs(deps.storage)).defaultFolder;
	}

	/** Starts a job in the background and returns its id at once. */
	function start(input: Omit<JobInput, "id">): string {
		const id = deps.ids.uuid();
		const failurePage =
			input.source.kind === "word-sharepoint"
				? "upload.html?reason=word"
				: undefined;
		const job = runSendJob(
			{ failurePage, ...input, id },
			{ ...deps, account, fetchers },
		).finally(() => running.delete(job));
		running.add(job);
		return id;
	}

	/** Starts a job whose source could not be built, so it is still recorded and notified. */
	function startFailed(
		title: string,
		source: Source,
		error: SendError,
	): string {
		return start({ source, title, destination: null, preflightError: error });
	}

	/**
	 * Classifies by URL, then asks the tab for its content type when the URL
	 * looks like an ordinary page: PDFs are often served without .pdf (arXiv).
	 */
	async function classifyTab(tab: TabInfo): Promise<ClassifiedUrl> {
		const classified = classify(tab.url, deps.config);
		if (classified.kind !== "web") return classified;
		const contentType = await deps.scripting.contentType(tab.id);
		if (contentType === null) {
			return { kind: "pdf-url", url: tab.url, guessed: true };
		}
		if (contentType === "application/pdf") {
			return { kind: "pdf-url", url: tab.url };
		}
		return classified;
	}

	async function sourceForTab(
		tab: TabInfo,
		mode: "auto" | "print",
	): Promise<Source | null> {
		const classified = await classifyTab(tab);
		switch (classified.kind) {
			case "unsendable":
				return null;
			case "web":
				return mode === "print"
					? { kind: "web-print", tabId: tab.id, url: tab.url }
					: { kind: "web-reflow", tabId: tab.id, url: tab.url };
			default:
				return classified;
		}
	}

	const handlers: Handlers = {
		async status(request) {
			const tab = await targetTab(deps.tabs, request.tabId);
			const classified = tab ? await classifyTab(tab) : null;
			let current: Record<string, unknown> | null = null;
			if (tab && classified && classified.kind !== "unsendable") {
				const access = siteAccessFor(classified.kind, deps.config);
				const missing =
					access && !(await deps.permissions.contains(access.origins))
						? access
						: null;
				current = {
					sourceKind: classified.kind,
					title: sanitizeTitle(tab.title),
					...(missing
						? { missingOrigins: missing.origins, site: missing.site }
						: {}),
				};
			}
			return {
				ok: true,
				connection: await connectionState(deps.storage),
				connectedAt: (await loadAccount(deps.storage))?.connectedAt ?? null,
				defaultFolder: (await loadPrefs(deps.storage)).defaultFolder,
				current,
				recentJobs: await recentJobs(deps.storage),
			};
		},
		async pair(request) {
			const result = await pair(request.code, deps);
			return result.ok ? { ok: true } : result;
		},
		async disconnect() {
			await disconnect(deps.storage);
			return { ok: true };
		},
		async "list-folders"() {
			const token = await account.deviceToken();
			if (token === null) return fail({ kind: "not-connected" });
			try {
				return { ok: true, folders: await deps.remarkable.listFolders(token) };
			} catch (error) {
				if (
					error instanceof RemarkableError &&
					error.kind === "auth-rejected"
				) {
					await account.markRevoked();
					return fail({ kind: "needs-reconnect" });
				}
				const status =
					error instanceof RemarkableError ? (error.status ?? 0) : 0;
				return fail(
					error instanceof RemarkableError && error.kind === "network"
						? { kind: "network", host: "reMarkable cloud" }
						: { kind: "service-error", status },
				);
			}
		},
		async "set-default-folder"(request) {
			await setDefaultFolder(deps.storage, request.folder);
			return { ok: true };
		},
		async "send-current"(request) {
			const tab = await targetTab(deps.tabs, request.tabId);
			const source = tab ? await sourceForTab(tab, request.mode) : null;
			if (!tab || !source) return fail({ kind: "unsendable-page" });
			const jobId = start({
				source,
				title: sanitizeTitle(tab.title),
				destination: await resolveDestination(request.folder),
			});
			return { ok: true, jobId };
		},
		async "send-file"(request) {
			const format = request.mime === "application/pdf" ? "pdf" : "epub";
			const jobId = start({
				source: {
					kind: "file",
					name: request.name,
					bytes: new Uint8Array(request.bytes),
					format,
				},
				title: sanitizeTitle(request.name.replace(/\.epub$/i, "")),
				destination: await resolveDestination(request.folder),
			});
			return { ok: true, jobId };
		},
	};

	async function handle(raw: unknown): Promise<Reply> {
		const parsed = parseRequest(raw);
		if (!parsed.ok) return fail(parsed.error);
		const handler = handlers[parsed.request.type] as
			| ((request: Request) => Promise<Reply>)
			| undefined;
		if (!handler) return fail({ kind: "bad-message" });
		return handler(parsed.request);
	}

	async function sendLink(
		click: MenuClick,
		tab: TabInfo | null,
	): Promise<void> {
		const linkUrl = click.linkUrl;
		if (!linkUrl) return;
		const classified = classify(linkUrl, deps.config);
		const source: Source =
			classified.kind === "google-doc" ||
			classified.kind === "word-sharepoint" ||
			classified.kind === "word-unsupported"
				? classified
				: { kind: "pdf-url", url: linkUrl };
		const title = sanitizeTitle(
			click.linkText?.trim() || fileNameTitle(linkUrl),
		);
		const destination = await resolveDestination(undefined);

		if (source.kind === "pdf-url" && /^https?:/.test(linkUrl)) {
			const sameOrigin =
				tab !== null &&
				URL.canParse(tab.url) &&
				new URL(tab.url).origin === new URL(linkUrl).origin;
			const allowed =
				sameOrigin ||
				(await deps.permissions.contains([originPattern(linkUrl)]));
			if (!allowed) {
				startFailed(title, source, {
					kind: "permission-denied",
					site: "all websites",
				});
				return;
			}
		}
		start({ source, title, destination });
	}

	return {
		handle,

		async menuClicked(click: MenuClick, tab: TabInfo | null): Promise<void> {
			switch (click.menuItemId) {
				case MENU_IDS.sendLink:
					return sendLink(click, tab);
				case MENU_IDS.sendPage:
				case MENU_IDS.sendPagePrint: {
					if (!tab) return;
					await handle({
						type: "send-current",
						mode: click.menuItemId === MENU_IDS.sendPage ? "auto" : "print",
						tabId: tab.id,
					});
					return;
				}
				case MENU_IDS.uploadFile:
					await deps.tabs.openExtensionPage("upload.html", { reason: "file" });
					return;
			}
		},

		/** Resolves when every running job has finished (tests). */
		async idle(): Promise<void> {
			while (running.size > 0) await Promise.allSettled([...running]);
		},
	};
}
