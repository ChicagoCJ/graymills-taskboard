# Graymills TaskBoard for Outlook desktop

Pilot flow: select an email in Outlook → **Create TaskBoard task** → **Review task in TaskBoard** → choose the fields and confirm. No email files, uploads, mailbox search box, or ChatGPT round-trip are required. Review opens in the normal browser so it can use the existing TaskBoard login and full-width form.

This is a read-item Office add-in with an XML add-in-only manifest, targeting the message-read surface in classic Outlook for Windows and other compatible Office clients. It reads the selected message's subject, sender, identifier, and a bounded plain-text excerpt. It does not fetch attachments, request mailbox-wide Graph scopes or legacy Exchange tokens, change read state or categories, move/delete messages, or send email. TaskBoard performs the actual task creation under its existing user session and RLS after confirmation.

## Hosting and pilot setup

The static assets must be reachable by Office over HTTPS without a Vercel sign-in wall. Host only this directory on the separate `graymills-taskboard-outlook-test` project; do not remove protection from TaskBoard or the OAuth services. No Supabase keys or other credentials belong in this directory.

`config.js` points to the existing TaskBoard review-branch alias for pilot testing. A normal TaskBoard user may create a real task there after confirmation; this is not an isolated test database. The source email link opens in Outlook on the web; validate the link for the user's mailbox during acceptance.

The connected Vercel account returned HTTP 403 for creation of the separate project, so hosting used the operator's Windows CLI login with `scripts/deploy-outlook-addin.ps1`. On November 24, 2026, the operator confirmed successful deployment and public asset/manifest checks at `https://graymills-taskboard-outlook-test.vercel.app`. One-time Outlook installation and desktop acceptance testing remain pending. The script is restricted to the named new project and exact team, checks any existing folder link, and never patches the main TaskBoard or OAuth projects.

From the Windows TaskBoard repository after fetching and switching to `feature/email-task-review`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-outlook-addin.ps1
```

## One-time Outlook installation, after hosting succeeds

1. Open https://aka.ms/olksideload while signed into the Microsoft 365 account used in Outlook desktop. Classic Outlook also provides **File → Info → Manage Add-ins**.
2. Choose **My add-ins → Add a custom add-in → Add from File** and select this directory's `manifest.xml`. This installs the add-in once; it is not an email upload.
3. Review the read-item permission and install. If the tenant blocks user-installed add-ins, the Microsoft 365 administrator must deploy/approve this manifest through the organization's supported process. Do not bypass tenant policy.
4. Restart Outlook if needed, select a received email with the reading pane enabled, and use **Create TaskBoard task** in the TaskBoard ribbon group (or the client's Apps/add-ins menu).
5. Confirm the pane shows the correct subject/sender. Open the TaskBoard review and inspect the fields and source link. Verify that nothing is saved before confirmation; then create an explicitly selected test task if authorized and verify its assignment and dates.

Natural-language Outlook search remains available in ChatGPT through its existing Outlook connection. This add-in is the independent desktop path for a message already selected in Outlook.

## Validation

- `node --test tests/outlook-addin.test.mjs` from the repository root checks message conversion, size limits, source ID escaping, selected-item races, missing-body handling, and read-only command scope.
- `npm run test:email-review` exercises the receiving form and its confirmation gate.
- `npx office-addin-manifest validate outlook-addin/manifest.xml` checks the manifest with Microsoft's validator. Public asset availability and actual client installation are separate acceptance checks.
- The handoff uses a bounded URL fragment with a short excerpt, never a query parameter or bearer token. Treat the review URL as private; the browser fragment is not encryption. The receiving TaskBoard form validates the payload and clears the fragment from the current address.

## Microsoft references

- https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/understanding-outlook-add-in-permissions
- https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/sideload-outlook-add-ins-for-testing
- https://learn.microsoft.com/en-us/office/dev/add-ins/testing/troubleshoot-manifest
- https://learn.microsoft.com/en-us/javascript/api/outlook/office.messageread
- https://learn.microsoft.com/en-us/javascript/api/office/office.ui
