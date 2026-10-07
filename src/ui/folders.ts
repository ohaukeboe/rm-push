import type { DestinationFolder } from "../adapters/ports";
import type { Folder } from "../core/messages";

export interface FolderList {
	folders: DestinationFolder[];
}

/** Fills a <select> with "Top level" first, then the folders. */
export function fillFolderSelect(
	select: HTMLSelectElement,
	folders: Folder[],
	selectedId: string,
): void {
	const top = new Option("Top level", "");
	const options = folders.map((folder) => new Option(folder.name, folder.id));
	select.replaceChildren(top, ...options);
	select.value = folders.some((f) => f.id === selectedId) ? selectedId : "";
}

export function selectedFolder(select: HTMLSelectElement): Folder | null {
	const option = select.selectedOptions[0];
	return option && option.value !== ""
		? { id: option.value, name: option.textContent ?? "" }
		: null;
}
