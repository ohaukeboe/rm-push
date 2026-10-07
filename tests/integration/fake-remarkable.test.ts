import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { register, remarkable } from "rmapi-js";
import { VALID_CODE } from "../fakes/remarkable";
import { MINIMAL_PDF, startFakeServer } from "../fakes/server";

const server = startFakeServer();
const hosts = {
	authHost: server.url,
	rawHost: server.url,
	uploadHost: server.url,
};

afterAll(() => server.stop());
beforeEach(() => server.remarkable.reset());

describe("fake reMarkable cloud, driven by rmapi-js", () => {
	test("register rejects a wrong code", async () => {
		await expect(
			register("zzzzzzzz", { authHost: server.url }),
		).rejects.toThrow();
	});

	test("register, auth and simple upload", async () => {
		const token = await register(VALID_CODE, { authHost: server.url });
		const api = await remarkable(token, hosts);
		await api.uploadPdf("Doc", MINIMAL_PDF);
		const [upload] = server.remarkable.state.simpleUploads;
		expect(upload?.name).toBe("Doc");
		expect(upload?.mime).toBe("application/pdf");
		expect(upload?.bytes).toEqual(MINIMAL_PDF);
	});

	test("sync protocol: folder, put into folder, list", async () => {
		const token = await register(VALID_CODE, { authHost: server.url });
		const api = await remarkable(token, hosts);
		const folder = await api.putFolder("Inbox");
		await api.putPdf("In folder", MINIMAL_PDF, { parent: folder.id });
		const items = await api.listItems(true);
		const doc = items.find((i) => i.visibleName === "In folder");
		expect(doc?.parent).toBe(folder.id);
		expect(
			items.some(
				(i) => i.visibleName === "Inbox" && i.type === "CollectionType",
			),
		).toBe(true);
	});

	test("revoked device cannot get a session", async () => {
		const token = await register(VALID_CODE, { authHost: server.url });
		server.remarkable.revoke(token);
		await expect(remarkable(token, hosts)).rejects.toThrow();
	});
});
