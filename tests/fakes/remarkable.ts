/**
 * In-memory fake of the reMarkable cloud endpoints rmapi-js uses:
 * device registration, session tokens, the simple upload API and the
 * content-addressed sync store. Paths come from rmapi-js 14.4 dist/index.js
 * and dist/raw.js.
 */

export const VALID_CODE = "abcdefgh";

export interface SimpleUpload {
	name: string;
	mime: string;
	bytes: Uint8Array;
}

export interface RemarkableFakeState {
	devices: Map<string, { deviceId: string; deviceDesc: string }>;
	sessions: Set<string>;
	revokedDevices: Set<string>;
	simpleUploads: SimpleUpload[];
	blobs: Map<string, Uint8Array<ArrayBuffer>>;
	root: { hash: string; generation: number };
	/** Status forced for every authed request whose path starts with the key. */
	failures: Map<string, number>;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return new Uint8Array(digest).toHex();
}

function base64url(text: string): string {
	return new TextEncoder()
		.encode(text)
		.toBase64({ alphabet: "base64url", omitPadding: true });
}

export class RemarkableFake {
	state!: RemarkableFakeState;
	private ready: Promise<void>;

	constructor() {
		this.ready = this.reset();
	}

	async reset(): Promise<void> {
		const emptyRoot = new TextEncoder().encode("4\n0:.:0:0\n");
		const hash = await sha256Hex(emptyRoot);
		this.state = {
			devices: new Map(),
			sessions: new Set(),
			revokedDevices: new Set(),
			simpleUploads: [],
			blobs: new Map([[hash, emptyRoot]]),
			root: { hash, generation: 1 },
			failures: new Map(),
		};
	}

	/** Forces `status` for authed requests under `pathPrefix` until cleared. */
	fail(pathPrefix: string, status: number): void {
		this.state.failures.set(pathPrefix, status);
	}

	revoke(deviceToken: string): void {
		this.state.revokedDevices.add(deviceToken);
	}

	/** Returns a Response for reMarkable paths, or null for anything else. */
	async handle(req: Request): Promise<Response | null> {
		await this.ready;
		const url = new URL(req.url);
		const path = url.pathname;

		if (req.method === "POST" && path === "/token/json/2/device/new") {
			const body = (await req.json()) as {
				code: string;
				deviceDesc: string;
				deviceID: string;
			};
			if (body.code !== VALID_CODE) {
				return new Response("invalid code", { status: 400 });
			}
			const token = `device-${body.deviceID}`;
			this.state.devices.set(token, {
				deviceId: body.deviceID,
				deviceDesc: body.deviceDesc,
			});
			return new Response(token);
		}

		const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "");

		if (req.method === "POST" && path === "/token/json/2/user/new") {
			const device = bearer ? this.state.devices.get(bearer) : undefined;
			if (!bearer || !device || this.state.revokedDevices.has(bearer)) {
				return new Response("unauthorized", { status: 401 });
			}
			const payload = base64url(
				JSON.stringify({
					"device-id": device.deviceId,
					nonce: crypto.randomUUID(),
				}),
			);
			const session = `${base64url('{"alg":"none"}')}.${payload}.sig`;
			this.state.sessions.add(session);
			return new Response(session);
		}

		const isRemarkablePath =
			path === "/doc/v2/files" || path.startsWith("/sync/");
		if (!isRemarkablePath) return null;

		if (!bearer || !this.state.sessions.has(bearer)) {
			return new Response("unauthorized", { status: 401 });
		}
		for (const [prefix, status] of this.state.failures) {
			if (path.startsWith(prefix)) {
				return new Response(`forced ${status}`, { status });
			}
		}

		if (req.method === "POST" && path === "/doc/v2/files") {
			const meta = JSON.parse(
				new TextDecoder().decode(
					Uint8Array.fromBase64(req.headers.get("rm-meta") ?? ""),
				),
			) as { file_name: string };
			const bytes = new Uint8Array(await req.arrayBuffer());
			this.state.simpleUploads.push({
				name: meta.file_name,
				mime: req.headers.get("content-type") ?? "",
				bytes,
			});
			return Response.json({
				docID: crypto.randomUUID(),
				hash: await sha256Hex(bytes),
			});
		}

		if (req.method === "GET" && path === "/sync/v4/root") {
			return Response.json({ ...this.state.root, schemaVersion: 4 });
		}

		if (req.method === "PUT" && path === "/sync/v3/root") {
			const body = (await req.json()) as { hash: string; generation: number };
			if (body.generation !== this.state.root.generation) {
				return new Response('{"message":"precondition failed"}\n', {
					status: 412,
				});
			}
			this.state.root = {
				hash: body.hash,
				generation: this.state.root.generation + 1,
			};
			return Response.json(this.state.root);
		}

		const file = /^\/sync\/v3\/files\/([0-9a-f]{64})$/.exec(path);
		if (file?.[1]) {
			const hash = file[1];
			if (req.method === "PUT") {
				this.state.blobs.set(hash, new Uint8Array(await req.arrayBuffer()));
				return new Response(null, { status: 200 });
			}
			const blob = this.state.blobs.get(hash);
			return blob
				? new Response(blob)
				: new Response("not found", { status: 404 });
		}

		return new Response("not found", { status: 404 });
	}
}
