"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  emailTaskPriorities, emailTaskStatuses, isOutlookMessageUrl,
  parseEmailTaskDraft, emailTaskDraftFromHash, type EmailTaskDraft, type ReviewedEmailTask,
} from "@/lib/emailTaskDraft";

type Option = { id: string; name: string };
type Props = {
  projects: Option[];
  people: Option[];
  teams: Option[];
  onCreate: (task: ReviewedEmailTask, file: File | null, requestId: string) => Promise<{ taskId: string; warning?: string }>;
};
const inputStyle = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const labelStyle = "block text-xs font-semibold text-slate-700";

export default function EmailTaskReview({ projects, people, teams, onCreate }: Props) {
  const [json, setJson] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<EmailTaskDraft | null>(null);
  const [task, setTask] = useState<ReviewedEmailTask | null>(null);
  const [dueChoice, setDueChoice] = useState("");
  const [reminderChoice, setReminderChoice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ taskId: string; warning?: string } | null>(null);
  const saving = useRef(false);
  const requestId = useRef("");
  const draftActive = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const prepare = useCallback((next: EmailTaskDraft, emailFile: File | null) => {
    draftActive.current = true;
    setDraft(next);
    requestId.current = crypto.randomUUID();
    setFile(emailFile);
    // Suggested names remain visible, but never silently select a person or project.
    setTask({ title: next.title, description: next.description, profileId: "", teamId: "__none__",
      projectId: "", status: next.status || "", priority: next.priority || "",
      dueDate: next.dueDate || "", reminderAt: "", reminderNote: "", source: { ...next.source } });
    setDueChoice(next.dueDate ? "date" : "");
    setReminderChoice("");
    setConfirmed(false);
    setResult(null);
    setMessage("");
  }, []);

  useEffect(() => {
    let active = true;
    function receiveReviewLink() {
      if (!active || saving.current) return;
      try {
        const next = emailTaskDraftFromHash(window.location.hash);
        if (!next) return;
        if (draftActive.current && !window.confirm("Replace the current email task draft with this one?")) return;
        // Remove the summary from this history entry once it is in the review form.
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
        prepare(next, null);
        document.getElementById("email-task-review")?.scrollIntoView?.({ block: "start" });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not open this task draft.");
      }
    }
    queueMicrotask(receiveReviewLink);
    window.addEventListener("hashchange", receiveReviewLink);
    return () => { active = false; window.removeEventListener("hashchange", receiveReviewLink); };
  }, [prepare]);

  function chooseFile(next: File | null) {
    if (!next) return;
    if (!/\.(msg|eml)$/i.test(next.name)) { setMessage("Choose a saved .msg or .eml email."); return; }
    if (next.size > 20 * 1024 * 1024) { setMessage("Choose an email file smaller than 20 MB."); return; }
    if (task) { setFile(next); setConfirmed(false); setMessage(""); return; }
    prepare({ version: 1, title: next.name.replace(/\.(msg|eml)$/i, ""), description: "",
      source: { subject: next.name.replace(/\.(msg|eml)$/i, "") } }, next);
  }

  function patch(values: Partial<ReviewedEmailTask>) {
    setTask((current) => current ? { ...current, ...values } : null);
    setConfirmed(false);
    setMessage("");
  }

  function validationError() {
    if (!task || !task.title.trim()) return "Enter a task title.";
    if (!task.projectId || (task.projectId !== "__none__" && !projects.some(p => p.id === task.projectId))) return "Choose a project or explicitly choose No project.";
    if (!task.profileId || (task.profileId !== "__none__" && !people.some(p => p.id === task.profileId))) return "Choose an owner or Team only.";
    if (task.teamId !== "__none__" && !teams.some(t => t.id === task.teamId)) return "Choose an available team.";
    if (task.profileId === "__none__" && task.teamId === "__none__") return "Choose at least one owner or team.";
    if (!emailTaskStatuses.some(s => s[0] === task.status)) return "Choose a status.";
    if (!emailTaskPriorities.some(p => p === task.priority)) return "Choose a priority.";
    if (!dueChoice) return "Choose a due date or No due date.";
    if (dueChoice === "date") {
      const date = new Date(`${task.dueDate}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate) || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== task.dueDate) return "Choose a valid due date.";
    }
    if (!reminderChoice || (reminderChoice === "date" && (!task.reminderAt || Number.isNaN(new Date(task.reminderAt).valueOf())))) return "Choose a reminder time or No reminder.";
    if (!task.source.subject.trim()) return "Enter the source email subject.";
    if (task.source.url && !isOutlookMessageUrl(task.source.url)) return "Use an HTTPS Outlook message link.";
    if (!task.source.url && !file) return "Add the Outlook message link or attach the original email.";
    return "";
  }

  async function create() {
    if (saving.current || result) return;
    const error = validationError();
    if (error || !confirmed || !task) { setMessage(error || "Confirm that you reviewed all task details."); return; }
    saving.current = true;
    setBusy(true);
    setMessage("");
    try {
      setResult(await onCreate({ ...task, profileId: task.profileId === "__none__" ? "" : task.profileId,
        projectId: task.projectId === "__none__" ? "" : task.projectId,
        teamId: task.teamId === "__none__" ? "" : task.teamId,
        title: task.title.trim(), dueDate: dueChoice === "none" ? "" : task.dueDate,
        reminderAt: reminderChoice === "none" ? "" : task.reminderAt,
        reminderNote: reminderChoice === "none" ? "" : task.reminderNote }, file, requestId.current));
      setConfirmed(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the email task.");
      setConfirmed(false);
    } finally { saving.current = false; setBusy(false); }
  }

  return <section id="email-task-review" className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-labelledby="email-task-heading">
    <h3 id="email-task-heading" className="font-semibold text-slate-950">Create task from email</h3>
    <p className="mt-1 text-sm text-slate-600">Ask ChatGPT to find an Outlook email, then open its TaskBoard review link. Review every detail here before creating the task.</p>
    {!task && <details className="mt-4 space-y-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">Other ways to open a draft</summary>
      <label className={labelStyle}>Paste a task draft from ChatGPT
        <textarea className={inputStyle} rows={4} value={json} maxLength={32000} onChange={e => setJson(e.target.value)} placeholder="Paste the email task JSON here" />
      </label>
      <button type="button" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white" onClick={() => {
        try { prepare(parseEmailTaskDraft(json), null); } catch (error) { setMessage((error as Error).message); }
      }}>Review draft</button>
      <p className="text-xs text-slate-500">Or start with a saved Outlook email. The file supplies its name; review and enter the task details.</p>
    </details>}
    {!result && <div className="mt-3 flex flex-wrap items-center gap-3" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) chooseFile(e.dataTransfer.files[0]); }}>
      <button type="button" disabled={busy} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" onClick={() => fileInput.current?.click()}>{file ? "Replace email file" : "Choose or drop email file"}</button>
      <input ref={fileInput} aria-label="Original email file" className="sr-only" type="file" accept=".msg,.eml" disabled={busy} onChange={e => { chooseFile(e.target.files?.[0] || null); e.target.value = ""; }} />
      {file && <><span className="text-xs text-slate-600">{file.name}</span><button type="button" disabled={busy} className="text-xs underline" onClick={() => { setFile(null); setConfirmed(false); }}>Remove file</button></>}
    </div>}
    {task && draft && !result && <fieldset disabled={busy} className="mt-4 space-y-4">
      {(draft.suggestedOwner || draft.suggestedProject) && <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">Suggested owner: {draft.suggestedOwner || "Not specified"}. Suggested project: {draft.suggestedProject || "Not specified"}. Confirm the matching selections below.</p>}
      <label className={labelStyle}>Task title<input className={inputStyle} value={task.title} maxLength={300} onChange={e => patch({ title: e.target.value })} /></label>
      <label className={labelStyle}>Task notes and next action<textarea className={inputStyle} rows={4} maxLength={20000} value={task.description} onChange={e => patch({ description: e.target.value })} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelStyle}>Owner<select className={inputStyle} value={task.profileId} onChange={e => patch({ profileId: e.target.value })}><option value="">Choose owner…</option><option value="__none__">Team only — no individual owner</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className={labelStyle}>Team<select className={inputStyle} value={task.teamId} onChange={e => patch({ teamId: e.target.value })}><option value="__none__">No team</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className={labelStyle}>Project<select className={inputStyle} value={task.projectId} onChange={e => patch({ projectId: e.target.value })}><option value="">Choose project…</option><option value="__none__">No project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className={labelStyle}>Status<select className={inputStyle} value={task.status} onChange={e => patch({ status: e.target.value })}><option value="">Choose status…</option>{emailTaskStatuses.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className={labelStyle}>Priority<select className={inputStyle} value={task.priority} onChange={e => patch({ priority: e.target.value })}><option value="">Choose priority…</option>{emailTaskPriorities.map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></label>
        <div><label className={labelStyle}>Due date<select className={inputStyle} value={dueChoice} onChange={e => { setDueChoice(e.target.value); setConfirmed(false); }}><option value="">Choose due date…</option><option value="none">No due date</option><option value="date">Choose a date</option></select></label>{dueChoice === "date" && <input aria-label="Task due date" className={inputStyle} type="date" value={task.dueDate} onChange={e => patch({ dueDate: e.target.value })} />}</div>
        <div><label className={labelStyle}>Reminder<select className={inputStyle} value={reminderChoice} onChange={e => { setReminderChoice(e.target.value); setConfirmed(false); }}><option value="">Choose reminder…</option><option value="none">No reminder</option><option value="date">Choose a date and time</option></select></label>{reminderChoice === "date" && <><input aria-label="Reminder date and time" className={inputStyle} type="datetime-local" value={task.reminderAt} onChange={e => patch({ reminderAt: e.target.value })} /><input aria-label="Reminder note" className={inputStyle} placeholder="Reminder note" value={task.reminderNote} onChange={e => patch({ reminderNote: e.target.value })} /><p className="mt-1 text-xs text-slate-500">Uses your browser’s local time zone.</p></>}</div>
      </div>
      <details className="rounded-xl border border-slate-200 bg-white p-3" open>
        <summary className="cursor-pointer text-sm font-semibold">Source email</summary>
        <label className={`${labelStyle} mt-3`}>Email subject<input className={inputStyle} value={task.source.subject} maxLength={500} onChange={e => patch({ source: { ...task.source, subject: e.target.value } })} /></label>
        <label className={`${labelStyle} mt-3`}>From<input className={inputStyle} value={task.source.from || ""} onChange={e => patch({ source: { ...task.source, from: e.target.value } })} /></label>
        <label className={`${labelStyle} mt-3`}>Received<input className={inputStyle} value={task.source.receivedAt || ""} onChange={e => patch({ source: { ...task.source, receivedAt: e.target.value } })} /></label>
        <label className={`${labelStyle} mt-3`}>Outlook message link<input className={inputStyle} type="url" value={task.source.url || ""} maxLength={4000} onChange={e => patch({ source: { ...task.source, url: e.target.value || undefined } })} /></label>
      </details>
      <label className="flex items-start gap-2 text-sm text-slate-800"><input className="mt-1" type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I reviewed the title, notes, owner, team, project, status, priority, due date, reminder, and source email.</label>
      <div className="flex gap-3"><button type="button" disabled={!confirmed || busy} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400" onClick={create}>{busy ? "Creating task…" : "Confirm & create task"}</button><button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm" onClick={() => { draftActive.current = false; setTask(null); setDraft(null); setFile(null); setConfirmed(false); setMessage(""); }}>Cancel</button></div>
    </fieldset>}
    {result && <div role="status" className="mt-4 rounded-xl border border-slate-300 bg-white p-4"><p className="font-semibold">{result.warning ? "Task created — follow-up needed" : "Email task created"}</p><p className="mt-1 text-sm">{task?.title}</p>{result.warning && <p className="mt-2 text-sm text-amber-900">{result.warning} Check the existing task before doing anything else; do not create a second copy.</p>}<p className="mt-2 text-xs text-slate-500">Task reference: {result.taskId}</p><button type="button" className="mt-3 text-sm underline" onClick={() => { draftActive.current = false; setResult(null); setTask(null); setDraft(null); setFile(null); setJson(""); setConfirmed(false); }}>Start another task</button></div>}
    {message && <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{message}</p>}
  </section>;
}
