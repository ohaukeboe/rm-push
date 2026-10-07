import { describe, expect, test } from "bun:test";
import { loadPrefs, setDefaultFolder } from "../../src/core/prefs";
import { FakeStorage } from "../fakes/browser";

describe("prefs", () => {
	test("default folder is null (root) by default", async () => {
		expect(await loadPrefs(new FakeStorage())).toEqual({ defaultFolder: null });
	});

	test("set-default-folder persists", async () => {
		const storage = new FakeStorage();
		await setDefaultFolder(storage, { id: "f1", name: "Inbox" });
		expect((await loadPrefs(storage)).defaultFolder).toEqual({
			id: "f1",
			name: "Inbox",
		});
		await setDefaultFolder(storage, null);
		expect((await loadPrefs(storage)).defaultFolder).toBeNull();
	});
});
