# Phase 0 Research: Send to reMarkable from Firefox

**Date**: 2026-10-07 | **Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

"Verified" = confirmed against a primary source (docs, source code, bug tracker) during research.
"Inferred" = reasoned from verified facts but not tested. Inferred items are listed as risks in
the plan and must be proven by an early spike or E2E test.

---

## R1. reMarkable cloud client

- **Decision**: Bundle `rmapi-js` (^14.4.0, MIT) in the extension. No native-messaging host.
- **Rationale**:
  - Actively maintained; already ships inside a production browser extension (rePub, Chrome).
  - Verified by reading the 14.4.0 package: it uses only `fetch`, `crypto.subtle`, JSZip and zod.
    No Node built-ins on the paths we need. Only `listen()` (WebSocket) is server-side; not used.
  - All three hosts are overridable (`register(code, {authHost})`, `remarkable(token, {authHost,
    rawHost, uploadHost})`), so tests can point it at a local fake server.
  - Hosts used: `webapp-prod.cloud.remarkable.engineering` (auth),
    `eu.tectonic.remarkable.com` (sync), `internal.cloud.remarkable.com` (simple upload).
- **Upload API choice** (verified from source docs):
  - `uploadPdf` / `uploadEpub` use the "simple" API that reMarkable's own extension uses and that
    "works even if the backend schema version is version 4". They always land in the root folder.
  - `putPdf` / `putEpub` take `parent` (folder) and reading options but go through the full sync
    protocol, which is the part that breaks when reMarkable changes schemas.
  - **Decision**: root destination uses `upload*`; a chosen folder uses `put*` with `parent`. If a
    `put*` call fails for a reason other than auth/network, retry once with `upload*` to root and
    tell the user (matches spec edge case "folder deleted → falls back to top level").
- **Pairing**: `register(code)` with the 8-letter code from
  `https://my.remarkable.com/device/browser/connect`; returns a device token that never expires.
  `deviceDesc` must be one of a fixed set; the only browser value is `"browser-chrome"`. Use it.
- **Folder listing**: `listItems()` then filter collections (type `CollectionType`). Uses sync
  protocol; failures there must not block sending to root.
- **Alternatives considered**: `ddvk/rmapi` via native messaging (rejected by user: install
  friction, no Android); own API client (rejected: maintenance burden).

## R2. Firefox MV3 platform

- **Background**: Firefox MV3 has no service worker; uses an event page via
  `background.scripts` (verified, bug 1573659). It is a document, so `DOMParser`, canvas,
  `OffscreenCanvas`, `crypto.subtle` are available (inferred from "background is a document").
  `"type": "module"` supported. Listeners must be registered at top level; menus created in
  `runtime.onInstalled`; state kept in storage, not globals.
- **Host permissions**: Since Firefox 127, `host_permissions` are shown and granted at install
  (verified). Users can revoke them any time, so code checks `permissions.contains` and calls
  `permissions.request` from a user gesture (popup/options click) when missing.
- **CORS / cookies**: A background `fetch` to a host the extension has permission for bypasses
  CORS (verified). Firefox treats it as first-party for cookie purposes (verified, bug 1655190),
  so `credentials: "include"` sends the user's normal cookies (inferred consequence).
  Background requests always use the **default container**; there is no per-container fetch
  (verified, bug 1670278 open). → Documented limitation: Firefox Multi-Account Containers are
  not supported in v1.
- **MV3 content scripts** cannot make cross-origin requests on extension permissions (verified).
  All network fetches therefore happen in the background.
- **`activeTab`**: grants temporary host permission for the active tab's origin when the user
  invokes the toolbar action or a context-menu item. Enough to re-fetch a PDF open in the
  current tab; not enough for a linked PDF on another origin or for third-party images.
- **Alternatives considered**: Chrome-style offscreen document (not needed in Firefox).

## R3. PDF sources

