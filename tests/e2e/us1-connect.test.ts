import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { VALID_CODE } from "../fakes/remarkable";
import { type Session, startSession } from "./harness";

let s: Session;

beforeAll(async () => {
	s = await startSession();
}, 60000);
afterAll(() => s?.quit());

describe("US1 connect", () => {
	test("popup asks to connect when disconnected", async () => {
		await s.open("popup.html");
		await s.waitForText("#connect-prompt", /Connect/);
	});

	test("invalid code shows an error and stays disconnected", async () => {
		await s.open("options.html");
		await s.type("#code", "zzzzzzzz");
		await s.click("#connect");
		await s.waitForText("#pair-error", /invalid or expired/);
		const status = await s.message<{ connection: string }>({ type: "status" });
		expect(status.connection).toBe("disconnected");
	});

	test("valid code connects", async () => {
		await s.open("options.html");
		await s.type("#code", VALID_CODE.toUpperCase());
		await s.click("#connect");
		await s.waitForText("#connected-since", /Connected since/);
	});

	test("connection survives a browser restart", async () => {
		await s.restart();
		await s.open("popup.html");
		const status = await s.message<{ connection: string }>({ type: "status" });
		expect(status.connection).toBe("connected");
	}, 60000);

	test("disconnect removes the stored account", async () => {
		await s.open("options.html");
		await s.waitForText("#connected-since", /Connected since/);
		await s.click("#disconnect");
		await s.waitForText("#connect", /Connect/);
		const account = await s.driver.executeAsyncScript(
			`const done = arguments[arguments.length - 1];
			browser.storage.local.get("account").then((items) => done(items.account ?? null));`,
		);
		expect(account).toBeNull();
	});
});
