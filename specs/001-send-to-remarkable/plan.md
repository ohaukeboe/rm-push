# Implementation Plan: Send to reMarkable from Firefox

**Branch**: `001-send-to-remarkable` | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-send-to-remarkable/spec.md`

## Summary

A Firefox (desktop, MV3) extension that sends the current tab or a linked file to the user's
reMarkable cloud. PDFs are re-fetched and uploaded as is; Google Docs and SharePoint Word
documents are exported to PDF through the user's logged-in session; ordinary web pages become a
reflowable EPUB (Readability + teapub) by default, or a print-faithful PDF via Firefox's
`saveAsPDF` plus a file-pick step. All cloud traffic goes through the bundled `rmapi-js` library,
so no native host or own API client is needed. Built, tested and packaged with bun inside
`nix-shell`. Details and sources: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (checked with `tsc` 7.0.2 from nixpkgs), runtime/bundler/test
runner bun 1.4.2

**Primary Dependencies**:
- Runtime (bundled): `rmapi-js` ^14.4.0 (reMarkable cloud), `@mozilla/readability` ^0.6.0 (article
  extraction), `teapub` ^4.1.0 (EPUB 3 assembly), `zod` (message validation; already a
  dependency of rmapi-js)
- Dev: `@types/firefox-webext-browser`, `@happy-dom/global-registrator`, `selenium-webdriver`,
  plus nix-provided `biome`, `web-ext`, `firefox`, `geckodriver`

**Storage**: `browser.storage.local` (device token, preferences), `browser.storage.session`
(session token, recent jobs). See [data-model.md](data-model.md).

**Testing**: `bun test` with happy-dom for unit and integration (hand-written port fakes, local
`Bun.serve` fake servers); Selenium + geckodriver driving headless Firefox 157 for E2E.

**Target Platform**: Firefox desktop ≥ 142 (needed for `data_collection_permissions`; current release 157 and ESR 153), Manifest V3,
event-page background. Not Firefox for Android, not Chrome.

**Project Type**: Browser extension (single project).

**Performance Goals**: A ≤ 10 MB document reaches the cloud within 15 s on broadband (SC-003);
popup opens with status in < 300 ms.

**Constraints**: No remote code, no `eval` (MV3 CSP); no third-party conversion services
(FR-014); upload size ≤ 100 MB; only default-container cookies are used (bug 1670278).

**Scale/Scope**: Single user per profile; ~6 UI surfaces (popup, options, upload page, 4 menu
items, notifications); 7 source kinds.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | How the plan complies |
|---|---|---|
| I. Test-First | ✅ | Tasks will be written test-first: each `core/` function and each adapter starts with a failing `bun test`; each user story starts with a failing E2E scenario from [quickstart.md](quickstart.md). |
| II. Layered coverage | ✅ | Unit: `tests/unit` (classifier, titles, URL builders, HTTP→error mapping, EPUB sanitising, message schemas). Integration: `tests/integration` (background job runner with port fakes and fake HTTP servers, rmapi-js adapter vs fake cloud). E2E: `tests/e2e` (built extension in headless Firefox, one test per primary flow). Single command `bun run ci`. No live services: fakes in `tests/fakes/`. Deterministic: injected clock and UUID generator. |
| III. Testable browser-API boundary | ✅ | `browser.*` only in `src/adapters/browser/*`; `rmapi-js` only in `src/adapters/remarkable.ts`. Logic receives ports ([contracts/ports.md](contracts/ports.md)). All cross-context messages zod-validated at the receiver ([contracts/messages.md](contracts/messages.md)). |
| IV. shell.nix | ✅ | `shell.nix` provides bun, firefox, geckodriver, web-ext, biome, typescript; npm deps via committed `bun.lock`. Tests read `FIREFOX_BIN` / `GECKODRIVER` exported by `shell.nix`; Selenium Manager downloads disabled. |
| V. Least privilege & simplicity | ✅ | Permissions justified one by one in research R8; site access beyond reMarkable is optional and requested per feature on first use. No remote code. Dependencies limited to three runtime libraries, each replacing substantial code (cloud protocol, extraction, EPUB packaging). |
| Tech constraints | ✅ | Target browser and MV3 stated above and exercised by E2E. Static analysis: biome + `tsc --noEmit` in `bun run check`. |

**Post-design re-check (after Phase 1)**: ✅ still passes. Design added no new permissions or
dependencies beyond those above. One accepted gap, recorded in Complexity Tracking: the
`saveAsPDF` OS dialog cannot be driven by E2E.

## Project Structure

### Documentation (this feature)

```text
specs/001-send-to-remarkable/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── messages.md      # Cross-context message schemas
│   ├── ports.md         # Adapter interfaces
│   └── ui.md            # Popup, menus, options, upload page, notifications
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
shell.nix                  # dev environment (constitution IV)
package.json  bun.lock  bunfig.toml  tsconfig.json  biome.json
build.ts                   # Bun.build per entry group; --e2e flag swaps hosts + manifest
src/
├── manifest.json          # MV3, gecko id, permissions per research R8
├── core/                  # pure logic, no browser.* imports
│   ├── classify.ts        # tab URL -> Source kind (FR-009)
│   ├── title.ts           # sanitizeTitle (FR-010)
│   ├── errors.ts          # SendError kinds, HTTP status mapping
│   ├── messages.ts        # zod schemas (contracts/messages.md)
│   ├── google-docs.ts     # export URL builder
│   ├── sharepoint.ts      # sourcedoc parsing, export URL chain
│   ├── epub.ts            # sanitise Readability HTML, assemble EPUB via teapub
│   └── send-job.ts        # job runner: source -> bytes -> upload -> notify
├── adapters/
│   ├── remarkable.ts      # RemarkablePort over rmapi-js
│   └── browser/           # storage, tabs, scripting, permissions, notifier, menus, http, image
├── background/index.ts    # top-level listeners, wires ports into core
├── content/extract.ts     # injected: clone document, run Readability, return ExtractResult
├── popup/                 # popup.html, popup.ts
├── options/               # options.html, options.ts
└── upload/                # upload.html, upload.ts (file pick / drop)
tests/
├── fakes/                 # fake ports; Bun.serve fake reMarkable/Google/SharePoint servers
├── unit/
├── integration/
└── e2e/                   # selenium-webdriver + geckodriver, headless
```

**Structure Decision**: Single project. `core/` is pure and unit-tested; `adapters/` is the only
place touching `browser.*` or `rmapi-js`; entry points (`background`, `content`, `popup`,
`options`, `upload`) are thin wiring. `build.ts` emits `dist/` (production) and `dist-e2e/`
(hosts pointed at the fake server, `http://127.0.0.1/*` added to host permissions for tests
only).

## Risks to retire first

These are inferred, not verified, and the first tasks must prove them (spike or E2E):

1. ~~`rmapi-js` works in a Firefox MV3 event page with the declared host permissions (only proven
   in Chrome).~~ **Retired by T048 (2026-10-07)**: pairing, session refresh and simple-API
   uploads run in headless Firefox 157 against the fake cloud. Only the build had to neutralise
   two `Function(...)` fallbacks in bundled jszip/core-js for AMO lint.
2. ~~Selenium can open `moz-extension://` pages on Firefox 157.~~ **Retired by T028**: works
   directly with geckodriver `--allow-system-access`.
3. Cookie-authenticated background fetch of Google Docs export works (manual smoke test step 5
   early, since fakes cannot prove this).
4. SharePoint `_api/v2.0 ... ?format=PDF` chain works without an app registration (manual,
   lowest priority, story P3).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| No E2E test for the `saveAsPDF` OS save dialog (Principle II) | The dialog is a native OS window that WebDriver cannot drive | Mocking `saveAsPDF` in E2E would test nothing real; covered instead by unit tests of the status → next-step logic, the Upload-a-file E2E, and manual smoke step 4 |
| Real Google/SharePoint export not exercised by automated tests (Principle II forbids live services) | Constitution forbids network access to live third-party services in tests | Fakes mirror the documented URL/redirect/status behaviour; real behaviour checked by manual smoke steps 5–6 |
