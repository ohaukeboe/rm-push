/**
 * Writes raw entries into the fake cloud through rmapi-js's low-level API, so
 * tests can reproduce library contents that the high-level API refuses
 * (e.g. documents created by other apps or older firmware).
 */
import type { RemarkableApi } from "rmapi-js";

const encode = (value: unknown) =>
	new TextEncoder().encode(JSON.stringify(value));

export async function seedRawDocument(
	api: RemarkableApi,
	doc: { id: string; metadata: unknown; content: unknown },
): Promise<void> {
	const raw = api.raw;
	const meta = await raw.putFile(`${doc.id}.metadata`, encode(doc.metadata));
	const content = await raw.putFile(`${doc.id}.content`, encode(doc.content));
	const entry = await raw.putEntries(doc.id, [meta, content], 4);
	const [rootHash, generation] = await raw.getRootHash();
	const { entries } = await raw.getEntries({ id: "root", hash: rootHash });
	const root = await raw.putEntries("root", [...entries, entry], 4);
	for (const pending of [meta, content, entry, root]) {
		await pending[Symbol.asyncDispose]();
	}
	await raw.putRootHash(root.hash, generation);
}

/**
 * Content of a real document that rmapi-js 14.4's strict schema rejects:
 * no `documentMetadata`, and `orientation`/`textAlignment` values outside its
 * enums (observed on a user's library, 2026-10-07; values anonymised).
 */
export const UNPARSEABLE_DOCUMENT_CONTENT = {
	coverPageNumber: 0,
	dummyDocument: false,
	extraMetadata: {},
	fileType: "pdf",
	fontName: "",
	lastOpenedPage: 0,
	lineHeight: -1,
	margins: 100,
	orientation: "",
	pageCount: 1,
	pageTags: [],
	pages: [],
	redirectionPageMap: [],
	textAlignment: "center",
	textScale: 1,
};
