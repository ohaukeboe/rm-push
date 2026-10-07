/**
 * Runs `web-ext lint` on dist/ and fails on any error or warning, except
 * warnings that come from audited third-party code listed below. Bun marks
 * each bundled module with a `// node_modules/<path>` banner, which tells us
 * where a flagged line came from.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const DIST = process.argv[2] ?? "dist";

/** code -> bundled package path prefixes whose warnings are accepted, and why. */
const ACCEPTED: Record<string, { packages: string[]; reason: string }> = {
	UNSAFE_VAR_ASSIGNMENT: {
		packages: ["node_modules/@mozilla/readability/", "node_modules/preact/"],
		reason:
			"Readability rewrites innerHTML of a detached clone of the page; preact's DOM renderer is bundled but unused (teapub renders to strings)",
	},
};

interface Message {
	code: string;
	file?: string;
	line?: number;
	message: string;
}

const proc = Bun.spawn(["web-ext", "lint", "-s", DIST, "-o", "json"], {
	stdout: "pipe",
	stderr: "inherit",
});
const report = JSON.parse(await new Response(proc.stdout).text()) as {
	errors: Message[];
	warnings: Message[];
	notices: Message[];
};
await proc.exited;

async function moduleOf(file: string, line: number): Promise<string> {
	const lines = (await readFile(join(DIST, file), "utf8")).split("\n");
	for (let i = line - 1; i >= 0; i--) {
		const match = /^\s*\/\/ (node_modules\/\S+)/.exec(lines[i] ?? "");
		if (match?.[1]) return match[1];
		if (/^\s*\/\/ src\//.test(lines[i] ?? ""))
			return lines[i]?.trim().slice(3) ?? "";
	}
	return "";
}

const failures: string[] = [];
for (const message of report.errors) {
	failures.push(
		`error ${message.code} ${message.file}:${message.line} ${message.message}`,
	);
}
for (const message of report.warnings) {
	const accepted = ACCEPTED[message.code];
	const origin =
		message.file && message.line
			? await moduleOf(message.file, message.line)
			: "";
	if (accepted?.packages.some((prefix) => origin.startsWith(prefix))) {
		console.log(`accepted ${message.code} from ${origin}: ${accepted.reason}`);
		continue;
	}
	failures.push(
		`warning ${message.code} ${message.file}:${message.line} (${origin || "unknown"}) ${message.message}`,
	);
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log(`web-ext lint: 0 errors, 0 unaccepted warnings (${DIST})`);
