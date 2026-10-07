---

description: "Task list for Send to reMarkable from Firefox"
---

# Tasks: Send to reMarkable from Firefox

**Input**: Design documents from `specs/001-send-to-remarkable/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: REQUIRED. The constitution (Principle I, NON-NEGOTIABLE) mandates test-first. In every
phase, each test task MUST be written and seen failing (`bun test <file>` red) before the
implementation task that follows it. Principle II requires unit, integration and E2E layers.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested and
demonstrated on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story the task belongs to (US1–US6)

## Conventions for every task

- Run everything inside `nix-shell`. Never install tools globally.
- `browser.*` is only referenced in `src/adapters/browser/*`; `rmapi-js` only in
  `src/adapters/remarkable.ts` (Principle III). Core code receives ports from
  `src/adapters/ports.ts`.
- Every cross-context message is validated with its zod schema from `src/core/messages.ts` at
  the receiving end.
- Tests never touch the network beyond `127.0.0.1` fake servers; clocks and UUIDs are injected.
- After each task: `bun run check` and the relevant `bun test` files pass.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project skeleton, toolchain and build, per plan.md "Project Structure".

- [X] T001 Create `shell.nix` providing `bun`, `firefox`, `geckodriver`, `web-ext`, `biome`, `typescript` from nixpkgs; export `FIREFOX_BIN=${firefox}/bin/firefox`, `GECKODRIVER=${geckodriver}/bin/geckodriver`, `SE_OFFLINE=true` (stop Selenium Manager downloading drivers) in `shellHook`; add `.envrc` with `use nix`
- [X] T002 Create `package.json` (`"type": "module"`, `"private": true`) with dependencies `rmapi-js@^14.4.0`, `@mozilla/readability@^0.6.0`, `teapub@^4.1.0`, `zod` (same major as rmapi-js uses), devDependencies `@types/firefox-webext-browser`, `@happy-dom/global-registrator`, `selenium-webdriver`, `@types/selenium-webdriver`; scripts `check` (`biome check . && tsc --noEmit`), `build` (`bun build.ts`), `build:e2e` (`bun build.ts --e2e`), `test` (`bun test tests/unit tests/integration`), `test:e2e` (`bun run build:e2e && bun test tests/e2e`), `lint:ext` (`web-ext lint --warnings-as-errors -s dist`), `package` (`web-ext build -s dist --overwrite-dest`), `dev` (`web-ext run -s dist --firefox=$FIREFOX_BIN`), `ci` (check, test, build, test:e2e, lint:ext, package in order); run `bun install` and commit-stage `bun.lock`
- [X] T003 [P] Create `tsconfig.json`: `strict: true`, `noEmit: true`, `target`/`lib` ES2022 + DOM + DOM.Iterable, `moduleResolution: "bundler"`, `types: ["firefox-webext-browser", "bun"]`, include `src`, `tests`, `build.ts`
- [X] T004 [P] Create `biome.json` enabling formatter and recommended linter for `src`, `tests`, `build.ts`; ignore `dist`, `dist-e2e`, `web-ext-artifacts`
- [X] T005 [P] Create `bunfig.toml` with `[test] preload = ["./tests/setup/happydom.ts"]` and `tests/setup/happydom.ts` calling `GlobalRegistrator.register()` from `@happy-dom/global-registrator`
- [X] T006 [P] Create `.gitignore` entries `node_modules/`, `dist/`, `dist-e2e/`, `web-ext-artifacts/`, `*.xpi`
- [X] T007 Create `src/manifest.json`: `manifest_version: 3`; `browser_specific_settings.gecko` with `id: "rm-push@ohaukeboe"`, `strict_min_version: "142.0"`, `data_collection_permissions: { required: ["none"] }`; `background.scripts: ["background.js"]`, `background.type: "module"`; `action.default_popup: "popup.html"`; `options_ui.page: "options.html"`; `permissions: ["storage","activeTab","scripting","menus","notifications"]`; `host_permissions` = `https://webapp-prod.cloud.remarkable.engineering/*`, `https://eu.tectonic.remarkable.com/*`, `https://internal.cloud.remarkable.com/*`; `optional_host_permissions` = `*://docs.google.com/*`, `*://*.googleusercontent.com/*`, `*://*.sharepoint.com/*`, `*://*.svc.ms/*`, `<all_urls>` (each justified in research.md R8)
- [X] T008 Create `build.ts`: `Bun.build` with `format: "iife"`, `splitting: false` for `src/content/extract.ts`; `format: "esm"` for `src/background/index.ts`, `src/popup/popup.ts`, `src/options/options.ts`, `src/upload/upload.ts`; output flat names (`background.js`, `extract.js`, `popup.js`, `options.js`, `upload.js`) into `dist/`; copy `src/manifest.json` and `src/**/*.html` (+ any `.css`) to `dist/`; `define` a `__CONFIG__` object (see T010) — `--e2e` writes to `dist-e2e/`, sets `__CONFIG__` hosts to the fake server origin read from env `E2E_FAKE_ORIGIN` (default `http://127.0.0.1:8787`) and adds `http://127.0.0.1/*` to `host_permissions`; fail the build if output contains `eval(` or `process.env`
- [X] T009 Create placeholder entry files so the build succeeds: `src/background/index.ts`, `src/content/extract.ts`, `src/popup/popup.html` + `popup.ts`, `src/options/options.html` + `options.ts`, `src/upload/upload.html` + `upload.ts`; verify `bun run build` produces a `dist/` that `bun run lint:ext` accepts

