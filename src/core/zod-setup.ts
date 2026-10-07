import { z } from "zod";

// MV3 extension pages forbid eval. Without `jitless`, zod (also used by rmapi-js)
// probes `new Function("")` on first parse, which Firefox reports as a CSP violation.
z.config({ jitless: true });
