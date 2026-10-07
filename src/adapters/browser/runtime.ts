/** browser.* calls made from extension UI pages (popup, options, upload). */
import type { Request } from "../../core/messages";

export function sendMessage<T>(request: Request): Promise<T> {
	return browser.runtime.sendMessage(request) as Promise<T>;
}

export function openOptionsPage(): Promise<void> {
	return browser.runtime.openOptionsPage();
}

export async function activeTabId(): Promise<number | undefined> {
	const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
	return tab?.id;
}

/** Must be called synchronously from a click handler (user gesture). */
export function requestOrigins(origins: string[]): Promise<boolean> {
	return browser.permissions.request({ origins });
}

export function hasOrigins(origins: string[]): Promise<boolean> {
	return browser.permissions.contains({ origins });
}

export function removeOrigins(origins: string[]): Promise<boolean> {
	return browser.permissions.remove({ origins });
}

export function openExtensionPage(path: string): Promise<unknown> {
	return browser.tabs.create({ url: browser.runtime.getURL(path) });
}

export async function closeCurrentTab(): Promise<void> {
	const tab = await browser.tabs.getCurrent();
	if (tab?.id !== undefined) await browser.tabs.remove(tab.id);
}