**Checkpoint**: `bun run check`, `bun run build`, `bun run lint:ext` all exit 0.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared core types, ports, fakes, job runner, background router and the E2E harness.
Retires plan risks 1 and 2 early.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Config, errors, titles, classification (pure core)

- [X] T010 [P] Create `src/core/config.ts` exporting typed `Config` (`remarkable: { authHost, rawHost, uploadHost } | null` where null = rmapi-js defaults; `googleDocsOrigin` default `https://docs.google.com`; `sharepointSuffix` default `.sharepoint.com`) read from the build-time `__CONFIG__` define, plus `declare const __CONFIG__` in `src/core/globals.d.ts`; unit test defaults in `tests/unit/config.test.ts`
- [X] T011 [P] Write failing tests `tests/unit/errors.test.ts` for `SendError` kinds exactly as listed in data-model.md "SendError" (`not-connected`, `needs-reconnect`, `permission-denied`, `network`, `not-a-pdf`, `export-forbidden`, `not-logged-in`, `no-readable-content`, `too-large`, `service-error`, `unsendable-page`) and `mapHttpStatus(status, finalUrl)`: "401 or redirect to a login host → `not-logged-in`; 403 → `export-forbidden`; other 4xx/5xx → `service-error`; thrown fetch → `network`" (contracts/ports.md); plus `userMessage(error)` returning the exact texts in data-model.md
- [X] T012 Implement `src/core/errors.ts` to pass T011
- [X] T013 [P] Write failing tests `tests/unit/title.test.ts` for `sanitizeTitle(raw)`: "trim; collapse whitespace; strip control characters and `/ \ : * ? " < > |`; strip trailing ` - Google Docs` / ` - Word` / `.pdf`; truncate to 120 characters; empty → `"Untitled"`" (data-model.md)
- [X] T014 Implement `src/core/title.ts` to pass T013
- [X] T015 [P] Write failing tests `tests/unit/classify.test.ts` for `classify(url, contentTypeHint?)` covering every rule in data-model.md "Source", first match wins: internal schemes (`about:`, `moz-extension:`, `view-source:`, `chrome:`) → not sendable; `docs.google.com/document/(u/N/)?d/<ID>` → `google-doc` with `docId` and `accountIndex`; `*.sharepoint.com/.../_layouts/15/Doc.aspx?sourcedoc={GUID}` → `word-sharepoint` with `siteUrl` and `fileGuid`; `onedrive.live.com`, `1drv.ms`, `word.cloud.microsoft`, `*.officeapps.live.com` → `word-unsupported`; path ending `.pdf` or hint `application/pdf` → `pdf-url`; `file://…pdf` → `local-file`; other `http(s)` → `web-reflow`; hosts taken from `Config` (T010) so E2E can use fake origins
- [X] T016 Implement `src/core/classify.ts` and the `Source` tagged union in `src/core/source.ts` to pass T015

### Messages and ports

