import { z } from "zod";

export const emailTaskStatuses = [
  ["backlog", "Backlog"], ["todo", "To Do"],
  ["in_progress", "In Progress"], ["waiting", "Waiting"],
  ["review", "Review"], ["done", "Done"],
] as const;
export const emailTaskPriorities = ["low", "normal", "high", "urgent"] as const;

export function isOutlookMessageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      ["outlook.office.com", "outlook.office365.com", "outlook.live.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a real calendar date.");

export const emailTaskDraftSchema = z.object({
  version: z.literal(1),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20000).default(""),
  suggestedOwner: z.string().max(200).optional(),
  suggestedProject: z.string().max(200).optional(),
  dueDate: dateOnly.nullable().optional(),
  status: z.enum(["backlog", "todo", "in_progress", "waiting", "review", "done"]).optional(),
  priority: z.enum(emailTaskPriorities).optional(),
  source: z.object({
    subject: z.string().trim().min(1).max(500),
    from: z.string().max(300).optional(),
    receivedAt: z.string().max(100).optional(),
    url: z.string().max(4000).refine(isOutlookMessageUrl, "Use an HTTPS Outlook message link.").optional(),
  }).strict(),
}).strict();

export type EmailTaskDraft = z.infer<typeof emailTaskDraftSchema>;
export type ReviewedEmailTask = {
  title: string;
  description: string;
  profileId: string;
  teamId: string;
  projectId: string;
  status: string;
  priority: string;
  dueDate: string;
  reminderAt: string;
  reminderNote: string;
  source: EmailTaskDraft["source"];
};

export function parseEmailTaskDraft(text: string): EmailTaskDraft {
  if (text.length > 32000) throw new Error("The email task draft is too large.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Paste the email task JSON provided by ChatGPT.");
  }
  const parsed = emailTaskDraftSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid email task draft.");
  return parsed.data;
}

const reviewHashPrefix = "#email-task=";

export function emailTaskReviewUrl(baseUrl: string, draft: EmailTaskDraft) {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Use the verified HTTPS TaskBoard address.");
  }
  // The fragment is consumed in the browser, not sent in the page request.
  const validated = parseEmailTaskDraft(JSON.stringify(draft));
  const hash = reviewHashPrefix + encodeURIComponent(JSON.stringify(validated));
  if (hash.length > 12000) throw new Error("Keep the task summary shorter for a review link.");
  url.hash = hash;
  return url.toString();
}

export function emailTaskDraftFromHash(hash: string): EmailTaskDraft | null {
  if (!hash.startsWith(reviewHashPrefix)) return null;
  if (hash.length > 12000) throw new Error("This email task review link is too large.");
  try {
    return parseEmailTaskDraft(decodeURIComponent(hash.slice(reviewHashPrefix.length)));
  } catch (error) {
    throw new Error(error instanceof URIError ? "This email task review link is invalid." : (error as Error).message);
  }
}

export function emailTaskDescription(task: ReviewedEmailTask) {
  return [task.description.trim(), "Source email", `Subject: ${task.source.subject}`,
    task.source.from ? `From: ${task.source.from}` : "",
    task.source.receivedAt ? `Received: ${task.source.receivedAt}` : "",
    task.source.url ? `Open in Outlook: ${task.source.url}` : "",
  ].filter(Boolean).join("\n\n");
}
