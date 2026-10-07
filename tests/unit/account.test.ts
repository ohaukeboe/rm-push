import { beforeEach, describe, expect, test } from "bun:test";
import { RemarkableError, type RemarkablePort } from "../../src/adapters/ports";
import {
	accountAccess,
	connectionState,
	disconnect,
	normalizeCode,
	pair,
} from "../../src/core/account";
import { FakeStorage, FixedClock, SequentialIds } from "../fakes/browser";

class PairingRemarkable implements RemarkablePort {
	calls: { code: string; deviceId: string }[] = [];
	failWith: RemarkableError | null = null;

	async register(code: string, deviceId: string) {
		this.calls.push({ code, deviceId });
		if (this.failWith) throw this.failWith;
		return { deviceToken: `token-${deviceId}` };
	}

	async upload(): Promise<never> {
		throw new Error("unused");
	}

	async listFolders() {
		return [];
	}
}

let storage: FakeStorage;
let remarkable: PairingRemarkable;
const deps = () => ({
	storage,
	remarkable,
	clock: new FixedClock(),
	ids: new SequentialIds(),
});

beforeEach(() => {
	storage = new FakeStorage();
	remarkable = new PairingRemarkable();
});

describe("normalizeCode", () => {
	test("accepts 8 letters, trimmed and lower-cased", () => {
		expect(normalizeCode("abcdefgh")).toBe("abcdefgh");
		expect(normalizeCode("  ABCDefgh \n")).toBe("abcdefgh");
	});

	test("rejects anything else", () => {
		for (const code of ["", "abcdefg", "abcdefghi", "abcd efg", "abcdefg1"]) {
			expect(normalizeCode(code)).toBeNull();
		}
	});
});

describe("pair", () => {
	test("Disconnected --valid code--> Connected", async () => {
		expect(await pair(" ABCDEFGH ", deps())).toEqual({ ok: true });
		expect(remarkable.calls).toEqual([
			{ code: "abcdefgh", deviceId: "00000000-0000-4000-8000-000000000001" },
		]);
		expect(await storage.get<unknown>("local", "account")).toEqual({
			deviceToken: "token-00000000-0000-4000-8000-000000000001",
			deviceId: "00000000-0000-4000-8000-000000000001",
			connectedAt: "2026-10-07T12:00:00.000Z",
		});
		expect(await connectionState(storage)).toBe("connected");
	});

	test("malformed code is rejected without a network call", async () => {
		expect(await pair("abc", deps())).toEqual({
			ok: false,
			error: { kind: "invalid-code" },
		});
		expect(remarkable.calls).toHaveLength(0);
		expect(await connectionState(storage)).toBe("disconnected");
	});

	test("Disconnected --code rejected by service--> Disconnected", async () => {
		remarkable.failWith = new RemarkableError("invalid-code");
		expect(await pair("abcdefgh", deps())).toEqual({
			ok: false,
			error: { kind: "invalid-code" },
		});
		expect(await connectionState(storage)).toBe("disconnected");
	});

	test("network and service failures are reported", async () => {
		remarkable.failWith = new RemarkableError("network");
		expect(await pair("abcdefgh", deps())).toEqual({
			ok: false,
			error: { kind: "network", host: "reMarkable cloud" },
		});
		remarkable.failWith = new RemarkableError("service", 503);
		expect(await pair("abcdefgh", deps())).toEqual({
			ok: false,
			error: { kind: "service-error", status: 503 },
		});
	});

	test("NeedsReconnect --valid code--> Connected", async () => {
		await pair("abcdefgh", deps());
		await accountAccess(storage).markRevoked();
		expect(await connectionState(storage)).toBe("needs-reconnect");
		await pair("abcdefgh", deps());
		expect(await connectionState(storage)).toBe("connected");
	});
});

describe("disconnect", () => {
	test("Connected --disconnect--> Disconnected, deleting account and session", async () => {
		await pair("abcdefgh", deps());
		await storage.set("session", "session", { sessionToken: "s" });
		await disconnect(storage);
		expect(await storage.get("local", "account")).toBeUndefined();
		expect(await storage.get("session", "session")).toBeUndefined();
		expect(await connectionState(storage)).toBe("disconnected");
	});
});

describe("accountAccess", () => {
	test("exposes token and revocation", async () => {
		const access = accountAccess(storage);
		expect(await access.deviceToken()).toBeNull();
		await pair("abcdefgh", deps());
		expect(await access.deviceToken()).toBe(
			"token-00000000-0000-4000-8000-000000000001",
		);
		expect(await access.isRevoked()).toBe(false);
		await access.markRevoked();
		expect(await access.isRevoked()).toBe(true);
		expect(
			(await storage.get<{ revoked?: boolean }>("local", "account"))?.revoked,
		).toBe(true);
	});
});
