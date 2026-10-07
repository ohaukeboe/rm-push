const MAX_LENGTH = 120;
const SUFFIXES = [
	/\s+-\s+Google Docs$/i,
	/\s+-\s+Word$/i,
	/\.pdf$/i,
	/\.docx?$/i,
];

/** Document name shown on the tablet (FR-010). */
export function sanitizeTitle(raw: string): string {
	let title = raw
		.replace(/\s+/g, " ")
		// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
		.replace(/[\u0000-\u001f\u007f]/g, "")
		.replace(/[/\\:*?"<>|]/g, "")
		.replace(/ {2,}/g, " ")
		.trim();
	for (const suffix of SUFFIXES) title = title.replace(suffix, "").trim();
	title = title.slice(0, MAX_LENGTH).trim();
	return title === "" ? "Untitled" : title;
}
