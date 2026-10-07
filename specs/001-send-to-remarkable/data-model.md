# Data Model: Send to reMarkable from Firefox

**Date**: 2026-10-07 | **Plan**: [plan.md](plan.md)

All persisted data lives in `browser.storage`. No server-side state of our own.

## AccountConnection

Persisted in `storage.local` under key `account`. Session token cached in `storage.session`
under key `session`.

| Field | Type | Rules |
|---|---|---|
| `deviceToken` | string | Returned by pairing. Never exposed to content scripts or logs. |
| `deviceId` | string (UUID v4) | Generated at pairing, sent with registration. |
| `connectedAt` | ISO 8601 string | Set at successful pairing. |

Session cache (`storage.session`): `{ sessionToken: string, obtainedAt: ISO string }`.

**Validation**:
- Pairing code: exactly 8 characters, letters only, trimmed, case-insensitive input normalised
  to lower case before sending. Anything else is rejected locally without a network call.

**States**:

```text
Disconnected --pair(valid code)--> Connected
Disconnected --pair(invalid code)--> Disconnected  (error shown)
Connected --disconnect--> Disconnected            (account + session keys deleted)
Connected --auth rejected (token revoked)--> NeedsReconnect
NeedsReconnect --pair(valid code)--> Connected
NeedsReconnect --disconnect--> Disconnected
```

`NeedsReconnect` is derived, persisted as `account.revoked = true`, so the popup can show it.

## Preferences

Persisted in `storage.local` under key `prefs`.

| Field | Type | Default | Rules |
|---|---|---|---|
| `defaultFolder` | `{ id: string, name: string } \| null` | `null` (root) | `id` is a reMarkable collection UUID. |

## SendJob

In memory in the background page while running; the last N (20) finished jobs are kept in
`storage.session` key `jobs` so the popup can show recent results after the event page unloads.

| Field | Type | Rules |
|---|---|---|
| `id` | string (UUID) | Unique per job. |
| `source` | `Source` (below) | Required. |
| `title` | string | Derived per FR-010; never empty (fallback `"Untitled"`). |
| `destination` | `{ id: string, name: string } \| null` | `null` = root. |
| `status` | `"running" \| "succeeded" \| "failed" \| "canceled" \| "handed-off"` | `handed-off`: flow continues on the Upload-a-file page |
| `error` | `SendError \| undefined` | Present iff `status = "failed"`. |
| `startedAt` / `endedAt` | ISO strings | |
| `fellBackToRoot` | boolean | True when a folder upload failed and root upload succeeded. |

**State transitions**:

```text
running --upload ok--> succeeded
running --any step fails--> failed (error.kind set)
running --user cancels save/file pick--> canceled (no notification)
running --flow continues on the upload page--> handed-off (no notification)
```

Each job is independent; concurrent jobs never share state (spec edge case "several sends").

## Source (tagged union)

| `kind` | Fields | Output format |
|---|---|---|
| `pdf-url` | `url` | PDF |
| `google-doc` | `docId`, `accountIndex?` | PDF |
| `word-sharepoint` | `siteUrl`, `fileGuid` | PDF |
| `word-unsupported` | `url` | none: shows fallback guidance |
| `web-reflow` | `tabId`, `url` | EPUB |
| `web-print` | `tabId` | PDF via save + pick |
| `local-file` | `File` | PDF or EPUB (by type) |

`classify(url, contentTypeHint?)` is a pure function mapping a tab URL to a `Source` kind
(FR-009). Rules, first match wins:

1. `about:`, `moz-extension:`, `view-source:`, `chrome:` → not sendable.
2. `docs.google.com/document/(u/N/)?d/<ID>` → `google-doc`.
3. `*.sharepoint.com/[/:w:/r]…/_layouts/15/Doc.aspx` or `doc2.aspx` `?sourcedoc={GUID}` → `word-sharepoint` (sharing prefix stripped from `siteUrl`).
4. `onedrive.live.com`, `1drv.ms`, `word.cloud.microsoft`, `*.officeapps.live.com` → `word-unsupported`.
5. Tab shows Firefox PDF viewer (URL path ends `.pdf`, or content type `application/pdf`) → `pdf-url`.
6. `file://` ending `.pdf` → `local-file` (opens Upload-a-file page).
7. Any other `http(s)` → `web-reflow` (default) / `web-print` (explicit action).

For a current tab, rule 7 is refined by probing the tab (`Scripting.contentType`): if the
document reports `application/pdf`, or scripts cannot run in it (Firefox's PDF viewer refuses
injection), the tab is treated as `pdf-url` (the latter with `guessed: true`). PDFs are often
served without `.pdf` in the URL, e.g. `https://arxiv.org/pdf/2604.14228v2`. A guessed PDF whose
URL does not return a PDF fails with `unsendable-page`.

## SendError

| `kind` | User message (FR-011) |
|---|---|
| `not-connected` | "Connect your reMarkable account first." (opens options) |
| `needs-reconnect` | "reMarkable rejected the connection. Pair again." |
| `permission-denied` | "Firefox access to <site> is needed. Click to grant." |
| `network` | "Could not reach <host>. Check your connection and retry." |
| `not-a-pdf` | "The link did not return a PDF." |
| `export-forbidden` | "The document's owner has disabled downloading." |
| `not-logged-in` | "You are not signed in to <service> in this browser." |
| `no-readable-content` | "Could not find readable content on this page." |
| `too-large` | "The document is larger than reMarkable accepts (100 MB)." |
| `service-error` | "reMarkable's service returned an error (<status>). It may have changed; try updating the extension." |
| `unsendable-page` | "This page cannot be sent." |
| `source-error` | "<host> returned an error (<status>) while downloading the document." (HTTP errors from the document's site; `service-error` is only for the reMarkable cloud) |
| `invalid-code` | "That code is invalid or expired. Get a new code and try again." (pairing only) |
| `bad-message` | "Internal error: the extension received an invalid message." |

## Title rules (FR-010)

`sanitizeTitle(raw)`: trim; collapse whitespace; strip control characters and `/ \ : * ? " < > |`;
strip trailing ` - Google Docs` / ` - Word` / `.pdf` / `.docx` / `.doc`; truncate to 120 characters; empty →
`"Untitled"`. Same name already in destination is allowed (reMarkable keeps both; spec edge case).

## DestinationFolder

Read-only view of a reMarkable collection: `{ id, name, parentId }`, listed on demand in options
and popup, not cached across sessions. If the stored `defaultFolder.id` no longer exists at send
time, the job falls back to root and sets `fellBackToRoot` (spec US6 scenario 3).
