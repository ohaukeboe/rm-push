/**
 * Drives the built dist-e2e/ extension in headless Firefox via Selenium and
 * geckodriver from shell.nix. All network traffic goes to the local fake server.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	Browser,
	Builder,
	By,
	until,
	type WebDriver,
} from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox";
import { VALID_CODE } from "../fakes/remarkable";
import { type FakeServer, startFakeServer } from "../fakes/server";

export const ADDON_ID = "rm-push@ohaukeboe";
export const ADDON_UUID = "6b0e3c9a-1f2d-4e5a-9b8c-7d6e5f4a3b2c";
export const BASE = `moz-extension://${ADDON_UUID}`;

const origin = process.env.E2E_FAKE_ORIGIN ?? "http://127.0.0.1:8787";

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set; run inside nix-shell`);
	return value;
}

export interface Session {
	driver: WebDriver;
	server: FakeServer;
	profileDir: string;
	/** Open an extension page (path relative to the extension root). */
	open(path: string): Promise<void>;
	/** Open a page served by the fake server. */
	openFake(path: string): Promise<void>;
	/** Send a message to the background as the extension's own page would. */
	message<T = unknown>(message: unknown): Promise<T>;
	/** Open a fake-server page in a new tab and return to the previous tab. Returns the tab id. */
	openFakeTab(path: string): Promise<number>;
	/** Connect the extension to the fake cloud. */
	pair(): Promise<void>;
	text(css: string): Promise<string>;
	click(css: string): Promise<void>;
	type(css: string, text: string): Promise<void>;
	waitForText(
		css: string,
		pattern: RegExp,
		timeoutMs?: number,
	): Promise<string>;
	/** Wait until the fake reMarkable cloud has `count` simple uploads. */
	waitForUploads(count: number, timeoutMs?: number): Promise<void>;
	restart(): Promise<void>;
	quit(): Promise<void>;
}

async function launch(profileDir: string): Promise<WebDriver> {
	const options = new firefox.Options()
		.setBinary(required("FIREFOX_BIN"))
		.addArguments("-headless", "-profile", profileDir)
		.setPreference(
			"extensions.webextensions.uuids",
			JSON.stringify({ [ADDON_ID]: ADDON_UUID }),
		)
		// Without a user gesture the popup cannot be opened; tests drive pages directly.
		.setPreference("extensions.webextensions.restrictedDomains", "");
	const service = new firefox.ServiceBuilder(
		required("GECKODRIVER"),
	).addArguments("--allow-system-access");
	const driver = await new Builder()
		.forBrowser(Browser.FIREFOX)
		.setFirefoxOptions(options)
		.setFirefoxService(service)
		.build();
	await (driver as firefox.Driver).installAddon(
		join(import.meta.dir, "..", "..", "dist-e2e"),
		true,
	);
	return driver;
}

/** driver.get() on moz-extension:// is blocked on Firefox 156+; fall back to chrome context. */
async function navigate(driver: WebDriver, url: string): Promise<void> {
	try {
		await driver.get(url);
		return;
	} catch (error) {
		if (!String(error).includes("not allowed")) throw error;
		if (process.env.E2E_DEBUG)
			console.error("driver.get blocked; using chrome context");
	}
	const fx = driver as firefox.Driver;
	const before = await driver.getAllWindowHandles();
	await fx.setContext(firefox.Context.CHROME);
	await driver.executeScript(
		`gBrowser.selectedTab = gBrowser.addTab(arguments[0], {
			triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
		});`,
		url,
	);
	await fx.setContext(firefox.Context.CONTENT);
	const after = await driver.getAllWindowHandles();
	const added = after.find((h) => !before.includes(h));
	if (added) await driver.switchTo().window(added);
	await driver.wait(async () => (await driver.getCurrentUrl()) === url, 5000);
}

export async function startSession(): Promise<Session> {
	const port = Number(new URL(origin).port);
	const server = startFakeServer(port);
	const profileDir = await mkdtemp(join(tmpdir(), "rm-push-e2e-"));
	let driver = await launch(profileDir);

	const session: Session = {
		get driver() {
			return driver;
		},
		server,
		profileDir,
		open: (path) => navigate(driver, `${BASE}/${path}`),
		openFake: (path) => navigate(driver, `${server.url}${path}`),
		async message<T>(message: unknown): Promise<T> {
			if (!(await driver.getCurrentUrl()).startsWith(BASE)) {
				await session.open("options.html");
			}
			return (await driver.executeAsyncScript(
				`const done = arguments[arguments.length - 1];
				browser.runtime.sendMessage(arguments[0]).then(done, (e) => done({ thrown: String(e) }));`,
				message,
			)) as T;
		},
		async openFakeTab(path) {
			const home = await driver.getWindowHandle();
			await driver.switchTo().newWindow("tab");
			const url = `${server.url}${path}`;
			await driver.get(url);
			await driver.switchTo().window(home);
			if (!(await driver.getCurrentUrl()).startsWith(BASE)) {
				await session.open("options.html");
			}
			const id = await driver.executeAsyncScript(
				`const done = arguments[arguments.length - 1];
				browser.tabs.query({}).then((tabs) => {
					const tab = tabs.find((t) => t.url === arguments[0]);
					done(tab ? tab.id : null);
				});`,
				url,
			);
			if (typeof id !== "number") throw new Error(`no tab for ${url}`);
			return id;
		},
		async pair() {
			const reply = await session.message<{ ok: boolean }>({
				type: "pair",
				code: VALID_CODE,
			});
			if (!reply.ok)
				throw new Error(`pairing failed: ${JSON.stringify(reply)}`);
		},
		async text(css) {
			return driver.findElement(By.css(css)).getText();
		},
		async click(css) {
			await driver.findElement(By.css(css)).click();
		},
		async type(css, text) {
			const element = driver.findElement(By.css(css));
			await element.clear();
			await element.sendKeys(text);
		},
		async waitForText(css, pattern, timeoutMs = 10000) {
			const element = await driver.wait(
				until.elementLocated(By.css(css)),
				timeoutMs,
			);
			let last = "";
			await driver
				.wait(async () => {
					last = await element.getText();
					return pattern.test(last);
				}, timeoutMs)
				.catch(() => {
					throw new Error(`"${css}" text was "${last}", expected ${pattern}`);
				});
			return last;
		},
		async waitForUploads(count, timeoutMs = 15000) {
			const deadline = Date.now() + timeoutMs;
			while (server.remarkable.state.simpleUploads.length < count) {
				if (Date.now() > deadline) {
					throw new Error(
						`expected ${count} uploads, got ${server.remarkable.state.simpleUploads.length}`,
					);
				}
				await Bun.sleep(100);
			}
		},
		async restart() {
			await driver.quit();
			driver = await launch(profileDir);
		},
		async quit() {
			await driver.quit().catch(() => {});
			await server.stop();
		},
	};
	return session;
}
