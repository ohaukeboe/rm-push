import { expect, test } from "bun:test";
import { z } from "zod";
import "../../src/core/messages";

// MV3 CSP forbids eval; without jitless zod probes `new Function` and Firefox logs a CSP error.
test("zod runs without eval", () => {
	expect(z.config().jitless).toBe(true);
});
