import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { register, remarkable } from "rmapi-js";
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
/** A second client on the same account, to arrange and inspect the cloud. */
let cloud: Awaited<ReturnType<typeof remarkable>>;

beforeEach(async () => {
	await server.remarkable.reset();
	port = createRemarkable({
		hosts,
		storage: new FakeStorage(),
		maxTransientRetries: 0,
	});
	token = (await port.register(VALID_CODE, "dev")).deviceToken;
	cloud = await remarkable(
		await register(VALID_CODE, { authHost: server.url }),
		hosts,
	);
});

const doc = { name: "Paper", bytes: MINIMAL_PDF, kind: "pdf" as const };

describe("listFolders", () => {
	test("returns live collections with their full path, sorted", async () => {
		const work = await cloud.putFolder("Work");
		await cloud.putFolder("Reports", { parent: work.id });
		await cloud.putFolder("Archive");
		const trashed = await cloud.putFolder("Old");
		await cloud.delete(trashed);
		await cloud.putPdf("Not a folder", MINIMAL_PDF);

		const folders = await port.listFolders(token);
		expect(folders.map((f) => f.name)).toEqual([
			"Archive",
			"Work",
			"Work / Reports",
		]);
		expect(folders.find((f) => f.name === "Work")?.id).toBe(work.id);
	});
});

describe("upload into a folder", () => {
	test("PDF lands in the folder through the sync API", async () => {
		const inbox = await cloud.putFolder("Inbox");
		const result = await port.upload(token, doc, inbox.id);
		expect(result.fellBackToRoot).toBe(false);
		const items = await cloud.listItems(true);
		expect(items.find((i) => i.visibleName === "Paper")?.parent).toBe(inbox.id);
		expect(server.remarkable.state.simpleUploads).toHaveLength(0);
	});

	test("EPUB lands in the folder", async () => {
		const inbox = await cloud.putFolder("Inbox");
		const epub = new Uint8Array([80, 75, 3, 4, 0, 0]);
		await port.upload(
			token,
			{ name: "Book", bytes: epub, kind: "epub" },
			inbox.id,
		);
		const items = await cloud.listItems(true);
		expect(items.find((i) => i.visibleName === "Book")?.parent).toBe(inbox.id);
	});

	test("deleted folder falls back to root via the simple API", async () => {
		const gone = await cloud.putFolder("Gone");
		await cloud.delete(gone);
		const result = await port.upload(token, doc, gone.id);
		expect(result.fellBackToRoot).toBe(true);
		expect(server.remarkable.state.simpleUploads).toMatchObject([
			{ name: "Paper" },
		]);
	});

	test("unknown folder id falls back to root", async () => {
		const result = await port.upload(token, doc, "no-such-folder");
		expect(result.fellBackToRoot).toBe(true);
	});

	test("sync failure falls back to root once", async () => {
		const inbox = await cloud.putFolder("Inbox");
		server.remarkable.fail("/sync/v3/root", 500);
		const result = await port.upload(token, doc, inbox.id);
		expect(result.fellBackToRoot).toBe(true);
		expect(server.remarkable.state.simpleUploads).toHaveLength(1);
	});

	test("auth errors are not retried", async () => {
		const inbox = await cloud.putFolder("Inbox");
		server.remarkable.revoke(token);
		try {
			await port.upload(token, doc, inbox.id);
			throw new Error("expected rejection");
		} catch (error) {
			expect(error).toBeInstanceOf(RemarkableError);
			expect((error as RemarkableError).kind).toBe("auth-rejected");
		}
		expect(server.remarkable.state.simpleUploads).toHaveLength(0);
	});
});