- [X] T017 [P] Write failing tests `tests/unit/messages.test.ts`: for each request in contracts/messages.md (`status`, `pair`, `disconnect`, `list-folders`, `set-default-folder`, `send-current` with `mode: "auto" | "print"`, `send-file` with `mime: "application/pdf" | "application/epub+zip"`) one accept and at least one reject case; `ExtractResult` accept/reject including limits "`html` ≤ 20 MB, `imageUrls` ≤ 500 entries, every URL `http(s)` or `data:`"; `send-file` over 100 MB rejected as `too-large`
- [X] T018 Implement zod schemas and `parseRequest` / `parseExtractResult` in `src/core/messages.ts` to pass T017 (invalid → `{ ok: false, error: { kind: "bad-message" } }`)
- [X] T019 [P] Define port interfaces in `src/adapters/ports.ts` exactly as contracts/ports.md: `RemarkablePort`, `Storage`, `Tabs`, `Scripting`, `Permissions`, `Notifier`, `Menus`, `Http`, `ImageCodec`, plus `Clock` (`now(): Date`) and `Ids` (`uuid(): string`)
- [X] T020 [P] Create in-memory fakes in `tests/fakes/browser.ts`: Map-backed `Storage` for `local` and `session`, recording `Notifier`, scripted `Tabs` (active tab, `saveAsPdf` returning a configured status, recorded `openExtensionPage` calls), `Permissions` with a configurable granted-origins set, recording `Menus`, fixed `Clock`, sequential `Ids`
- [X] T021 Create fake reMarkable cloud `tests/fakes/remarkable-server.ts` using `Bun.serve({ port })` (port 0 in tests, `E2E_FAKE_ORIGIN` port in E2E): read `node_modules/rmapi-js/dist/index.js` and `raw.js` to find the exact paths and payloads rmapi-js uses for `register` (`/token/json/2/device/new`), `auth` (`/token/json/2/user/new`), simple upload (`uploadFile`), and the sync calls behind `putPdf`/`putEpub`/`listItems`; implement those with in-memory state (registered devices, uploaded docs with name, mime, parent, bytes), valid code `abcdefgh`, and switches to force 401/500 responses; expose `uploads()` and `reset()` for assertions; self-test in `tests/integration/fake-remarkable.test.ts` using rmapi-js directly

### Job runner and background wiring

- [X] T022 Write failing tests `tests/unit/send-job.test.ts` for `runSendJob({ source, title, destination }, deps)` per data-model.md "SendJob": states `running → succeeded | failed | canceled`; failed job stores `error`; canceled job produces no notification; success notification text "Sent “<title>” to reMarkable[ (folder <name>)]." plus " Folder not found, sent to top level." when `fellBackToRoot` (contracts/ui.md); "the last N (20) finished jobs are kept in `storage.session` key `jobs`"; two concurrent jobs do not share state; not connected → `not-connected` without calling the fetcher
- [X] T023 Implement `src/core/send-job.ts` to pass T022 (fetcher per `source.kind` passed in a registry so stories add fetchers without editing the runner)
- [X] T024 [P] Implement thin production adapters `src/adapters/browser/storage.ts`, `notifier.ts` (`browser.notifications.create` type `basic`; `onClicked` opens the page given in `onClickPage`), `clock.ts`, `ids.ts` (`crypto.randomUUID`)
- [X] T025 Write failing integration test `tests/integration/background-router.test.ts`: the router validates every incoming message with `parseRequest`, rejects invalid ones with `bad-message`, and dispatches `status` returning `{ connection: "disconnected", defaultFolder: null, current: null, recentJobs: [] }` on an empty fake storage
- [X] T026 Implement `src/background/router.ts` (pure, takes ports) and `src/background/index.ts` (registers `runtime.onMessage` at top level, constructs production adapters, delegates to router) to pass T025

### E2E harness (retires plan risk 2)

- [X] T027 Create `tests/e2e/harness.ts`: start fake servers on `E2E_FAKE_ORIGIN`; build Firefox options with binary `$FIREFOX_BIN`, `-headless`, pref `extensions.webextensions.uuids = {"rm-push@ohaukeboe":"<fixed uuid>"}`; `ServiceBuilder($GECKODRIVER)` with `--allow-system-access`; `installAddon(dist-e2e as zip, true)`; helper `openExtensionPage(path)` that first tries `driver.get("moz-extension://<uuid>/<path>")` and on "not allowed in this context" falls back to chrome context `gBrowser.addTab(url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() })` then switches to the new window (research.md R9); helper `readExtensionStorage(key)` via the options page; `afterAll` quits driver and servers
- [X] T028 Write E2E smoke test `tests/e2e/smoke.test.ts`: extension installs, options page opens and renders its title, popup page opens and shows "Connect" (disconnected state); if `selenium-webdriver` fails under bun, switch the `test:e2e` script to run the same files with `node --test` and record the reason in plan.md Complexity Tracking

