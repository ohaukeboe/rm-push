# Feature Specification: Send to reMarkable from Firefox

**Feature Branch**: `001-send-to-remarkable`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "A Firefox browser extension for easily sending files to the reMarkable cloud. It should support Microsoft Word (online documents), Google Docs, and PDF files, and preferably also converting any website into a PDF and sending it. Local .docx files are out of scope."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect the extension to a reMarkable account (Priority: P1)

A user installs the extension and links it to their reMarkable cloud account once, using the
one-time pairing code that reMarkable issues from its account website. After that, the extension
stays connected across browser restarts until the user disconnects it.

**Why this priority**: Nothing else works without a connected account; it is the entry point
for every other story.

**Independent Test**: Install the extension, enter a valid pairing code, restart the browser,
and confirm the extension still reports the account as connected.

**Acceptance Scenarios**:

1. **Given** a freshly installed, unconnected extension, **When** the user opens it, **Then** it
   explains how to obtain a pairing code and offers a field to enter it.
2. **Given** the pairing screen, **When** the user enters a valid code, **Then** the extension
   shows the account as connected.
3. **Given** the pairing screen, **When** the user enters an invalid or expired code, **Then** the
   extension shows a clear error and stays unconnected.
4. **Given** a connected extension, **When** the user chooses "Disconnect", **Then** the stored
   credentials are removed and the extension returns to the unconnected state.

---

### User Story 2 - Send a PDF to the reMarkable (Priority: P1)

While viewing a PDF in the browser, or when right-clicking a link to a PDF, the user sends that
PDF to their reMarkable cloud with one action. It appears on the tablet under a sensible name.

**Why this priority**: PDF is the format the reMarkable reads natively and the most common thing
users want to send; it is the minimal viable product together with Story 1.

**Independent Test**: With a connected account, open a PDF tab, trigger "Send to reMarkable", and
confirm the document appears in the cloud with the expected name.

**Acceptance Scenarios**:

1. **Given** a connected extension and a tab showing a PDF, **When** the user triggers "Send to
   reMarkable", **Then** the PDF is uploaded and the user sees a success confirmation.
2. **Given** a web page with a link to a PDF, **When** the user right-clicks the link and chooses
   "Send to reMarkable", **Then** the linked PDF is uploaded without the user having to open it.
3. **Given** an upload in progress, **When** it fails (network error, service rejection),
   **Then** the user sees an error that says what went wrong and can retry.
4. **Given** an unconnected extension, **When** the user tries to send, **Then** the extension
   directs them to connect first instead of failing silently.

---

### User Story 3 - Send a web page (Priority: P2)

While reading any web page, the user sends it to their reMarkable so they can read and annotate
it on the tablet.

**Why this priority**: High everyday value (articles, documentation), but it is not needed for
the core PDF flow.

**Independent Test**: With a connected account, open an article page, trigger "Send to
reMarkable", and confirm a readable document of that page appears in the cloud.

**Acceptance Scenarios**:

1. **Given** a connected extension and an ordinary web page, **When** the user triggers "Send to
   reMarkable", **Then** a document of that page, titled after the page, appears in the cloud.
2. **Given** a page the user is logged in to (paywalled or private content they can see),
   **When** they send it, **Then** the document contains what the user sees, not a logged-out
   version.
3. **Given** a page from which no readable content can be produced, **When** the user sends it,
   **Then** the extension reports the failure rather than uploading an empty document.

4. **Given** a web page, **When** the user chooses the default "Send to reMarkable", **Then** a
   reflowable reading version (main text and images, re-laid-out to fit the tablet; navigation,
   ads and page chrome removed) is sent without any dialogs.
5. **Given** a web page, **When** the user chooses "Send as printed PDF", **Then** a PDF matching
   the browser's print output is sent. This flow may require the user to save the printed PDF
   and confirm the saved file; the extension guides them through each step.
6. **Given** the "Send as printed PDF" flow, **When** the user cancels the save or file
   confirmation, **Then** nothing is uploaded and no error is shown.

---

### User Story 4 - Send a Google Docs document (Priority: P2)

While editing or viewing a Google Docs document, the user sends it to their reMarkable as a PDF
that matches the document's layout.

**Why this priority**: Named as a required source by the user; common for work and study
documents.

**Independent Test**: With a connected account and a Google Doc the user can access, trigger
"Send to reMarkable" from the document tab, and confirm a PDF of the document appears in the
cloud.

**Acceptance Scenarios**:

1. **Given** a connected extension and an open Google Docs document the user can view, **When**
   they trigger "Send to reMarkable", **Then** a PDF of the full document (not just the visible
   part) is uploaded, titled after the document.
2. **Given** a Google Doc the user can view but whose owner has disabled download/export,
   **When** they send it, **Then** the extension reports that the document cannot be exported.

---

### User Story 5 - Send a Microsoft Word online document (Priority: P3)

While viewing a Word document in Word for the web (Microsoft 365 / OneDrive / SharePoint), the
user sends it to their reMarkable as a PDF.

**Why this priority**: Requested by the user, but the least certain to be achievable without
extra steps; delivered after the other sources.

**Independent Test**: With a connected account and a Word online document the user can access,
trigger "Send to reMarkable", and confirm a PDF of the document appears in the cloud.

**Acceptance Scenarios**:

1. **Given** a connected extension and an open Word online document, **When** the user triggers
   "Send to reMarkable", **Then** a PDF of the full document is uploaded, titled after the
   document.
2. **Given** a Word online document that cannot be exported for this user, **When** they send it,
   **Then** the extension reports why and suggests saving it as PDF manually.

---

### User Story 6 - Choose where documents land (Priority: P3)

