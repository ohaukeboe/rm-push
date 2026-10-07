import type { Notice, Notifier } from "../ports";

const CLICK_PAGES_KEY = "notificationPages";

type ClickPages = Record<string, string>;

export const browserNotifier: Notifier = {
	async notify(notice: Notice): Promise<void> {
		if (notice.onClickPage) {
			const { [CLICK_PAGES_KEY]: pages = {} } =
				await browser.storage.session.get(CLICK_PAGES_KEY);
			await browser.storage.session.set({
				[CLICK_PAGES_KEY]: {
					...(pages as ClickPages),
					[notice.id]: notice.onClickPage,
				},
			});
		}
		await browser.notifications.create(notice.id, {
			type: "basic",
			title: notice.title,
			message: notice.message,
			iconUrl: browser.runtime.getURL("icon.svg"),
		});
	},
};

/** Must be called at the top level of the background script. */
export function registerNotificationClicks(): void {
	browser.notifications.onClicked.addListener(async (id) => {
		const { [CLICK_PAGES_KEY]: pages = {} } =
			await browser.storage.session.get(CLICK_PAGES_KEY);
		const page = (pages as ClickPages)[id];
		if (page === "options.html") await browser.runtime.openOptionsPage();
		else if (page)
			await browser.tabs.create({ url: browser.runtime.getURL(page) });
		await browser.notifications.clear(id);
	});
}
