import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom's fetch stack cannot talk to Bun.serve reliably; keep Bun's own.
const native = {
	fetch: globalThis.fetch,
	Request: globalThis.Request,
	Response: globalThis.Response,
	Headers: globalThis.Headers,
	AbortController: globalThis.AbortController,
	AbortSignal: globalThis.AbortSignal,
};

GlobalRegistrator.register();
Object.assign(globalThis, native);
