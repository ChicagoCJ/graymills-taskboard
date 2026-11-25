export function draftFromMessage(message, bodyText, restId) {
  if (!message || !message.itemId || !restId) throw new Error("Open a saved email in Outlook first.");
  const subject = String(message.subject || "Email follow-up").trim().slice(0, 500) || "Email follow-up";
  const sender = message.from || message.sender || {};
  const from = [sender.displayName, sender.emailAddress ? `<${sender.emailAddress}>` : ""].filter(Boolean).join(" ").slice(0, 300);
  return {
    version: 1,
    title: subject.slice(0, 300),
    description: bodyText ? `Email excerpt — review and enter the next action:\n\n${String(bodyText).slice(0, 1800)}` : "Review this email and enter the next action.",
    source: {
      subject,
      from,
      url: `https://outlook.office365.com/owa/?ItemID=${encodeURIComponent(restId)}&exvsurl=1&viewmodel=ReadMessageItem`,
    },
  };
}

export function reviewLink(baseUrl, original) {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" || base.username || base.password) throw new Error("The TaskBoard address must use HTTPS.");
  const draft = { ...original };
  let encoded = encodeURIComponent(JSON.stringify(draft));
  // Some languages take more bytes per character. Fit the same receiving limit.
  while (encoded.length > 11500 && draft.description.length > 100) {
    draft.description = draft.description.slice(0, Math.floor(draft.description.length * 0.75));
    encoded = encodeURIComponent(JSON.stringify(draft));
  }
  if (encoded.length > 11500) throw new Error("This email has too much metadata for a review link.");
  base.hash = "email-task=" + encoded;
  return base.toString();
}

export function readSelectedMessage(office) {
  const mailbox = office?.context?.mailbox;
  const item = mailbox?.item;
  if (!item?.itemId || !item?.body?.getAsync) return Promise.reject(new Error("Select an email in Outlook’s reading pane, then reopen TaskBoard."));
  if (!mailbox.convertToRestId) return Promise.reject(new Error("This Outlook version cannot create the email link. Update Outlook and try again."));
  const restId = mailbox.convertToRestId(item.itemId, office.MailboxEnums.RestVersion.v2_0);
  return new Promise((resolve, reject) => {
    item.body.getAsync(office.CoercionType.Text, result => {
      // Do not silently send the wrong message if the user switches selection mid-read.
      if (mailbox.item?.itemId !== item.itemId) { reject(new Error("The selected email changed. Reopen TaskBoard for the email you want.")); return; }
      const text = result.status === office.AsyncResultStatus.Succeeded ? result.value : "";
      resolve(draftFromMessage(item, text, restId));
    });
  });
}
