import type { SaveStatus } from "../adapters/ports";
import { sanitizeTitle } from "./title";

export type PrintStep =
	| { kind: "open-upload"; query: { reason: "print"; expected: string } }
	| { kind: "canceled" };

export function printFileName(title: string): string {
	return `${sanitizeTitle(title)}.pdf`;
}

/** What to do after Firefox's save-as-PDF dialog closes (research R6). */
export function nextStepAfterSave(
	status: SaveStatus,
	title: string,
): PrintStep {
	if (status === "saved" || status === "replaced") {
		return {
			kind: "open-upload",
			query: { reason: "print", expected: printFileName(title) },
		};
	}
	return { kind: "canceled" };
}