**Checkpoint**: `bun run test` and `bun run test:e2e` (smoke) green. Foundation ready.

---

## Phase 3: User Story 1 — Connect the extension to a reMarkable account (Priority: P1) 🎯 MVP

**Goal**: User pairs once with an 8-letter code; connection survives restarts; disconnect wipes credentials.

**Independent Test**: Install, enter valid code, restart profile, popup still shows connected (quickstart.md E2E rows 1–3).

### Tests for User Story 1 (write first, must fail)

- [X] T029 [P] [US1] Write failing tests `tests/unit/account.test.ts` for `src/core/account.ts`: `normalizeCode(input)` — "exactly 8 characters, letters only, trimmed, case-insensitive input normalised to lower case"; anything else rejected locally without a network call; state machine from data-model.md "AccountConnection" (`Disconnected → Connected`, invalid code stays `Disconnected`, `Connected → Disconnected` on disconnect deletes `account` and `session` keys, auth rejected → `NeedsReconnect` persisted as `account.revoked = true`, `NeedsReconnect → Connected` on re-pair)
- [X] T030 [P] [US1] Write failing integration tests `tests/integration/remarkable-register.test.ts`: `RemarkablePort.register` against the fake server (T021) returns `{ deviceToken, deviceId }` for `abcdefgh`, maps rejection to `InvalidCode`, unreachable host to `Network`, 5xx to `Service(status)`; registration sends `deviceDesc: "browser-chrome"`
- [X] T031 [P] [US1] Write failing E2E tests `tests/e2e/us1-connect.test.ts`: pair valid code → options shows connected; invalid code → error text and still disconnected; disconnect → `storage.local` has no `account` key; restart (new driver with same profile dir) → popup still connected

### Implementation for User Story 1

- [X] T032 [US1] Implement `src/core/account.ts` (pure, uses `Storage`, `Clock`, `Ids` ports) to pass T029; persisted shape `account = { deviceToken, deviceId, connectedAt, revoked? }`, session cache `session = { sessionToken, obtainedAt }`
- [X] T033 [US1] Implement `register` in `src/adapters/remarkable.ts` (wraps `rmapi-js` `register(code, { deviceDesc: "browser-chrome", uuid, authHost })`, hosts from `Config`) and a `SessionStore` that caches the session token in `storage.session` and refreshes it once on 401; pass T030
- [X] T034 [US1] Add `pair`, `disconnect` and connection part of `status` handlers in `src/background/router.ts` using `account.ts` and `RemarkablePort`
- [X] T035 [US1] Build pairing UI in `src/options/options.html` + `src/options/options.ts` per contracts/ui.md "Options page": link to `https://my.remarkable.com/device/browser/connect`, 8-letter code field, **Connect** button, error text from `userMessage`, connected state with "connected since" date and **Disconnect** button
- [X] T036 [US1] Build disconnected / needs-reconnect popup state in `src/popup/popup.html` + `src/popup/popup.ts` (explanation + **Connect** button opening options via `runtime.openOptionsPage`); popup calls `status` on open
- [X] T037 [US1] Make T031 pass; confirm token never reaches content scripts (no `storage` access in `src/content/`)

**Checkpoint**: US1 independently demonstrable; MVP part 1.

---

## Phase 4: User Story 2 — Send a PDF to the reMarkable (Priority: P1) 🎯 MVP

**Goal**: One action sends the PDF in the current tab, a linked PDF, or a picked local file to the cloud root.

**Independent Test**: Connected extension, open PDF tab, Send → fake cloud has the PDF named after the tab (quickstart.md rows 4–7). Retires plan risk 1 (rmapi-js in Firefox).

### Tests for User Story 2 (write first, must fail)

