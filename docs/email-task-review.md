# Email task review

Email-created tasks now go through a review panel in TaskBoard rather than silently taking quick-add defaults.

## Workflow

1. In ChatGPT, ask in normal language for the Outlook email or thread, for example: “Find the email about the SRI pro forma.” The connected Outlook tools search and read the message. Prepare a concise task summary, keeping inferred facts, suggested owners, and uncertain deadlines explicit.
2. Open the **Review in TaskBoard** link supplied by ChatGPT. The review panel opens with the proposed task and source email link; no email-file saving, uploading, or JSON pasting is required. Sign in to TaskBoard with your normal account if needed. This is a browser handoff, not a direct database write from ChatGPT.
3. Edit the title, notes, owner, team, project, status, priority, due date, reminder, and source email. Owner/project dropdowns use the signed-in account's current available records. Suggested names do not automatically select records. No new person or project is created from imported text.
4. Choose an actual date or **No due date**; choose a reminder time or **No reminder**. A task must have at least one owner or team. **No project** is an explicit option.
5. Review the full panel, check the confirmation, and select **Confirm & create task**. Any edit clears the confirmation. Selecting or importing an email never creates a task by itself.

Example draft (illustrative, not a real email):

```json
{
  "version": 1,
  "title": "Confirm vendor shipment and arrival",
  "description": "Confirm that the supplier accepted the corrected order and obtain shipment status. Delivery has not been established.",
  "suggestedOwner": "Purchasing contact",
  "suggestedProject": "Vendor follow-ups",
  "dueDate": null,
  "status": "waiting",
  "priority": "normal",
  "source": {
    "subject": "Initial stocking order",
    "from": "Vendor contact",
    "receivedAt": "Date from the source email"
  }
}
```

Add the real HTTPS Outlook message URL to `source.url`, or attach the original email in the panel. Only `outlook.office.com`, `outlook.office365.com`, and `outlook.live.com` source link hosts are accepted; URLs containing credentials are rejected. Dates use `YYYY-MM-DD`. Owner and project fields are suggestions rather than identifiers, and unknown JSON fields are rejected.

### Creating the one-click handoff

Use `emailTaskReviewUrl(verifiedTaskBoardUrl, draft)` from `src/lib/emailTaskDraft.ts`. The confirmed main project domain is `https://graymills-taskboard.vercel.app/`; use the actual branch preview URL during acceptance testing. Present the generated URL as a **Review in TaskBoard** link. Never use the separate SEO MCP or auth service as the destination.

Only put the concise task proposal and email metadata/link in the draft; omit the complete thread and its attachments. The helper validates the draft and places it in a URL fragment capped at 12,000 characters. The browser reads that fragment after the TaskBoard review component mounts for the signed-in user, clears it from the current address/history entry, and opens an unsaved review. A malformed or unrecognized payload cannot create a task. An incoming link cannot replace an active draft without confirmation. The link itself contains the proposal, so treat it as private; fragment handling is not encryption.

TaskBoard does not independently search Microsoft Graph or have its own natural-language Outlook search box in this version. Natural-language search uses the existing connected Outlook app in ChatGPT. A search box inside TaskBoard would require a separately implemented mailbox authorization and search flow.

Saved-email files and manual JSON remain optional fallback inputs under the panel's secondary controls. Files are attached as originals; the app does not parse their bodies.

## Permissions and reliability

Creation uses the existing signed-in TaskBoard Supabase client and existing row-level policies. This change adds no elevated database credentials, policies, migrations, direct Outlook mailbox access, or write tools to the SEO connector. No task or email was created or changed during automated verification.

Task, assignment, file, and activity writes use the existing separate operations. They are not a database transaction. If follow-up operations fail after the task has been inserted, the panel returns the created task reference and a warning instead of offering to create that task again. Correct the existing task in TaskBoard.

A review gets a fixed client-generated task UUID. Retries reuse it and never upsert/overwrite an existing task. If the insert result is uncertain, the app tries to find that same record. An unresolved lookup tells the user to check TaskBoard before retrying. Starting a separate review can still create a separate task for the same email; cross-session/email deduplication is not implemented.

The source link and email metadata are saved as plain text in the task description. Outlook still controls access to the linked email. Selecting a message file does not automatically copy its separate attachments into TaskBoard.

## Verification

- `npm run test:email-review`: draft and link validation, Unicode handoff, automatic review without writes, fragment removal, source retention, confirmation gating, dropdown values, reconfirmation after edits, rapid double submission, stable retry IDs, partial-success display, and file/cancel behavior, using the real React component in JSDOM.
- `npx tsc --noEmit`.
- `npx eslint src/components/EmailTaskReview.tsx src/lib/emailTaskDraft.ts`.
- Production Next.js build with inert public Supabase placeholders.

The existing main page has two pre-existing `react-hooks/set-state-in-effect` lint errors and six warnings; this change does not modify those effects. Full-page lint is not clean. A real browser could not launch in the execution environment, so visual/mobile and signed-in live database acceptance remain to be checked on an authenticated preview. Production has not been deployed as part of this change.
