/** RemarkablePort over rmapi-js; the only module that imports it (constitution III). */
import {
	AuthError,
	auth,
	type Entry,
	RegisterError,
	type RemarkableApi,
	ResponseError,
	register,
	session,
} from "rmapi-js";
import type { RemarkableHosts } from "../core/config";
import {
	type DestinationFolder,
	RemarkableError,
	type RemarkablePort,
	type Storage,
	type UploadDoc,
} from "./ports";

const SESSION_KEY = "session";

interface CachedSession {
	deviceToken: string;
	sessionToken: string;
	obtainedAt: string;
}

/** Live (not trashed) folders by id, with the path shown to the user. */
function liveFolders(items: Entry[]): DestinationFolder[] {
	const byId = new Map(items.map((item) => [item.id, item]));
	const folders: DestinationFolder[] = [];
	for (const item of items) {
		if (item.type !== "CollectionType") continue;
		const names: string[] = [];
		let current: Entry | undefined = item;
		let live = true;
		for (let depth = 0; current && depth < 64; depth++) {
			names.unshift(current.visibleName);
			const parent: string = current.parent ?? "";
			if (parent === "trash") live = false;
			if (parent === "" || parent === "trash") break;
			current = byId.get(parent);
			if (!current) live = false;
		}
		if (live) {
			folders.push({
				id: item.id,
				name: names.join(" / "),
				parentId: item.parent ?? "",
			});
		}
	}
	return folders.sort((a, b) => a.name.localeCompare(b.name));
}

class FolderMissing extends Error {}

export interface RemarkableOptions {
	/** null uses rmapi-js's production hosts. */
	hosts: RemarkableHosts | null;
	storage: Storage;
	maxTransientRetries?: number;
}

function toRemarkableError(error: unknown): RemarkableError {
	if (error instanceof RemarkableError) return error;
	if (error instanceof RegisterError) {
		return error.status >= 500
			? new RemarkableError("service", error.status)
			: new RemarkableError("invalid-code", error.status);
	}
	if (error instanceof AuthError || error instanceof ResponseError) {
		if (error.status === 401 || error.status === 403) {
			return new RemarkableError("auth-rejected", error.status);
		}
		if (error.status === 413) return new RemarkableError("too-large", 413);
		return new RemarkableError("service", error.status);
	}
	if (error instanceof TypeError) return new RemarkableError("network");
	return new RemarkableError("service");
}

export function createRemarkable(options: RemarkableOptions): RemarkablePort & {
	/** Runs `fn` with a session, refreshing the session token once on 401. */
	withApi<T>(
		deviceToken: string,
		fn: (api: RemarkableApi) => Promise<T>,
	): Promise<T>;
} {
	const hostOptions = options.hosts ?? {};
	const authHost = options.hosts?.authHost;

	async function sessionToken(
		deviceToken: string,
		refresh: boolean,
	): Promise<string> {
		const cached = await options.storage.get<CachedSession>(
			"session",
			SESSION_KEY,
		);
		if (!refresh && cached?.deviceToken === deviceToken) {
			return cached.sessionToken;
		}
		const token = await auth(deviceToken, authHost ? { authHost } : {});
		await options.storage.set("session", SESSION_KEY, {
			deviceToken,
			sessionToken: token,
			obtainedAt: new Date().toISOString(),
		} satisfies CachedSession);
		return token;
	}

	async function withApi<T>(
		deviceToken: string,
		fn: (api: RemarkableApi) => Promise<T>,
	): Promise<T> {
		const make = async (refresh: boolean) =>
			session(await sessionToken(deviceToken, refresh), {
				...hostOptions,
				maxTransientRetries: options.maxTransientRetries ?? 3,
			});
		try {
			try {
				return await fn(await make(false));
			} catch (error) {
				if (error instanceof ResponseError && error.status === 401) {
					return await fn(await make(true));
				}
				throw error;
			}
		} catch (error) {
			throw toRemarkableError(error);
		}
	}

	return {
		withApi,

		async register(code: string, deviceId: string) {
			try {
				const deviceToken = await register(code, {
					deviceDesc: "browser-chrome",
					uuid: deviceId,
					...(authHost ? { authHost } : {}),
				});
				return { deviceToken };
			} catch (error) {
				throw toRemarkableError(error);
			}
		},

		async upload(
			deviceToken: string,
			doc: UploadDoc,
			folderId: string | null,
		): Promise<{ id: string; fellBackToRoot: boolean }> {
			// The simple API is what reMarkable's own extension uses and survives
			// schema changes, but it can only write to the top level.
			const toRoot = async () => {
				const entry = await withApi(deviceToken, (api) =>
					doc.kind === "pdf"
						? api.uploadPdf(doc.name, doc.bytes)
						: api.uploadEpub(doc.name, doc.bytes),
				);
				return entry.id;
			};
			if (folderId === null)
				return { id: await toRoot(), fellBackToRoot: false };

			try {
				const ref = await withApi(deviceToken, async (api) => {
					const folders = liveFolders(await api.listItems(true));
					if (!folders.some((folder) => folder.id === folderId)) {
						throw new FolderMissing(folderId);
					}
					return doc.kind === "pdf"
						? api.putPdf(doc.name, doc.bytes, { parent: folderId })
						: api.putEpub(doc.name, doc.bytes, { parent: folderId });
				});
				return { id: ref.id, fellBackToRoot: false };
			} catch (error) {
				if (
					error instanceof RemarkableError &&
					(error.kind === "auth-rejected" || error.kind === "network")
				) {
					throw error;
				}
				return { id: await toRoot(), fellBackToRoot: true };
			}
		},

		async listFolders(deviceToken: string): Promise<DestinationFolder[]> {
			return withApi(deviceToken, async (api) =>
				liveFolders(await api.listItems(true)),
			);
		},
	};
}
