import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { RemarkableError } from "../../src/adapters/ports";
import { createRemarkable } from "../../src/adapters/remarkable";
import { FakeStorage } from "../fakes/browser";
import { VALID_CODE } from "../fakes/remarkable";
import { startFakeServer } from "../fakes/server";

const server = startFakeServer();
const hosts = {
	authHost: server.url,
	rawHost: server.url,
	uploadHost: server.url,
};
afterAll(() => server.stop());
beforeEach(() => server.remarkable.reset());

const adapter = (h = hosts) =>
	createRemarkable({
		hosts: h,
		storage: new FakeStorage(),
		maxTransientRetries: 0,
	});

async function rejection(promise: Promise<unknown>): Promise<RemarkableError> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof RemarkableError) return error;
		throw error;
	}
	throw new Error("expected a rejection");
}

describe("RemarkablePort.register", () => {
	test("valid code returns a device token, registered as browser-chrome", async () => {
		const { deviceToken } = await adapter().register(VALID_CODE, "dev-1");
		expect(deviceToken).toBe("device-dev-1");
		expect(server.remarkable.state.devices.get(deviceToken)).toEqual({
			deviceId: "dev-1",
			deviceDesc: "browser-chrome",
		});
	});

	test("rejected code is invalid-code", async () => {
		const error = await rejection(adapter().register("zzzzzzzz", "dev-1"));
		expect(error.kind).toBe("invalid-code");
	});

	test("unreachable host is network", async () => {
		const dead = { ...hosts, authHost: "http://127.0.0.1:9" };
		const error = await rejection(adapter(dead).register(VALID_CODE, "d"));
		expect(error.kind).toBe("network");
	});

	test("5xx is service with status", async () => {
		const failing = startFakeServer();
		failing.handlers.push(() => new Response("down", { status: 503 }));
		// Paths under /broken are not reMarkable paths, so the handler answers 503.
		const broken = { ...hosts, authHost: `${failing.url}/broken` };
		const error = await rejection(adapter(broken).register(VALID_CODE, "d"));
		expect(error.kind).toBe("service");
		expect(error.status).toBe(503);
		await failing.stop();
	});
});