- **PDF in current tab** (Firefox's pdf.js viewer): content scripts cannot be injected into the
  viewer (verified). `tab.url` is the original PDF URL (inferred), so the background re-fetches
  it. `http(s)` and `data:` work; `file://` and `blob:` cannot be fetched → fall back to the
  "Upload a file" page (R6).
- **Linked PDF** (context menu on a link): `menus` with `contexts: ["link"]` (verified). Fetch
  in background; requires host permission for the link's origin → optional `<all_urls>` (R8).
- **Detection**: treat a response as PDF if `Content-Type` is `application/pdf` or the bytes
  start with `%PDF-`. Reject anything else with a clear error rather than uploading it.
- **PDF tabs without `.pdf` in the URL** (bug rm-push-rdo, e.g. arXiv): verified in Firefox 157
  that `scripting.executeScript` into the PDF viewer throws "Missing host permission for the tab"
  even with host access, and the tab URL stays the original. So a tab whose URL looks like a web
  page but refuses injection is treated as a PDF candidate and confirmed by fetching it.

## R4. Google Docs

- **Decision**: Background `fetch` of
  `https://docs.google.com/document/d/<ID>/export?format=pdf` with `credentials: "include"`.
  Keep the `/u/<N>/` path segment from the tab URL (or add `authuser=<N>`) for multi-account.
- **Facts**: export URL is the one Docs' own download uses (sourced); cookie-only fetch works
  (inferred). Downloads may redirect to `*.googleusercontent.com` (historically sourced; 2026
  unverified) → request both hosts. A doc with "disable download/print/copy for viewers" is
  expected to answer 403 (inferred) → report "owner has disabled download", never work around.
  Docs with tabs: plain export includes all tabs, each with a cover page (sourced). v1 sends the
  whole document, matching spec "full document".
- **Alternatives considered**: Drive API (needs OAuth app); screenshotting the viewer (rejected:
  circumvents owner restrictions).

## R5. Microsoft Word for the web

- **SharePoint / OneDrive for Business** (`*.sharepoint.com`): background fetch of
  `https://<tenant>.sharepoint.com/_api/v2.0/sites/<host>:/sites/<site>:/drive/root:/<path>:/content?format=PDF`
  with cookies (sourced from a working gist). Responds 302 to a short-lived
  `https://<region>-mediap.svc.ms/transform/pdf?...` URL → need host permission for
  `*.svc.ms` as well. File path resolved from the `sourcedoc={GUID}` query parameter via
  `/_api/web/GetFileById('<GUID>')?$select=ServerRelativeUrl` (standard REST; chain inferred).
  These are undocumented internal endpoints: expect breakage.
- **Verified 2026-10-07 (rm-push-bla)** on a real OneDrive for Business account: the
  `_api/v2.0/sites/<host>:<path>:/drive/root:/…:/content?format=PDF` form above answers
  `400 invalidRequest`. What works with cookies alone is
  `<siteUrl>/_api/v2.0/drive/items/<sourcedoc GUID>/content?format=pdf` (also `drive/root:/<path>`
  and `v2.1`). The extension uses the item-GUID form: one request, no `GetFileById` lookup.
  Editor URLs may be `doc2.aspx` behind a sharing prefix such as `/:w:/r`.
- **OneDrive personal** (`onedrive.live.com`, `1drv.ms`): no cookie-based PDF conversion found;
  Graph needs an Entra app registration. **Not supported directly.**
- **Update 2026-10-07 (rm-push-aqy, abandoned)**: personal documents open at
  `https://word.cloud.microsoft/open/onedrive/?docId=<cid>!s<guid>&driveId=<cid>` and are stored
  at `my.microsoftpersonalcontent.com`. A live probe with the user's session returned
  `401 Unauthenticated` for every cookie-only request (`_api/v2.0/.../content?format=pdf`,
  `GetFileById`, `download.aspx`, `api.onedrive.com`). Word authenticates with
  `Authorization: Bearer` (POSTs from origin `word.cloud.microsoft` to
  `/_api/v2.0/drives/<driveId>/items/<itemId>/`). Capturing that header with `webRequest` was
  tried: Firefox reported Word's POST to the extension, but without the `Authorization` header
  (likely sent from a worker), so no token was ever seen. Not pursued further; personal
  documents keep the guided "Download as PDF" fallback.
- **Decision**: Implement SharePoint/ODfB export. For OneDrive personal, `word.cloud.microsoft`
  redirect pages, and any SharePoint failure: show guided fallback ("In Word choose File →
  Export → Download as PDF, then drop the file here") opening the Upload-a-file page (R6).
  This satisfies spec US5 scenario 2.
- **Alternatives considered**: Graph `/content?format=pdf` (needs app registration);
  `download.aspx` (returns .docx, local conversion out of scope).

## R6. Web page → print-faithful PDF

- **Facts (verified from Firefox source)**: `tabs.saveAsPDF` is Firefox-only, available in MV3,
  prints the **active** tab, always shows the OS save dialog (only the default filename can be
  set), resolves to `"saved" | "replaced" | "canceled" | "not_saved" | "not_replaced"`, and
  creates no downloads entry, so the saved path is unknowable.
- **File picker**: an `<input type="file">` in the toolbar popup closes the popup when the
  picker opens (verified, bug 1292701 still open). Use a dedicated extension tab instead.
- **Decision**: "Send as printed PDF" → `saveAsPDF({toFileName: <title>.pdf})` → on
  `saved`/`replaced` open the extension's **Upload a file** page (file input + drop zone,
  showing the expected filename) → user picks the file → upload. On `canceled`/`not_saved`:
  do nothing, no error (spec US3 scenario 6). Action count: menu → save → pick → confirm ≤ 5.
- **Reuse**: the same Upload-a-file page serves `file://` PDFs and the Word fallback.
- **Alternatives considered**: JS PDF renderers (poor fidelity); headless print (needs native host).

## R7. Web page → reflowable reading version

- **Decision**:
  1. `scripting.executeScript` (with `activeTab`) runs a content script that clones the live
     `document` and runs `@mozilla/readability` on the clone (post-JS DOM, correct base URL).
     Returns `{title, byline, html, imageUrls}` as a validated message.
  2. Background sanitises the HTML (drop script/style/iframe/form/event handlers/srcset), fetches
     images (needs optional `<all_urls>`; if not granted, images are dropped and the user is
     told), converts every image (including SVG) to PNG/JPEG via `createImageBitmap` +
     `OffscreenCanvas`, max 1620×2160.
  3. Build EPUB 3 with `teapub` (MIT, same author as rmapi-js, used by rePub in production).
  4. Upload with `uploadEpub` (root) or `putEpub` (folder).
- **Facts**: rePub (MIT, github.com/hafacc/repub) does the same pipeline; inline SVG does not
  render on reMarkable and unsupported glyphs break line height (from rePub code comments).
  reMarkable supports PNG/JPEG, not WebP/AVIF/SVG (support page, notebooks; EPUB inferred).
  Upload limit via web app is 100 MB.
- **Readability vs defuddle**: Readability 0.6.0 (Apache-2.0, ~150 KB) chosen over defuddle
  (~2.7 MB) for size; swap later if extraction quality is poor.
- **Empty result**: if Readability returns null or text shorter than a threshold, fail with
  "Could not find readable content" (spec US3 scenario 3).
- **Alternatives considered**: hand-built EPUB with JSZip (more code to own); jEpub,
  epub-gen-memory (less maintained).

## R8. Permissions (least privilege, constitution V)

| Permission | Why |
|---|---|
| `storage` | Device token, preferences |
| `activeTab` | Read current tab URL/title; fetch PDF in current tab; inject extraction script |
| `scripting` | Run Readability content script on demand |
| `menus` | Link and page context-menu entries |
| `notifications` | Success/failure notices (basic type only in Firefox) |
| host: 3 reMarkable hosts | Pairing and upload (required) |
| optional host: `*://docs.google.com/*`, `*://*.googleusercontent.com/*` | Google Docs export; requested on first Google Docs send |
| optional host: `*://*.sharepoint.com/*`, `*://*.svc.ms/*` | Word (SharePoint) export; requested on first Word send |
| optional host: `<all_urls>` | Linked PDFs on other origins, page images; requested on first use, feature degrades without it |

Not requested: `tabs` (activeTab suffices), `downloads`, `nativeMessaging`, `cookies`.

## R9. Tooling (bun, constitution IV)

nixpkgs unstable versions verified via mcp-nixos: `bun` 1.4.2, `firefox` 157.0, `geckodriver`
0.37.1, `web-ext` 10.7.0, `biome` 2.5.15, `typescript` 7.0.2.

- **Package manager / runtime / bundler**: bun. `build.ts` calls `Bun.build` per entry group:
  content script as `iife` (classic script), background/popup/options/upload pages as `esm`.
  No `eval`; no `process.env` left in output (use `define`).
- **Types**: `@types/firefox-webext-browser` (global `browser`); no `webextension-polyfill`
  (pointless in Firefox, throws outside an extension).
- **Lint/format**: biome. **Type check**: `tsc --noEmit` (TypeScript 7 native); pin TS 5.x via
  bun if incompatibilities appear.
- **Unit + integration**: `bun test`, happy-dom preload (`@happy-dom/global-registrator`),
  hand-written in-memory fakes for adapter interfaces (no sinon-chrome etc.).
- **Fake reMarkable cloud**: a `Bun.serve({port: 0})` fake implementing the auth, simple-upload,
  and (minimal) sync endpoints used by rmapi-js; also fake Google/SharePoint export endpoints.
- **E2E**: `selenium-webdriver` + nix `geckodriver`, headless Firefox, `installAddon(xpi, true)`,
  extension UUID pinned via `extensions.webextensions.uuids` pref. A test build points rmapi-js
  hosts at the fake server. Known risk: Firefox 156+ blocks `driver.get("moz-extension://…")`;
  workaround (geckodriver `--allow-system-access`, open tab from chrome context) comes from a
  single source and must be proven in the first E2E task. Fallback runner: `node` if
  selenium-webdriver misbehaves under bun.
  **Result (T028, 2026-10-07)**: with geckodriver started with `--allow-system-access`,
  `driver.get("moz-extension://…")` works directly on Firefox 157; the chrome-context fallback
  in the harness is kept but unused. `selenium-webdriver` runs fine under bun; `installAddon`
  accepts the unpacked `dist-e2e/` directory.
- **Packaging/lint**: `web-ext lint --warnings-as-errors -s dist`, `web-ext build -s dist`.
  Manifest needs `browser_specific_settings.gecko.id` and `gecko.data_collection_permissions`.
- **Alternatives considered**: Playwright (cannot load Firefox extensions); Puppeteer
  `installExtension` on Firefox (broken, issue closed not planned).

## R10. Token storage

- **Decision**: device token in `storage.local` (persists, survives restarts; SC-006). Short-lived
  session token cached in `storage.session`. Neither is ever sent to content scripts.
  Disconnect deletes both (FR-003). `window.localStorage` not used.
- `storage.local` is not encrypted (inferred); acceptable since the token is equivalent to what
  reMarkable's own desktop apps store, and the user can revoke it from my.remarkable.com.
