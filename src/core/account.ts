import type { Clock, Ids, RemarkablePort, Storage } from "../adapters/ports";
import { RemarkableError } from "../adapters/ports";
import type { SendError } from "./errors";
import type { AccountAccess } from "./send-job";

export interface StoredAccount {
	deviceToken: string;
	deviceId: string;
	connectedAt: string;
	revoked?: boolean;
}

export type ConnectionState = "disconnected" | "connected" | "needs-reconnect";

export const ACCOUNT_KEY = "account";
export const SESSION_KEY = "session";

export async function loadAccount(
	storage: Storage,
): Promise<StoredAccount | undefined> {
	return storage.get<StoredAccount>("local", ACCOUNT_KEY);
}

export async function connectionState(
	storage: Storage,
): Promise<ConnectionState> {
	const account = await loadAccount(storage);
	if (!account) return "disconnected";
	return account.revoked ? "needs-reconnect" : "connected";
}

/** Exactly 8 letters, trimmed, lower-cased; null for anything else. */
export function normalizeCode(input: string): string | null {
	const code = input.trim().toLowerCase();
	return /^[a-z]{8}$/.test(code) ? code : null;
}

export interface PairDeps {
	storage: Storage;
	remarkable: RemarkablePort;
	clock: Clock;
	ids: Ids;
}

export async function pair(
	input: string,
	deps: PairDeps,
): Promise<{ ok: true } | { ok: false; error: SendError }> {
	const code = normalizeCode(input);
	if (code === null) return { ok: false, error: { kind: "invalid-code" } };
	const deviceId = deps.ids.uuid();
	try {
		const { deviceToken } = await deps.remarkable.register(code, deviceId);
		const account: StoredAccount = {
			deviceToken,
			deviceId,
			connectedAt: deps.clock.now().toISOString(),
		};
		await deps.storage.remove("session", [SESSION_KEY]);
		await deps.storage.set("local", ACCOUNT_KEY, account);
		return { ok: true };
	} catch (error) {
		if (!(error instanceof RemarkableError)) throw error;
		switch (error.kind) {
			case "invalid-code":
				return { ok: false, error: { kind: "invalid-code" } };
			case "network":
				return {
					ok: false,
					error: { kind: "network", host: "reMarkable cloud" },
				};
			default:
				return {
					ok: false,
					error: { kind: "service-error", status: error.status ?? 0 },
				};
		}
	}
}

export async function disconnect(storage: Storage): Promise<void> {
	await storage.remove("local", [ACCOUNT_KEY]);
	await storage.remove("session", [SESSION_KEY]);
}

export function accountAccess(storage: Storage): AccountAccess {
	return {
		async deviceToken() {
			return (await loadAccount(storage))?.deviceToken ?? null;
		},
		async isRevoked() {
			return (await loadAccount(storage))?.revoked === true;
		},
		async markRevoked() {
			const account = await loadAccount(storage);
			if (account) {
				await storage.set("local", ACCOUNT_KEY, { ...account, revoked: true });
			}
		},
	};
}
