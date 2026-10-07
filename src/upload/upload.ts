import { closeCurrentTab, sendMessage } from "../adapters/browser/runtime";
import { MAX_UPLOAD_BYTES, userMessage } from "../core/errors";
import { $, show } from "../ui/dom";
import { describeJob, type Reply, waitForJob } from "../ui/status";

const params = new URLSearchParams(location.search);
const reason = params.get("reason") ?? "file";
const expected = params.get("expected");

const INSTRUCTIONS: Record<string, string> = {
	print: `Firefox saved the page${expected ? ` as “${expected}”` : ""}. Choose that file to send it.`,
	word: "Word for the web can't be sent directly from this account. In Word choose File → Export → Download as PDF (or File → Save as → Download a copy as PDF), then choose the downloaded file here.",
	file: expected
		? `Firefox doesn't let extensions read local files. Choose “${expected}” to send it.`
		: "Choose a PDF or EPUB file to send.",
};
$("#instructions").textContent =
	INSTRUCTIONS[reason] ?? INSTRUCTIONS.file ?? "";

function mimeFor(
	file: File,
): "application/pdf" | "application/epub+zip" | null {
	const name = file.name.toLowerCase();
	if (file.type === "application/pdf" || name.endsWith(".pdf"))
		return "application/pdf";
	if (file.type === "application/epub+zip" || name.endsWith(".epub")) {
		return "application/epub+zip";
	}
	return null;
}

async function upload(file: File): Promise<void> {
	const result = $("#result");
	const mime = mimeFor(file);
	if (!mime) {
		result.textContent = "Only PDF and EPUB files can be sent.";
		return;
	}
	if (file.size > MAX_UPLOAD_BYTES) {
		result.textContent = userMessage({ kind: "too-large" });
		return;
	}
	result.textContent = `Sending “${file.name}”…`;
	const reply = await sendMessage<Reply<{ jobId: string }>>({
		type: "send-file",
		name: file.name,
		bytes: await file.arrayBuffer(),
		mime,
	});
	if (!reply.ok) {
		result.textContent = userMessage(reply.error);
		return;
	}
	const job = await waitForJob(reply.jobId);
	result.textContent = job ? describeJob(job) : "Still sending…";
	show($("#close"), job?.status === "succeeded");
}

const input = $<HTMLInputElement>("#file");
input.addEventListener("change", () => {
	const file = input.files?.[0];
	if (file) void upload(file);
});

const drop = $("#drop");
drop.addEventListener("dragover", (event) => {
	event.preventDefault();
	drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (event) => {
	event.preventDefault();
	drop.classList.remove("over");
	const file = event.dataTransfer?.files[0];
	if (file) void upload(file);
});

$("#close").addEventListener("click", () => void closeCurrentTab());
