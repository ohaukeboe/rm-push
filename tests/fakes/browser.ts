import type {
	Clock,
	Ids,
	Notice,
	Notifier,
	Permissions,
	SaveStatus,
	Storage,
	StorageArea,
	TabInfo,
	Tabs,
} from "../../src/adapters/ports";

export class FakeStorage implements Storage {
	readonly areas: Record<StorageArea, Map<string, unknown>> = {
		local: new Map(),
		session: new Map(),
	};

	async get<T>(area: StorageArea, key: string): Promise<T | undefined> {
		const value = this.areas[area].get(key);
		return value === undefined ? undefined : structuredClone(value as T);
	}

	async set(area: StorageArea, key: string, value: unknown): Promise<void> {
		this.areas[area].set(key, structuredClone(value));
	}

	async remove(area: StorageArea, keys: string[]): Promise<void> {
		for (const key of keys) this.areas[area].delete(key);
	}
}

export class FakeNotifier implements Notifier {
	readonly notices: Notice[] = [];

	async notify(notice: Notice): Promise<void> {
		this.notices.push(notice);
	}
}

export class FakeTabs implements Tabs {
	active: TabInfo | null = null;
	saveStatus: SaveStatus = "saved";
	readonly savedAs: string[] = [];
	readonly opened: { path: string; query?: Record<string, string> }[] = [];
	optionsOpened = 0;

	async activeTab(): Promise<TabInfo | null> {
		return this.active;
	}

	async get(tabId: number): Promise<TabInfo | null> {
		return this.active?.id === tabId ? this.active : null;
	}

	async saveAsPdf(fileName: string): Promise<SaveStatus> {
		this.savedAs.push(fileName);
		return this.saveStatus;
	}

	async openExtensionPage(
		path: string,
		query?: Record<string, string>,
	): Promise<void> {
		this.opened.push({ path, query });
	}

	async openOptions(): Promise<void> {
		this.optionsOpened++;
	}
}

export class FakePermissions implements Permissions {
	readonly granted = new Set<string>();

	async contains(origins: string[]): Promise<boolean> {
		if (this.granted.has("<all_urls>")) return true;
		return origins.every((o) => this.granted.has(o));
	}
}

export class FixedClock implements Clock {
	constructor(public current = new Date("2026-10-07T12:00:00Z")) {}

	now(): Date {
		return new Date(this.current);
	}
}

export class SequentialIds implements Ids {
	private next = 1;

	uuid(): string {
		const n = (this.next++).toString(16).padStart(12, "0");
		return `00000000-0000-4000-8000-${n}`;
	}
}
