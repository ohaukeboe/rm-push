# Contract: Ports (adapter interfaces)

Business logic depends only on these interfaces (constitution III). Each has one production
adapter (thin wrapper around `browser.*` or `rmapi-js`) and one in-memory fake used by unit and
integration tests. The fakes are part of the test suite and must pass the same contract tests
as the real adapters where a real adapter can be exercised (E2E or fake-server integration).

## RemarkablePort (`src/adapters/remarkable.ts`, wraps rmapi-js)

```text
register(code: string): Promise<{ deviceToken, deviceId }>
  errors: InvalidCode, Network, Service(status)

upload(deviceToken, doc: { name, bytes: Uint8Array, kind: "pdf" | "epub" },
       folderId: string | null): Promise<{ id, fellBackToRoot: boolean }>
  folderId null  -> uploadPdf / uploadEpub (simple API, root)
  folderId set   -> putPdf / putEpub with parent; on non-auth, non-network failure,
                    retry once via simple API at root and return fellBackToRoot = true
  errors: AuthRejected, Network, TooLarge, Service(status)

listFolders(deviceToken): Promise<DestinationFolder[]>
  errors: AuthRejected, Network, Service(status)
```

Hosts (`authHost`, `rawHost`, `uploadHost`) are injected at construction; production uses
rmapi-js defaults, tests and the E2E build use the fake server URL. Session tokens are obtained
and cached inside the adapter through `SessionStore`.

## BrowserPorts (`src/adapters/browser/*.ts`)

```text
Storage        get(key) / set(key, value) / remove(key), area: "local" | "session"
Tabs           activeTab(): { id, url, title }      saveAsPdf(fileName): SaveStatus
               openExtensionPage(path, query)
Scripting      runExtract(tabId): ExtractResult
Permissions    contains(origins): boolean            (request is UI-only, see messages.md)
Notifier       notify({ id, title, message, onClickPage? })
Menus          register(items, onClick)              (called from runtime.onInstalled)
Http           fetch(url, init): Response            (background fetch, credentials: include)
ImageCodec     toRaster(bytes, mime, maxW, maxH): { bytes, mime: "image/png" | "image/jpeg" }
```

## Source fetchers (pure orchestration over ports)

```text
fetchPdfFromUrl(http, url)                       -> Uint8Array | SendError
exportGoogleDoc(http, docId, accountIndex?)      -> Uint8Array | SendError
exportSharepointWord(http, siteUrl, fileGuid)    -> Uint8Array | SendError
buildReadableEpub(extract, http, imageCodec)     -> Uint8Array | SendError
```

HTTP status mapping shared by all fetchers: 401 or redirect to a login host → `not-logged-in`;
403 → `export-forbidden`; other 4xx/5xx → `service-error`; thrown fetch → `network`.
