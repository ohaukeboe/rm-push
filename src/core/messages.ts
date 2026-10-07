import "./zod-setup";
import { z } from "zod";
import { MAX_UPLOAD_BYTES, type SendError } from "./errors";

const folder = z.object({ id: z.string().min(1), name: z.string() });
const isArrayBuffer = (value: unknown): value is ArrayBuffer =>
	Object.prototype.toString.call(value) === "[object ArrayBuffer]";

const requestSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("status"), tabId: z.number().int().optional() }),
	z.object({ type: z.literal("pair"), code: z.string() }),
	z.object({ type: z.literal("disconnect") }),
	z.object({ type: z.literal("list-folders") }),
	z.object({
		type: z.literal("set-default-folder"),
		folder: folder.nullable(),
	}),
	z.object({
		type: z.literal("send-current"),
		mode: z.enum(["auto", "print"]),
		tabId: z.number().int().optional(),
		folder: folder.nullable().optional(),
	}),
	z.object({
		type: z.literal("send-file"),
		name: z.string(),
		bytes: z.custom<ArrayBuffer>(isArrayBuffer),
		mime: z.enum(["application/pdf", "application/epub+zip"]),
		folder: folder.nullable().optional(),
	}),
]);

export type Folder = z.infer<typeof folder>;
export type Request = z.infer<typeof requestSchema>;
export type Response<T = Record<string, never>> =
	| ({ ok: true } & T)
	| { ok: false; error: SendError };

export function parseRequest(
	raw: unknown,
): { ok: true; request: Request } | { ok: false; error: SendError } {
	const parsed = requestSchema.safeParse(raw);
	if (!parsed.success) return { ok: false, error: { kind: "bad-message" } };
	const request = parsed.data;
	if (
		request.type === "send-file" &&
		request.bytes.byteLength > MAX_UPLOAD_BYTES
	) {
		return { ok: false, error: { kind: "too-large" } };
	}
	return { ok: true, request };
}

const MAX_HTML_LENGTH = 20 * 1024 * 1024;
const MAX_IMAGES = 500;
const imageUrl = z
	.string()
	.refine((url) => /^(https?:|data:)/i.test(url), "http(s) or data URL");

const extractSchema = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		title: z.string(),
		byline: z.string().nullable(),
		lang: z.string().nullable(),
		html: z.string().max(MAX_HTML_LENGTH),
		baseUrl: z.string(),
		imageUrls: z.array(imageUrl).max(MAX_IMAGES),
	}),
	z.object({ ok: z.literal(false), reason: z.literal("no-readable-content") }),
]);

export type ExtractResult = z.infer<typeof extractSchema>;

/** Validates the content script's result; anything malformed counts as no content. */
export function parseExtractResult(raw: unknown): ExtractResult {
	const parsed = extractSchema.safeParse(raw);
	return parsed.success
		? parsed.data
		: { ok: false, reason: "no-readable-content" };
}
