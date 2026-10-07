import type { TabInfo } from "../ports";

export interface MenuItem {
	id: string;
	title: string;
	contexts: browser.menus.ContextType[];
}

export interface MenuClickInfo {
	menuItemId: string | number;
	linkUrl?: string;
	linkText?: string;
}

/** Call from runtime.onInstalled; menus persist across event-page restarts. */
export async function createMenus(items: MenuItem[]): Promise<void> {
	await browser.menus.removeAll();
	for (const item of items) browser.menus.create(item);
}

/** Must be called at the top level of the background script. */
export function onMenuClicked(
	listener: (info: MenuClickInfo, tab: TabInfo | null) => void,
): void {
	browser.menus.onClicked.addListener((info, tab) => {
		const tabInfo =
			tab?.id !== undefined && tab.url
				? { id: tab.id, url: tab.url, title: tab.title ?? "" }
				: null;
		listener(
			{
				menuItemId: info.menuItemId,
				linkUrl: info.linkUrl,
				linkText: info.linkText,
			},
			tabInfo,
		);
	});
}
