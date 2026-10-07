import type { ImageCodec } from "../ports";

/** SVGs without intrinsic size are drawn at this size. */
const FALLBACK_SIZE = { width: 800, height: 600 };
const OPAQUE_TYPES = new Set(["image/jpeg", "image/jpg"]);

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("image could not be decoded"));
		image.src = url;
	});
}

/**
 * Re-encodes any image Firefox can display (WebP, AVIF, GIF, SVG…) as PNG or
 * JPEG, scaled to fit, because the reMarkable reader only handles those.
 * Runs in the background page, which is a document in Firefox MV3.
 */
export const canvasImageCodec: ImageCodec = {
	async toRaster(bytes, mime, maxWidth, maxHeight) {
		const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
		const url = URL.createObjectURL(blob);
		try {
			const image = await loadImage(url);
			const width = image.naturalWidth || FALLBACK_SIZE.width;
			const height = image.naturalHeight || FALLBACK_SIZE.height;
			const scale = Math.min(1, maxWidth / width, maxHeight / height);
			const canvas = new OffscreenCanvas(
				Math.max(1, Math.round(width * scale)),
				Math.max(1, Math.round(height * scale)),
			);
			const context = canvas.getContext("2d");
			if (!context) throw new Error("no 2d context");
			const opaque = OPAQUE_TYPES.has(mime);
			if (opaque) {
				context.fillStyle = "#fff";
				context.fillRect(0, 0, canvas.width, canvas.height);
			}
			context.drawImage(image, 0, 0, canvas.width, canvas.height);
			const type = opaque ? "image/jpeg" : "image/png";
			const out = await canvas.convertToBlob({ type, quality: 0.85 });
			return { bytes: new Uint8Array(await out.arrayBuffer()), mime: type };
		} finally {
			URL.revokeObjectURL(url);
		}
	},
};
