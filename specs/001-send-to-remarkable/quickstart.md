# Quickstart: validate Send to reMarkable

**Plan**: [plan.md](plan.md)

## Prerequisites

- Nix with `nix-shell` (all tools come from `shell.nix`; nothing global).
- For the manual checks only: a reMarkable account with cloud sync, a Google account, and
  optionally a Microsoft 365 work/school account with SharePoint.

## Setup

```bash
nix-shell            # bun, firefox, geckodriver, web-ext, biome, typescript
bun install --frozen-lockfile
```

## Automated quality gate (constitution: must all pass)

```bash
bun run check        # biome lint + tsc --noEmit
bun test tests/unit tests/integration
bun run build        # dist/ (production manifest)
bun run test:e2e     # builds dist-e2e/ against fake servers, runs headless Firefox
bun run lint:ext     # web-ext lint --warnings-as-errors -s dist
bun run package      # web-ext build -> web-ext-artifacts/*.zip
```

`bun run ci` runs all of the above in order.

Expected: every command exits 0. E2E needs no network: the reMarkable, Google and SharePoint
endpoints are served by the local fake server in `tests/fakes/`.

## E2E scenarios (automated, `tests/e2e/`)

| Scenario | Spec | Expected |
|---|---|---|
| Pair with valid code, restart profile | US1 #2, FR-002 | Popup shows connected after restart |
| Pair with invalid code | US1 #3 | Error text, still disconnected |
| Disconnect | US1 #4, FR-003 | `storage.local` has no `account` key |
| Send PDF tab | US2 #1 | Fake cloud received a PDF named after the tab |
| Send linked PDF (menu) | US2 #2 | Fake cloud received the linked PDF |
| Upload fails (fake returns 500) | US2 #3 | Failure notification with reason |
| Send while disconnected | US2 #4 | Options page opens / "Connect first" |
| Send article page | US3 #1 | Fake cloud received a valid EPUB with page title and PNG images |
| Page with no content | US3 #3 | `no-readable-content` notification, nothing uploaded |
| Upload-a-file page with a PDF | US3 #5 (pick step) | Fake cloud received file |
| Google Doc tab (fake docs host) | US4 #1 | PDF from fake export endpoint uploaded |
| Google Doc export 403 | US4 #2 | `export-forbidden` notification |
| SharePoint Word tab (fake host) | US5 #1 | PDF from fake transform endpoint uploaded |
| OneDrive personal tab | US5 #2 | Upload-a-file page opens with Word instructions |
| Default folder set / deleted | US6 #2, #3 | Lands in folder / falls back to root with notice |

The `saveAsPDF` OS dialog cannot be automated; US3 #5 is covered by unit tests of the
status → next-step logic plus the Upload-a-file E2E, and by the manual check below.

## Manual smoke test against the real services

```bash
bun run dev          # web-ext run with dist/, temporary install in nix firefox
```

1. Options → open `https://my.remarkable.com/device/browser/connect`, paste code → "Connected".
2. Open any public PDF → toolbar → **Send**. Within ~15 s the PDF is in the reMarkable app.
3. Open a news article → **Send**. An EPUB with images appears.
4. Same article → **Send as printed PDF** → save → pick file → appears as PDF.
5. Open a Google Doc you own → **Send** (grant Google access when asked) → PDF appears.
6. (Optional) SharePoint Word doc → **Send** → PDF appears.
7. Options → choose a folder → send again → lands in the folder.
8. Options → **Disconnect** → popup shows "Connect".

Record any failure as a beads issue (`bd create`) with the step number.