- [X] T038 [P] [US2] Write failing tests `tests/unit/pdf.test.ts` for `fetchPdfFromUrl(http, url)`: accept when `Content-Type` is `application/pdf` or bytes start with `%PDF-`; otherwise `not-a-pdf`; status mapping via `mapHttpStatus`; > 100 MB → `too-large`; `file:` and `blob:` URLs → returns a signal to open the Upload-a-file page instead of fetching (research.md R3)
- [X] T039 [P] [US2] Write failing integration tests `tests/integration/remarkable-upload.test.ts`: `RemarkablePort.upload(token, { name, bytes, kind: "pdf" }, null)` uses the simple API and lands at root in the fake server; auth failure → `AuthRejected`; 500 → `Service(500)`; network → `Network`
- [X] T040 [P] [US2] Write failing integration tests `tests/integration/send-pdf.test.ts`: router `send-current` on a fake active tab showing a PDF from a local `Bun.serve` fixture → job succeeds, upload name is `sanitizeTitle(tab.title)`, success notification recorded; disconnected → `not-connected` notification whose click opens options; linked-PDF menu click with origin not granted → `permission-denied`
- [X] T041 [P] [US2] Write failing E2E tests `tests/e2e/us2-pdf.test.ts`: send PDF tab (fixture served by fake server) → fake cloud received it; context menu "Send linked PDF to reMarkable" (trigger via the menu click handler through a test hook page if native context menus cannot be driven) → linked PDF received; fake cloud 500 → failure notification; Upload-a-file page with a PDF file → received

### Implementation for User Story 2

- [X] T042 [US2] Implement `src/core/pdf.ts` to pass T038 and register it as the `pdf-url` fetcher in the job runner registry
- [X] T043 [US2] Implement `upload` (root path via `uploadPdf`/`uploadEpub`) in `src/adapters/remarkable.ts` to pass T039; set `401 → mark account revoked` (NeedsReconnect) through `account.ts`
- [X] T044 [P] [US2] Implement production adapters `src/adapters/browser/http.ts` (`fetch` with `credentials: "include"`, returns final URL + status + bytes), `tabs.ts` (`activeTab`, `openExtensionPage`), `permissions.ts` (`contains`), `menus.ts` (create items in `runtime.onInstalled`, top-level `menus.onClicked` listener)
- [X] T045 [US2] Add `send-current` (classify active tab → job) and `send-file` handlers in `src/background/router.ts`; register the `link` context menu item "Send linked PDF to reMarkable" and `action` item "Upload a file…" (contracts/ui.md) in `src/background/index.ts`; pass T040
- [X] T046 [US2] Build connected popup state in `src/popup/popup.ts`: detected type label, title, **Send** button, "This page cannot be sent." for unsendable tabs, last 5 jobs, **Upload a file…** link; when a needed optional origin is missing, show **Grant access** that calls `browser.permissions.request` inside the click handler (user gesture) via a small UI-side helper `src/popup/grant.ts`
- [X] T047 [US2] Build Upload-a-file page `src/upload/upload.html` + `src/upload/upload.ts` per contracts/ui.md: drop zone + file input accepting `.pdf,.epub`, query params `expected=<filename>` and `reason=print|word|file` with reason-specific instructions, sends `send-file` (bytes as `ArrayBuffer`), success state with **Close tab**; reject > 100 MB before sending
- [X] T048 [US2] Make T041 pass in headless Firefox (this proves rmapi-js runs in the Firefox MV3 event page; if it does not, stop and file a beads issue with the error before continuing)

**Checkpoint**: US1 + US2 = MVP. Run quickstart manual steps 1–2 against the real service.

---

## Phase 5: User Story 3 — Send a web page (Priority: P2)

**Goal**: Default send creates a reflowable EPUB; "Send as printed PDF" saves via Firefox print and uploads the picked file.

**Independent Test**: Article page → Send → fake cloud has a valid EPUB with the page title and PNG/JPEG images (quickstart.md rows 8–10).

### Tests for User Story 3 (write first, must fail)

