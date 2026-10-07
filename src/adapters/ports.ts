/**
 * Interfaces between core logic and the outside world (contracts/ports.md).
 * Production adapters live next to this file; tests use tests/fakes/.
 */
import type { DocFormat } from "../core/source";

export interface DestinationFolder {
	id: string;
	name: string;
	parentId: string;
}

export interface UploadDoc {
	name: string;
	bytes: Uint8Array;
	kind: DocFormat;
}

export type RemarkableErrorKind =
	| "invalid-code"
	| "auth-rejected"
	| "network"
	| "too-large"
	| "service";

export class RemarkableError extends Error {
	constructor(
		readonly kind: RemarkableErrorKind,
		readonly status?: number,
	) {
		super(status === undefined ? kind : `${kind} (${status})`);
		this.name = "RemarkableError";
	}
}

export interface RemarkablePort {
	register(code: string, deviceId: string): Promise<{ deviceToken: string }>;
	upload(
		deviceToken: string,
		doc: UploadDoc,
		folderId: string | null,
	): Promise<{ id: string; fellBackToRoot: boolean }>;
	listFolders(deviceToken: string): Promise<DestinationFolder[]>;
}

export type StorageArea = "local" | "session";

export interface Storage {
	get<T>(area: StorageArea, key: string): Promise<T | undefined>;
	set(area: StorageArea, key: string, value: unknown): Promise<void>;
	remove(area: StorageArea, keys: string[]): Promise<void>;
}

export interface TabInfo {
	id: number;
	url: string;
	title: string;
}

export type SaveStatus =
	| "saved"
	| "replaced"
	| "canceled"
	| "not_saved"
	| "not_replaced";

export interface Tabs {
	activeTab(): Promise<TabInfo | null>;
	get(tabId: number): Promise<TabInfo | null>;
	saveAsPdf(fileName: string): Promise<SaveStatus>;
	openExtensionPage(
		path: string,
		query?: Record<string, string>,
	): Promise<void>;
	openOptions(): Promise<void>;
}

export interface Scripting {
	/** Runs the bundled extract.js in the tab and returns its raw result. */
	runExtract(tabId: number): Promise<unknown>;
	/**
	 * The tab document's MIME type, or null when scripts cannot run there.
	 * Firefox's PDF viewer is such a tab.
	 */
	contentType(tabId: number): Promise<string | null>;
}

export interface Permissions {
	contains(origins: string[]): Promise<boolean>;
}

export interface Notice {
	id: string;
	title: string;
	message: string;
	/** Extension page opened when the notification is clicked. */
	onClickPage?: string;
}

export interface Notifier {
	notify(notice: Notice): Promise<void>;
}

export interface HttpResult {
	status: number;
	finalUrl: string;
	contentType: string;
	bytes: Uint8Array;
}

export interface Http {
	/** Background fetch with the user's cookies. Throws NetworkError when unreachable. */
	fetch(url: string, init?: RequestInit): Promise<HttpResult>;
}

export class NetworkError extends Error {
	constructor(readonly url: string) {
		super(`could not reach ${url}`);
		this.name = "NetworkError";
	}
}

export interface ImageCodec {
	toRaster(
		bytes: Uint8Array,
		mime: string,
		maxWidth: number,
		maxHeight: number,
	): Promise<{ bytes: Uint8Array; mime: "image/png" | "image/jpeg" }>;
}

export interface Clock {
	now(): Date;
}

export interface Ids {
	uuid(): string;
}
