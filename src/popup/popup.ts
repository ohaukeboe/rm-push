import {
	activeTabId,
	openExtensionPage,
	openOptionsPage,
	requestOrigins,
	sendMessage,
} from "../adapters/browser/runtime";
import { userMessage } from "../core/errors";
import { $, show } from "../ui/dom";
import {
	type FolderList,
	fillFolderSelect,
	selectedFolder,
} from "../ui/folders";
import {
	describeJob,
	getStatus,
	type Reply,
	SOURCE_LABELS,
	type Status,
	waitForJob,
} from "../ui/status";

let tabId: number | undefined;
let missingOrigins: string[] = [];
let foldersLoaded = false;

async function loadDestinations(status: Status): Promise<void> {
	const select = $<HTMLSelectElement>("#destination");
	const defaultFolder = status.defaultFolder;
	if (!foldersLoaded) {
		// Show the default at once; the full list needs a round trip to the cloud.
		fillFolderSelect(
			select,
			defaultFolder ? [defaultFolder] : [],
			defaultFolder?.id ?? "",
		);
		show($("#destination-row"), true);
	}
	foldersLoaded = true;
	const reply = await sendMessage<Reply<FolderList>>({ type: "list-folders" });
	if (reply.ok) fillFolderSelect(select, reply.folders, select.value);
}

function renderJobs(status: Status): void {
	const list = $("#jobs");
	list.replaceChildren(
		...status.recentJobs.slice(0, 5).map((job) => {
			const item = document.createElement("li");
			item.textContent = describeJob(job);
			return item;
		}),
	);
}

async function render(): Promise<void> {
	const status = await getStatus(tabId);
	if (!status) return;
	const connected = status.connection === "connected";
	show($("#connect-prompt"), !connected);
	show($("#send-panel"), connected);
	if (status.connection === "needs-reconnect") {
		$("#connect-text").textContent =
			"reMarkable rejected the connection. Pair again.";
	}
	if (!connected) return;

	const current = status.current;
	show($("#current"), current !== null);
	show($("#unsendable"), current === null);
	$<HTMLButtonElement>("#send").disabled = current === null;
	show($("#send-print"), current?.sourceKind === "web");
	if (current) {
		$("#current-kind").textContent = SOURCE_LABELS[current.sourceKind] ?? "";
		$("#current-title").textContent = current.title;
	}
	missingOrigins = current?.missingOrigins ?? [];
	show($("#grant"), missingOrigins.length > 0);
	if (current?.site) {
		$("#grant-text").textContent =
			`Firefox access to ${current.site} is needed.`;
	}
	renderJobs(status);
	if (!foldersLoaded) void loadDestinations(status);
}

async function send(mode: "auto" | "print"): Promise<void> {
	const result = $("#send-result");
	result.textContent = "Sending…";
	const reply = await sendMessage<Reply<{ jobId: string }>>({
		type: "send-current",
		mode,
		tabId,
		folder: selectedFolder($<HTMLSelectElement>("#destination")),
	});
	if (!reply.ok) {
		result.textContent = userMessage(reply.error);
		return;
	}
	if (mode === "print") {
		// The save dialog and upload page take over from here.
		window.close();
		return;
	}
	const job = await waitForJob(reply.jobId);
	result.textContent = job ? describeJob(job) : "Still sending…";
	await render();
}

$("#open-options").addEventListener("click", async () => {
	await openOptionsPage();
	window.close();
});
$("#send").addEventListener("click", () => void send("auto"));
$("#send-print").addEventListener("click", () => void send("print"));
$("#grant-button").addEventListener("click", () => {
	// permissions.request must run directly inside the click handler.
	void requestOrigins(missingOrigins).then(render);
});
$("#upload-link").addEventListener("click", async () => {
	await openExtensionPage("upload.html?reason=file");
	window.close();
});

void activeTabId().then((id) => {
	tabId = id;
	return render();
});