- [X] T049 [P] [US3] Write failing tests `tests/unit/epub-sanitize.test.ts` for `sanitizeArticleHtml(html, baseUrl)`: removes `script`, `style`, `iframe`, `form` elements, `on*` attributes and `srcset`; drops attributes invalid as XML names; strips control characters; resolves relative `src`/`href` against `baseUrl`; returns cleaned HTML and the list of image URLs in document order (XHTML serialisation is done by teapub and verified in T050)
- [X] T050 [P] [US3] Write failing tests `tests/unit/epub-build.test.ts` for `buildEpub({ title, byline, lang, xhtml, images })`: output is a zip whose first entry is `mimetype` stored uncompressed with content `application/epub+zip`; has `META-INF/container.xml`, an OPF with `dc:identifier`, `dc:title`, `dc:language`, `dcterms:modified`, a nav document; every `img src` points to a file in the manifest; images whose fetch failed are removed rather than left dangling
- [X] T051 [P] [US3] Write failing tests `tests/unit/readable.test.ts` for `buildReadableEpub(extract, http, imageCodec, permissions)`: `ExtractResult { ok: false }` or text under 200 characters → `no-readable-content`; images fetched only when `<all_urls>` is granted, otherwise dropped and job result flags `imagesSkipped`; every image passed through `imageCodec.toRaster(bytes, mime, 1620, 2160)`
- [X] T052 [P] [US3] Write failing tests `tests/unit/print-flow.test.ts` for `nextStepAfterSave(status, title)`: `"saved"`/`"replaced"` → open `upload.html?expected=<sanitizeTitle(title)>.pdf&reason=print`; `"canceled"`/`"not_saved"`/`"not_replaced"` → job `canceled`, no notification (spec US3 scenario 6)
- [X] T053 [P] [US3] Write failing E2E tests `tests/e2e/us3-web.test.ts`: fixture article page with a WebP and an inline SVG image → Send → fake cloud received an EPUB titled after the page whose images are PNG/JPEG; fixture empty page → `no-readable-content` notification and no upload; Upload-a-file page opened with `reason=print&expected=x.pdf` shows the expected filename and uploads a picked PDF

### Implementation for User Story 3

- [X] T054 [US3] Implement `src/content/extract.ts` (injected IIFE): clone `document`, run `new Readability(clone).parse()`, return `ExtractResult` per contracts/messages.md (`title`, `byline`, `lang`, `html`, `baseUrl = document.baseURI`, absolute `imageUrls`) or `{ ok: false, reason: "no-readable-content" }`
- [X] T055 [US3] Implement `src/core/epub.ts` (`sanitizeArticleHtml`, `buildEpub` via `teapub`) to pass T049–T050
- [X] T056 [US3] Implement `src/core/readable.ts` (`buildReadableEpub`) to pass T051; register as `web-reflow` fetcher (output kind `epub`)
- [X] T057 [P] [US3] Implement production adapters `src/adapters/browser/scripting.ts` (`scripting.executeScript({ target: { tabId }, files: ["extract.js"] })`, result parsed with `parseExtractResult`) and `src/adapters/browser/image.ts` (`createImageBitmap` + `OffscreenCanvas.convertToBlob`, PNG for images with alpha else JPEG, scale to fit 1620×2160; SVG rasterised via `Image` element on a blob URL)
- [X] T058 [US3] Implement `src/core/print-flow.ts` to pass T052; add `saveAsPdf(fileName)` to `src/adapters/browser/tabs.ts`; wire `send-current` with `mode: "print"` in `src/background/router.ts` (job `web-print`)
- [X] T059 [US3] Add page context menu items "Send page to reMarkable" and "Send page to reMarkable as printed PDF" in `src/background/index.ts`; add **Send as printed PDF** button for web pages in `src/popup/popup.ts`; show "Images skipped — grant access to all sites to include them" with **Grant access** when `imagesSkipped`
- [X] T060 [US3] Make T053 pass

**Checkpoint**: US3 works independently of US4–US6. Run quickstart manual steps 3–4.

---

## Phase 6: User Story 4 — Send a Google Docs document (Priority: P2)

**Goal**: Send the open Google Doc as a full-document PDF using the user's session.

**Independent Test**: Google Doc tab (fake docs origin in E2E) → Send → fake export PDF uploaded (quickstart.md rows 11–12).

### Tests for User Story 4 (write first, must fail)

- [X] T061 [P] [US4] Write failing tests `tests/unit/google-docs.test.ts` for `googleDocExportUrl({ docId, accountIndex }, config)`: `<origin>/document/d/<ID>/export?format=pdf`, keeping `/u/<N>/` when `accountIndex` is set (research.md R4); and `exportGoogleDoc(http, source)`: 403 → `export-forbidden`; redirect to `accounts.google.com` or 401 → `not-logged-in`; non-PDF body → `not-a-pdf`; follows redirect to a `googleusercontent.com` host
- [X] T062 [P] [US4] Add fake Google Docs endpoints to `tests/fakes/docs-server.ts`: `/document/d/:id/export` returning a fixture PDF via a 302 hop, `403` for id `forbidden`, redirect to a fake login URL for id `loggedout`
- [X] T063 [P] [US4] Write failing E2E tests `tests/e2e/us4-gdocs.test.ts` (E2E build sets `googleDocsOrigin` to the fake origin): open `<fake>/document/d/abc/edit` → Send → fake cloud has a PDF titled from the tab title minus ` - Google Docs`; id `forbidden` → `export-forbidden` notification

