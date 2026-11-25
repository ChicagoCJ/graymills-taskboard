import { TASKBOARD_URL } from "./config.js";
import { readSelectedMessage, reviewLink } from "./handoff.js";

const status = document.getElementById("status");
const review = document.getElementById("review");
let draft = null;
let itemId = "";

async function loadMessage() {
  review.disabled = true;
  draft = null;
  try {
    draft = await readSelectedMessage(window.Office);
    itemId = window.Office.context.mailbox.item.itemId;
    document.getElementById("subject").textContent = draft.source.subject;
    document.getElementById("sender").textContent = draft.source.from;
    status.textContent = "Ready. You’ll review the details before creating a task.";
    review.disabled = false;
  } catch (error) {
    status.textContent = error.message || "Could not read the selected email.";
  }
}

review.addEventListener("click", () => {
  if (!draft) return;
  if (window.Office.context.mailbox.item?.itemId !== itemId) {
    status.textContent = "The selected email changed. Loading the current selection…";
    void loadMessage();
    return;
  }
  try {
    const url = reviewLink(TASKBOARD_URL, draft);
    if (window.Office.context.requirements.isSetSupported("OpenBrowserWindowApi", "1.1")) {
      window.Office.context.ui.openBrowserWindow(url);
    } else {
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      // With noopener the browser may return null even when opening succeeds.
      void opened;
    }
    status.textContent = "TaskBoard review opened in your browser. Sign in with your normal TaskBoard account if prompted.";
  } catch (error) { status.textContent = error.message || "Could not open TaskBoard."; }
});

if (!window.Office) status.textContent = "Open this add-in from a selected email in Outlook.";
else window.Office.onReady(info => {
  if (info.host !== window.Office.HostType.Outlook) { status.textContent = "This add-in opens from Outlook."; return; }
  void loadMessage();
});
