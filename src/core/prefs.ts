import type { Storage } from "../adapters/ports";
import type { Folder } from "./messages";

export interface Prefs {
	defaultFolder: Folder | null;
}

export const PREFS_KEY = "prefs";

export async function setDefaultFolder(
	storage: Storage,
	folder: Folder | null,
): Promise<void> {
	const prefs = await loadPrefs(storage);
	await storage.set("local", PREFS_KEY, { ...prefs, defaultFolder: folder });
}

export async function loadPrefs(storage: Storage): Promise<Prefs> {
	const stored = await storage.get<Partial<Prefs>>("local", PREFS_KEY);
	return { defaultFolder: stored?.defaultFolder ?? null };
}