### Implementation for User Story 4

- [X] T064 [US4] Implement `src/core/google-docs.ts` to pass T061 and register as `google-doc` fetcher; require origins `*://docs.google.com/*` and `*://*.googleusercontent.com/*`, else `permission-denied` naming Google Docs
- [X] T065 [US4] Popup: label "Google Doc" and **Grant Google access** when those origins are missing (via `src/popup/grant.ts`); options page "Site access" row for Google (contracts/ui.md)
- [ ] T066 [US4] Make T063 pass; run quickstart manual step 5 against a real Google Doc and record the result (retires plan risk 3; file a beads issue if it fails)

**Checkpoint**: US4 independently demonstrable.

---

## Phase 7: User Story 5 — Send a Microsoft Word online document (Priority: P3)

**Goal**: SharePoint/OneDrive-for-Business Word docs export to PDF; everything else gets the guided fallback.

**Independent Test**: SharePoint Word tab (fake origin) → Send → fake transform PDF uploaded; OneDrive personal tab → Upload-a-file page with Word instructions (quickstart.md rows 13–14).

### Tests for User Story 5 (write first, must fail)

- [X] T067 [P] [US5] Write failing tests `tests/unit/sharepoint.test.ts`: parse `siteUrl` (path before `/_layouts/15/`) and `fileGuid` (from `sourcedoc={GUID}`, braces and URL-encoding stripped); `exportSharepointWord(http, source)` calls `<siteUrl>/_api/web/GetFileById('<GUID>')?$select=ServerRelativeUrl` (JSON accept header), then `<tenant>/_api/v2.0/sites/<host>:<sitePath>:/drive/root:/<path relative to library>:/content?format=PDF`, follows the 302 to a `*.svc.ms` host; any failure → `SendError` via `mapHttpStatus`; `word-unsupported` source → open `upload.html?reason=word` (research.md R5)
- [X] T068 [P] [US5] Add fake SharePoint endpoints to `tests/fakes/sharepoint-server.ts`: `GetFileById` JSON, `_api/v2.0 …/content?format=PDF` → 302 to a fake `/transform/pdf` returning a fixture PDF
- [X] T069 [P] [US5] Write failing E2E tests `tests/e2e/us5-word.test.ts` (E2E build sets `sharepointSuffix` to match the fake origin): SharePoint Doc.aspx tab → Send → PDF uploaded; OneDrive personal URL tab → Upload-a-file page opens showing "File → Export → Download as PDF" instructions

### Implementation for User Story 5

- [X] T070 [US5] Implement `src/core/sharepoint.ts` to pass T067; register `word-sharepoint` fetcher (requires `*://*.sharepoint.com/*` and `*://*.svc.ms/*`) and `word-unsupported` handling (opens upload page, job `canceled`, no error notification)
- [X] T071 [US5] Popup label "Word document", **Grant Microsoft access** button, options "Site access" row for Microsoft; on any SharePoint export failure also offer the fallback link to `upload.html?reason=word`
- [ ] T072 [US5] Make T069 pass; if a SharePoint account is available run quickstart manual step 6 and record the result (plan risk 4)

**Checkpoint**: US5 independently demonstrable.

---

## Phase 8: User Story 6 — Choose where documents land (Priority: P3)

**Goal**: Default destination folder plus per-send override, with fallback to root.

**Independent Test**: Set default folder, send PDF → lands in folder; delete folder in fake cloud, send → lands at root with notice (quickstart.md row 15).

### Tests for User Story 6 (write first, must fail)

- [X] T073 [P] [US6] Write failing integration tests `tests/integration/remarkable-folders.test.ts`: `listFolders` returns collections only, root first; `upload(..., folderId)` uses `putPdf`/`putEpub` with `parent: folderId`; when the folder no longer exists (or put fails with a non-auth, non-network error) it retries once via the simple API at root and returns `fellBackToRoot: true`; auth/network errors are not retried
- [X] T074 [P] [US6] Write failing unit tests `tests/unit/prefs.test.ts`: `prefs.defaultFolder` is "`{ id: string, name: string } | null`", default `null` (root); `set-default-folder` persists; a per-send `folder` in `send-current`/`send-file` overrides the default
- [X] T075 [P] [US6] Write failing E2E tests `tests/e2e/us6-folders.test.ts`: create folder in fake cloud, pick it in options, send PDF → fake cloud doc has that `parent`; delete folder, send → doc at root and notification contains "Folder not found, sent to top level."

