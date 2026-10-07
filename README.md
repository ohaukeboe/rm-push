# rm-push

A Firefox extension that sends documents to your reMarkable tablet through the reMarkable cloud.

- **PDFs**: the PDF open in the current tab, a linked PDF (right-click the link), or a file you
  pick.
- **Web pages**: sent as a clean, reflowable EPUB with the page's main text and images. Use
  "Send as printed PDF" instead to get exactly what Firefox's print would produce.
- **Google Docs**: the whole document, exported as PDF.
- **Word for the web**: documents in SharePoint or OneDrive for work or school are exported as
  PDF. For personal OneDrive, the extension walks you through downloading a PDF and then sends it.
- **Folders**: choose a default destination folder, or a different folder for each send.

The extension needs no server or companion app. It talks to the reMarkable cloud with the bundled
[rmapi-js](https://github.com/erikbrinkman/rmapi-js) library.

## Install

Requires Firefox 142 or newer on desktop.

For development, see [Development](#development) and use `bun run dev`. You can also load
`dist/manifest.json` from `about:debugging` → *This Firefox* → *Load Temporary Add-on…*.

## Connect your account

1. Open the extension's options (toolbar button → *Connect*).
2. Visit <https://my.remarkable.com/device/browser/connect>, sign in and copy the 8-letter code.
3. Paste the code and click *Connect*.

The extension stores the resulting device token in Firefox's local extension storage. To revoke
it, click *Disconnect* in the options. You can also remove the device on my.remarkable.com.

## Permissions

| Permission | Why |
|---|---|
| reMarkable cloud hosts | Pair the extension and upload documents (always required) |
| `activeTab`, `scripting` | Read the current tab when you click *Send*; extract a page's article text |
| `menus`, `notifications`, `storage` | Context-menu entries, send results, your settings |
| Google Docs *(optional)* | Download Google Docs as PDF with your Google session |
| Microsoft SharePoint *(optional)* | Convert Word documents to PDF with your work or school session |
| All websites *(optional)* | Send linked PDFs from other sites and include images in web pages |

Optional access is requested the first time you use a feature that needs it. You can grant or
revoke it at any time in the options. The extension sends your documents only to the reMarkable
cloud and fetches them only from the site they came from.

## Known limitations

- The reMarkable cloud API is unofficial. If reMarkable changes it, sending can break until the
  extension (via rmapi-js) is updated. Sending to the top level uses the same simple API as
  reMarkable's own extension and is the most robust path. Sending into a folder uses the full
  sync protocol.
- Firefox Multi-Account Containers are not supported. Documents are fetched with the session from
  the default container.
- Personal OneDrive documents cannot be converted directly. Use the guided *Download as PDF* step.
- "Send as printed PDF" needs two extra steps: Firefox always shows a save dialog, and then you
  pick the saved file.
- Firefox for Android is not supported.

## Development

All tools come from `shell.nix`. Run everything inside `nix-shell`:

```bash
nix-shell
bun install --frozen-lockfile
bun run ci      # lint, type check, unit + integration tests, build, E2E in headless Firefox, package
bun run dev     # run the extension in Firefox
```

The design documents (spec, plan, research, contracts) are in `specs/001-send-to-remarkable/`.
