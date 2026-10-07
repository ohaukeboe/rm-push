import type { Scripting } from "../ports";

export const browserScripting: Scripting = {
	async runExtract(tabId: number): Promise<unknown> {
		await browser.scripting.executeScript({
			target: { tabId },
			files: ["extract.js"],
		});
		const [result] = await browser.scripting.executeScript({
			target: { tabId },
			func: () =>
				(globalThis as { __rmPushExtract?: () => unknown }).__rmPushExtract?.(),
		});
		return result?.result;
	},
	async contentType(tabId: number): Promise<string | null> {
		try {
			const [result] = await browser.scripting.executeScript({
				target: { tabId },
				func: () => document.contentType,
			});
			return typeof result?.result === "string" ? result.result : null;
		} catch {
			return null;
		}
	},
};
