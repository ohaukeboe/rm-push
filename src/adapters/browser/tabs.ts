import type { SaveStatus, TabInfo, Tabs } from "../ports";

export const browserTabs: Tabs = {
	async activeTab(): Promise<TabInfo | null> {
		const [tab] = await browser.tabs.query({
			active: true,
			currentWindow: true,
		});
		if (!tab || tab.id === undefined || !tab.url) return null;
		return { id: tab.id, url: tab.url, title: tab.title ?? "" };
	},
	async get(tabId: number): Promise<TabInfo | null> {
		try {
			const tab = await browser.tabs.get(tabId);
			return tab.url
				? { id: tabId, url: tab.url, title: tab.title ?? "" }
				: null;
		} catch {
			return null;
		}
	},
	async saveAsPdf(fileName: string): Promise<SaveStatus> {
		return (await browser.tabs.saveAsPDF({
			toFileName: fileName,
		})) as SaveStatus;
	},
	async openExtensionPage(
		path: string,
		query?: Record<string, string>,
	): Promise<void> {
		const search = query ? `?${new URLSearchParams(query)}` : "";
		await browser.tabs.create({
			url: browser.runtime.getURL(`${path}${search}`),
		});
	},
	async openOptions(): Promise<void> {
		await browser.runtime.openOptionsPage();
	},
};
