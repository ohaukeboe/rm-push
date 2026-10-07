import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { MINIMAL_PDF } from "../fakes/server";
import { sharepointHandler } from "../fakes/sharepoint";
import { type Session, startSession } from "./harness";

let s: Session;

beforeAll(async () => {
	s = await startSession();
	s.server.handlers.push(sharepointHandler);
}, 60000);
afterAll(() => s?.quit());
beforeEach(() => s.server.remarkable.reset());

describe("US5 Word for the web", () => {
	test("SharePoint document is exported as PDF", async () => {
		await s.pair();
		const tabId = await s.openFakeTab(
			"/sites/T/_layouts/15/Doc.aspx?sourcedoc=%7B1A2B%7D&file=Q4%20Plan.docx",
		);
		await s.message({ type: "send-current", mode: "auto", tabId });
		await s.waitForUploads(1);
		const [upload] = s.server.remarkable.state.simpleUploads;
		expect(upload?.name).toBe("Q4 Plan");
		expect(upload?.bytes).toEqual(MINIMAL_PDF);
		expect(
			s.server.requests.some((r) =>
				r.includes(
					"/_api/v2.0/sites/127.0.0.1:/sites/T:/drive/root:/Plans/Q4%20Plan.docx:/content",
				),
			),
		).toBe(true);
	});

	test("unsupported Word host opens the upload page with instructions", async () => {
		await s.pair();
		const before = (await s.driver.getAllWindowHandles()).length;
		await s.message({
			type: "e2e-menu-click",
			click: {
				menuItemId: "send-link",
				linkUrl: "https://onedrive.live.com/edit?id=1",
			},
			tabId: -1,
		});
		await s.driver.wait(
			async () => (await s.driver.getAllWindowHandles()).length > before,
			10000,
		);
		const handles = await s.driver.getAllWindowHandles();
		await s.driver.switchTo().window(handles[handles.length - 1] ?? "");
		await s.waitForText("#instructions", /Download as PDF/);
	});
});
