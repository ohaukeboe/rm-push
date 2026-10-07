/** What a tab or link URL is, before it is bound to a tab or a send mode. */
export type ClassifiedUrl =
	| { kind: "unsendable" }
	/** `guessed`: the tab blocked scripts (Firefox's PDF viewer) but the URL has no .pdf. */
	| { kind: "pdf-url"; url: string; guessed?: boolean }
	| { kind: "google-doc"; docId: string; accountIndex?: number }
	| { kind: "word-sharepoint"; siteUrl: string; fileGuid: string }
	| { kind: "word-unsupported"; url: string }
	| { kind: "local-file"; url: string }
	| { kind: "web"; url: string };

/** A source bound to everything a send job needs (data-model.md "Source"). */
export type Source =
	| Exclude<ClassifiedUrl, { kind: "unsendable" } | { kind: "web" }>
	| { kind: "web-reflow"; tabId: number; url: string }
	| { kind: "web-print"; tabId: number; url: string }
	| { kind: "file"; name: string; bytes: Uint8Array; format: DocFormat };

export type DocFormat = "pdf" | "epub";

export type SourceKind = Source["kind"];