### Implementation for User Story 6

- [X] T076 [US6] Implement `listFolders` and folder upload with fallback in `src/adapters/remarkable.ts` to pass T073 (extend fake server sync endpoints in `tests/fakes/remarkable-server.ts` if T021 left gaps)
- [X] T077 [US6] Implement `src/core/prefs.ts` and `list-folders` / `set-default-folder` handlers plus destination resolution in `src/background/router.ts` to pass T074
- [X] T078 [US6] Options page default-folder dropdown with **Refresh** (root first) in `src/options/options.ts`; popup destination selector preselecting the default in `src/popup/popup.ts`; listing failure shows an error but leaves sending to root available
- [X] T079 [US6] Make T075 pass

**Checkpoint**: All six stories independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T080 [P] Fill `CLAUDE.md` and `AGENTS.md` "Build & Test" and "Architecture Overview" sections with the commands from quickstart.md and the core/adapters/entry-points layout (keep both files in sync)
- [X] T081 [P] Write `README.md`: what it does, install (temporary add-on / signed XPI), pairing steps, permissions and why (from research.md R8), known limitations (containers, OneDrive personal, unofficial API)
- [X] T082 Add a performance check `tests/integration/perf.test.ts`: a 10 MB PDF through job runner + fake cloud completes well under the SC-003 budget of 15 s (assert < 5 s locally to leave headroom for real network)
- [X] T083 Security pass: grep that `deviceToken`/`sessionToken` never appear in `console.*`, notification text, or `src/content/`; confirm manifest permissions match research.md R8 exactly; `web-ext lint --warnings-as-errors` clean
- [X] T084 Run `bun run ci` from a fresh clone inside `nix-shell` (constitution IV) and fix anything that relied on local state
- [ ] T085 Run the full quickstart.md manual smoke test against the real reMarkable cloud; file beads issues (`bd create`) for any failing step

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: needs Setup. Blocks all stories.
- **US1 (Phase 3)**: needs Foundational.
- **US2 (Phase 4)**: needs Foundational; E2E (T041/T048) needs US1 pairing to have a connected state. Unit/integration tasks can start in parallel with US1.
- **US3, US4, US5 (Phases 5–7)**: need Foundational, and the upload path + Upload-a-file page from US2 (T043, T047). Independent of each other.
- **US6 (Phase 8)**: needs US2 upload adapter (T043). Independent of US3–US5.
- **Polish (Phase 9)**: after the stories you intend to ship.

```text
Setup -> Foundational -> US1 -> US2 -+-> US3
                                     +-> US4
                                     +-> US5
                                     +-> US6
                                           -> Polish
```

### Within each story

Tests first (red) → core logic → adapters → background wiring → UI → E2E green.

### Parallel opportunities

- Setup: T003, T004, T005, T006 together.
- Foundational: T010, T011, T013, T015, T017, T019, T020 together; then their implementations.
- Every story's test tasks marked [P] together.
- After US2: US3, US4, US5, US6 can be worked by different people in parallel (they touch different `src/core/*` files; `router.ts`, `popup.ts`, `options.ts` edits must be serialised or merged carefully).

### Parallel example: User Story 3

```text
Together: T049 epub-sanitize tests, T050 epub-build tests, T051 readable tests, T052 print-flow tests, T053 E2E
Then:     T054 extract.ts, T057 scripting/image adapters (parallel), then T055 -> T056 -> T058 -> T059 -> T060
```

### Parallel example: User Story 4

```text
Together: T061 unit tests, T062 fake docs server, T063 E2E
Then:     T064 -> T065 -> T066
```

---

## Implementation Strategy

### MVP first (US1 + US2)

1. Phase 1 Setup, Phase 2 Foundational (including the E2E harness: retire Selenium risk now).
2. US1 connect, US2 PDF send. T048 proves rmapi-js in Firefox; stop and reassess if it fails.
3. Validate with quickstart manual steps 1–2. Ship as a temporary add-on.

### Incremental delivery

1. MVP → US3 web pages (highest daily value) → US4 Google Docs → US6 folders → US5 Word.
2. Each story ends with its checkpoint: its E2E file green and the full `bun run ci` green.

### Tracking

Work is tracked in beads (`bd`). Optionally convert these tasks with `/speckit-taskstoissues`
or create one bead per phase with `bd create --parent`.
