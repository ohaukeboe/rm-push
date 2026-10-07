import type { Storage, StorageArea } from "../ports";

export const browserStorage: Storage = {
	async get<T>(area: StorageArea, key: string): Promise<T | undefined> {
		const items = await browser.storage[area].get(key);
		return items[key] as T | undefined;
	},
	async set(area: StorageArea, key: string, value: unknown): Promise<void> {
		await browser.storage[area].set({ [key]: value });
	},
	async remove(area: StorageArea, keys: string[]): Promise<void> {
		await browser.storage[area].remove(keys);
	},
};
