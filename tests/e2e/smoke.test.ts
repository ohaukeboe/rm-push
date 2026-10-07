import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Session, startSession } from "./harness";

let s: Session;

beforeAll(async () => {
	s = await startSession();
}, 60000);
afterAll(() => s?.quit());

describe("extension smoke", () => {
	test("options page loads", async () => {
		await s.open("options.html");
		expect(await s.driver.getTitle()).toBe("Send to reMarkable");
	});

	test("background answers status", async () => {
		const status = await s.message<{ ok: boolean; connection: string }>({
			type: "status",
		});
		expect(status).toMatchObject({ ok: true, connection: "disconnected" });
	});
});
