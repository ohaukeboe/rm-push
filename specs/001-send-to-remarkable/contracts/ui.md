# Contract: User-facing surfaces

## Toolbar button (action popup)

| State | Shows |
|---|---|
| Disconnected / needs reconnect | Explanation + "Connect" button → options page |
| Connected, sendable tab | Detected type ("PDF", "Google Doc", "Word document", "Web page"), title, destination selector (default folder preselected), **Send** button; for web pages also **Send as printed PDF** |
| Connected, unsendable tab | "This page cannot be sent." + **Upload a file…** link |
| Any | Last 5 jobs with status; **Upload a file…** link |

Send from popup = 2 actions (open popup, click Send) — SC-002.

## Context menus (`menus`)

| Context | Title | Action |
|---|---|---|
| `link` (any link) | Send linked PDF to reMarkable | `pdf-url` job for the link target |
| `page` | Send page to reMarkable | `send-current` mode `auto` |
| `page` | Send page to reMarkable as printed PDF | `send-current` mode `print` |
| `action` | Upload a file… | open Upload-a-file page |

## Options page (`options.html`)

- Pairing: link to `https://my.remarkable.com/device/browser/connect`, 8-letter code field,
  **Connect** button, error text on failure.
- Connected state: connected-since date, **Disconnect** button.
- Default folder: dropdown loaded via `list-folders` (root first); **Refresh**.
- Site access: per optional permission group a **Grant** / **Revoke** button with the reason
  text from research R8.

## Upload-a-file page (`upload.html`, extension tab)

- Query parameters: `expected=<filename>` (after print save), `reason=print|word|file`.
- Large drop zone + file input accepting `.pdf,.epub`.
- Reason-specific instructions (e.g. Word fallback steps: "File → Export → Download as PDF").
- After upload: success state and "Close tab" button. Cancel = close tab; nothing uploaded.

## Notifications

`basic` type only. Success: "Sent “<title>” to reMarkable[ (folder <name>)]." plus
" Folder not found, sent to top level." when `fellBackToRoot`. Failure: message from the
`SendError` table in [data-model.md](../data-model.md). Canceled jobs produce no notification.