The user picks a destination folder in their reMarkable cloud, either as a default for all sends
or for a single send, so sent documents don't clutter the top level.

**Why this priority**: Convenience; the feature is usable with everything landing in one place.

**Independent Test**: Set a default folder, send a PDF, and confirm it lands in that folder.

**Acceptance Scenarios**:

1. **Given** no folder preference, **When** the user sends a document, **Then** it lands in the
   top level of their cloud.
2. **Given** a default folder is set, **When** the user sends a document, **Then** it lands in
   that folder.
3. **Given** the default folder was deleted on the tablet, **When** the user sends a document,
   **Then** the extension tells them and falls back to the top level instead of losing the
   document.

---

### Edge Cases

- A document with the same name already exists in the destination: the new one is added
  alongside it, never replacing it.
- The PDF or document is larger than the cloud service accepts: the user gets a size error before
  or during upload, not a silent failure.
- The account's pairing is revoked from the reMarkable website while the extension is connected:
  the next send fails with a message telling the user to reconnect.
- The user triggers several sends quickly: each one completes or fails independently and gets its
  own notification.
- The current tab is a browser-internal page (settings, new tab, extension pages): the send
  action is unavailable or explains that the page cannot be sent.
- The PDF link requires a login the user has in the browser: the download uses the user's session
  so the file is fetched successfully.
- The reMarkable cloud changes its interface and uploads start failing: the user sees an error
  that points at the service, not a generic crash.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The extension MUST run in desktop Firefox.
- **FR-002**: Users MUST be able to connect the extension to their reMarkable cloud account using a
  one-time pairing code issued by reMarkable, and the connection MUST persist across browser
  restarts.
- **FR-003**: Users MUST be able to disconnect, which MUST delete all stored account credentials.
- **FR-004**: Users MUST be able to send the PDF shown in the current tab with a single action from
  the toolbar.
- **FR-005**: Users MUST be able to send a linked PDF from the right-click menu on the link without
  opening it.
- **FR-006**: Users MUST be able to send the current web page as a reflowable reading version;
  this MUST be the default action for ordinary web pages.
- **FR-006a**: Users MUST be able to send the current web page as a print-faithful PDF through a
  separate, explicitly chosen action.
- **FR-007**: Users MUST be able to send the currently open Google Docs document as a PDF of the
  whole document.
- **FR-008**: Users MUST be able to send the currently open Word for the web document as a PDF of
  the whole document.
- **FR-009**: The extension MUST choose the send behavior from the type of the current tab (PDF,
  Google Docs, Word online, other web page) so the user does not have to pick a format by hand.
- **FR-010**: Sent documents MUST be named after the page, document or file title, with characters
  the tablet cannot display removed.
- **FR-011**: The extension MUST show progress while a send is in progress and a success or failure
  notification when it ends; failures MUST say what went wrong in plain language.
- **FR-012**: Users MUST be able to set a default destination folder, and choose a different
  folder for an individual send.
- **FR-013**: Fetching source content (PDF links, Google Docs, Word online, web pages) MUST use the
  user's existing browser session, so content they can see is the content that gets sent.
- **FR-014**: The extension MUST NOT send any document or credential anywhere except the
  reMarkable cloud and the site the document came from; no third-party conversion service.
- **FR-015**: Sending a local Word (.docx) file from disk is out of scope.

### Key Entities

- **Account connection**: The link between the extension and one reMarkable cloud account; holds
  the long-lived credential obtained from the pairing code and its connected/disconnected state.
- **Send job**: One request to send one source to the cloud; has a source (tab or link), a detected
  source type, a document title, a destination folder, and a status (in progress, succeeded,
  failed with reason).
- **Destination folder**: A folder in the user's reMarkable cloud; the user's default is stored as a
  preference.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can install the extension, connect their account and send their first PDF
  in under 2 minutes.
- **SC-002**: Sending an open PDF, Google Doc or web page (reflowable) takes at most 2 user
  actions (for example click the toolbar button, confirm). Sending a print-faithful PDF takes at
  most 5 user actions.
- **SC-003**: A typical document (under 10 MB) appears in the reMarkable cloud within 15 seconds of
  the user triggering the send on a normal broadband connection.
- **SC-004**: 100% of failed sends produce a visible notification with a reason; none fail silently.
- **SC-005**: Sent Google Docs and Word online documents have the same page count and layout as the
  source service's own "download as PDF".
- **SC-006**: Once connected, the user does not need to reconnect over at least 30 days of normal
  use.

## Assumptions

- Target is desktop Firefox only; Firefox for Android and other browsers are out of scope for v1.
- The user already has a reMarkable account with cloud sync enabled; the extension does not
  create accounts or manage subscriptions.
- One reMarkable account per browser profile.
- The reMarkable cloud interface is unofficial and may change; the extension relies on an
  actively maintained third-party implementation of it rather than its own, and accepts
  occasional breakage until that dependency is updated.
- The reMarkable cloud accepts PDF and EPUB documents; Word and Google Docs content is therefore
  sent as PDF.
- Google Docs and Word online documents are sent in their current saved state; unsaved local edits
  are not guaranteed to be included.
- Only "Microsoft Word" in the browser (Word for the web) is in scope; Excel, PowerPoint, Google
  Sheets and Google Slides are out of scope for v1.
- Default destination is the top level of the user's cloud until they set a folder.
- Logged-in sessions are taken from the browser's default container; sessions that exist only in
  Firefox Multi-Account Containers are not used in v1.
- Direct Word export is supported for work/school documents (SharePoint / OneDrive for
  Business). Personal OneDrive documents use the guided fallback of User Story 5 scenario 2.
