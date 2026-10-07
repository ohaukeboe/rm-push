import "../core/zod-setup";
import { cryptoIds, systemClock } from "../adapters/browser/clock";
import { browserHttp } from "../adapters/browser/http";
import { canvasImageCodec } from "../adapters/browser/image";
import { createMenus, onMenuClicked } from "../adapters/browser/menus";
import {
	browserNotifier,
	registerNotificationClicks,
} from "../adapters/browser/notifier";
import { browserPermissions } from "../adapters/browser/permissions";
import { browserScripting } from "../adapters/browser/scripting";
import { browserStorage } from "../adapters/browser/storage";
import { browserTabs } from "../adapters/browser/tabs";
import { createRemarkable } from "../adapters/remarkable";
import { loadConfig } from "../core/config";
import { createRouter, MENU_IDS, type MenuClick } from "./router";

const config = loadConfig();

const router = createRouter({
	storage: browserStorage,
	tabs: browserTabs,
	config,
	remarkable: createRemarkable({
		hosts: config.remarkable,
		storage: browserStorage,
	}),
	clock: systemClock,
	ids: cryptoIds,
	notifier: browserNotifier,
	permissions: browserPermissions,
	http: browserHttp,
	scripting: browserScripting,
	imageCodec: canvasImageCodec,
});

// Listeners must be registered synchronously at the top level of an event page.
browser.runtime.onMessage.addListener((message, sender) => {
	if (sender.id !== browser.runtime.id) return undefined;
	if (config.e2eHooks && isE2eMenuClick(message)) {
		return browserTabs
			.get(message.tabId)
			.then((tab) => router.menuClicked(message.click, tab))
			.then(() => ({ ok: true }));
	}
	return router.handle(message);
});

onMenuClicked((info, tab) => {
	void router.menuClicked(info, tab);
});

browser.runtime.onInstalled.addListener(() => {
	void createMenus([
		{
			id: MENU_IDS.sendLink,
			title: "Send linked PDF to reMarkable",
			contexts: ["link"],
		},
		{
			id: MENU_IDS.sendPage,
			title: "Send page to reMarkable",
			contexts: ["page"],
		},
		{
			id: MENU_IDS.sendPagePrint,
			title: "Send page to reMarkable as printed PDF",
			contexts: ["page"],
		},
		{ id: MENU_IDS.uploadFile, title: "Upload a file…", contexts: ["action"] },
	]);
});

registerNotificationClicks();

function isE2eMenuClick(
	message: unknown,
): message is { type: "e2e-menu-click"; click: MenuClick; tabId: number } {
	return (
		typeof message === "object" &&
		message !== null &&
		(message as { type?: unknown }).type === "e2e-menu-click"
	);
}
