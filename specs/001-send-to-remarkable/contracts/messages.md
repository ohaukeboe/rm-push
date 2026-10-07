# Contract: Extension messages

Messages between extension contexts (constitution III). Every message is validated with a zod
schema at the **receiving** end; an invalid message is rejected with
`{ ok: false, error: { kind: "bad-message" } }` and never acted on. Schemas live in
`src/core/messages.ts` and each has unit tests for accept and reject cases.

Transport: `browser.runtime.sendMessage` (popup/options/upload page → background) and the return
value of `scripting.executeScript` (content script → background).

## Popup / options / upload page → background

All requests carry `type`; all responses are `{ ok: true, ... } | { ok: false, error: SendError }`
(`SendError` from [data-model.md](../data-model.md)).

| `type` | Request fields | Response (ok) |
|---|---|---|
| `status` | `tabId?: number` | `{ connection: "disconnected" \| "connected" \| "needs-reconnect", defaultFolder, current: { sourceKind, title } \| null, recentJobs: SendJob[] }` |
| `pair` | `code: string` (8 letters) | `{}` |
| `disconnect` | none | `{}` |
| `list-folders` | none | `{ folders: DestinationFolder[] }` |
| `set-default-folder` | `folder: { id, name } \| null` | `{}` |
| `send-current` | `mode: "auto" \| "print"`, `tabId?: number`, `folder?: { id, name } \| null` | `{ jobId }` |
| `send-file` | `name: string`, `bytes: ArrayBuffer`, `mime: "application/pdf" \| "application/epub+zip"`, `folder?` | `{ jobId }` |

Notes:
- `tabId` is the active tab of the popup's window (the popup queries it itself); when absent the
  background uses the active tab of the last focused window. E2E tests pass it explicitly.
- `send-current` returns as soon as the job starts; completion is reported by notification and
  via `status.recentJobs`.
- `send-file` payloads above 100 MB are rejected before upload with `too-large`.
- Permission requests (`permissions.request`) are made by the UI page in the click handler
  (user gesture), never by the background.

## Content script → background (return value of injected `extract` function)

```text
ExtractResult =
  | { ok: true, title: string, byline: string | null, lang: string | null,
      html: string,                 // Readability output, not yet sanitised
      baseUrl: string,              // document.baseURI
      imageUrls: string[] }         // absolute URLs referenced by <img> in html
  | { ok: false, reason: "no-readable-content" }
```

Limits checked by the background: `html` ≤ 20 MB, `imageUrls` ≤ 500 entries, every URL
`http(s)` or `data:`; otherwise treated as `no-readable-content`.

## Background → UI

No push messages. UI polls `status` when opened. Notifications (`browser.notifications.create`,
type `basic`) carry the job outcome; clicking a failure notification for `permission-denied` or
`not-connected` opens the options page.
