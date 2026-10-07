import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { RemarkableError } from "../../src/adapters/ports";
import { createRemarkable } from "../../src/adapters/remarkable";
import { FakeStorage } from "../fakes/browser";
import { VALID_CODE } from "../fakes/remarkable";
import { MINIMAL_PDF, startFakeServer } from "../fakes/server";

const server = startFakeServer();
const hosts = {
	authHost: server.url,
	rawHost: server.url,
	uploadHost: server.url,
};
afterAll(() => server.stop());

let port: ReturnType<typeof createRemarkable>;
let token: string;

beforeEach(async () => {
	await server.remarkable.reset();
	port = createRemarkable({
		hosts,
		storage: new FakeStorage(),
		maxTransientRetries: 0,
	});
	token = (await port.register(VALID_CODE, "dev")).deviceToken;
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

describe("RemarkablePort.upload to root", () => {
	test("PDF goes through the simple API", async () => {
		const result = await port.upload(
			token,
			{ name: "Paper", bytes: MINIMAL_PDF, kind: "pdf" },
			null,
		);
		expect(result.fellBackToRoot).toBe(false);
		expect(server.remarkable.state.simpleUploads).toMatchObject([
			{ name: "Paper", mime: "application/pdf" },
		]);
	});

	test("EPUB goes through the simple API", async () => {
		await port.upload(
			token,
			{ name: "Book", bytes: new Uint8Array([80, 75, 3, 4]), kind: "epub" },
			null,
		);
		expect(server.remarkable.state.simpleUploads[0]?.mime).toBe(
			"application/epub+zip",
		);
	});

	test("revoked device is auth-rejected", async () => {
		server.remarkable.revoke(token);
		const error = await rejection(
			port.upload(token, { name: "x", bytes: MINIMAL_PDF, kind: "pdf" }, null),
		);
		expect(error.kind).toBe("auth-rejected");
	});

	test("expired session is refreshed once", async () => {
		await port.upload(
			token,
			{ name: "a", bytes: MINIMAL_PDF, kind: "pdf" },
			null,
		);
		server.remarkable.state.sessions.clear();
		await port.upload(
			token,
			{ name: "b", bytes: MINIMAL_PDF, kind: "pdf" },
			null,
		);
		expect(server.remarkable.state.simpleUploads).toHaveLength(2);
	});

	test("500 is service(500)", async () => {
		server.remarkable.fail("/doc/v2/files", 500);
		const error = await rejection(
			port.upload(token, { name: "x", bytes: MINIMAL_PDF, kind: "pdf" }, null),
		);
		expect(error.kind).toBe("service");
		expect(error.status).toBe(500);
	});

	test("unreachable is network", async () => {
		const dead = createRemarkable({
			hosts: { ...hosts, uploadHost: "http://127.0.0.1:9" },
			storage: new FakeStorage(),
			maxTransientRetries: 0,
		});
		const error = await rejection(
			dead.upload(token, { name: "x", bytes: MINIMAL_PDF, kind: "pdf" }, null),
		);
		expect(error.kind).toBe("network");
	});
});
