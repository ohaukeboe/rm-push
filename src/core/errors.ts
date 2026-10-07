export const sendErrorKinds = [
	"not-connected",
	"needs-reconnect",
	"permission-denied",
	"network",
	"not-a-pdf",
	"export-forbidden",
	"not-logged-in",
	"no-readable-content",
	"too-large",
	"service-error",
	"unsendable-page",
	"bad-message",
	"invalid-code",
] as const;

export type SendErrorKind = (typeof sendErrorKinds)[number];

export type SendError =
	| { kind: "permission-denied"; site: string }
	| { kind: "network"; host: string }
	| { kind: "not-logged-in"; service: string }
	| { kind: "service-error"; status: number }
	| {
			kind: Exclude<
				SendErrorKind,
				"permission-denied" | "network" | "not-logged-in" | "service-error"
			>;
	  };

/** Upload limit of the reMarkable web app. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const LOGIN_HOSTS = [
	"accounts.google.com",
	"login.microsoftonline.com",
	"login.live.com",
];

function hostOf(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

/** Maps an HTTP outcome to a SendError, or null when the response is usable. */
export function mapHttpStatus(
	status: number,
	finalUrl: string,
): SendError | null {
	const host = hostOf(finalUrl);
	if (status === 401 || LOGIN_HOSTS.includes(host)) {
		return { kind: "not-logged-in", service: host };
	}
	if (status === 403) return { kind: "export-forbidden" };
	if (status >= 400) return { kind: "service-error", status };
	return null;
}

export function networkError(url: string): SendError {
	return { kind: "network", host: hostOf(url) };
}

export function userMessage(error: SendError): string {
	switch (error.kind) {
		case "not-connected":
			return "Connect your reMarkable account first.";
		case "needs-reconnect":
			return "reMarkable rejected the connection. Pair again.";
		case "permission-denied":
			return `Firefox access to ${error.site} is needed. Click to grant.`;
		case "network":
			return `Could not reach ${error.host}. Check your connection and retry.`;
		case "not-a-pdf":
			return "The link did not return a PDF.";
		case "export-forbidden":
			return "The document's owner has disabled downloading.";
		case "not-logged-in":
			return `You are not signed in to ${error.service} in this browser.`;
		case "no-readable-content":
			return "Could not find readable content on this page.";
		case "too-large":
			return "The document is larger than reMarkable accepts (100 MB).";
		case "service-error":
			return `reMarkable's service returned an error (${error.status}). It may have changed; try updating the extension.`;
		case "unsendable-page":
			return "This page cannot be sent.";
		case "invalid-code":
			return "That code is invalid or expired. Get a new code and try again.";
		case "bad-message":
			return "Internal error: the extension received an invalid message.";
	}
}

/** Thrown inside fetchers and adapters to abort a job with a known error. */
export class SendFailure extends Error {
	constructor(readonly error: SendError) {
		super(error.kind);
		this.name = "SendFailure";
	}
}
