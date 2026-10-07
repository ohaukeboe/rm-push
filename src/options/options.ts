import {
	hasOrigins,
	removeOrigins,
	requestOrigins,
	sendMessage,
} from "../adapters/browser/runtime";
import { loadConfig } from "../core/config";
import { type SendError, userMessage } from "../core/errors";
import { $, show } from "../ui/dom";
import {
	type FolderList,
	fillFolderSelect,
	selectedFolder,
} from "../ui/folders";

type Reply<T = object> = ({ ok: true } & T) | { ok: false; error: SendError };

interface Status {
	connection: "disconnected" | "connected" | "needs-reconnect";
	connectedAt?: string | null;
	defaultFolder: { id: string; name: string } | null;
}

async function refresh(): Promise<void> {
	const status = await sendMessage<Reply<Status>>({ type: "status" });
	if (!status.ok) return;
	const connected = status.connection === "connected";
	show($("#pairing"), !connected);
	show($("#connected"), connected);
	show($("#folders"), connected);
	show($("#revoked-note"), status.connection === "needs-reconnect");
	if (connected) {
		const since = status.connectedAt
			? new Date(status.connectedAt).toLocaleDateString()
			: "";
		$("#connected-since").textContent = `Connected since ${since}`.trim();
		await loadFolders(status.defaultFolder?.id ?? "");
	}
}

async function loadFolders(selectedId: string): Promise<void> {
	$("#folder-error").textContent = "";
	const reply = await sendMessage<Reply<FolderList>>({ type: "list-folders" });
	const select = $<HTMLSelectElement>("#default-folder");
	if (!reply.ok) {
		$("#folder-error").textContent =
			`Could not load folders: ${userMessage(reply.error)} Sending to the top level still works.`;
		return;
	}
	fillFolderSelect(select, reply.folders, selectedId);
}

$("#default-folder").addEventListener("change", async () => {
	const folder = selectedFolder($<HTMLSelectElement>("#default-folder"));
	await sendMessage({ type: "set-default-folder", folder });
	$("#folder-saved").textContent = "Saved.";
});

$("#refresh-folders").addEventListener("click", () => {
	void loadFolders($<HTMLSelectElement>("#default-folder").value);
});

$("#pair-form").addEventListener("submit", async (event) => {
	event.preventDefault();
	const button = $<HTMLButtonElement>("#connect");
	button.disabled = true;
	$("#pair-error").textContent = "";
	try {
		const reply = await sendMessage<Reply>({
			type: "pair",
			code: $<HTMLInputElement>("#code").value,
		});
		if (!reply.ok) $("#pair-error").textContent = userMessage(reply.error);
		else $<HTMLInputElement>("#code").value = "";
	} finally {
		button.disabled = false;
	}
	await refresh();
});

$("#disconnect").addEventListener("click", async () => {
	await sendMessage({ type: "disconnect" });
	await refresh();
});

const config = loadConfig();
const ACCESS_GROUPS = [
	{
		name: "Google Docs",
		why: "export Google Docs documents as PDF",
		origins: config.origins.google,
	},
	{
		name: "Microsoft SharePoint",
		why: "export Word documents from work or school accounts as PDF",
		origins: config.origins.microsoft,
	},
	{
		name: "All websites",
		why: "send linked PDFs from other sites and include images in web pages",
		origins: config.origins.allSites,
	},
];

async function renderAccess(): Promise<void> {
	const rows = await Promise.all(
		ACCESS_GROUPS.map(async (group) => {
			const granted = await hasOrigins(group.origins);
			const row = document.createElement("div");
			row.className = "row";
			const label = document.createElement("span");
			label.textContent = `${group.name}: ${granted ? "allowed" : "not allowed"} (to ${group.why})`;
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = granted ? "Revoke" : "Grant";
			button.addEventListener("click", () => {
				// permissions.request must run directly inside the click handler.
				const change = granted
					? removeOrigins(group.origins)
					: requestOrigins(group.origins);
				void change.then(renderAccess);
			});
			row.append(label, button);
			return row;
		}),
	);
	$("#access-rows").replaceChildren(...rows);
}

void refresh();
void renderAccess();
