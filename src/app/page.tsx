"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  DndContext,
  type DragEndEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { supabase } from "@/lib/supabaseClient";

const APP_REVISION = "Version 3.13 — Fixed comments and author display";

const statusColumns = [
  {
    id: "backlog",
    name: "Backlog",
    description: "Ideas, requests, and tasks not ready to start.",
  },
  { id: "todo", name: "To Do", description: "Ready to be worked on." },
  {
    id: "in_progress",
    name: "In Progress",
    description: "Currently active work.",
  },
  {
    id: "waiting",
    name: "Waiting",
    description: "Blocked by another person, vendor, or decision.",
  },
  {
    id: "review",
    name: "Review",
    description: "Ready for approval or final check.",
  },
  { id: "done", name: "Done", description: "Completed work." },
];

const calendarColumns = [
  {
    id: "overdue",
    name: "Overdue",
    description: "Tasks with due dates before today.",
  },
  { id: "today", name: "Today", description: "Tasks due today." },
  { id: "tomorrow", name: "Tomorrow", description: "Tasks due tomorrow." },
  {
    id: "next7",
    name: "Next 7 Days",
    description: "Tasks due in the next week.",
  },
  {
    id: "later",
    name: "Later",
    description: "Tasks due more than a week from now.",
  },
  {
    id: "no-date",
    name: "No Due Date",
    description: "Tasks with no due date assigned.",
  },
];

const smartFilterOptions = [
  { id: "all", label: "All Tasks" },
  { id: "my", label: "My Tasks" },
  { id: "due-today", label: "Due Today" },
  { id: "due-week", label: "Due This Week" },
  { id: "overdue", label: "Overdue" },
  { id: "high", label: "High Priority" },
  { id: "waiting", label: "Waiting" },
  { id: "review", label: "Needs Review" },
  { id: "no-assignee", label: "No Assignee" },
  { id: "not-copied", label: "Not Copied to Blitzit" },
  { id: "has-files", label: "Has Files" },
  { id: "has-subtasks", label: "Has Subtasks" },
  { id: "no-due-date", label: "No Due Date" },
  { id: "has-reminder", label: "Has Reminder" },
  { id: "reminder-due", label: "Reminder Due" },
] as const;

type SmartFilterId = (typeof smartFilterOptions)[number]["id"];

type BoardView = "status" | "assigned" | "team" | "project" | "calendar";

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "admin" | "manager" | "member";
  profile_color: string;
  is_active: boolean;
};

type ProjectRow = {
  id: string;
  name: string;
  description?: string | null;
  status?: string;
  target_date?: string | null;
  project_color?: string;
  is_active?: boolean;
};

type TeamRow = {
  id: string;
  name: string;
  description?: string | null;
  team_color: string;
  is_active?: boolean;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  profile_color: string;
  role?: "admin" | "manager" | "member";
  is_active?: boolean;
};

type TeamMemberRow = {
  team_id: string;
  profile_id: string;
};

type TaskRow = {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  reminder_at: string | null;
  reminder_note: string | null;
  sort_order: number;
  blitzit_copied_at: string | null;
};

type TaskAssigneeRow = {
  task_id: string;
  assignment_type: string;
  profile_id: string | null;
  team_id: string | null;
};

type TagRow = {
  id: string;
  name: string;
  tag_color: string;
};

type TaskTagRow = {
  task_id: string;
  tag_id: string;
};

type TaskAttachmentRow = {
  id: string;
  task_id: string;
  uploaded_by_profile_id: string | null;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size_bytes: number | null;
  created_at: string;
};

type TaskCommentRow = {
  id: string;
  task_id: string;
  profile_id: string | null;
  comment_text: string | null;
  comment_body?: string | null;
  created_at: string;
  commenter_name?: string;
};

type TaskSubtaskRow = {
  id: string;
  task_id: string;
  created_by_profile_id: string | null;
  title: string;
  is_done: boolean;
  sort_order: number;
  created_at: string;
  updated_at?: string | null;
  completed_at?: string | null;
  creator_name?: string;
};

type TaskActivityRow = {
  id: string;
  task_id: string;
  profile_id: string | null;
  activity_type: string;
  activity_text: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  actor_name?: string;
};

type NotificationPreferenceRow = {
  profile_id: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  reminder_due_enabled: boolean;
  include_overdue: boolean;
  updated_at?: string | null;
};

type NotificationDismissalRow = {
  profile_id: string;
  task_id: string;
  dismissed_at: string;
};

type BoardTask = {
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  project: string;
  projectColor: string;
  assignees: string[];
  team: string;
  priority: string;
  due: string;
  dueRaw: string | null;
  reminderAt: string | null;
  reminderNote: string | null;
  tags: string[];
  personColors: string[];
  teamColors: string[];
  status: string;
  sortOrder: number;
  primaryProfileId: string;
  primaryTeamId: string;
  assignedProfileIds: string[];
  assignedTeamIds: string[];
  attachmentCount: number;
  commentCount: number;
  subtaskCount: number;
  completedSubtaskCount: number;
  blitzitCopiedAt: string | null;
};

type ArchivedTask = {
  id: string;
  title: string;
  project: string;
  assignees: string[];
  team: string;
  status: string;
  priority: string;
  due: string;
  archivedDisplayDate: string;
  updatedAt: string | null;
  createdAt: string | null;
};

type DisplayColumn = {
  id: string;
  name: string;
  description: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const supabaseStatus =
  supabaseUrl && supabaseKey
    ? "Supabase environment variables detected"
    : "Supabase environment variables missing";

type CsvRow = Record<string, string | number | null | undefined>;

function csvEscape(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowsToCsv(rows: CsvRow[], headers?: string[]) {
  const csvHeaders =
    headers ?? Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  const lines = [
    csvHeaders.map(csvEscape).join(","),
    ...rows.map((row) =>
      csvHeaders.map((header) => csvEscape(row[header])).join(","),
    ),
  ];

  return lines.join("\n");
}

function downloadCsvFile(filename: string, rows: CsvRow[], headers?: string[]) {
  const csv = rowsToCsv(rows, headers);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function todayFileStamp() {
  return new Date().toISOString().slice(0, 10);
}

function displayProfileName(profileRow: ProfileRow) {
  return profileRow.full_name || profileRow.email || "Unnamed user";
}

function formatDate(dateValue: string | null) {
  if (!dateValue) return "No due date";
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function toLocalDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatReminderDate(dateValue: string | null) {
  if (!dateValue) return "No reminder";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "No reminder";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toReminderDateInput(dateValue: string | null) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return toLocalDateInput(date);
}

function reminderIsDue(dateValue: string | null) {
  if (!dateValue) return false;
  const reminderDateInput = toReminderDateInput(dateValue);
  if (!reminderDateInput) return false;
  return reminderDateInput <= toLocalDateInput(new Date());
}

function reminderIsToday(dateValue: string | null) {
  if (!dateValue) return false;
  const reminderDateInput = toReminderDateInput(dateValue);
  if (!reminderDateInput) return false;
  return reminderDateInput === toLocalDateInput(new Date());
}

function reminderIsOverdue(dateValue: string | null) {
  if (!dateValue) return false;
  const reminderDateInput = toReminderDateInput(dateValue);
  if (!reminderDateInput) return false;
  return reminderDateInput < toLocalDateInput(new Date());
}

function reminderDateToIso(dateInputValue: string) {
  if (!dateInputValue) return null;
  // Store date-only reminders at local noon to avoid timezone edge cases.
  return new Date(`${dateInputValue}T12:00:00`).toISOString();
}

function getTomorrowDateInput() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toLocalDateInput(date);
}

function getOneWeekDateInput() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return toLocalDateInput(date);
}

function getEndOfWeekFridayDateInput() {
  const date = new Date();
  const day = date.getDay();
  const friday = 5;
  const daysUntilFriday = (friday - day + 7) % 7;
  date.setDate(date.getDate() + daysUntilFriday);
  return toLocalDateInput(date);
}

function addDays(baseDate: Date, days: number) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return date;
}

function getCalendarColumnId(dateValue: string | null) {
  if (!dateValue) return "no-date";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(`${dateValue}T00:00:00`);
  dueDate.setHours(0, 0, 0, 0);

  const daysFromToday = Math.round(
    (dueDate.getTime() - today.getTime()) / 86400000,
  );

  if (daysFromToday < 0) return "overdue";
  if (daysFromToday === 0) return "today";
  if (daysFromToday === 1) return "tomorrow";
  if (daysFromToday <= 7) return "next7";
  return "later";
}

function dueDateForCalendarColumn(columnId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (columnId === "no-date") return null;
  if (columnId === "overdue") return toLocalDateInput(addDays(today, -1));
  if (columnId === "today") return toLocalDateInput(today);
  if (columnId === "tomorrow") return toLocalDateInput(addDays(today, 1));
  if (columnId === "next7") return toLocalDateInput(addDays(today, 7));
  if (columnId === "later") return toLocalDateInput(addDays(today, 14));
  return undefined;
}

function formatPriority(priority: string) {
  if (priority === "urgent") return "Urgent";
  if (priority === "high") return "High";
  if (priority === "low") return "Low";
  return "Normal";
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeStorageName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

function isEmailTaskFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return lowerName.endsWith(".msg") || lowerName.endsWith(".eml");
}

function titleFromEmailFileName(fileName: string) {
  return (
    fileName
      .replace(/\.(msg|eml)$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Task from Outlook email"
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const style =
    priority === "urgent"
      ? "bg-red-100 text-red-800 border-red-200"
      : priority === "high"
        ? "bg-orange-100 text-orange-800 border-orange-200"
        : priority === "low"
          ? "bg-slate-50 text-slate-500 border-slate-200"
          : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <span
      className={`rounded-full border px-2 py-1 text-xs font-medium ${style}`}
    >
      {formatPriority(priority)}
    </span>
  );
}

function normalizeProjectColor(
  project: ProjectRow | undefined,
  fallback = "#CBD5E1",
) {
  return project?.project_color || fallback;
}

function SegmentedColorBar({
  colors,
  fallbackColor,
  title,
}: {
  colors: string[];
  fallbackColor: string;
  title: string;
}) {
  const safeColors = colors.length > 0 ? colors : [fallbackColor];

  return (
    <div
      className="flex h-1.5 overflow-hidden rounded-full bg-slate-200"
      title={title}
    >
      {safeColors.map((color, index) => (
        <div
          key={`${title}-${color}-${index}`}
          className="h-full"
          style={{
            width: `${100 / safeColors.length}%`,
            backgroundColor: color,
          }}
        />
      ))}
    </div>
  );
}

function TaskColorBars({
  personColors,
  teamColors,
  projectColor,
}: {
  personColors: string[];
  teamColors: string[];
  projectColor: string;
}) {
  return (
    <div className="mb-3 space-y-1">
      <SegmentedColorBar
        colors={personColors}
        fallbackColor="#CBD5E1"
        title="Assigned person colors"
      />
      <SegmentedColorBar
        colors={teamColors}
        fallbackColor="#E2E8F0"
        title="Assigned team colors"
      />
      <SegmentedColorBar
        colors={[projectColor]}
        fallbackColor="#CBD5E1"
        title="Project color"
      />
    </div>
  );
}

function TaskCard({
  task,
  columnId,
  onOpen,
  onCopyToBlitzit,
  copyingTaskId,
  blitzitReady,
  isSelected,
  onToggleSelect,
}: {
  task: BoardTask;
  columnId: string;
  onOpen: (task: BoardTask) => void;
  onCopyToBlitzit: (task: BoardTask) => void;
  copyingTaskId: string | null;
  blitzitReady: boolean;
  isSelected: boolean;
  onToggleSelect: (taskId: string) => void;
}) {
  const dragId = `drag:${columnId}:${task.id}`;
  const cardDropId = `card:${columnId}:${task.id}`;

  const {
    attributes,
    listeners,
    setNodeRef: setDraggableNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: dragId,
    data: {
      type: "task",
      taskId: task.id,
      columnId,
    },
  });

  const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({
    id: cardDropId,
    data: {
      type: "card",
      taskId: task.id,
      columnId,
    },
  });

  function setCombinedNodeRef(node: HTMLDivElement | null) {
    setDraggableNodeRef(node);
    setDroppableNodeRef(node);
  }

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 50 : "auto",
      }
    : undefined;

  return (
    <div
      ref={setCombinedNodeRef}
      style={style}
      onClick={() => onOpen(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(task);
        }
      }}
      className={`cursor-pointer rounded-2xl border bg-white p-3 shadow-sm transition hover:shadow-md ${
        isDragging
          ? "border-blue-300 opacity-70 shadow-xl"
          : isOver
            ? "border-blue-300"
            : "border-slate-200"
      }`}
    >
      <div
        className="mb-2 flex items-center justify-between gap-2"
        onClick={(event) => event.stopPropagation()}
      >
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(task.id)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Select
        </label>
      </div>

      <TaskColorBars
        personColors={task.personColors}
        teamColors={task.teamColors}
        projectColor={task.projectColor}
      />

      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-snug text-slate-950">
          {task.title}
        </h3>
        <PriorityBadge priority={task.priority} />
      </div>

      <div className="space-y-0.5 text-xs text-slate-600">
        <p>
          <span className="font-semibold text-slate-800">Project:</span>{" "}
          {task.project}
        </p>
        <p>
          <span className="font-semibold text-slate-800">Assigned:</span>{" "}
          {task.assignees.length > 0 ? task.assignees.join(", ") : "Unassigned"}
        </p>
        <p>
          <span className="font-semibold text-slate-800">Team:</span>{" "}
          {task.team}
        </p>
        <p>
          <span className="font-semibold text-slate-800">Status:</span>{" "}
          {statusColumns.find((column) => column.id === task.status)?.name ||
            task.status}
        </p>
        <p>
          <span className="font-semibold text-slate-800">Due:</span> {task.due}
        </p>
        <p>
          <span className="font-semibold text-slate-800">Reminder:</span>{" "}
          {formatReminderDate(task.reminderAt)}
        </p>
        <p>
          <span className="font-semibold text-slate-800">Blitzit:</span>{" "}
          {task.blitzitCopiedAt ? "Copied" : "Not copied"}
        </p>
      </div>

      {task.description && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">
          {task.description}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {task.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
          >
            #{tag}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
        <div className="flex gap-3">
          <span>Files: {task.attachmentCount}</span>
          <span>Comments: {task.commentCount}</span>
          <span>Subtasks: {task.completedSubtaskCount}/{task.subtaskCount}</span>
        </div>

        <div
          className="flex gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            {...listeners}
            {...attributes}
            className="cursor-grab rounded-lg border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-50 active:cursor-grabbing"
          >
            Drag
          </button>

          <button
            type="button"
            onClick={() => onCopyToBlitzit(task)}
            disabled={!blitzitReady || copyingTaskId === task.id}
            className="rounded-lg border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              blitzitReady
                ? "Copy this task to Blitzit"
                : "Save your Blitzit webhook settings first"
            }
          >
            {copyingTaskId === task.id
              ? "Copying..."
              : task.blitzitCopiedAt
                ? "Re-copy"
                : "Copy"}
          </button>

          <button
            type="button"
            onClick={() => onOpen(task)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-50"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}

function BoardColumn({
  column,
  tasks,
  onOpen,
  onCopyToBlitzit,
  copyingTaskId,
  blitzitReady,
  selectedTaskIds,
  onToggleTaskSelection,
  onAddTask,
  addingTaskColumnId,
}: {
  column: DisplayColumn;
  tasks: BoardTask[];
  onOpen: (task: BoardTask) => void;
  onCopyToBlitzit: (task: BoardTask) => void;
  copyingTaskId: string | null;
  blitzitReady: boolean;
  selectedTaskIds: string[];
  onToggleTaskSelection: (taskId: string) => void;
  onAddTask: (column: DisplayColumn) => void;
  addingTaskColumnId: string | null;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `column:${column.id}`,
    data: {
      type: "column",
      columnId: column.id,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`w-80 shrink-0 rounded-2xl border p-3 transition ${
        isOver ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-100"
      }`}
    >
      <div className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-slate-950">{column.name}</h3>
          <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">
            {tasks.length}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600">{column.description}</p>
      </div>

      <div className="min-h-24 space-y-3">
        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-center text-xs text-slate-500">
            Drop tasks here.
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={`${column.id}:${task.id}`}
              task={task}
              columnId={column.id}
              onOpen={onOpen}
              onCopyToBlitzit={onCopyToBlitzit}
              copyingTaskId={copyingTaskId}
              blitzitReady={blitzitReady}
              isSelected={selectedTaskIds.includes(task.id)}
              onToggleSelect={onToggleTaskSelection}
            />
          ))
        )}
      </div>

      <button
        type="button"
        onClick={() => onAddTask(column)}
        disabled={addingTaskColumnId === column.id}
        className="mt-3 w-full rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
      >
        {addingTaskColumnId === column.id ? "Adding..." : "+ Add Task"}
      </button>
    </div>
  );
}

function friendlyAuthErrorMessage(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Password reset email rate limit reached. Wait before requesting another reset email. If this is urgent, an admin can reset the password from Supabase Authentication > Users.";
  }

  if (lower.includes("invalid login credentials")) {
    return "That email/password combination did not work. Try again, or use Forgot Password to send a reset email.";
  }

  if (lower.includes("email not confirmed")) {
    return "This email has not been confirmed yet. Check the inbox for a confirmation email, or ask an admin to confirm the user in Supabase.";
  }

  if (
    lower.includes("requested path is invalid") ||
    lower.includes("redirect")
  ) {
    return "The password reset link could not open the correct page. Confirm the Supabase Site URL and Redirect URLs include this app URL and /update-password.";
  }

  return message;
}

function LoginScreen() {
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "reset">("sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [resetEmailSent, setResetEmailSent] = useState(false);

  function switchMode(nextMode: "sign-in" | "sign-up" | "reset") {
    setMode(nextMode);
    setMessage("");
    if (nextMode !== "reset") {
      setResetEmailSent(false);
    }
  }

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      if (mode === "reset") {
        if (!email) {
          setMessage("Enter your email address first.");
          return;
        }

        const redirectTo = `${window.location.origin}/update-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        });

        if (error) {
          setMessage(friendlyAuthErrorMessage(error.message));
          return;
        }

        setResetEmailSent(true);
        setMessage(
          `Password reset email sent. Check your inbox and use the reset link. The link should open ${redirectTo}. Do not click Send Reset Email again unless you need a new link.`,
        );
        return;
      }

      if (!email || !password) {
        setMessage("Enter an email and password.");
        return;
      }

      if (mode === "sign-up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });

        if (error) {
          setMessage(friendlyAuthErrorMessage(error.message));
          return;
        }

        setMessage(
          "Signup submitted. If email confirmation is enabled, check your email before signing in. New users may need an admin to assign role/color settings.",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setMessage(friendlyAuthErrorMessage(error.message));
          return;
        }

        setMessage("Signed in successfully.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <img
            src="/graymills-logo.png"
            alt="Graymills logo"
            className="h-10 w-auto max-w-40 object-contain"
          />
          <div>
            <p className="text-xs font-medium text-slate-500">{APP_REVISION}</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">
              TaskBoard
            </h1>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-600">
          {mode === "reset"
            ? "Enter your email and we’ll send a password reset link. The reset link will return to this same app."
            : "Sign in to view your shared marketing task board."}
        </p>

        <div className="mt-5 grid grid-cols-3 rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => switchMode("sign-in")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              mode === "sign-in"
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-600"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode("sign-up")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              mode === "sign-up"
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-600"
            }`}
          >
            Sign Up
          </button>
          <button
            type="button"
            onClick={() => switchMode("reset")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              mode === "reset"
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-600"
            }`}
          >
            Reset
          </button>
        </div>

        <form onSubmit={handleAuth} className="mt-5 space-y-4">
          {mode === "sign-up" && (
            <div>
              <label className="text-sm font-semibold text-slate-900">
                Full name
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Craig Shields"
              />
            </div>
          )}

          <div>
            <label className="text-sm font-semibold text-slate-900">
              Email
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@graymills.com"
            />
          </div>

          {mode !== "reset" && (
            <div>
              <label className="text-sm font-semibold text-slate-900">
                Password
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Use a strong password"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={busy || (mode === "reset" && resetEmailSent)}
            className="w-full rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {busy
              ? "Working..."
              : mode === "sign-up"
                ? "Create Account"
                : mode === "reset"
                  ? resetEmailSent
                    ? "Reset Email Sent"
                    : "Send Reset Email"
                  : "Sign In"}
          </button>
        </form>

        {mode === "reset" && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-950">
            <p className="font-semibold">Password reset tips</p>
            <p className="mt-1">
              Use the newest reset email only. Repeated requests can trigger
              Supabase email rate limits. If that happens, wait before trying
              again or ask an admin to reset your password in Supabase.
            </p>
            {resetEmailSent && (
              <button
                type="button"
                onClick={() => {
                  setResetEmailSent(false);
                  setMessage("");
                }}
                className="mt-2 text-xs font-semibold underline underline-offset-4"
              >
                I need to request another link
              </button>
            )}
          </div>
        )}

        {mode !== "reset" && (
          <button
            type="button"
            onClick={() => switchMode("reset")}
            className="mt-4 text-sm font-semibold text-slate-700 underline underline-offset-4 hover:text-slate-950"
          >
            Forgot your password?
          </button>
        )}

        {message && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {message}
          </div>
        )}
      </div>
    </main>
  );
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [profileMessage, setProfileMessage] = useState("");

  const [boardView, setBoardView] = useState<BoardView>("status");
  const [activeSmartFilter, setActiveSmartFilter] =
    useState<SmartFilterId>("all");
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [boardTasks, setBoardTasks] = useState<BoardTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskMessage, setTaskMessage] = useState("");
  const [selectedActiveTaskIds, setSelectedActiveTaskIds] = useState<string[]>(
    [],
  );
  const [bulkArchivingTasks, setBulkArchivingTasks] = useState(false);

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);

  const [adminProjects, setAdminProjects] = useState<ProjectRow[]>([]);
  const [adminTeams, setAdminTeams] = useState<TeamRow[]>([]);
  const [adminProfiles, setAdminProfiles] = useState<ProfileRow[]>([]);
  const [teamMemberships, setTeamMemberships] = useState<TeamMemberRow[]>([]);
  const [memberToAddByTeam, setMemberToAddByTeam] = useState<
    Record<string, string>
  >({});
  const [teamMembershipBusy, setTeamMembershipBusy] = useState<string | null>(
    null,
  );
  const [archivedTasks, setArchivedTasks] = useState<ArchivedTask[]>([]);
  const [archivedTaskSearch, setArchivedTaskSearch] = useState("");
  const [loadingArchivedTasks, setLoadingArchivedTasks] = useState(false);
  const [restoringArchivedTaskId, setRestoringArchivedTaskId] = useState<
    string | null
  >(null);
  const [deletingArchivedTaskId, setDeletingArchivedTaskId] = useState<
    string | null
  >(null);
  const [selectedArchivedTaskIds, setSelectedArchivedTaskIds] = useState<
    string[]
  >([]);
  const [bulkArchivedAction, setBulkArchivedAction] = useState<
    "restore" | "delete" | null
  >(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [exportingBackup, setExportingBackup] = useState(false);
  const [restoreFileName, setRestoreFileName] = useState("");
  const [restorePreview, setRestorePreview] = useState<Record<
    string,
    number
  > | null>(null);
  const [restoreBackupData, setRestoreBackupData] = useState<Record<
    string,
    unknown[]
  > | null>(null);
  const [restoringBackup, setRestoringBackup] = useState(false);

  const [editingUserId, setEditingUserId] = useState("");
  const [editUserFullName, setEditUserFullName] = useState("");
  const [editUserRole, setEditUserRole] = useState<
    "admin" | "manager" | "member"
  >("member");
  const [editUserColor, setEditUserColor] = useState("#2563EB");

  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectStatus, setNewProjectStatus] = useState("active");
  const [newProjectTargetDate, setNewProjectTargetDate] = useState("");
  const [newProjectColor, setNewProjectColor] = useState("#2563EB");

  const [editingProjectId, setEditingProjectId] = useState("");
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectDescription, setEditProjectDescription] = useState("");
  const [editProjectStatus, setEditProjectStatus] = useState("active");
  const [editProjectTargetDate, setEditProjectTargetDate] = useState("");
  const [editProjectColor, setEditProjectColor] = useState("#2563EB");

  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");
  const [newTeamColor, setNewTeamColor] = useState("#2563EB");

  const [editingTeamId, setEditingTeamId] = useState("");
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamDescription, setEditTeamDescription] = useState("");
  const [editTeamColor, setEditTeamColor] = useState("#2563EB");

  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const [quickProjectId, setQuickProjectId] = useState("");
  const [quickProfileId, setQuickProfileId] = useState("");
  const [quickTeamId, setQuickTeamId] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const [creatingColumnTaskId, setCreatingColumnTaskId] = useState<
    string | null
  >(null);
  const [quickAddMessage, setQuickAddMessage] = useState("");

  const [emailTaskFile, setEmailTaskFile] = useState<File | null>(null);
  const [creatingEmailTask, setCreatingEmailTask] = useState(false);
  const [emailTaskMessage, setEmailTaskMessage] = useState("");

  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);

  const [selectedTask, setSelectedTask] = useState<BoardTask | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState("normal");
  const [editStatus, setEditStatus] = useState("backlog");
  const [editDueDate, setEditDueDate] = useState("");
  const [editReminderAt, setEditReminderAt] = useState("");
  const [editReminderNote, setEditReminderNote] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [editProfileIds, setEditProfileIds] = useState<string[]>([]);
  const [editTeamIds, setEditTeamIds] = useState<string[]>([]);
  const [savingTask, setSavingTask] = useState(false);
  const [archivingTask, setArchivingTask] = useState(false);
  const [editMessage, setEditMessage] = useState("");

  const [attachments, setAttachments] = useState<TaskAttachmentRow[]>([]);
  const [selectedAttachmentFile, setSelectedAttachmentFile] =
    useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachmentMessage, setAttachmentMessage] = useState("");

  const [comments, setComments] = useState<TaskCommentRow[]>([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [commentMessage, setCommentMessage] = useState("");

  const [subtasks, setSubtasks] = useState<TaskSubtaskRow[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [savingSubtask, setSavingSubtask] = useState(false);
  const [subtaskMessage, setSubtaskMessage] = useState("");

  const [activities, setActivities] = useState<TaskActivityRow[]>([]);
  const [activityMessage, setActivityMessage] = useState("");
  const [activityExpanded, setActivityExpanded] = useState(false);

  const [blitzitWebhookUrl, setBlitzitWebhookUrl] = useState("");
  const [blitzitSigningSecret, setBlitzitSigningSecret] = useState("");
  const [savingBlitzitSettings, setSavingBlitzitSettings] = useState(false);
  const [blitzitMessage, setBlitzitMessage] = useState("");
  const [copyingTaskId, setCopyingTaskId] = useState<string | null>(null);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [inAppNotificationsEnabled, setInAppNotificationsEnabled] =
    useState(true);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] =
    useState(false);
  const [reminderDueNotificationsEnabled, setReminderDueNotificationsEnabled] =
    useState(true);
  const [includeOverdueNotifications, setIncludeOverdueNotifications] =
    useState(true);
  const [dismissedNotificationTaskIds, setDismissedNotificationTaskIds] =
    useState<string[]>([]);
  const [showDismissedNotifications, setShowDismissedNotifications] =
    useState(false);
  const [savingNotificationSettings, setSavingNotificationSettings] =
    useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");

  const accountInactive = profile?.is_active === false;
  const isAdmin = profile?.role === "admin" && !accountInactive;
  const isManager = profile?.role === "manager" && !accountInactive;
  const canManageWorkspace = isAdmin || isManager;
  const currentEmail = session?.user.email ?? "Unknown user";

  const topBoardScrollRef = useRef<HTMLDivElement | null>(null);
  const mainBoardScrollRef = useRef<HTMLDivElement | null>(null);

  const supabaseStatusStyle =
    supabaseUrl && supabaseKey
      ? "border-green-200 bg-green-50 text-green-800"
      : "border-red-200 bg-red-50 text-red-800";

  const roleLabel = useMemo(() => {
    if (!profile) return "Profile loading";
    if (profile.is_active === false) return "Inactive";
    if (profile.role === "admin") return "Admin";
    if (profile.role === "manager") return "Manager";
    return "Member";
  }, [profile]);

  const blitzitReady = Boolean(
    blitzitWebhookUrl.trim() && blitzitSigningSecret.trim(),
  );

  const currentBoardColumns = useMemo<DisplayColumn[]>(() => {
    if (boardView === "status") return statusColumns;

    if (boardView === "calendar") return calendarColumns;

    if (boardView === "assigned") {
      return [
        ...profiles.map((profileRow) => ({
          id: `person:${profileRow.id}`,
          name: displayProfileName(profileRow),
          description: "Tasks assigned to this person.",
        })),
        {
          id: "unassigned-person",
          name: "No Person",
          description: "Tasks with no assigned person.",
        },
      ];
    }

    if (boardView === "team") {
      return [
        ...teams.map((team) => ({
          id: `team:${team.id}`,
          name: team.name,
          description: "Tasks assigned to this team.",
        })),
        {
          id: "unassigned-team",
          name: "No Team",
          description: "Tasks with no assigned team.",
        },
      ];
    }

    return [
      ...projects.map((project) => ({
        id: `project:${project.id}`,
        name: project.name,
        description: "Tasks assigned to this project.",
      })),
      {
        id: "no-project",
        name: "No Project",
        description: "Tasks with no project selected.",
      },
    ];
  }, [boardView, profiles, teams, projects]);

  const boardScrollWidth = Math.max(
    currentBoardColumns.length * 384 +
      Math.max(currentBoardColumns.length - 1, 0) * 16,
    384,
  );

  function handleTopBoardScroll() {
    if (!topBoardScrollRef.current || !mainBoardScrollRef.current) return;
    mainBoardScrollRef.current.scrollLeft =
      topBoardScrollRef.current.scrollLeft;
  }

  function handleMainBoardScroll() {
    if (!topBoardScrollRef.current || !mainBoardScrollRef.current) return;
    topBoardScrollRef.current.scrollLeft =
      mainBoardScrollRef.current.scrollLeft;
  }

  function getDefaultProjectId(projectRows: ProjectRow[]) {
    return (
      projectRows.find((project) => project.name === "TaskBoard Setup")?.id ||
      projectRows[0]?.id ||
      ""
    );
  }

  function getDefaultTeamId(teamRows: TeamRow[]) {
    return (
      teamRows.find((team) => team.name === "Marketing")?.id ||
      teamRows[0]?.id ||
      ""
    );
  }

  function buildAssignmentType(profileId: string, teamId: string) {
    if (profileId && teamId) return "person_within_team";
    if (profileId) return "person";
    return "team";
  }

  function describeStatus(status: string) {
    return statusColumns.find((column) => column.id === status)?.name || status;
  }

  function describeProject(projectId: string | null) {
    if (!projectId) return "No project";
    return (
      projects.find((project) => project.id === projectId)?.name || "Project"
    );
  }

  function describeProfiles(profileIds: string[]) {
    if (profileIds.length === 0) return "No people";
    return (
      profileIds
        .map((profileId) =>
          profiles.find((profileRow) => profileRow.id === profileId),
        )
        .filter(Boolean)
        .map((profileRow) => displayProfileName(profileRow as ProfileRow))
        .join(", ") || "No people"
    );
  }

  function describeTeams(teamIds: string[]) {
    if (teamIds.length === 0) return "No teams";
    return (
      teamIds
        .map((teamId) => teams.find((team) => team.id === teamId)?.name)
        .filter(Boolean)
        .join(", ") || "No teams"
    );
  }

  function arraysAreSame(left: string[], right: string[]) {
    if (left.length !== right.length) return false;
    const rightSet = new Set(right);
    return left.every((item) => rightSet.has(item));
  }

  function buildTaskEditActivityText(task: BoardTask) {
    const changes: string[] = [];

    if (task.title !== editTitle.trim()) changes.push("title");
    if ((task.description ?? "") !== editDescription.trim())
      changes.push("notes");
    if (task.priority !== editPriority)
      changes.push(
        `priority from ${formatPriority(task.priority)} to ${formatPriority(editPriority)}`,
      );
    if (task.status !== editStatus)
      changes.push(
        `status from ${describeStatus(task.status)} to ${describeStatus(editStatus)}`,
      );
    if ((task.dueRaw ?? "") !== editDueDate)
      changes.push(
        `due date from ${task.dueRaw || "none"} to ${editDueDate || "none"}`,
      );
    if (toReminderDateInput(task.reminderAt) !== editReminderAt)
      changes.push(
        `reminder from ${formatReminderDate(task.reminderAt)} to ${editReminderAt || "none"}`,
      );
    if ((task.reminderNote ?? "") !== editReminderNote.trim())
      changes.push("reminder note");
    if ((task.projectId ?? "") !== editProjectId)
      changes.push(
        `project from ${task.project} to ${describeProject(editProjectId || null)}`,
      );
    if (!arraysAreSame(task.assignedProfileIds, editProfileIds))
      changes.push(
        `people from ${describeProfiles(task.assignedProfileIds)} to ${describeProfiles(editProfileIds)}`,
      );
    if (!arraysAreSame(task.assignedTeamIds, editTeamIds))
      changes.push(
        `teams from ${describeTeams(task.assignedTeamIds)} to ${describeTeams(editTeamIds)}`,
      );

    if (changes.length === 0)
      return "Task saved with no tracked field changes.";
    return `Updated task: ${changes.join("; ")}.`;
  }

  function getTaskColumnId(task: BoardTask) {
    if (boardView === "status") return task.status;
    if (boardView === "calendar") return getCalendarColumnId(task.dueRaw);
    if (boardView === "assigned") {
      if (task.primaryProfileId) return `person:${task.primaryProfileId}`;
      return "unassigned-person";
    }
    if (boardView === "team") {
      if (task.primaryTeamId) return `team:${task.primaryTeamId}`;
      return "unassigned-team";
    }
    if (task.projectId) return `project:${task.projectId}`;
    return "no-project";
  }

  function taskBelongsToColumn(task: BoardTask, columnId: string) {
    if (boardView === "assigned") {
      if (columnId === "unassigned-person") {
        return task.assignedProfileIds.length === 0;
      }
      if (columnId.startsWith("person:")) {
        return task.assignedProfileIds.includes(
          columnId.replace("person:", ""),
        );
      }
      return false;
    }

    if (boardView === "team") {
      if (columnId === "unassigned-team") {
        return task.assignedTeamIds.length === 0;
      }
      if (columnId.startsWith("team:")) {
        return task.assignedTeamIds.includes(columnId.replace("team:", ""));
      }
      return false;
    }

    return getTaskColumnId(task) === columnId;
  }

  function getSmartFilterLabel(filterId: SmartFilterId) {
    return (
      smartFilterOptions.find((filterOption) => filterOption.id === filterId)
        ?.label || "All Tasks"
    );
  }

  function isDateWithinNextSevenDays(dateValue: string | null) {
    if (!dateValue) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDate = new Date(`${dateValue}T00:00:00`);
    dueDate.setHours(0, 0, 0, 0);

    const daysFromToday = Math.round(
      (dueDate.getTime() - today.getTime()) / 86400000,
    );
    return daysFromToday >= 0 && daysFromToday <= 7;
  }

  function taskMatchesSmartFilter(task: BoardTask) {
    if (activeSmartFilter === "all") return true;

    if (activeSmartFilter === "my") {
      return Boolean(
        session?.user.id && task.assignedProfileIds.includes(session.user.id),
      );
    }

    if (activeSmartFilter === "due-today")
      return getCalendarColumnId(task.dueRaw) === "today";
    if (activeSmartFilter === "due-week")
      return isDateWithinNextSevenDays(task.dueRaw);
    if (activeSmartFilter === "overdue")
      return getCalendarColumnId(task.dueRaw) === "overdue";
    if (activeSmartFilter === "high")
      return task.priority === "high" || task.priority === "urgent";
    if (activeSmartFilter === "waiting") return task.status === "waiting";
    if (activeSmartFilter === "review") return task.status === "review";
    if (activeSmartFilter === "no-assignee")
      return (
        task.assignedProfileIds.length === 0 &&
        task.assignedTeamIds.length === 0
      );
    if (activeSmartFilter === "not-copied") return !task.blitzitCopiedAt;
    if (activeSmartFilter === "has-files") return task.attachmentCount > 0;
    if (activeSmartFilter === "has-subtasks") return task.subtaskCount > 0;
    if (activeSmartFilter === "no-due-date") return !task.dueRaw;
    if (activeSmartFilter === "has-reminder") return Boolean(task.reminderAt);
    if (activeSmartFilter === "reminder-due")
      return reminderIsDue(task.reminderAt);

    return true;
  }

  function taskMatchesSearchQuery(task: BoardTask) {
    const cleanQuery = taskSearchQuery.trim().toLowerCase();

    if (!cleanQuery) return true;

    const searchableText = [
      task.title,
      task.description ?? "",
      task.project,
      task.assignees.join(" "),
      task.team,
      task.tags.join(" "),
      task.status,
      statusColumns.find((column) => column.id === task.status)?.name ?? "",
      formatPriority(task.priority),
      task.due,
      formatReminderDate(task.reminderAt),
      task.reminderNote ?? "",
      `${task.completedSubtaskCount}/${task.subtaskCount} subtasks`,
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(cleanQuery);
  }

  const filteredBoardTasks = useMemo(
    () =>
      boardTasks.filter(
        (task) => taskMatchesSmartFilter(task) && taskMatchesSearchQuery(task),
      ),
    [boardTasks, activeSmartFilter, taskSearchQuery, session?.user.id],
  );

  const filteredArchivedTasks = useMemo(() => {
    const cleanQuery = archivedTaskSearch.trim().toLowerCase();

    if (!cleanQuery) return archivedTasks;

    return archivedTasks.filter((task) => {
      const searchableText = [
        task.title,
        task.project,
        task.assignees.join(" "),
        task.team,
        task.status,
        formatPriority(task.priority),
        task.due,
        task.archivedDisplayDate,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(cleanQuery);
    });
  }, [archivedTasks, archivedTaskSearch]);

  const visibleSelectedActiveTaskIds = useMemo(
    () =>
      selectedActiveTaskIds.filter((taskId) =>
        filteredBoardTasks.some((task) => task.id === taskId),
      ),
    [selectedActiveTaskIds, filteredBoardTasks],
  );

  const visibleSelectedArchivedTaskIds = useMemo(
    () =>
      selectedArchivedTaskIds.filter((taskId) =>
        filteredArchivedTasks.some((task) => task.id === taskId),
      ),
    [selectedArchivedTaskIds, filteredArchivedTasks],
  );

  function toggleActiveTaskSelection(taskId: string) {
    setSelectedActiveTaskIds((currentIds) =>
      currentIds.includes(taskId)
        ? currentIds.filter((id) => id !== taskId)
        : [...currentIds, taskId],
    );
  }

  function toggleArchivedTaskSelection(taskId: string) {
    setSelectedArchivedTaskIds((currentIds) =>
      currentIds.includes(taskId)
        ? currentIds.filter((id) => id !== taskId)
        : [...currentIds, taskId],
    );
  }

  const reminderNotificationTasks = useMemo(() => {
    if (!inAppNotificationsEnabled || !reminderDueNotificationsEnabled)
      return [];

    return boardTasks
      .filter((task) => {
        if (!task.reminderAt) return false;
        if (task.status === "done") return false;
        if (
          dismissedNotificationTaskIds.includes(task.id) &&
          !showDismissedNotifications
        )
          return false;
        if (includeOverdueNotifications) return reminderIsDue(task.reminderAt);
        return reminderIsToday(task.reminderAt);
      })
      .sort((a, b) => {
        const aDate = toReminderDateInput(a.reminderAt);
        const bDate = toReminderDateInput(b.reminderAt);
        return aDate.localeCompare(bDate) || a.title.localeCompare(b.title);
      });
  }, [
    boardTasks,
    inAppNotificationsEnabled,
    reminderDueNotificationsEnabled,
    includeOverdueNotifications,
    dismissedNotificationTaskIds,
    showDismissedNotifications,
  ]);

  const activeNotificationCount = useMemo(() => {
    if (!inAppNotificationsEnabled || !reminderDueNotificationsEnabled)
      return 0;

    return boardTasks.filter((task) => {
      if (!task.reminderAt) return false;
      if (task.status === "done") return false;
      if (dismissedNotificationTaskIds.includes(task.id)) return false;
      if (includeOverdueNotifications) return reminderIsDue(task.reminderAt);
      return reminderIsToday(task.reminderAt);
    }).length;
  }, [
    boardTasks,
    inAppNotificationsEnabled,
    reminderDueNotificationsEnabled,
    includeOverdueNotifications,
    dismissedNotificationTaskIds,
  ]);

  const dashboardStats = useMemo(() => {
    const openTasks = boardTasks.filter(
      (task) => task.status !== "done" && task.status !== "canceled",
    );
    const completedTasks = boardTasks.filter((task) => task.status === "done");
    const overdueTasks = openTasks.filter(
      (task) => getCalendarColumnId(task.dueRaw) === "overdue",
    );
    const dueThisWeekTasks = openTasks.filter((task) =>
      isDateWithinNextSevenDays(task.dueRaw),
    );
    const highPriorityTasks = openTasks.filter(
      (task) => task.priority === "high" || task.priority === "urgent",
    );
    const waitingTasks = openTasks.filter((task) => task.status === "waiting");
    const reviewTasks = openTasks.filter((task) => task.status === "review");
    const reminderDueTasks = openTasks.filter((task) =>
      reminderIsDue(task.reminderAt),
    );
    const notCopiedToBlitzitTasks = openTasks.filter(
      (task) => !task.blitzitCopiedAt,
    );

    const countByStatus = statusColumns.map((column) => ({
      label: column.name,
      count: boardTasks.filter((task) => task.status === column.id).length,
    }));

    const countByPriority = ["urgent", "high", "normal", "low"].map(
      (priority) => ({
        label: formatPriority(priority),
        count: boardTasks.filter((task) => task.priority === priority).length,
      }),
    );

    const countByProject = [
      ...projects.map((project) => ({
        label: project.name,
        count: openTasks.filter((task) => task.projectId === project.id).length,
      })),
      {
        label: "No Project",
        count: openTasks.filter((task) => !task.projectId).length,
      },
    ]
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    const countByPerson = [
      ...profiles.map((profileRow) => ({
        label: displayProfileName(profileRow),
        count: openTasks.filter((task) =>
          task.assignedProfileIds.includes(profileRow.id),
        ).length,
      })),
      {
        label: "No Person",
        count: openTasks.filter((task) => task.assignedProfileIds.length === 0)
          .length,
      },
    ]
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    const countByTeam = [
      ...teams.map((team) => ({
        label: team.name,
        count: openTasks.filter((task) =>
          task.assignedTeamIds.includes(team.id),
        ).length,
      })),
      {
        label: "No Team",
        count: openTasks.filter((task) => task.assignedTeamIds.length === 0)
          .length,
      },
    ]
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    const recentlyCompleted = completedTasks
      .slice()
      .sort(
        (a, b) => b.sortOrder - a.sortOrder || a.title.localeCompare(b.title),
      )
      .slice(0, 8);

    return {
      totalTasks: boardTasks.length,
      openTasks: openTasks.length,
      completedTasks: completedTasks.length,
      overdueTasks,
      dueThisWeekTasks,
      highPriorityTasks,
      waitingTasks,
      reviewTasks,
      reminderDueTasks,
      notCopiedToBlitzitTasks,
      countByStatus,
      countByPriority,
      countByProject,
      countByPerson,
      countByTeam,
      recentlyCompleted,
    };
  }, [boardTasks, projects, profiles, teams]);

  function taskToReportRow(task: BoardTask): CsvRow {
    return {
      Task: task.title,
      Status:
        statusColumns.find((column) => column.id === task.status)?.name ??
        task.status,
      Priority: formatPriority(task.priority),
      Project: task.project,
      People:
        task.assignees.length > 0 ? task.assignees.join("; ") : "Unassigned",
      Teams: task.team,
      "Due Date": task.dueRaw ?? "",
      "Reminder Date": toReminderDateInput(task.reminderAt),
      "Reminder Note": task.reminderNote ?? "",
      Tags: task.tags.join("; "),
      Files: task.attachmentCount,
      Comments: task.commentCount,
      Subtasks: `${task.completedSubtaskCount}/${task.subtaskCount}`,
      "Copied to Blitzit": task.blitzitCopiedAt ? "Yes" : "No",
      "Task ID": task.id,
    };
  }

  function exportOpenTasksReport() {
    const openTasks = boardTasks.filter(
      (task) => task.status !== "done" && task.status !== "canceled",
    );

    downloadCsvFile(
      `graymills-taskboard-open-tasks-${todayFileStamp()}.csv`,
      openTasks.map(taskToReportRow),
    );
  }

  function exportOverdueTasksReport() {
    downloadCsvFile(
      `graymills-taskboard-overdue-tasks-${todayFileStamp()}.csv`,
      dashboardStats.overdueTasks.map(taskToReportRow),
    );
  }

  function exportDashboardSummaryReport() {
    const rows: CsvRow[] = [
      { Metric: "Total Tasks", Value: dashboardStats.totalTasks },
      { Metric: "Open Tasks", Value: dashboardStats.openTasks },
      { Metric: "Completed Tasks", Value: dashboardStats.completedTasks },
      { Metric: "Overdue", Value: dashboardStats.overdueTasks.length },
      {
        Metric: "Due This Week",
        Value: dashboardStats.dueThisWeekTasks.length,
      },
      {
        Metric: "High / Urgent",
        Value: dashboardStats.highPriorityTasks.length,
      },
      { Metric: "Waiting", Value: dashboardStats.waitingTasks.length },
      { Metric: "Needs Review", Value: dashboardStats.reviewTasks.length },
      { Metric: "Reminder Due", Value: dashboardStats.reminderDueTasks.length },
      {
        Metric: "Not Copied to Blitzit",
        Value: dashboardStats.notCopiedToBlitzitTasks.length,
      },
    ];

    downloadCsvFile(
      `graymills-taskboard-dashboard-summary-${todayFileStamp()}.csv`,
      rows,
      ["Metric", "Value"],
    );
  }

  function exportDashboardBreakdownsReport() {
    const rows: CsvRow[] = [
      ...dashboardStats.countByStatus.map((item) => ({
        Category: "Status",
        Label: item.label,
        Count: item.count,
      })),
      ...dashboardStats.countByPriority.map((item) => ({
        Category: "Priority",
        Label: item.label,
        Count: item.count,
      })),
      ...dashboardStats.countByProject.map((item) => ({
        Category: "Project",
        Label: item.label,
        Count: item.count,
      })),
      ...dashboardStats.countByPerson.map((item) => ({
        Category: "Person",
        Label: item.label,
        Count: item.count,
      })),
      ...dashboardStats.countByTeam.map((item) => ({
        Category: "Team",
        Label: item.label,
        Count: item.count,
      })),
    ];

    downloadCsvFile(
      `graymills-taskboard-dashboard-breakdowns-${todayFileStamp()}.csv`,
      rows,
      ["Category", "Label", "Count"],
    );
  }

  async function loadProfile(userId: string) {
    setProfileMessage("");

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, profile_color, is_active")
      .eq("id", userId)
      .single();

    if (error) {
      setProfile(null);
      setProfileMessage(
        `Signed in, but profile could not be loaded yet: ${error.message}`,
      );
      return;
    }

    setProfile(data as Profile);
  }

  async function loadAdminData() {
    if (!canManageWorkspace) return;

    const [projectResult, teamResult, profileResult, teamMembersResult] =
      await Promise.all([
        supabase
          .from("projects")
          .select(
            "id, name, description, status, target_date, project_color, is_active",
          )
          .order("is_active", { ascending: false })
          .order("name"),
        supabase
          .from("teams")
          .select("id, name, description, team_color, is_active")
          .order("is_active", { ascending: false })
          .order("name"),
        supabase
          .from("profiles")
          .select("id, email, full_name, profile_color, role, is_active")
          .order("is_active", { ascending: false })
          .order("full_name"),
        supabase.from("team_members").select("team_id, profile_id"),
      ]);

    if (projectResult.error) {
      setAdminMessage(
        `Could not load admin projects: ${projectResult.error.message}`,
      );
      return;
    }

    if (teamResult.error) {
      setAdminMessage(
        `Could not load admin teams: ${teamResult.error.message}`,
      );
      return;
    }

    if (profileResult.error) {
      setAdminMessage(
        `Could not load admin users: ${profileResult.error.message}`,
      );
      return;
    }

    if (teamMembersResult.error) {
      setAdminMessage(
        `Could not load team memberships: ${teamMembersResult.error.message}`,
      );
      return;
    }

    setAdminProjects((projectResult.data ?? []) as ProjectRow[]);
    setAdminTeams((teamResult.data ?? []) as TeamRow[]);
    setAdminProfiles((profileResult.data ?? []) as ProfileRow[]);
    setTeamMemberships((teamMembersResult.data ?? []) as TeamMemberRow[]);
  }

  function startEditUser(userProfile: ProfileRow) {
    setEditingUserId(userProfile.id);
    setEditUserFullName(userProfile.full_name ?? "");
    setEditUserRole(userProfile.role ?? "member");
    setEditUserColor(userProfile.profile_color || "#2563EB");
  }

  async function handleSaveUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || !editingUserId) return;

    const cleanName = editUserFullName.trim();

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: cleanName || null,
        role: editUserRole,
        profile_color: editUserColor,
      })
      .eq("id", editingUserId);

    if (error) {
      setAdminMessage(`Could not save user: ${error.message}`);
      return;
    }

    if (editingUserId === session?.user.id) {
      await loadProfile(editingUserId);
    }

    setEditingUserId("");
    setAdminMessage("User saved.");
    await refreshAllData();
  }

  async function setUserActive(userId: string, active: boolean) {
    if (!isAdmin) return;

    if (!active && userId === session?.user.id) {
      setAdminMessage(
        "You cannot deactivate your own active admin account from here.",
      );
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ is_active: active })
      .eq("id", userId);

    if (error) {
      setAdminMessage(
        `Could not ${active ? "activate" : "deactivate"} user: ${error.message}`,
      );
      return;
    }

    setAdminMessage(
      active
        ? "User activated."
        : "User deactivated. Existing task history is preserved.",
    );
    await refreshAllData();
  }

  async function loadAttachments(taskId: string) {
    setAttachmentMessage("");

    const { data, error } = await supabase
      .from("task_attachments")
      .select(
        "id, task_id, uploaded_by_profile_id, file_name, file_path, file_type, file_size_bytes, created_at",
      )
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });

    if (error) {
      setAttachmentMessage(`Could not load attachments: ${error.message}`);
      setAttachments([]);
      return;
    }

    setAttachments((data ?? []) as TaskAttachmentRow[]);
  }

  async function loadComments(taskId: string) {
    setCommentMessage("");

    const { data, error } = await supabase
      .from("task_comments")
      .select("id, task_id, profile_id, comment_text, comment_body, created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    if (error) {
      setCommentMessage(`Could not load comments: ${error.message}`);
      setComments([]);
      return;
    }

    const rawComments = (data ?? []) as TaskCommentRow[];
    const profileIds = Array.from(
      new Set(
        rawComments
          .map((comment) => comment.profile_id)
          .filter(Boolean) as string[],
      ),
    );

    let commenterMap = new Map<string, string>();

    if (profileIds.length > 0) {
      const { data: commentProfiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, profile_color")
        .in("id", profileIds);

      commenterMap = new Map(
        ((commentProfiles ?? []) as ProfileRow[]).map((profileRow) => [
          profileRow.id,
          displayProfileName(profileRow),
        ]),
      );
    }

    setComments(
      rawComments.map((comment) => ({
        ...comment,
        commenter_name: comment.profile_id
          ? (commenterMap.get(comment.profile_id) ?? "Unknown user")
          : "Unknown user",
      })),
    );
  }

  async function loadSubtasks(taskId: string) {
    setSubtaskMessage("");

    const { data, error } = await supabase
      .from("task_subtasks")
      .select(
        "id, task_id, created_by_profile_id, title, is_done, sort_order, created_at, updated_at, completed_at",
      )
      .eq("task_id", taskId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      setSubtaskMessage(`Could not load subtasks: ${error.message}`);
      setSubtasks([]);
      return;
    }

    const rawSubtasks = (data ?? []) as TaskSubtaskRow[];
    const profileIds = Array.from(
      new Set(
        rawSubtasks
          .map((subtask) => subtask.created_by_profile_id)
          .filter(Boolean) as string[],
      ),
    );

    let creatorMap = new Map<string, string>();

    if (profileIds.length > 0) {
      const { data: creatorProfiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, profile_color")
        .in("id", profileIds);

      creatorMap = new Map(
        ((creatorProfiles ?? []) as ProfileRow[]).map((profileRow) => [
          profileRow.id,
          displayProfileName(profileRow),
        ]),
      );
    }

    setSubtasks(
      rawSubtasks.map((subtask) => ({
        ...subtask,
        creator_name: subtask.created_by_profile_id
          ? (creatorMap.get(subtask.created_by_profile_id) ?? "Unknown user")
          : "Unknown user",
      })),
    );
  }

  async function loadActivity(taskId: string) {
    setActivityMessage("");

    const { data, error } = await supabase
      .from("activity_log")
      .select(
        "id, task_id, profile_id, activity_type, activity_text, metadata, created_at",
      )
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });

    if (error) {
      setActivityMessage(`Could not load activity: ${error.message}`);
      setActivities([]);
      return;
    }

    const rawActivities = (data ?? []) as TaskActivityRow[];
    const profileIds = Array.from(
      new Set(
        rawActivities
          .map((activity) => activity.profile_id)
          .filter(Boolean) as string[],
      ),
    );

    let actorMap = new Map<string, string>();

    if (profileIds.length > 0) {
      const { data: activityProfiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, profile_color")
        .in("id", profileIds);

      actorMap = new Map(
        ((activityProfiles ?? []) as ProfileRow[]).map((profileRow) => [
          profileRow.id,
          displayProfileName(profileRow),
        ]),
      );
    }

    setActivities(
      rawActivities.map((activity) => ({
        ...activity,
        actor_name: activity.profile_id
          ? (actorMap.get(activity.profile_id) ?? "Unknown user")
          : "System",
      })),
    );
  }

  async function logTaskActivity(
    taskId: string,
    activityType: string,
    activityText: string,
    metadata?: Record<string, unknown>,
  ) {
    if (!session?.user.id) return;

    const { error } = await supabase.from("activity_log").insert({
      task_id: taskId,
      profile_id: session.user.id,
      activity_type: activityType,
      activity_text: activityText,
      metadata: metadata ?? null,
    });

    if (error) {
      console.warn("Activity log failed", error.message);
    }
  }

  async function loadBoardTasks() {
    setLoadingTasks(true);
    setTaskMessage("");

    try {
      const { data: taskRows, error: taskError } = await supabase
        .from("tasks")
        .select(
          "id, project_id, title, description, status, priority, due_date, reminder_at, reminder_note, sort_order, blitzit_copied_at",
        )
        .eq("is_archived", false)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (taskError) {
        setTaskMessage(`Could not load tasks: ${taskError.message}`);
        setBoardTasks([]);
        return;
      }

      const [
        projectsResult,
        assigneesResult,
        profilesResult,
        teamsResult,
        taskTagsResult,
        tagsResult,
        attachmentsResult,
        commentsResult,
        subtasksResult,
      ] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, project_color, is_active")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("task_assignees")
          .select("task_id, assignment_type, profile_id, team_id"),
        supabase
          .from("profiles")
          .select("id, email, full_name, profile_color, role, is_active")
          .eq("is_active", true)
          .order("full_name"),
        supabase
          .from("teams")
          .select("id, name, team_color, is_active")
          .eq("is_active", true)
          .order("name"),
        supabase.from("task_tags").select("task_id, tag_id"),
        supabase.from("tags").select("id, name, tag_color"),
        supabase.from("task_attachments").select("task_id"),
        supabase.from("task_comments").select("task_id"),
        supabase.from("task_subtasks").select("task_id, is_done"),
      ]);

      if (projectsResult.error) {
        setTaskMessage(
          `Could not load projects: ${projectsResult.error.message}`,
        );
        return;
      }
      if (assigneesResult.error) {
        setTaskMessage(
          `Could not load task assignees: ${assigneesResult.error.message}`,
        );
        return;
      }
      if (profilesResult.error) {
        setTaskMessage(
          `Could not load profiles: ${profilesResult.error.message}`,
        );
        return;
      }
      if (teamsResult.error) {
        setTaskMessage(`Could not load teams: ${teamsResult.error.message}`);
        return;
      }
      if (taskTagsResult.error) {
        setTaskMessage(
          `Could not load task tags: ${taskTagsResult.error.message}`,
        );
        return;
      }
      if (tagsResult.error) {
        setTaskMessage(`Could not load tags: ${tagsResult.error.message}`);
        return;
      }
      if (attachmentsResult.error) {
        setTaskMessage(
          `Could not load attachment counts: ${attachmentsResult.error.message}`,
        );
        return;
      }
      if (commentsResult.error) {
        setTaskMessage(
          `Could not load comment counts: ${commentsResult.error.message}`,
        );
        return;
      }
      if (subtasksResult.error) {
        setTaskMessage(
          `Could not load subtask counts: ${subtasksResult.error.message}`,
        );
        return;
      }

      const projectRows = (projectsResult.data ?? []) as ProjectRow[];
      const profileRows = (profilesResult.data ?? []) as ProfileRow[];
      const teamRows = (teamsResult.data ?? []) as TeamRow[];
      const tasks = (taskRows ?? []) as TaskRow[];

      setProjects(projectRows);
      setProfiles(profileRows);
      setTeams(teamRows);

      if (!quickProjectId) setQuickProjectId(getDefaultProjectId(projectRows));
      if (!quickProfileId && session?.user.id)
        setQuickProfileId(session.user.id);
      if (!quickTeamId) setQuickTeamId(getDefaultTeamId(teamRows));

      const projectMap = new Map(
        projectRows.map((project) => [project.id, project]),
      );
      const profileMap = new Map(
        profileRows.map((profileRow) => [profileRow.id, profileRow]),
      );
      const teamMap = new Map(teamRows.map((team) => [team.id, team]));
      const tagMap = new Map(
        ((tagsResult.data ?? []) as TagRow[]).map((tag) => [tag.id, tag]),
      );

      const attachmentCountByTask = new Map<string, number>();
      ((attachmentsResult.data ?? []) as { task_id: string }[]).forEach(
        (row) => {
          attachmentCountByTask.set(
            row.task_id,
            (attachmentCountByTask.get(row.task_id) ?? 0) + 1,
          );
        },
      );

      const commentCountByTask = new Map<string, number>();
      ((commentsResult.data ?? []) as { task_id: string }[]).forEach((row) => {
        commentCountByTask.set(
          row.task_id,
          (commentCountByTask.get(row.task_id) ?? 0) + 1,
        );
      });

      const subtaskCountByTask = new Map<string, number>();
      const completedSubtaskCountByTask = new Map<string, number>();
      ((subtasksResult.data ?? []) as { task_id: string; is_done: boolean }[]).forEach((row) => {
        subtaskCountByTask.set(
          row.task_id,
          (subtaskCountByTask.get(row.task_id) ?? 0) + 1,
        );
        if (row.is_done) {
          completedSubtaskCountByTask.set(
            row.task_id,
            (completedSubtaskCountByTask.get(row.task_id) ?? 0) + 1,
          );
        }
      });

      const assigneesByTask = new Map<string, TaskAssigneeRow[]>();
      ((assigneesResult.data ?? []) as TaskAssigneeRow[]).forEach(
        (assignee) => {
          const existing = assigneesByTask.get(assignee.task_id) ?? [];
          existing.push(assignee);
          assigneesByTask.set(assignee.task_id, existing);
        },
      );

      const tagsByTask = new Map<string, string[]>();
      ((taskTagsResult.data ?? []) as TaskTagRow[]).forEach((taskTag) => {
        const tag = tagMap.get(taskTag.tag_id);
        if (!tag) return;
        const existing = tagsByTask.get(taskTag.task_id) ?? [];
        existing.push(tag.name);
        tagsByTask.set(taskTag.task_id, existing);
      });

      const formattedTasks: BoardTask[] = tasks.map((task) => {
        const taskAssignees = assigneesByTask.get(task.id) ?? [];

        const assigneeNames: string[] = [];
        const personColors: string[] = [];
        const teamColors: string[] = [];
        const teamNames: string[] = [];
        const profileIds = Array.from(
          new Set(
            taskAssignees
              .map((assignee) => assignee.profile_id)
              .filter(Boolean) as string[],
          ),
        );
        const teamIds = Array.from(
          new Set(
            taskAssignees
              .map((assignee) => assignee.team_id)
              .filter(Boolean) as string[],
          ),
        );
        const firstProfileId = profileIds[0] || "";
        const firstTeamId = teamIds[0] || "";

        taskAssignees.forEach((assignee) => {
          if (assignee.profile_id) {
            const assignedProfile = profileMap.get(assignee.profile_id);
            if (assignedProfile) {
              assigneeNames.push(displayProfileName(assignedProfile));
              personColors.push(assignedProfile.profile_color || "#2563EB");
            }
          }

          if (assignee.team_id) {
            const assignedTeam = teamMap.get(assignee.team_id);
            if (assignedTeam) {
              teamNames.push(assignedTeam.name);
              teamColors.push(assignedTeam.team_color || "#F97316");

              if (!assignee.profile_id) {
                assigneeNames.push(assignedTeam.name);
              }
            }
          }
        });

        const projectName = task.project_id
          ? (projectMap.get(task.project_id)?.name ??
            "Archived or missing project")
          : "No project";

        return {
          id: task.id,
          projectId: task.project_id,
          title: task.title,
          description: task.description,
          project: projectName,
          projectColor: normalizeProjectColor(
            task.project_id ? projectMap.get(task.project_id) : undefined,
          ),
          assignees: Array.from(new Set(assigneeNames)),
          team:
            teamNames.length > 0
              ? Array.from(new Set(teamNames)).join(", ")
              : "No team",
          priority: task.priority,
          due: formatDate(task.due_date),
          dueRaw: task.due_date,
          reminderAt: task.reminder_at,
          reminderNote: task.reminder_note,
          tags: tagsByTask.get(task.id) ?? [],
          personColors: Array.from(new Set(personColors)),
          teamColors: Array.from(new Set(teamColors)),
          status: task.status,
          sortOrder: task.sort_order,
          primaryProfileId: firstProfileId,
          primaryTeamId: firstTeamId,
          assignedProfileIds: profileIds,
          assignedTeamIds: teamIds,
          attachmentCount: attachmentCountByTask.get(task.id) ?? 0,
          commentCount: commentCountByTask.get(task.id) ?? 0,
          subtaskCount: subtaskCountByTask.get(task.id) ?? 0,
          completedSubtaskCount: completedSubtaskCountByTask.get(task.id) ?? 0,
          blitzitCopiedAt: task.blitzit_copied_at,
        };
      });

      setBoardTasks(formattedTasks);
    } finally {
      setLoadingTasks(false);
    }
  }

  async function loadArchivedTasks() {
    if (!canManageWorkspace) return;

    setLoadingArchivedTasks(true);

    try {
      const { data: archivedRows, error: archivedError } = await supabase
        .from("tasks")
        .select(
          "id, project_id, title, status, priority, due_date, created_at, updated_at",
        )
        .eq("is_archived", true)
        .order("updated_at", { ascending: false });

      if (archivedError) {
        setAdminMessage(
          `Could not load archived tasks: ${archivedError.message}`,
        );
        setArchivedTasks([]);
        return;
      }

      const [projectsResult, assigneesResult, profilesResult, teamsResult] =
        await Promise.all([
          supabase
            .from("projects")
            .select("id, name, project_color, is_active")
            .order("name"),
          supabase
            .from("task_assignees")
            .select("task_id, assignment_type, profile_id, team_id"),
          supabase
            .from("profiles")
            .select("id, email, full_name, profile_color, role, is_active")
            .order("full_name"),
          supabase
            .from("teams")
            .select("id, name, team_color, is_active")
            .order("name"),
        ]);

      if (projectsResult.error) {
        setAdminMessage(
          `Could not load archived task projects: ${projectsResult.error.message}`,
        );
        return;
      }
      if (assigneesResult.error) {
        setAdminMessage(
          `Could not load archived task assignments: ${assigneesResult.error.message}`,
        );
        return;
      }
      if (profilesResult.error) {
        setAdminMessage(
          `Could not load archived task profiles: ${profilesResult.error.message}`,
        );
        return;
      }
      if (teamsResult.error) {
        setAdminMessage(
          `Could not load archived task teams: ${teamsResult.error.message}`,
        );
        return;
      }

      const projectMap = new Map(
        ((projectsResult.data ?? []) as ProjectRow[]).map((project) => [
          project.id,
          project,
        ]),
      );
      const profileMap = new Map(
        ((profilesResult.data ?? []) as ProfileRow[]).map((profileRow) => [
          profileRow.id,
          profileRow,
        ]),
      );
      const teamMap = new Map(
        ((teamsResult.data ?? []) as TeamRow[]).map((team) => [team.id, team]),
      );

      const assigneesByTask = new Map<string, TaskAssigneeRow[]>();
      ((assigneesResult.data ?? []) as TaskAssigneeRow[]).forEach(
        (assignee) => {
          const existing = assigneesByTask.get(assignee.task_id) ?? [];
          existing.push(assignee);
          assigneesByTask.set(assignee.task_id, existing);
        },
      );

      const formattedArchivedTasks: ArchivedTask[] = (
        (archivedRows ?? []) as (TaskRow & {
          created_at?: string | null;
          updated_at?: string | null;
        })[]
      ).map((task) => {
        const taskAssignees = assigneesByTask.get(task.id) ?? [];
        const assigneeNames: string[] = [];
        const teamNames: string[] = [];

        taskAssignees.forEach((assignee) => {
          if (assignee.profile_id) {
            const assignedProfile = profileMap.get(assignee.profile_id);
            if (assignedProfile)
              assigneeNames.push(displayProfileName(assignedProfile));
          }

          if (assignee.team_id) {
            const assignedTeam = teamMap.get(assignee.team_id);
            if (assignedTeam) teamNames.push(assignedTeam.name);
          }
        });

        const updatedAt = task.updated_at ?? null;
        const archivedDate = updatedAt ? new Date(updatedAt) : null;

        return {
          id: task.id,
          title: task.title,
          project: task.project_id
            ? (projectMap.get(task.project_id)?.name ??
              "Archived or missing project")
            : "No project",
          assignees: Array.from(new Set(assigneeNames)),
          team:
            teamNames.length > 0
              ? Array.from(new Set(teamNames)).join(", ")
              : "No team",
          status: task.status,
          priority: task.priority,
          due: formatDate(task.due_date),
          archivedDisplayDate:
            archivedDate && !Number.isNaN(archivedDate.getTime())
              ? archivedDate.toLocaleString()
              : "Unknown",
          updatedAt,
          createdAt: task.created_at ?? null,
        };
      });

      setArchivedTasks(formattedArchivedTasks);
    } finally {
      setLoadingArchivedTasks(false);
    }
  }

  async function archiveSelectedActiveTasks() {
    const taskIdsToArchive = selectedActiveTaskIds.filter((taskId) =>
      boardTasks.some((task) => task.id === taskId),
    );

    if (taskIdsToArchive.length === 0) {
      setTaskMessage("Select one or more tasks to archive.");
      return;
    }

    const confirmed = window.confirm(
      `Archive ${taskIdsToArchive.length} selected task${taskIdsToArchive.length === 1 ? "" : "s"}?\n\nArchived tasks are hidden from the active board but remain available in Admin > Archived Tasks.`,
    );

    if (!confirmed) return;

    setBulkArchivingTasks(true);
    setTaskMessage("");

    try {
      const selectedTasks = boardTasks.filter((task) =>
        taskIdsToArchive.includes(task.id),
      );

      await Promise.all(
        selectedTasks.map((task) =>
          logTaskActivity(
            task.id,
            "archived",
            `Archived task by bulk action: ${task.title}.`,
            { title: task.title, bulk: true },
          ),
        ),
      );

      const { error } = await supabase
        .from("tasks")
        .update({ is_archived: true })
        .in("id", taskIdsToArchive);

      if (error) {
        setTaskMessage(`Could not archive selected tasks: ${error.message}`);
        return;
      }

      setSelectedActiveTaskIds([]);
      setTaskMessage(
        `Archived ${taskIdsToArchive.length} selected task${taskIdsToArchive.length === 1 ? "" : "s"}.`,
      );
      await Promise.all([loadBoardTasks(), loadArchivedTasks()]);
    } finally {
      setBulkArchivingTasks(false);
    }
  }

  async function restoreSelectedArchivedTasks() {
    if (!canManageWorkspace) return;

    const taskIdsToRestore = selectedArchivedTaskIds.filter((taskId) =>
      archivedTasks.some((task) => task.id === taskId),
    );

    if (taskIdsToRestore.length === 0) {
      setAdminMessage("Select one or more archived tasks to restore.");
      return;
    }

    const confirmed = window.confirm(
      `Restore ${taskIdsToRestore.length} selected archived task${taskIdsToRestore.length === 1 ? "" : "s"}?`,
    );

    if (!confirmed) return;

    setBulkArchivedAction("restore");
    setAdminMessage("");

    try {
      const tasksToRestore = archivedTasks.filter((task) =>
        taskIdsToRestore.includes(task.id),
      );

      const { error } = await supabase
        .from("tasks")
        .update({ is_archived: false })
        .in("id", taskIdsToRestore);

      if (error) {
        setAdminMessage(`Could not restore selected tasks: ${error.message}`);
        return;
      }

      await Promise.all(
        tasksToRestore.map((task) =>
          logTaskActivity(
            task.id,
            "restored",
            `Restored archived task by bulk action: ${task.title}.`,
            { title: task.title, bulk: true },
          ),
        ),
      );

      setSelectedArchivedTaskIds([]);
      setAdminMessage(
        `Restored ${taskIdsToRestore.length} archived task${taskIdsToRestore.length === 1 ? "" : "s"}.`,
      );
      await Promise.all([loadBoardTasks(), loadArchivedTasks()]);
    } finally {
      setBulkArchivedAction(null);
    }
  }

  async function permanentlyDeleteSelectedArchivedTasks() {
    if (!isAdmin) return;

    const taskIdsToDelete = selectedArchivedTaskIds.filter((taskId) =>
      archivedTasks.some((task) => task.id === taskId),
    );

    if (taskIdsToDelete.length === 0) {
      setAdminMessage(
        "Select one or more archived tasks to permanently delete.",
      );
      return;
    }

    const firstConfirm = window.confirm(
      `Permanently delete ${taskIdsToDelete.length} selected archived task${taskIdsToDelete.length === 1 ? "" : "s"}?\n\nThis will delete task records, comments, assignments, tags, activity history, attachment records, stored attachment files, notification dismissals, and custom field values. This cannot be undone.`,
    );

    if (!firstConfirm) return;

    const typedConfirm = window.prompt(
      `Type DELETE to permanently delete ${taskIdsToDelete.length} archived task${taskIdsToDelete.length === 1 ? "" : "s"}.`,
    );

    if (typedConfirm !== "DELETE") {
      setAdminMessage(
        "Permanent delete canceled. You must type DELETE exactly.",
      );
      return;
    }

    setBulkArchivedAction("delete");
    setAdminMessage("");

    try {
      const { data: attachments, error: attachmentLoadError } = await supabase
        .from("task_attachments")
        .select("id, file_path")
        .in("task_id", taskIdsToDelete);

      if (attachmentLoadError) {
        setAdminMessage(
          `Could not load attachment records before delete: ${attachmentLoadError.message}`,
        );
        return;
      }

      const filePaths = (attachments ?? [])
        .map((attachment) => attachment.file_path)
        .filter(Boolean);

      if (filePaths.length > 0) {
        const { error: storageDeleteError } = await supabase.storage
          .from("task-attachments")
          .remove(filePaths);

        if (storageDeleteError) {
          setAdminMessage(
            `Could not delete stored attachment files: ${storageDeleteError.message}`,
          );
          return;
        }
      }

      const cleanupSteps: Array<{ tableName: string; label: string }> = [
        {
          tableName: "notification_dismissals",
          label: "notification dismissals",
        },
        { tableName: "task_custom_field_values", label: "custom field values" },
        { tableName: "task_tags", label: "task tags" },
        { tableName: "task_assignees", label: "task assignments" },
        { tableName: "task_comments", label: "comments" },
        { tableName: "task_subtasks", label: "subtasks" },
        { tableName: "task_attachments", label: "attachment records" },
        { tableName: "activity_log", label: "activity history" },
      ];

      for (const step of cleanupSteps) {
        const { error } = await supabase
          .from(step.tableName)
          .delete()
          .in("task_id", taskIdsToDelete);

        if (error) {
          setAdminMessage(
            `Could not delete ${step.label}: ${error.message}. Tasks were not permanently deleted.`,
          );
          return;
        }
      }

      const { error: taskDeleteError } = await supabase
        .from("tasks")
        .delete()
        .in("id", taskIdsToDelete)
        .eq("is_archived", true);

      if (taskDeleteError) {
        setAdminMessage(
          `Could not permanently delete selected tasks: ${taskDeleteError.message}`,
        );
        return;
      }

      setSelectedArchivedTaskIds([]);
      setAdminMessage(
        `Permanently deleted ${taskIdsToDelete.length} archived task${taskIdsToDelete.length === 1 ? "" : "s"}.`,
      );
      await Promise.all([loadBoardTasks(), loadArchivedTasks()]);
    } finally {
      setBulkArchivedAction(null);
    }
  }

  async function restoreArchivedTask(taskId: string) {
    if (!canManageWorkspace) return;

    const taskToRestore = archivedTasks.find((task) => task.id === taskId);
    const confirmed = window.confirm(
      `Restore this archived task?\n\n${taskToRestore?.title ?? "Selected task"}\n\nIt will return to the active board in its previous status column.`,
    );

    if (!confirmed) return;

    setRestoringArchivedTaskId(taskId);
    setAdminMessage("");

    try {
      const { error } = await supabase
        .from("tasks")
        .update({ is_archived: false })
        .eq("id", taskId);

      if (error) {
        setAdminMessage(`Could not restore task: ${error.message}`);
        return;
      }

      await logTaskActivity(
        taskId,
        "restored",
        `Restored archived task${taskToRestore?.title ? `: ${taskToRestore.title}` : ""}.`,
        { title: taskToRestore?.title ?? null },
      );

      setSelectedArchivedTaskIds((currentIds) =>
        currentIds.filter((id) => id !== taskId),
      );
      setAdminMessage("Archived task restored to the active board.");
      await Promise.all([loadBoardTasks(), loadArchivedTasks()]);
    } finally {
      setRestoringArchivedTaskId(null);
    }
  }

  async function permanentlyDeleteArchivedTask(taskId: string) {
    if (!isAdmin) return;

    const taskToDelete = archivedTasks.find((task) => task.id === taskId);

    const firstConfirm = window.confirm(
      `Permanently delete this archived task?\n\n${taskToDelete?.title ?? "Selected task"}\n\nThis will delete the task record, comments, assignments, tags, activity history, attachment records, and stored attachment files. This cannot be undone.`,
    );

    if (!firstConfirm) return;

    const typedConfirm = window.prompt(
      "Type DELETE to permanently delete this archived task.",
    );

    if (typedConfirm !== "DELETE") {
      setAdminMessage(
        "Permanent delete canceled. You must type DELETE exactly.",
      );
      return;
    }

    setDeletingArchivedTaskId(taskId);
    setAdminMessage("");

    try {
      const { data: attachments, error: attachmentLoadError } = await supabase
        .from("task_attachments")
        .select("id, file_path")
        .eq("task_id", taskId);

      if (attachmentLoadError) {
        setAdminMessage(
          `Could not load attachment records before delete: ${attachmentLoadError.message}`,
        );
        return;
      }

      const filePaths = (attachments ?? [])
        .map((attachment) => attachment.file_path)
        .filter(Boolean);

      if (filePaths.length > 0) {
        const { error: storageDeleteError } = await supabase.storage
          .from("task-attachments")
          .remove(filePaths);

        if (storageDeleteError) {
          setAdminMessage(
            `Could not delete stored attachment files: ${storageDeleteError.message}`,
          );
          return;
        }
      }

      const cleanupSteps: Array<{ tableName: string; label: string }> = [
        {
          tableName: "notification_dismissals",
          label: "notification dismissals",
        },
        { tableName: "task_custom_field_values", label: "custom field values" },
        { tableName: "task_tags", label: "task tags" },
        { tableName: "task_assignees", label: "task assignments" },
        { tableName: "task_comments", label: "comments" },
        { tableName: "task_subtasks", label: "subtasks" },
        { tableName: "task_attachments", label: "attachment records" },
        { tableName: "activity_log", label: "activity history" },
      ];

      for (const step of cleanupSteps) {
        const { error } = await supabase
          .from(step.tableName)
          .delete()
          .eq("task_id", taskId);

        if (error) {
          setAdminMessage(
            `Could not delete ${step.label}: ${error.message}. Task was not permanently deleted.`,
          );
          return;
        }
      }

      const { error: taskDeleteError } = await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId)
        .eq("is_archived", true);

      if (taskDeleteError) {
        setAdminMessage(
          `Could not permanently delete task: ${taskDeleteError.message}`,
        );
        return;
      }

      setSelectedArchivedTaskIds((currentIds) =>
        currentIds.filter((id) => id !== taskId),
      );
      setAdminMessage(
        `Permanently deleted archived task${taskToDelete?.title ? `: ${taskToDelete.title}` : ""}.`,
      );
      await Promise.all([loadBoardTasks(), loadArchivedTasks()]);
    } finally {
      setDeletingArchivedTaskId(null);
    }
  }

  async function refreshAllData() {
    await loadBoardTasks();
    await loadAdminData();
    await loadArchivedTasks();
  }

  async function readBackupTable(tableName: string) {
    const { data, error } = await supabase.from(tableName).select("*");

    if (error) {
      throw new Error(`${tableName}: ${error.message}`);
    }

    return data ?? [];
  }

  async function handleExportBackup() {
    if (!isAdmin) return;

    setExportingBackup(true);
    setBackupMessage("");

    try {
      const tableNames = [
        "profiles",
        "projects",
        "teams",
        "project_teams",
        "team_members",
        "tasks",
        "task_assignees",
        "tags",
        "task_tags",
        "task_comments",
        "task_subtasks",
        "task_attachments",
        "notification_preferences",
        "notification_dismissals",
        "custom_fields",
        "task_custom_field_values",
      ];

      const tableEntries = await Promise.all(
        tableNames.map(
          async (tableName) =>
            [tableName, await readBackupTable(tableName)] as const,
        ),
      );

      const data = Object.fromEntries(tableEntries);

      // Export integration presence without exposing webhook URLs or signing secrets in the JSON file.
      const { data: integrations, error: integrationsError } = await supabase
        .from("user_integrations")
        .select(
          "id, profile_id, integration_name, is_enabled, created_at, updated_at",
        );

      if (integrationsError) {
        throw new Error(`user_integrations: ${integrationsError.message}`);
      }

      data.user_integrations = integrations ?? [];

      const backup = {
        app: "Graymills TaskBoard",
        revision: APP_REVISION,
        exported_at: new Date().toISOString(),
        exported_by: session?.user.email ?? session?.user.id ?? "unknown",
        notes: [
          "Rev 1.22 backup export/restore.",
          "Blitzit webhook URLs and signing secrets are intentionally excluded.",
          "Attachment metadata is included, but file binary contents are not included in this JSON export.",
        ],
        data,
      };

      const prettyJson = JSON.stringify(backup, null, 2);
      const blob = new Blob([prettyJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const link = document.createElement("a");
      link.href = url;
      link.download = `graymills-taskboard-backup-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setBackupMessage(
        "Backup exported. Check your Downloads folder for the JSON file.",
      );
    } catch (error) {
      setBackupMessage(
        error instanceof Error
          ? `Backup export failed: ${error.message}`
          : "Backup export failed.",
      );
    } finally {
      setExportingBackup(false);
    }
  }

  const restoreTablePlan = [
    { tableName: "profiles", onConflict: "id" },
    { tableName: "teams", onConflict: "id" },
    { tableName: "projects", onConflict: "id" },
    { tableName: "project_teams", onConflict: "project_id,team_id" },
    { tableName: "team_members", onConflict: "team_id,profile_id" },
    { tableName: "tags", onConflict: "id" },
    { tableName: "custom_fields", onConflict: "id" },
    { tableName: "tasks", onConflict: "id" },
    { tableName: "task_assignees", onConflict: "id" },
    { tableName: "task_tags", onConflict: "task_id,tag_id" },
    { tableName: "task_comments", onConflict: "id" },
    { tableName: "task_subtasks", onConflict: "id" },
    { tableName: "task_attachments", onConflict: "id" },
    { tableName: "notification_preferences", onConflict: "profile_id" },
    { tableName: "notification_dismissals", onConflict: "profile_id,task_id" },
    { tableName: "task_custom_field_values", onConflict: "id" },
  ] as const;

  function clearRestorePreview() {
    setRestoreFileName("");
    setRestorePreview(null);
    setRestoreBackupData(null);
  }

  async function handleRestoreFileSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    if (!isAdmin) return;

    const file = event.target.files?.[0];

    if (!file) return;

    setBackupMessage("");
    setRestoreFileName(file.name);
    setRestorePreview(null);
    setRestoreBackupData(null);

    try {
      const fileText = await file.text();
      const parsed = JSON.parse(fileText) as {
        app?: string;
        data?: Record<string, unknown>;
      };

      if (parsed.app !== "Graymills TaskBoard") {
        throw new Error(
          "This does not look like a Graymills TaskBoard backup file.",
        );
      }

      if (!parsed.data || typeof parsed.data !== "object") {
        throw new Error("Backup file is missing its data section.");
      }

      const preview: Record<string, number> = {};
      const restoreData: Record<string, unknown[]> = {};

      restoreTablePlan.forEach(({ tableName }) => {
        const tableData = parsed.data?.[tableName];
        if (Array.isArray(tableData)) {
          restoreData[tableName] = tableData;
          preview[tableName] = tableData.length;
        } else {
          restoreData[tableName] = [];
          preview[tableName] = 0;
        }
      });

      setRestorePreview(preview);
      setRestoreBackupData(restoreData);
      setBackupMessage(
        "Backup file loaded for preview. Review the counts before restoring.",
      );
    } catch (error) {
      clearRestorePreview();
      setBackupMessage(
        error instanceof Error
          ? `Backup preview failed: ${error.message}`
          : "Backup preview failed.",
      );
    } finally {
      event.target.value = "";
    }
  }

  async function upsertRestoreRows(
    tableName: string,
    rows: unknown[],
    onConflict: string,
  ) {
    if (rows.length === 0) return;

    const { error } = await supabase
      .from(tableName)
      .upsert(rows as never[], { onConflict });

    if (error) {
      throw new Error(`${tableName}: ${error.message}`);
    }
  }

  async function handleRestoreBackup() {
    if (!isAdmin || !restoreBackupData) return;

    const confirmed = window.confirm(
      "Restore this backup now? This will merge records into Supabase using their saved IDs. It will not delete records that are not in the backup. Blitzit secrets and uploaded file contents are not restored.",
    );

    if (!confirmed) return;

    setRestoringBackup(true);
    setBackupMessage("Restoring backup...");

    try {
      for (const { tableName, onConflict } of restoreTablePlan) {
        await upsertRestoreRows(
          tableName,
          restoreBackupData[tableName] ?? [],
          onConflict,
        );
      }

      setBackupMessage(
        "Backup restored. Existing matching records were updated and missing records were added. Refreshing app data...",
      );
      clearRestorePreview();
      await refreshAllData();
    } catch (error) {
      setBackupMessage(
        error instanceof Error
          ? `Backup restore failed: ${error.message}`
          : "Backup restore failed.",
      );
    } finally {
      setRestoringBackup(false);
    }
  }

  async function loadBlitzitSettings() {
    if (!session?.user.id) return;

    const { data, error } = await supabase
      .from("user_integrations")
      .select("webhook_url, webhook_header, is_enabled")
      .eq("profile_id", session.user.id)
      .eq("integration_name", "blitzit")
      .maybeSingle();

    if (error) {
      setBlitzitMessage(`Could not load Blitzit settings: ${error.message}`);
      return;
    }

    if (data) {
      setBlitzitWebhookUrl(data.webhook_url ?? "");
      setBlitzitSigningSecret(data.webhook_header ?? "");

      if (data.webhook_url && data.webhook_header) {
        setBlitzitMessage("Blitzit settings loaded for this user.");
      }
    }
  }

  async function saveBlitzitSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session?.user.id) {
      setBlitzitMessage(
        "You must be signed in before saving Blitzit settings.",
      );
      return;
    }

    if (!blitzitWebhookUrl.trim() || !blitzitSigningSecret.trim()) {
      setBlitzitMessage(
        "Paste both the Blitzit Webhook URL and Signing Secret.",
      );
      return;
    }

    setSavingBlitzitSettings(true);
    setBlitzitMessage("");

    const { error } = await supabase.from("user_integrations").upsert(
      {
        profile_id: session.user.id,
        integration_name: "blitzit",
        webhook_url: blitzitWebhookUrl.trim(),
        webhook_header: blitzitSigningSecret.trim(),
        is_enabled: true,
      },
      { onConflict: "profile_id,integration_name" },
    );

    if (error) {
      setBlitzitMessage(`Could not save Blitzit settings: ${error.message}`);
      setSavingBlitzitSettings(false);
      return;
    }

    setBlitzitMessage("Blitzit settings saved.");
    setSavingBlitzitSettings(false);
  }

  async function loadNotificationSettings() {
    if (!session?.user.id) return;

    const { data: preferences, error: preferencesError } = await supabase
      .from("notification_preferences")
      .select(
        "profile_id, in_app_enabled, email_enabled, reminder_due_enabled, include_overdue, updated_at",
      )
      .eq("profile_id", session.user.id)
      .maybeSingle();

    if (preferencesError) {
      setNotificationMessage(
        `Could not load notification preferences: ${preferencesError.message}`,
      );
    } else if (preferences) {
      const row = preferences as NotificationPreferenceRow;
      setInAppNotificationsEnabled(row.in_app_enabled);
      setEmailNotificationsEnabled(row.email_enabled);
      setReminderDueNotificationsEnabled(row.reminder_due_enabled);
      setIncludeOverdueNotifications(row.include_overdue);
    }

    const { data: dismissals, error: dismissalsError } = await supabase
      .from("notification_dismissals")
      .select("profile_id, task_id, dismissed_at")
      .eq("profile_id", session.user.id);

    if (dismissalsError) {
      setNotificationMessage(
        `Could not load notification dismissals: ${dismissalsError.message}`,
      );
      return;
    }

    setDismissedNotificationTaskIds(
      ((dismissals ?? []) as NotificationDismissalRow[]).map(
        (row) => row.task_id,
      ),
    );
  }

  async function saveNotificationSettings(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!session?.user.id) {
      setNotificationMessage(
        "You must be signed in before saving notification preferences.",
      );
      return;
    }

    setSavingNotificationSettings(true);
    setNotificationMessage("");

    const { error } = await supabase.from("notification_preferences").upsert(
      {
        profile_id: session.user.id,
        in_app_enabled: inAppNotificationsEnabled,
        email_enabled: emailNotificationsEnabled,
        reminder_due_enabled: reminderDueNotificationsEnabled,
        include_overdue: includeOverdueNotifications,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    );

    if (error) {
      setNotificationMessage(
        `Could not save notification preferences: ${error.message}`,
      );
      setSavingNotificationSettings(false);
      return;
    }

    setNotificationMessage(
      emailNotificationsEnabled
        ? "Notification preferences saved. Email delivery is still pending SMTP setup."
        : "Notification preferences saved.",
    );
    setSavingNotificationSettings(false);
  }

  async function dismissNotification(taskId: string) {
    if (!session?.user.id) return;

    const { error } = await supabase.from("notification_dismissals").upsert(
      {
        profile_id: session.user.id,
        task_id: taskId,
        dismissed_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,task_id" },
    );

    if (error) {
      setNotificationMessage(
        `Could not dismiss notification: ${error.message}`,
      );
      return;
    }

    setDismissedNotificationTaskIds((current) =>
      current.includes(taskId) ? current : [...current, taskId],
    );
  }

  async function clearDismissedNotifications() {
    if (!session?.user.id) return;

    const { error } = await supabase
      .from("notification_dismissals")
      .delete()
      .eq("profile_id", session.user.id);

    if (error) {
      setNotificationMessage(
        `Could not clear dismissed notifications: ${error.message}`,
      );
      return;
    }

    setDismissedNotificationTaskIds([]);
    setNotificationMessage("Dismissed notifications cleared.");
  }

  function openTaskFromNotification(task: BoardTask) {
    setNotificationsOpen(false);
    openTaskEditor(task);
  }

  async function copyTaskToBlitzit(task: BoardTask) {
    if (!session?.access_token) {
      setBlitzitMessage("You must be signed in before copying to Blitzit.");
      return;
    }

    if (!blitzitReady) {
      setBlitzitMessage(
        "Save your Blitzit Webhook URL and Signing Secret first.",
      );
      return;
    }

    setCopyingTaskId(task.id);
    setBlitzitMessage("");

    try {
      const response = await fetch("/api/blitzit/copy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ taskId: task.id }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setBlitzitMessage(result?.error || "Could not copy task to Blitzit.");
        setCopyingTaskId(null);
        return;
      }

      await logTaskActivity(
        task.id,
        task.blitzitCopiedAt ? "blitzit_recopied" : "blitzit_copied",
        `${task.blitzitCopiedAt ? "Re-copied" : "Copied"} task to Blitzit.`,
        {
          title: task.title,
        },
      );

      setBlitzitMessage(`Copied to Blitzit: ${task.title}`);
      await loadBoardTasks();
    } catch (error) {
      setBlitzitMessage(
        error instanceof Error
          ? `Blitzit copy failed: ${error.message}`
          : "Blitzit copy failed.",
      );
    } finally {
      setCopyingTaskId(null);
    }
  }

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageWorkspace) return;

    const cleanName = newProjectName.trim();
    if (!cleanName) {
      setAdminMessage("Enter a project name.");
      return;
    }

    setAdminMessage("");

    const { error } = await supabase.from("projects").insert({
      name: cleanName,
      description: newProjectDescription.trim() || null,
      status: newProjectStatus,
      target_date: newProjectTargetDate || null,
      project_color: newProjectColor,
      owner_profile_id: session?.user.id ?? null,
      is_active: true,
    });

    if (error) {
      setAdminMessage(`Could not create project: ${error.message}`);
      return;
    }

    setNewProjectName("");
    setNewProjectDescription("");
    setNewProjectStatus("active");
    setNewProjectTargetDate("");
    setNewProjectColor("#2563EB");
    setAdminMessage("Project created.");
    await refreshAllData();
  }

  function startEditProject(project: ProjectRow) {
    setEditingProjectId(project.id);
    setEditProjectName(project.name);
    setEditProjectDescription(project.description ?? "");
    setEditProjectStatus(project.status ?? "active");
    setEditProjectTargetDate(project.target_date ?? "");
    setEditProjectColor(project.project_color || "#2563EB");
  }

  async function handleSaveProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageWorkspace || !editingProjectId) return;

    const cleanName = editProjectName.trim();
    if (!cleanName) {
      setAdminMessage("Project name cannot be blank.");
      return;
    }

    const { error } = await supabase
      .from("projects")
      .update({
        name: cleanName,
        description: editProjectDescription.trim() || null,
        status: editProjectStatus,
        target_date: editProjectTargetDate || null,
        project_color: editProjectColor,
      })
      .eq("id", editingProjectId);

    if (error) {
      setAdminMessage(`Could not save project: ${error.message}`);
      return;
    }

    setEditingProjectId("");
    setAdminMessage("Project saved.");
    await refreshAllData();
  }

  async function archiveProject(projectId: string) {
    if (!canManageWorkspace) return;

    const { error } = await supabase
      .from("projects")
      .update({ is_active: false, status: "archived" })
      .eq("id", projectId);

    if (error) {
      setAdminMessage(`Could not archive project: ${error.message}`);
      return;
    }

    setAdminMessage("Project archived. Existing tasks are preserved.");
    await refreshAllData();
  }

  async function restoreProject(projectId: string) {
    if (!canManageWorkspace) return;

    const { error } = await supabase
      .from("projects")
      .update({ is_active: true, status: "active" })
      .eq("id", projectId);

    if (error) {
      setAdminMessage(`Could not restore project: ${error.message}`);
      return;
    }

    setAdminMessage("Project restored.");
    await refreshAllData();
  }

  function getTeamMemberProfileIds(teamId: string) {
    return teamMemberships
      .filter((membership) => membership.team_id === teamId)
      .map((membership) => membership.profile_id);
  }

  function getProfileNameById(profileId: string) {
    const foundProfile =
      adminProfiles.find((profileRow) => profileRow.id === profileId) ||
      profiles.find((profileRow) => profileRow.id === profileId);

    return foundProfile ? displayProfileName(foundProfile) : "Unknown user";
  }

  function getAvailableTeamMembers(teamId: string) {
    const currentMemberIds = getTeamMemberProfileIds(teamId);

    return adminProfiles.filter(
      (profileRow) =>
        profileRow.is_active !== false &&
        !currentMemberIds.includes(profileRow.id),
    );
  }

  async function addTeamMember(teamId: string) {
    if (!canManageWorkspace) return;

    const profileIdToAdd = memberToAddByTeam[teamId];

    if (!profileIdToAdd) {
      setAdminMessage("Choose a user to add to the team.");
      return;
    }

    setTeamMembershipBusy(`${teamId}:${profileIdToAdd}:add`);
    setAdminMessage("");

    const { error } = await supabase.from("team_members").insert({
      team_id: teamId,
      profile_id: profileIdToAdd,
    });

    if (error) {
      setAdminMessage(`Could not add team member: ${error.message}`);
      setTeamMembershipBusy(null);
      return;
    }

    setMemberToAddByTeam((current) => ({ ...current, [teamId]: "" }));
    setAdminMessage("Team member added.");
    await refreshAllData();
    setTeamMembershipBusy(null);
  }

  async function removeTeamMember(teamId: string, profileIdToRemove: string) {
    if (!canManageWorkspace) return;

    const confirmed = window.confirm(
      `Remove ${getProfileNameById(profileIdToRemove)} from this team? Team-assigned tasks will no longer be visible to them through this team.`,
    );

    if (!confirmed) return;

    setTeamMembershipBusy(`${teamId}:${profileIdToRemove}:remove`);
    setAdminMessage("");

    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("profile_id", profileIdToRemove);

    if (error) {
      setAdminMessage(`Could not remove team member: ${error.message}`);
      setTeamMembershipBusy(null);
      return;
    }

    setAdminMessage("Team member removed.");
    await refreshAllData();
    setTeamMembershipBusy(null);
  }

  async function handleCreateTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageWorkspace) return;

    const cleanName = newTeamName.trim();
    if (!cleanName) {
      setAdminMessage("Enter a team name.");
      return;
    }

    const { error } = await supabase.from("teams").insert({
      name: cleanName,
      description: newTeamDescription.trim() || null,
      team_color: newTeamColor,
      is_active: true,
    });

    if (error) {
      setAdminMessage(`Could not create team: ${error.message}`);
      return;
    }

    setNewTeamName("");
    setNewTeamDescription("");
    setNewTeamColor("#2563EB");
    setAdminMessage("Team created.");
    await refreshAllData();
  }

  function startEditTeam(team: TeamRow) {
    setEditingTeamId(team.id);
    setEditTeamName(team.name);
    setEditTeamDescription(team.description ?? "");
    setEditTeamColor(team.team_color || "#2563EB");
  }

  async function handleSaveTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageWorkspace || !editingTeamId) return;

    const cleanName = editTeamName.trim();
    if (!cleanName) {
      setAdminMessage("Team name cannot be blank.");
      return;
    }

    const { error } = await supabase
      .from("teams")
      .update({
        name: cleanName,
        description: editTeamDescription.trim() || null,
        team_color: editTeamColor,
      })
      .eq("id", editingTeamId);

    if (error) {
      setAdminMessage(`Could not save team: ${error.message}`);
      return;
    }

    setEditingTeamId("");
    setAdminMessage("Team saved.");
    await refreshAllData();
  }

  async function archiveTeam(teamId: string) {
    if (!canManageWorkspace) return;

    const { error } = await supabase
      .from("teams")
      .update({ is_active: false })
      .eq("id", teamId);

    if (error) {
      setAdminMessage(`Could not archive team: ${error.message}`);
      return;
    }

    setAdminMessage("Team archived. Existing task history is preserved.");
    await refreshAllData();
  }

  async function restoreTeam(teamId: string) {
    if (!canManageWorkspace) return;

    const { error } = await supabase
      .from("teams")
      .update({ is_active: true })
      .eq("id", teamId);

    if (error) {
      setAdminMessage(`Could not restore team: ${error.message}`);
      return;
    }

    setAdminMessage("Team restored.");
    await refreshAllData();
  }

  function handleEmailTaskFile(file: File | null) {
    if (!file) {
      setEmailTaskFile(null);
      setEmailTaskMessage("");
      return;
    }

    if (!isEmailTaskFile(file)) {
      setEmailTaskFile(null);
      setEmailTaskMessage(
        "Please choose a saved Outlook email file ending in .msg or .eml.",
      );
      return;
    }

    setEmailTaskFile(file);
    setEmailTaskMessage(`Selected email file: ${file.name}`);
  }

  function handleEmailTaskInput(event: React.ChangeEvent<HTMLInputElement>) {
    handleEmailTaskFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  function handleEmailTaskDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    handleEmailTaskFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function createTaskFromEmailFile() {
    if (!session?.user.id || !profile) {
      setEmailTaskMessage(
        "You must be signed in before creating a task from an email file.",
      );
      return;
    }

    if (!emailTaskFile) {
      setEmailTaskMessage(
        "Choose or drop a saved .msg or .eml email file first.",
      );
      return;
    }

    if (!isEmailTaskFile(emailTaskFile)) {
      setEmailTaskMessage(
        "Please choose a saved Outlook email file ending in .msg or .eml.",
      );
      return;
    }

    const selectedProfileId = quickProfileId || session.user.id;
    const selectedTeamId = quickTeamId;

    if (!selectedProfileId && !selectedTeamId) {
      setEmailTaskMessage(
        "Choose a person, a team, or both before creating the email task.",
      );
      return;
    }

    setCreatingEmailTask(true);
    setEmailTaskMessage("");

    try {
      const title = titleFromEmailFileName(emailTaskFile.name);
      const nextSortOrder =
        boardTasks.filter((task) => task.status === "backlog").length * 10 +
        100;

      const { data: newTask, error: taskError } = await supabase
        .from("tasks")
        .insert({
          project_id: quickProjectId || null,
          created_by_profile_id: session.user.id,
          title,
          description: `Created from saved Outlook email file: ${emailTaskFile.name}`,
          status: "backlog",
          priority: "normal",
          sort_order: nextSortOrder,
        })
        .select("id")
        .single();

      if (taskError) {
        setEmailTaskMessage(
          `Could not create email task: ${taskError.message}`,
        );
        return;
      }

      const { error: assigneeError } = await supabase
        .from("task_assignees")
        .insert({
          task_id: newTask.id,
          profile_id: selectedProfileId || null,
          team_id: selectedTeamId || null,
          assignment_type: buildAssignmentType(
            selectedProfileId,
            selectedTeamId,
          ),
        });

      if (assigneeError) {
        setEmailTaskMessage(
          `Task was created, but assignment failed: ${assigneeError.message}`,
        );
        await loadBoardTasks();
        return;
      }

      const storagePath = `${session.user.id}/${newTask.id}/${Date.now()}-${safeStorageName(emailTaskFile.name)}`;

      const { error: uploadError } = await supabase.storage
        .from("task-attachments")
        .upload(storagePath, emailTaskFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: emailTaskFile.type || "application/octet-stream",
        });

      if (uploadError) {
        setEmailTaskMessage(
          `Task was created, but the email file could not be attached: ${uploadError.message}`,
        );
        await loadBoardTasks();
        return;
      }

      const { error: attachmentError } = await supabase
        .from("task_attachments")
        .insert({
          task_id: newTask.id,
          uploaded_by_profile_id: session.user.id,
          file_name: emailTaskFile.name,
          file_path: storagePath,
          file_type: emailTaskFile.type || null,
          file_size_bytes: emailTaskFile.size,
        });

      if (attachmentError) {
        setEmailTaskMessage(
          `Email file uploaded, but the attachment record failed: ${attachmentError.message}`,
        );
        await loadBoardTasks();
        return;
      }

      await logTaskActivity(
        newTask.id,
        "created_from_email",
        `Created task from email file: ${emailTaskFile.name}.`,
        {
          file_name: emailTaskFile.name,
          file_size_bytes: emailTaskFile.size,
          project_id: quickProjectId || null,
          profile_ids: [selectedProfileId].filter(Boolean),
          team_ids: [selectedTeamId].filter(Boolean),
        },
      );

      await logTaskActivity(
        newTask.id,
        "attachment_added",
        `Attached original email file: ${emailTaskFile.name}.`,
        {
          file_name: emailTaskFile.name,
          file_size_bytes: emailTaskFile.size,
        },
      );

      setEmailTaskFile(null);
      setEmailTaskMessage(
        "Email task created and original email file attached.",
      );
      await loadBoardTasks();
    } finally {
      setCreatingEmailTask(false);
    }
  }

  function getColumnTaskContext(column: DisplayColumn) {
    const defaultProfileIds = quickProfileId
      ? [quickProfileId]
      : session?.user.id
        ? [session.user.id]
        : [];
    const defaultTeamIds = quickTeamId ? [quickTeamId] : [];

    let status = "backlog";
    let projectId = quickProjectId || null;
    let dueDate: string | null = null;
    let profileIds = defaultProfileIds;
    let teamIds = defaultTeamIds;

    if (boardView === "status") {
      status = column.id;
    }

    if (boardView === "project") {
      projectId = column.id.startsWith("project:")
        ? column.id.replace("project:", "")
        : null;
    }

    if (boardView === "calendar") {
      const calendarDueDate = dueDateForCalendarColumn(column.id);
      dueDate = calendarDueDate === undefined ? null : calendarDueDate;
    }

    if (boardView === "assigned") {
      profileIds = column.id.startsWith("person:")
        ? [column.id.replace("person:", "")]
        : [];
    }

    if (boardView === "team") {
      teamIds = column.id.startsWith("team:")
        ? [column.id.replace("team:", "")]
        : [];
    }

    return {
      status,
      projectId,
      dueDate,
      profileIds,
      teamIds,
    };
  }

  async function createTaskFromColumn(column: DisplayColumn) {
    if (!session?.user.id || !profile) {
      setTaskMessage("You must be signed in before creating a task.");
      return;
    }

    const context = getColumnTaskContext(column);
    const title = `New task — ${column.name}`;
    const nextSortOrder =
      filteredBoardTasks.filter((task) => taskBelongsToColumn(task, column.id))
        .length *
        10 +
      100;

    setCreatingColumnTaskId(column.id);
    setTaskMessage("");

    try {
      const { data: newTask, error: taskError } = await supabase
        .from("tasks")
        .insert({
          project_id: context.projectId,
          created_by_profile_id: session.user.id,
          title,
          description: null,
          status: context.status,
          priority: "normal",
          due_date: context.dueDate,
          sort_order: nextSortOrder,
        })
        .select("id")
        .single();

      if (taskError) {
        setTaskMessage(
          `Could not create task in ${column.name}: ${taskError.message}`,
        );
        return;
      }

      const assignmentRows = [
        ...context.profileIds.map((profileId) => ({
          task_id: newTask.id,
          profile_id: profileId,
          team_id: null,
          assignment_type: "person",
        })),
        ...context.teamIds.map((teamId) => ({
          task_id: newTask.id,
          profile_id: null,
          team_id: teamId,
          assignment_type: "team",
        })),
      ];

      if (assignmentRows.length > 0) {
        const { error: assigneeError } = await supabase
          .from("task_assignees")
          .insert(assignmentRows);

        if (assigneeError) {
          setTaskMessage(
            `Task was created in ${column.name}, but assignment failed: ${assigneeError.message}`,
          );
          await loadBoardTasks();
          return;
        }
      }

      await logTaskActivity(
        newTask.id,
        "created",
        `Created task from ${boardView} column: ${column.name}.`,
        {
          title,
          board_view: boardView,
          column_id: column.id,
          column_name: column.name,
          status: context.status,
          project_id: context.projectId,
          due_date: context.dueDate,
          profile_ids: context.profileIds,
          team_ids: context.teamIds,
        },
      );

      setQuickAddMessage(`Task created in ${column.name}.`);
      await loadBoardTasks();
    } finally {
      setCreatingColumnTaskId(null);
    }
  }

  async function handleQuickAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session?.user.id || !profile) {
      setQuickAddMessage("You must be signed in before creating a task.");
      return;
    }

    const title = quickTaskTitle.trim();

    if (!title) {
      setQuickAddMessage("Enter a task title first.");
      return;
    }

    const selectedProfileId = quickProfileId || session.user.id;
    const selectedTeamId = quickTeamId;

    if (!selectedProfileId && !selectedTeamId) {
      setQuickAddMessage("Choose a person, a team, or both.");
      return;
    }

    setCreatingTask(true);
    setQuickAddMessage("");

    try {
      const nextSortOrder =
        boardTasks.filter((task) => task.status === "backlog").length * 10 +
        100;

      const { data: newTask, error: taskError } = await supabase
        .from("tasks")
        .insert({
          project_id: quickProjectId || null,
          created_by_profile_id: session.user.id,
          title,
          description: null,
          status: "backlog",
          priority: "normal",
          sort_order: nextSortOrder,
        })
        .select("id")
        .single();

      if (taskError) {
        setQuickAddMessage(`Could not create task: ${taskError.message}`);
        return;
      }

      const { error: assigneeError } = await supabase
        .from("task_assignees")
        .insert({
          task_id: newTask.id,
          profile_id: selectedProfileId || null,
          team_id: selectedTeamId || null,
          assignment_type: buildAssignmentType(
            selectedProfileId,
            selectedTeamId,
          ),
        });

      if (assigneeError) {
        setQuickAddMessage(
          `Task was created, but assignment failed: ${assigneeError.message}`,
        );
        await loadBoardTasks();
        return;
      }

      await logTaskActivity(newTask.id, "created", `Created task: ${title}.`, {
        title,
        project_id: quickProjectId || null,
        profile_ids: [selectedProfileId].filter(Boolean),
        team_ids: [selectedTeamId].filter(Boolean),
      });

      setQuickTaskTitle("");
      setQuickAddMessage("Task created with project and assignment.");
      await loadBoardTasks();
    } finally {
      setCreatingTask(false);
    }
  }

  async function openTaskEditor(task: BoardTask) {
    setSelectedTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditPriority(task.priority);
    setEditStatus(task.status);
    setEditDueDate(task.dueRaw ?? "");
    setEditReminderAt(toReminderDateInput(task.reminderAt));
    setEditReminderNote(task.reminderNote ?? "");
    setEditProjectId(task.projectId ?? "");
    setEditProfileIds(task.assignedProfileIds);
    setEditTeamIds(task.assignedTeamIds);
    setEditMessage("");
    setAttachmentMessage("");
    setAttachments([]);
    setSelectedAttachmentFile(null);
    setCommentMessage("");
    setComments([]);
    setNewCommentText("");
    setSubtaskMessage("");
    setSubtasks([]);
    setNewSubtaskTitle("");
    setActivityMessage("");
    setActivities([]);
    setActivityExpanded(false);
    await Promise.all([
      loadAttachments(task.id),
      loadComments(task.id),
      loadSubtasks(task.id),
      loadActivity(task.id),
    ]);
  }

  function closeTaskEditor() {
    setSelectedTask(null);
    setEditMessage("");
    setAttachmentMessage("");
    setAttachments([]);
    setSelectedAttachmentFile(null);
    setCommentMessage("");
    setComments([]);
    setNewCommentText("");
    setSubtaskMessage("");
    setSubtasks([]);
    setNewSubtaskTitle("");
    setActivityMessage("");
    setActivities([]);
    setActivityExpanded(false);
  }

  function toggleEditProfile(profileId: string) {
    setEditProfileIds((current) =>
      current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [...current, profileId],
    );
  }

  function toggleEditTeam(teamId: string) {
    setEditTeamIds((current) =>
      current.includes(teamId)
        ? current.filter((id) => id !== teamId)
        : [...current, teamId],
    );
  }

  async function saveTaskEdits(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTask) return;

    const cleanTitle = editTitle.trim();

    if (!cleanTitle) {
      setEditMessage("Task title cannot be blank.");
      return;
    }

    if (editProfileIds.length === 0 && editTeamIds.length === 0) {
      setEditMessage("Choose at least one person or team.");
      return;
    }

    setSavingTask(true);
    setEditMessage("");

    try {
      const { error: taskUpdateError } = await supabase
        .from("tasks")
        .update({
          project_id: editProjectId || null,
          title: cleanTitle,
          description: editDescription.trim() || null,
          priority: editPriority,
          status: editStatus,
          due_date: editDueDate || null,
          reminder_at: editReminderAt
            ? reminderDateToIso(editReminderAt)
            : null,
          reminder_note: editReminderNote.trim() || null,
          completed_at: editStatus === "done" ? new Date().toISOString() : null,
        })
        .eq("id", selectedTask.id);

      if (taskUpdateError) {
        setEditMessage(`Could not save task: ${taskUpdateError.message}`);
        return;
      }

      const { error: deleteError } = await supabase
        .from("task_assignees")
        .delete()
        .eq("task_id", selectedTask.id);

      if (deleteError) {
        setEditMessage(
          `Task details saved, but old assignment could not be cleared: ${deleteError.message}`,
        );
        return;
      }

      const assignmentRows = [
        ...editProfileIds.map((profileId) => ({
          task_id: selectedTask.id,
          profile_id: profileId,
          team_id: null,
          assignment_type: "person",
        })),
        ...editTeamIds.map((teamId) => ({
          task_id: selectedTask.id,
          profile_id: null,
          team_id: teamId,
          assignment_type: "team",
        })),
      ];

      const { error: insertError } = await supabase
        .from("task_assignees")
        .insert(assignmentRows);

      if (insertError) {
        setEditMessage(
          `Task details saved, but new assignments could not be saved: ${insertError.message}`,
        );
        return;
      }

      await logTaskActivity(
        selectedTask.id,
        "updated",
        buildTaskEditActivityText(selectedTask),
        {
          title: cleanTitle,
          priority: editPriority,
          status: editStatus,
          due_date: editDueDate || null,
          project_id: editProjectId || null,
          profile_ids: editProfileIds,
          team_ids: editTeamIds,
        },
      );

      await loadBoardTasks();
      await loadActivity(selectedTask.id);
      closeTaskEditor();
    } finally {
      setSavingTask(false);
    }
  }

  async function archiveSelectedTask() {
    if (!selectedTask) return;

    const confirmed = window.confirm(
      `Archive this task?\n\n${selectedTask.title}\n\nArchived tasks are hidden from the board but remain in Supabase for history and backup purposes.`,
    );

    if (!confirmed) return;

    setArchivingTask(true);
    setEditMessage("");

    try {
      await logTaskActivity(
        selectedTask.id,
        "archived",
        `Archived task: ${selectedTask.title}.`,
        { title: selectedTask.title },
      );

      const { error } = await supabase
        .from("tasks")
        .update({ is_archived: true })
        .eq("id", selectedTask.id);

      if (error) {
        setEditMessage(`Could not archive task: ${error.message}`);
        return;
      }

      setSelectedActiveTaskIds((currentIds) =>
        currentIds.filter((id) => id !== selectedTask.id),
      );
      await loadBoardTasks();
      closeTaskEditor();
      setTaskMessage(
        "Task archived. It is hidden from the active board but preserved in Supabase.",
      );
    } finally {
      setArchivingTask(false);
    }
  }

  async function uploadAttachment(file: File) {
    if (!session?.user.id || !selectedTask) return;

    setUploadingFile(true);
    setAttachmentMessage("");

    try {
      const storagePath = `${session.user.id}/${selectedTask.id}/${Date.now()}-${safeStorageName(file.name)}`;

      const { error: uploadError } = await supabase.storage
        .from("task-attachments")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (uploadError) {
        setAttachmentMessage(`Could not upload file: ${uploadError.message}`);
        return;
      }

      const { error: insertError } = await supabase
        .from("task_attachments")
        .insert({
          task_id: selectedTask.id,
          uploaded_by_profile_id: session.user.id,
          file_name: file.name,
          file_path: storagePath,
          file_type: file.type || null,
          file_size_bytes: file.size,
        });

      if (insertError) {
        setAttachmentMessage(
          `File uploaded, but attachment record failed: ${insertError.message}`,
        );
        return;
      }

      await logTaskActivity(
        selectedTask.id,
        "attachment_added",
        `Added attachment: ${file.name}.`,
        {
          file_name: file.name,
          file_size_bytes: file.size,
        },
      );

      setSelectedAttachmentFile(null);
      setAttachmentMessage("File attached.");
      await loadAttachments(selectedTask.id);
      await loadActivity(selectedTask.id);
      await loadBoardTasks();
    } finally {
      setUploadingFile(false);
    }
  }

  async function handleAddSubtask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTask || !session?.user.id) return;

    const cleanTitle = newSubtaskTitle.trim();

    if (!cleanTitle) {
      setSubtaskMessage("Enter a subtask first.");
      return;
    }

    setSavingSubtask(true);
    setSubtaskMessage("");

    try {
      const nextSortOrder = subtasks.length * 10 + 100;
      const { error } = await supabase.from("task_subtasks").insert({
        task_id: selectedTask.id,
        created_by_profile_id: session.user.id,
        title: cleanTitle,
        is_done: false,
        sort_order: nextSortOrder,
      });

      if (error) {
        setSubtaskMessage(`Could not add subtask: ${error.message}`);
        return;
      }

      await logTaskActivity(
        selectedTask.id,
        "subtask_added",
        `Added subtask: ${cleanTitle}.`,
        { subtask_title: cleanTitle },
      );

      setNewSubtaskTitle("");
      await Promise.all([
        loadSubtasks(selectedTask.id),
        loadActivity(selectedTask.id),
        loadBoardTasks(),
      ]);
    } finally {
      setSavingSubtask(false);
    }
  }

  async function toggleSubtaskDone(subtask: TaskSubtaskRow) {
    if (!selectedTask) return;

    const nextDoneState = !subtask.is_done;
    setSubtaskMessage("");

    const { error } = await supabase
      .from("task_subtasks")
      .update({
        is_done: nextDoneState,
        completed_at: nextDoneState ? new Date().toISOString() : null,
      })
      .eq("id", subtask.id);

    if (error) {
      setSubtaskMessage(`Could not update subtask: ${error.message}`);
      return;
    }

    await logTaskActivity(
      selectedTask.id,
      nextDoneState ? "subtask_completed" : "subtask_reopened",
      `${nextDoneState ? "Completed" : "Reopened"} subtask: ${subtask.title}.`,
      { subtask_id: subtask.id, subtask_title: subtask.title },
    );

    await Promise.all([
      loadSubtasks(selectedTask.id),
      loadActivity(selectedTask.id),
      loadBoardTasks(),
    ]);
  }

  async function deleteSubtask(subtask: TaskSubtaskRow) {
    if (!selectedTask) return;

    const confirmed = window.confirm(`Delete this subtask?\n\n${subtask.title}`);
    if (!confirmed) return;

    setSubtaskMessage("");

    const { error } = await supabase
      .from("task_subtasks")
      .delete()
      .eq("id", subtask.id);

    if (error) {
      setSubtaskMessage(`Could not delete subtask: ${error.message}`);
      return;
    }

    await logTaskActivity(
      selectedTask.id,
      "subtask_deleted",
      `Deleted subtask: ${subtask.title}.`,
      { subtask_id: subtask.id, subtask_title: subtask.title },
    );

    await Promise.all([
      loadSubtasks(selectedTask.id),
      loadActivity(selectedTask.id),
      loadBoardTasks(),
    ]);
  }

  async function handleAddComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session?.user.id || !selectedTask) {
      setCommentMessage(
        "You must be signed in and have a task open to comment.",
      );
      return;
    }

    const cleanComment = newCommentText.trim();

    if (!cleanComment) {
      setCommentMessage("Enter a comment first.");
      return;
    }

    setSavingComment(true);
    setCommentMessage("");

    try {
      const { error } = await supabase.from("task_comments").insert({
        task_id: selectedTask.id,
        profile_id: session.user.id,
        comment_text: cleanComment,
        comment_body: cleanComment,
      });

      if (error) {
        setCommentMessage(`Could not add comment: ${error.message}`);
        return;
      }

      await logTaskActivity(
        selectedTask.id,
        "comment_added",
        "Added a comment.",
        {
          comment_preview: cleanComment.slice(0, 120),
        },
      );

      setNewCommentText("");
      await Promise.all([
        loadComments(selectedTask.id),
        loadActivity(selectedTask.id),
        loadBoardTasks(),
      ]);
    } finally {
      setSavingComment(false);
    }
  }

  function handleAttachmentInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedAttachmentFile(file);
    setAttachmentMessage(file ? `Selected file: ${file.name}` : "");
    event.target.value = "";
  }

  async function handleAddSelectedFile() {
    if (!selectedAttachmentFile) {
      setAttachmentMessage("Choose a file first.");
      return;
    }

    await uploadAttachment(selectedAttachmentFile);
  }

  async function openAttachment(attachment: TaskAttachmentRow) {
    setAttachmentMessage("");

    const { data, error } = await supabase.storage
      .from("task-attachments")
      .createSignedUrl(attachment.file_path, 60 * 10);

    if (error) {
      setAttachmentMessage(`Could not open attachment: ${error.message}`);
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteAttachment(attachment: TaskAttachmentRow) {
    if (!selectedTask) return;

    setAttachmentMessage("");

    const { error: storageError } = await supabase.storage
      .from("task-attachments")
      .remove([attachment.file_path]);

    if (storageError) {
      setAttachmentMessage(
        `Could not delete file from storage: ${storageError.message}`,
      );
      return;
    }

    const { error: recordError } = await supabase
      .from("task_attachments")
      .delete()
      .eq("id", attachment.id);

    if (recordError) {
      setAttachmentMessage(
        `File deleted, but attachment record remained: ${recordError.message}`,
      );
      return;
    }

    await logTaskActivity(
      selectedTask.id,
      "attachment_deleted",
      `Deleted attachment: ${attachment.file_name}.`,
      {
        file_name: attachment.file_name,
      },
    );

    setAttachmentMessage("Attachment deleted.");
    await loadAttachments(selectedTask.id);
    await loadActivity(selectedTask.id);
    await loadBoardTasks();
  }

  function getDragTarget(event: DragEndEvent) {
    const activeTaskId = event.active.data.current?.taskId as
      | string
      | undefined;
    const sourceColumnId = event.active.data.current?.columnId as
      | string
      | undefined;
    const targetColumnId = event.over?.data.current?.columnId as
      | string
      | undefined;
    const overTaskId =
      event.over?.data.current?.type === "card"
        ? (event.over.data.current.taskId as string | undefined)
        : undefined;

    return {
      activeTaskId,
      sourceColumnId,
      targetColumnId,
      overTaskId,
    };
  }

  function buildOrderedColumnTasks(
    columnId: string,
    movedTask: BoardTask,
    overTaskId?: string,
  ) {
    const destinationTasks = filteredBoardTasks
      .filter(
        (task) =>
          taskBelongsToColumn(task, columnId) && task.id !== movedTask.id,
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (!overTaskId) {
      return [...destinationTasks, movedTask];
    }

    const overIndex = destinationTasks.findIndex(
      (task) => task.id === overTaskId,
    );

    if (overIndex < 0) {
      return [...destinationTasks, movedTask];
    }

    const orderedTasks = [...destinationTasks];
    orderedTasks.splice(overIndex, 0, movedTask);
    return orderedTasks;
  }

  async function saveSortOrderForTasks(
    orderedTasks: BoardTask[],
    movedTaskId: string,
    movedTaskUpdates: Record<string, unknown> = {},
  ) {
    const results = await Promise.all(
      orderedTasks.map((task, index) =>
        supabase
          .from("tasks")
          .update({
            sort_order: (index + 1) * 10,
            ...(task.id === movedTaskId ? movedTaskUpdates : {}),
          })
          .eq("id", task.id),
      ),
    );

    const failedUpdate = results.find((result) => result.error);

    if (failedUpdate?.error) {
      throw new Error(failedUpdate.error.message);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { activeTaskId, sourceColumnId, targetColumnId, overTaskId } =
      getDragTarget(event);

    if (!activeTaskId || !targetColumnId) return;

    const movedTask = boardTasks.find((task) => task.id === activeTaskId);
    if (!movedTask) return;

    if (sourceColumnId === targetColumnId && overTaskId === activeTaskId)
      return;

    setMovingTaskId(activeTaskId);
    setTaskMessage("");

    const previousTasks = boardTasks;
    const orderedDestinationTasks = buildOrderedColumnTasks(
      targetColumnId,
      movedTask,
      overTaskId,
    );

    try {
      if (boardView === "status") {
        const validStatus = statusColumns.some(
          (column) => column.id === targetColumnId,
        );
        if (!validStatus) {
          setMovingTaskId(null);
          return;
        }

        setBoardTasks((currentTasks) =>
          currentTasks.map((task) => {
            if (task.id === activeTaskId)
              return { ...task, status: targetColumnId };

            const orderedIndex = orderedDestinationTasks.findIndex(
              (orderedTask) => orderedTask.id === task.id,
            );
            if (orderedIndex >= 0)
              return { ...task, sortOrder: (orderedIndex + 1) * 10 };

            return task;
          }),
        );

        await saveSortOrderForTasks(orderedDestinationTasks, activeTaskId, {
          status: targetColumnId,
          completed_at:
            targetColumnId === "done" ? new Date().toISOString() : null,
        });
      }

      if (boardView === "calendar") {
        const newDueDate = dueDateForCalendarColumn(targetColumnId);

        if (newDueDate === undefined) {
          setMovingTaskId(null);
          return;
        }

        setBoardTasks((currentTasks) =>
          currentTasks.map((task) => {
            if (task.id === activeTaskId) {
              return {
                ...task,
                dueRaw: newDueDate,
                due: formatDate(newDueDate),
              };
            }

            const orderedIndex = orderedDestinationTasks.findIndex(
              (orderedTask) => orderedTask.id === task.id,
            );
            if (orderedIndex >= 0)
              return { ...task, sortOrder: (orderedIndex + 1) * 10 };

            return task;
          }),
        );

        await saveSortOrderForTasks(orderedDestinationTasks, activeTaskId, {
          due_date: newDueDate,
        });
      }

      if (boardView === "project") {
        const newProjectId = targetColumnId.startsWith("project:")
          ? targetColumnId.replace("project:", "")
          : null;

        const targetProject = newProjectId
          ? projects.find((project) => project.id === newProjectId)
          : undefined;
        const newProjectName =
          targetProject?.name || (newProjectId ? "Project" : "No project");
        const newProjectColor = normalizeProjectColor(targetProject);

        setBoardTasks((currentTasks) =>
          currentTasks.map((task) => {
            if (task.id === activeTaskId) {
              return {
                ...task,
                projectId: newProjectId,
                project: newProjectName,
              };
            }

            const orderedIndex = orderedDestinationTasks.findIndex(
              (orderedTask) => orderedTask.id === task.id,
            );
            if (orderedIndex >= 0)
              return { ...task, sortOrder: (orderedIndex + 1) * 10 };

            return task;
          }),
        );

        await saveSortOrderForTasks(orderedDestinationTasks, activeTaskId, {
          project_id: newProjectId,
        });
      }

      if (boardView === "assigned") {
        let newProfileId: string | null = null;

        if (targetColumnId.startsWith("person:")) {
          newProfileId = targetColumnId.replace("person:", "");
        } else if (targetColumnId !== "unassigned-person") {
          setMovingTaskId(null);
          return;
        }

        const assignmentChanged = sourceColumnId !== targetColumnId;

        if (assignmentChanged) {
          const existingTeamIds = movedTask.assignedTeamIds;

          const { error: deleteError } = await supabase
            .from("task_assignees")
            .delete()
            .eq("task_id", activeTaskId);

          if (deleteError) {
            setTaskMessage(
              `Could not clear old assignment: ${deleteError.message}`,
            );
            setMovingTaskId(null);
            return;
          }

          const newAssignments = [
            ...(newProfileId
              ? [
                  {
                    task_id: activeTaskId,
                    profile_id: newProfileId,
                    team_id: null,
                    assignment_type: "person",
                  },
                ]
              : []),
            ...existingTeamIds.map((teamId) => ({
              task_id: activeTaskId,
              profile_id: null,
              team_id: teamId,
              assignment_type: "team",
            })),
          ];

          if (newAssignments.length > 0) {
            const { error: insertError } = await supabase
              .from("task_assignees")
              .insert(newAssignments);

            if (insertError) {
              setTaskMessage(
                `Could not save new person assignment: ${insertError.message}`,
              );
              setMovingTaskId(null);
              return;
            }
          }
        }

        setBoardTasks((currentTasks) =>
          currentTasks.map((task) => {
            const orderedIndex = orderedDestinationTasks.findIndex(
              (orderedTask) => orderedTask.id === task.id,
            );
            if (orderedIndex >= 0)
              return { ...task, sortOrder: (orderedIndex + 1) * 10 };
            return task;
          }),
        );

        await saveSortOrderForTasks(orderedDestinationTasks, activeTaskId);
      }

      if (boardView === "team") {
        let newTeamId: string | null = null;

        if (targetColumnId.startsWith("team:")) {
          newTeamId = targetColumnId.replace("team:", "");
        } else if (targetColumnId !== "unassigned-team") {
          setMovingTaskId(null);
          return;
        }

        const assignmentChanged = sourceColumnId !== targetColumnId;

        if (assignmentChanged) {
          const existingProfileIds = movedTask.assignedProfileIds;

          const { error: deleteError } = await supabase
            .from("task_assignees")
            .delete()
            .eq("task_id", activeTaskId);

          if (deleteError) {
            setTaskMessage(
              `Could not clear old assignment: ${deleteError.message}`,
            );
            setMovingTaskId(null);
            return;
          }

          const newAssignments = [
            ...existingProfileIds.map((profileId) => ({
              task_id: activeTaskId,
              profile_id: profileId,
              team_id: null,
              assignment_type: "person",
            })),
            ...(newTeamId
              ? [
                  {
                    task_id: activeTaskId,
                    profile_id: null,
                    team_id: newTeamId,
                    assignment_type: "team",
                  },
                ]
              : []),
          ];

          if (newAssignments.length > 0) {
            const { error: insertError } = await supabase
              .from("task_assignees")
              .insert(newAssignments);

            if (insertError) {
              setTaskMessage(
                `Could not save new team assignment: ${insertError.message}`,
              );
              setMovingTaskId(null);
              return;
            }
          }
        }

        setBoardTasks((currentTasks) =>
          currentTasks.map((task) => {
            const orderedIndex = orderedDestinationTasks.findIndex(
              (orderedTask) => orderedTask.id === task.id,
            );
            if (orderedIndex >= 0)
              return { ...task, sortOrder: (orderedIndex + 1) * 10 };
            return task;
          }),
        );

        await saveSortOrderForTasks(orderedDestinationTasks, activeTaskId);
      }

      await logTaskActivity(
        activeTaskId,
        "moved",
        `Moved task in ${boardView} view.`,
        {
          board_view: boardView,
          source_column: sourceColumnId ?? null,
          target_column: targetColumnId,
        },
      );

      await loadBoardTasks();
      setMovingTaskId(null);
    } catch (error) {
      setBoardTasks(previousTasks);
      setTaskMessage(
        error instanceof Error
          ? `Move failed: ${error.message}`
          : "Move failed.",
      );
      setMovingTaskId(null);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setBoardTasks([]);
  }

  useEffect(() => {
    let isMounted = true;

    async function initializeSession() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (error) {
          setProfileMessage(`Session error: ${error.message}`);
          setSession(null);
          setLoadingSession(false);
          return;
        }

        setSession(data.session);
        setLoadingSession(false);

        if (data.session?.user.id) loadProfile(data.session.user.id);
      } catch (error) {
        if (!isMounted) return;
        setProfileMessage(
          error instanceof Error
            ? `Session failed to load: ${error.message}`
            : "Session failed to load.",
        );
        setSession(null);
        setLoadingSession(false);
      }
    }

    initializeSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoadingSession(false);

      if (newSession?.user.id) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        setBoardTasks([]);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session) {
      loadBoardTasks();
      loadBlitzitSettings();
      loadNotificationSettings();
    }
  }, [session]);

  useEffect(() => {
    if (canManageWorkspace) {
      loadAdminData();
      loadArchivedTasks();
    }
  }, [canManageWorkspace]);

  if (loadingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
          Loading Graymills TaskBoard...
        </div>
      </main>
    );
  }

  if (!session) return <LoginScreen />;

  if (accountInactive) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium text-slate-500">{APP_REVISION}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Account inactive
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Your TaskBoard account is inactive. Contact an admin to reactivate
            your account.
          </p>
          <button
            onClick={handleLogout}
            className="mt-5 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Log Out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <img
              src="/graymills-logo.png"
              alt="Graymills logo"
              className="mt-1 h-11 w-auto shrink-0 object-contain"
            />
            <div>
              <p className="text-xs font-medium text-slate-500">
                {APP_REVISION}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                Graymills TaskBoard
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Shared marketing project tasks, ad hoc teams, due dates,
                priorities, files, comments, attachments, and one-way Blitzit
                copying.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${supabaseStatusStyle}`}
            >
              {supabaseStatus}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Signed in as</p>
              <p>{currentEmail}</p>
              <p className="mt-1">
                Role: <span className="font-semibold">{roleLabel}</span>
              </p>
              {profile?.profile_color && (
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="h-3 w-8 rounded-full border border-slate-200"
                    style={{ backgroundColor: profile.profile_color }}
                  />
                  <span className="text-xs text-slate-500">
                    Profile color: {profile.profile_color}
                  </span>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {canManageWorkspace && (
                  <button
                    type="button"
                    onClick={() => setAdminOpen(true)}
                    className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    {isAdmin ? "Admin" : "Manager"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(true)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold ${activeNotificationCount > 0 ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  Notifications
                  {activeNotificationCount > 0
                    ? ` (${activeNotificationCount})`
                    : ""}
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardOpen(true)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => setHelpOpen(true)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Help
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Log Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {profileMessage && (
        <section className="mx-auto max-w-[1600px] px-6 pt-6">
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
            {profileMessage}
          </div>
        </section>
      )}

      {taskMessage && (
        <section className="mx-auto max-w-[1600px] px-6 pt-6">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {taskMessage}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_320px]">
          <form
            onSubmit={handleQuickAdd}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <label className="text-sm font-semibold text-slate-900">
              Quick Add
            </label>

            <div className="mt-2 grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <input
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                placeholder="Example: Draft PH922 launch email"
                value={quickTaskTitle}
                onChange={(event) => setQuickTaskTitle(event.target.value)}
              />

              <select
                className="rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-slate-500"
                value={quickProjectId}
                onChange={(event) => setQuickProjectId(event.target.value)}
              >
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>

              <select
                className="rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-slate-500"
                value={quickProfileId}
                onChange={(event) => setQuickProfileId(event.target.value)}
              >
                <option value="">No person</option>
                {profiles.map((profileOption) => (
                  <option key={profileOption.id} value={profileOption.id}>
                    {displayProfileName(profileOption)}
                  </option>
                ))}
              </select>

              <select
                className="rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-slate-500"
                value={quickTeamId}
                onChange={(event) => setQuickTeamId(event.target.value)}
              >
                <option value="">No team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={creatingTask}
                className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {creatingTask ? "Adding..." : "Add Task"}
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Creates a real Backlog task with project, person, and team
              assignment.
            </p>
            {quickAddMessage && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {quickAddMessage}
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleEmailTaskDrop}
                className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-700"
              >
                <p className="font-semibold text-slate-900">
                  Create task from Outlook email
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Drag a saved .msg or .eml email file here, or choose one
                  below. The app creates a Backlog task and attaches the
                  original email file.
                </p>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Choose Email File
                    <input
                      type="file"
                      accept=".msg,.eml,message/rfc822,application/vnd.ms-outlook"
                      className="hidden"
                      onChange={handleEmailTaskInput}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={createTaskFromEmailFile}
                    disabled={creatingEmailTask}
                    className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {creatingEmailTask ? "Creating..." : "Create Email Task"}
                  </button>
                  {emailTaskFile && (
                    <span className="text-xs text-slate-600">
                      Selected: {emailTaskFile.name}
                    </span>
                  )}
                </div>
              </div>

              {emailTaskMessage && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                  {emailTaskMessage}
                </div>
              )}
            </div>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Board Controls
            </h2>
            <div className="mt-3 space-y-2">
              <label
                className="text-xs font-semibold text-slate-600"
                htmlFor="board-view-select"
              >
                View
              </label>
              <select
                id="board-view-select"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-slate-500"
                value={boardView}
                onChange={(event) =>
                  setBoardView(event.target.value as BoardView)
                }
              >
                <option value="status">Status View</option>
                <option value="assigned">Assigned To View</option>
                <option value="team">By Team View</option>
                <option value="project">Project View</option>
                <option value="calendar">Calendar View</option>
              </select>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Dragging cards changes status, person assignment, team assignment,
              project, or due date depending on the selected view.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <section className="min-w-0">
            <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:flex md:items-end md:justify-between md:gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Board View</h2>
                <p className="text-sm text-slate-600">
                  Current grouping:{" "}
                  <span className="font-semibold">
                    {boardView === "status"
                      ? "Status"
                      : boardView === "assigned"
                        ? "Assigned To"
                        : boardView === "team"
                          ? "By Team"
                          : boardView === "calendar"
                            ? "Calendar"
                            : "Project"}
                  </span>
                  . Dragging cards changes the field represented by the current
                  view. In Calendar View, dropping into a date bucket updates
                  the due date.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Showing:{" "}
                  <span className="font-semibold">
                    {getSmartFilterLabel(activeSmartFilter)}
                  </span>
                  {taskSearchQuery.trim() ? (
                    <span>
                      {" "}
                      · Search:{" "}
                      <span className="font-semibold">
                        {taskSearchQuery.trim()}
                      </span>
                    </span>
                  ) : null}{" "}
                  · {filteredBoardTasks.length} of {boardTasks.length} tasks
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <label
                    className="text-xs font-semibold text-slate-600"
                    htmlFor="task-search"
                  >
                    Search
                  </label>
                  <input
                    id="task-search"
                    className="w-48 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 outline-none focus:border-slate-500"
                    placeholder="Search tasks..."
                    value={taskSearchQuery}
                    onChange={(event) => setTaskSearchQuery(event.target.value)}
                  />
                  {taskSearchQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => setTaskSearchQuery("")}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <label
                    className="text-xs font-semibold text-slate-600"
                    htmlFor="smart-filter"
                  >
                    Filter
                  </label>
                  <select
                    id="smart-filter"
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 outline-none focus:border-slate-500"
                    value={activeSmartFilter}
                    onChange={(event) =>
                      setActiveSmartFilter(event.target.value as SmartFilterId)
                    }
                  >
                    {smartFilterOptions.map((filterOption) => (
                      <option key={filterOption.id} value={filterOption.id}>
                        {filterOption.label}
                      </option>
                    ))}
                  </select>
                  {activeSmartFilter !== "all" && (
                    <button
                      type="button"
                      onClick={() => setActiveSmartFilter("all")}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {(activeSmartFilter !== "all" || taskSearchQuery.trim()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSmartFilter("all");
                      setTaskSearchQuery("");
                    }}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Clear All
                  </button>
                )}

                <button
                  onClick={loadBoardTasks}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Refresh Tasks
                </button>
              </div>
            </div>

            {loadingTasks && (
              <div className="mb-3 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                Refreshing tasks from Supabase...
              </div>
            )}

            {movingTaskId && (
              <div className="mb-3 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                Moving/reordering task and saving change to Supabase...
              </div>
            )}

            <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm md:flex-row md:items-center md:justify-between">
              <div>
                <span className="font-semibold text-slate-950">
                  Bulk actions:
                </span>{" "}
                {visibleSelectedActiveTaskIds.length} selected on this view
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedActiveTaskIds(
                      filteredBoardTasks.map((task) => task.id),
                    )
                  }
                  disabled={filteredBoardTasks.length === 0}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  Select Shown
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedActiveTaskIds([])}
                  disabled={selectedActiveTaskIds.length === 0}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  Clear Selection
                </button>
                <button
                  type="button"
                  onClick={archiveSelectedActiveTasks}
                  disabled={
                    selectedActiveTaskIds.length === 0 || bulkArchivingTasks
                  }
                  className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
                >
                  {bulkArchivingTasks ? "Archiving..." : "Archive Selected"}
                </button>
              </div>
            </div>

            <div
              ref={topBoardScrollRef}
              onScroll={handleTopBoardScroll}
              className="mb-3 overflow-x-auto rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-sm"
              aria-label="Board horizontal scroll"
            >
              <div
                style={{ width: `${boardScrollWidth}px`, height: "1px" }}
                aria-hidden="true"
              />
            </div>

            <DndContext onDragEnd={handleDragEnd}>
              <div
                ref={mainBoardScrollRef}
                onScroll={handleMainBoardScroll}
                className="overflow-x-auto pb-4"
              >
                <div className="flex min-w-max gap-4">
                  {currentBoardColumns.map((column) => {
                    const columnTasks = filteredBoardTasks.filter((task) =>
                      taskBelongsToColumn(task, column.id),
                    );

                    return (
                      <BoardColumn
                        key={column.id}
                        column={column}
                        tasks={columnTasks}
                        onOpen={openTaskEditor}
                        onCopyToBlitzit={copyTaskToBlitzit}
                        copyingTaskId={copyingTaskId}
                        blitzitReady={blitzitReady}
                        selectedTaskIds={selectedActiveTaskIds}
                        onToggleTaskSelection={toggleActiveTaskSelection}
                        onAddTask={createTaskFromColumn}
                        addingTaskColumnId={creatingColumnTaskId}
                      />
                    );
                  })}
                </div>
              </div>
            </DndContext>
          </section>
        </div>
      </section>

      {dashboardOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40">
          <div className="h-full w-full max-w-5xl overflow-y-auto border-l border-slate-200 bg-slate-50 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  {APP_REVISION}
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">
                  Dashboard & Reporting
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  A quick management view of open work, due dates, reminders,
                  priorities, projects, people, and teams.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDashboardOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-950">
                    Export Reports
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Download CSV reports for management review, Excel, or email
                    follow-up. These exports do not include Blitzit secrets.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <button
                    type="button"
                    onClick={exportDashboardSummaryReport}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Summary CSV
                  </button>
                  <button
                    type="button"
                    onClick={exportDashboardBreakdownsReport}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Breakdowns CSV
                  </button>
                  <button
                    type="button"
                    onClick={exportOpenTasksReport}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Open Tasks CSV
                  </button>
                  <button
                    type="button"
                    onClick={exportOverdueTasksReport}
                    className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Overdue CSV
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Open Tasks
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-950">
                  {dashboardStats.openTasks}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {dashboardStats.completedTasks} completed ·{" "}
                  {dashboardStats.totalTasks} total
                </p>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                  Overdue
                </p>
                <p className="mt-2 text-3xl font-bold text-red-900">
                  {dashboardStats.overdueTasks.length}
                </p>
                <p className="mt-1 text-xs text-red-700">
                  Open tasks with due dates before today
                </p>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Due This Week
                </p>
                <p className="mt-2 text-3xl font-bold text-blue-900">
                  {dashboardStats.dueThisWeekTasks.length}
                </p>
                <p className="mt-1 text-xs text-blue-700">
                  Open tasks due today through the next 7 days
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  High / Urgent
                </p>
                <p className="mt-2 text-3xl font-bold text-amber-900">
                  {dashboardStats.highPriorityTasks.length}
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  Open high-priority or urgent tasks
                </p>
              </div>
              <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
                  Reminder Due
                </p>
                <p className="mt-2 text-3xl font-bold text-purple-900">
                  {dashboardStats.reminderDueTasks.length}
                </p>
                <p className="mt-1 text-xs text-purple-700">
                  Open tasks with reminders due today or earlier
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Not Copied to Blitzit
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-950">
                  {dashboardStats.notCopiedToBlitzitTasks.length}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Open tasks not yet sent to Blitzit
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  Tasks by Status
                </h3>
                <div className="mt-3 space-y-2">
                  {dashboardStats.countByStatus.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span className="text-slate-700">{item.label}</span>
                      <span className="font-semibold text-slate-950">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  Tasks by Priority
                </h3>
                <div className="mt-3 space-y-2">
                  {dashboardStats.countByPriority.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span className="text-slate-700">{item.label}</span>
                      <span className="font-semibold text-slate-950">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  Open Tasks by Project
                </h3>
                <div className="mt-3 space-y-2">
                  {dashboardStats.countByProject.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                      No open tasks by project.
                    </p>
                  ) : (
                    dashboardStats.countByProject.slice(0, 12).map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
                      >
                        <span className="text-slate-700">{item.label}</span>
                        <span className="font-semibold text-slate-950">
                          {item.count}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  Open Tasks by Person
                </h3>
                <div className="mt-3 space-y-2">
                  {dashboardStats.countByPerson.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                      No open tasks assigned to people.
                    </p>
                  ) : (
                    dashboardStats.countByPerson.slice(0, 12).map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
                      >
                        <span className="text-slate-700">{item.label}</span>
                        <span className="font-semibold text-slate-950">
                          {item.count}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  Open Tasks by Team
                </h3>
                <div className="mt-3 space-y-2">
                  {dashboardStats.countByTeam.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                      No open tasks assigned to teams.
                    </p>
                  ) : (
                    dashboardStats.countByTeam.slice(0, 12).map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
                      >
                        <span className="text-slate-700">{item.label}</span>
                        <span className="font-semibold text-slate-950">
                          {item.count}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  Recently Completed
                </h3>
                <div className="mt-3 space-y-2">
                  {dashboardStats.recentlyCompleted.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                      No completed tasks yet.
                    </p>
                  ) : (
                    dashboardStats.recentlyCompleted.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-xl bg-slate-50 px-3 py-2 text-sm"
                      >
                        <p className="font-semibold text-slate-900">
                          {task.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {task.project} ·{" "}
                          {task.assignees.length > 0
                            ? task.assignees.join(", ")
                            : "Unassigned"}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
              <p className="font-semibold text-slate-900">Version 2.4 note</p>
              <p className="mt-1">
                This first dashboard uses summary cards and lightweight tables.
                Charts and exportable reports can be added later if the team
                finds this view useful.
              </p>
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40">
          <div className="h-full w-full max-w-4xl overflow-y-auto border-l border-slate-200 bg-slate-50 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  {APP_REVISION}
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">
                  Help & Onboarding Guide
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  A practical guide for new users, managers, and admins using
                  Graymills TaskBoard.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 shadow-sm">
              <p className="font-bold">New user quick start</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>
                  Start in <span className="font-semibold">Status View</span> to
                  see what work is Backlog, To Do, In Progress, Waiting, Review,
                  or Done.
                </li>
                <li>
                  Use <span className="font-semibold">Search</span> or{" "}
                  <span className="font-semibold">Smart Filter</span> to narrow
                  the board.
                </li>
                <li>
                  Click <span className="font-semibold">Open</span> on a card to
                  edit details, assignments, files, comments, reminders, and
                  activity.
                </li>
                <li>
                  Drag cards to change the field represented by the current
                  board view.
                </li>
                <li>
                  Use <span className="font-semibold">+ Add Task</span> at the
                  bottom of a column to create a task already tied to that
                  column context.
                </li>
              </ol>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  1. What this app is for
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Graymills TaskBoard is for shared marketing and project work.
                  It is meant to show who owns what, what stage work is in, what
                  is due soon, what is waiting, and what needs manager/admin
                  attention.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  2. Roles and permissions
                </h3>
                <div className="mt-2 space-y-2 text-sm text-slate-600">
                  <p>
                    <span className="font-semibold text-slate-800">Admin:</span>{" "}
                    manages users, roles, colors, projects, teams,
                    backup/restore, archived tasks, and permanent deletes.
                  </p>
                  <p>
                    <span className="font-semibold text-slate-800">
                      Manager:
                    </span>{" "}
                    sees all active tasks, manages projects/teams/team members,
                    archives/restores tasks, and uses dashboard reporting.
                  </p>
                  <p>
                    <span className="font-semibold text-slate-800">
                      Member:
                    </span>{" "}
                    works on assigned or team-visible tasks, comments, files,
                    reminders, and personal Blitzit settings.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  3. Creating tasks
                </h3>
                <div className="mt-2 space-y-2 text-sm text-slate-600">
                  <p>
                    <span className="font-semibold text-slate-800">
                      Quick Add:
                    </span>{" "}
                    fastest way to create a task with title, project, person,
                    and team.
                  </p>
                  <p>
                    <span className="font-semibold text-slate-800">
                      Column Add Task:
                    </span>{" "}
                    use the + Add Task button at the bottom of a board column to
                    prefill that column context.
                  </p>
                  <p>
                    <span className="font-semibold text-slate-800">
                      Email file task:
                    </span>{" "}
                    drag or choose a saved .msg/.eml file to create a task and
                    attach the email file.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  4. Board views
                </h3>
                <div className="mt-2 space-y-2 text-sm text-slate-600">
                  <p>
                    <span className="font-semibold text-slate-800">
                      Status:
                    </span>{" "}
                    workflow stage: Backlog, To Do, In Progress, Waiting,
                    Review, Done.
                  </p>
                  <p>
                    <span className="font-semibold text-slate-800">
                      Assigned To:
                    </span>{" "}
                    people-only workload view.
                  </p>
                  <p>
                    <span className="font-semibold text-slate-800">
                      By Team:
                    </span>{" "}
                    team-only workload view.
                  </p>
                  <p>
                    <span className="font-semibold text-slate-800">
                      Project:
                    </span>{" "}
                    project-by-project planning view.
                  </p>
                  <p>
                    <span className="font-semibold text-slate-800">
                      Calendar:
                    </span>{" "}
                    due-date buckets: Overdue, Today, Tomorrow, Next 7 Days,
                    Later, No Due Date.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  5. Drag and drop rules
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Dragging a card changes the field represented by the selected
                  view. Status changes status, Assigned To changes person
                  assignment, By Team changes team assignment, Project changes
                  project, and Calendar changes due date. Dragging within a
                  column changes task order.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  6. Opening and editing cards
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Click Open to edit task title, notes, priority, status,
                  project, people, teams, due date, reminder date, comments,
                  files, Blitzit copy, and activity history.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  7. Search and smart filters
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Search checks task title, notes, project, assignees, teams,
                  tags, status, priority, due-date display, and reminder notes.
                  Smart Filters show common slices like My Tasks, Overdue, High
                  Priority, Reminder Due, Has Files, No Due Date, and Not Copied
                  to Blitzit.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  8. Reminders and notifications
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Reminders are date-only. Open a card to choose Tomorrow, 1
                  Week, End of Week / Friday, or a custom reminder date. Due and
                  overdue reminders appear in Notifications. Email notifications
                  remain pending SMTP/IT setup.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  9. Files, comments, and activity
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Attach Word documents, PDFs, images, email files, and other
                  supporting files inside a task. Use Comments for team
                  discussion. Activity shows key changes including task edits,
                  assignments, file changes, comments, archive/restore actions,
                  and Blitzit copies.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  10. Blitzit
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Save your personal Blitzit webhook settings in Settings. Use
                  Copy or Re-copy on a task to send it one-way to Blitzit.
                  TaskBoard does not sync changes back from Blitzit.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  11. Admin and manager tools
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Admin and Manager panels include projects, teams, team
                  membership, archived tasks, and reporting tools. Admins also
                  control users, roles, profile colors, backups, restore, and
                  permanent cleanup.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-950">
                  12. Archive vs. delete
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Archive hides a task from active boards while preserving
                  history. Admins can restore archived tasks. Delete Forever is
                  only available for archived tasks and requires confirmation
                  plus typing DELETE.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-950">
                Recommended information to include in team rollout
              </h3>
              <div className="mt-2 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <ul className="list-disc space-y-1 pl-5">
                  <li>Who should use TaskBoard and for what kinds of work.</li>
                  <li>What each role can and cannot do.</li>
                  <li>
                    When to use Status, Assigned To, By Team, Project, and
                    Calendar views.
                  </li>
                  <li>How projects and teams should be named.</li>
                  <li>When tasks should be archived instead of deleted.</li>
                </ul>
                <ul className="list-disc space-y-1 pl-5">
                  <li>How reminders should be used.</li>
                  <li>How comments should be used versus notes.</li>
                  <li>What file types are appropriate to attach.</li>
                  <li>How Blitzit copying works and what it does not do.</li>
                  <li>
                    Who to contact for access, role changes, or team membership
                    changes.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {notificationsOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40">
          <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-slate-50 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  {APP_REVISION}
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">
                  Notifications
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Reminder notifications appear here when a task reminder is
                  due. Email delivery is pending SMTP setup.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotificationsOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            {notificationMessage && (
              <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                {notificationMessage}
              </div>
            )}

            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setShowDismissedNotifications((current) => !current)
                }
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {showDismissedNotifications
                  ? "Hide Dismissed"
                  : "Show Dismissed"}
              </button>
              <button
                type="button"
                onClick={clearDismissedNotifications}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear Dismissed
              </button>
            </div>

            <div className="space-y-3">
              {reminderNotificationTasks.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
                  No reminder notifications to show.
                </div>
              ) : (
                reminderNotificationTasks.map((task) => {
                  const dismissed = dismissedNotificationTaskIds.includes(
                    task.id,
                  );
                  return (
                    <div
                      key={task.id}
                      className={`rounded-2xl border bg-white p-4 shadow-sm ${dismissed ? "border-slate-200 opacity-60" : reminderIsOverdue(task.reminderAt) ? "border-red-200" : "border-amber-200"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-950">
                            {task.title}
                          </p>
                          <p
                            className={`mt-1 text-xs font-semibold ${reminderIsOverdue(task.reminderAt) ? "text-red-700" : "text-amber-700"}`}
                          >
                            Reminder: {formatReminderDate(task.reminderAt)}
                            {dismissed ? " · dismissed" : ""}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            Project: {task.project} · Assigned:{" "}
                            {task.assignees.length > 0
                              ? task.assignees.join(", ")
                              : "Unassigned"}
                          </p>
                          {task.reminderNote && (
                            <p className="mt-2 rounded-xl bg-slate-50 p-2 text-xs text-slate-600">
                              {task.reminderNote}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => openTaskFromNotification(task)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Open
                          </button>
                          {!dismissed && (
                            <button
                              type="button"
                              onClick={() => dismissNotification(task.id)}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40">
          <div className="h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  {APP_REVISION}
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">
                  Settings
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Database status, Blitzit settings, attachment notes, smart
                  filters, and revision notes live here. The main board now uses
                  a wider, cleaner layout.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">
                  Database Status
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  The board is loading real task records from Supabase.
                </p>
                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                  <p>
                    Loaded tasks:{" "}
                    <span className="font-semibold">{boardTasks.length}</span>
                  </p>
                  <p>
                    Filtered tasks:{" "}
                    <span className="font-semibold">
                      {filteredBoardTasks.length}
                    </span>
                  </p>
                  <p>
                    Active projects:{" "}
                    <span className="font-semibold">{projects.length}</span>
                  </p>
                  <p>
                    Active teams:{" "}
                    <span className="font-semibold">{teams.length}</span>
                  </p>
                  <p>
                    People:{" "}
                    <span className="font-semibold">{profiles.length}</span>
                  </p>
                </div>
              </div>

              <form
                onSubmit={saveBlitzitSettings}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <h2 className="text-sm font-semibold text-slate-900">
                  Blitzit Settings
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Paste your Blitzit list webhook details here. Saved settings
                  now reload automatically when you sign in.
                </p>
                <div className="mt-3 space-y-3">
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-500"
                    placeholder="Blitzit Webhook URL"
                    value={blitzitWebhookUrl}
                    onChange={(event) =>
                      setBlitzitWebhookUrl(event.target.value)
                    }
                  />
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-500"
                    placeholder="Signing Secret value"
                    type="password"
                    value={blitzitSigningSecret}
                    onChange={(event) =>
                      setBlitzitSigningSecret(event.target.value)
                    }
                  />
                  <button
                    type="submit"
                    disabled={savingBlitzitSettings}
                    className="w-full rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {savingBlitzitSettings
                      ? "Saving..."
                      : "Save Blitzit Settings"}
                  </button>
                </div>
                {blitzitMessage && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    {blitzitMessage}
                  </div>
                )}
              </form>

              <form
                onSubmit={saveNotificationSettings}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <h2 className="text-sm font-semibold text-slate-900">
                  Notification Preferences
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  In-app reminder notifications are live. Email notifications
                  are saved as a preference, but delivery is paused until IT
                  configures SMTP.
                </p>
                <div className="mt-3 space-y-3 text-sm text-slate-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={inAppNotificationsEnabled}
                      onChange={(event) =>
                        setInAppNotificationsEnabled(event.target.checked)
                      }
                    />
                    Enable in-app notifications
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={reminderDueNotificationsEnabled}
                      onChange={(event) =>
                        setReminderDueNotificationsEnabled(event.target.checked)
                      }
                    />
                    Show reminder-due notifications
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeOverdueNotifications}
                      onChange={(event) =>
                        setIncludeOverdueNotifications(event.target.checked)
                      }
                    />
                    Include overdue reminders
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={emailNotificationsEnabled}
                      onChange={(event) =>
                        setEmailNotificationsEnabled(event.target.checked)
                      }
                    />
                    Email notifications preferred — pending SMTP setup
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={savingNotificationSettings}
                  className="mt-4 w-full rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {savingNotificationSettings
                    ? "Saving..."
                    : "Save Notification Preferences"}
                </button>
                {notificationMessage && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    {notificationMessage}
                  </div>
                )}
              </form>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">
                  Security / Reliability
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Inactive users are now blocked from the app UI. Admin controls
                  only appear for active admins. Blitzit secrets remain excluded
                  from backup export/restore.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">
                  Activity History
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Open a card to see a timeline of important task actions,
                  including comments, attachments, status moves, edits, and
                  Blitzit copies.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">
                  File Attachments
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Open a card to upload Word docs, PDFs, images, spreadsheets,
                  or other task files.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">
                  Reminders
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Open a card to set a reminder date and reminder notes. Due
                  reminders now appear in the Notifications panel and can still
                  be filtered with Has Reminder or Reminder Due.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">
                  Version 2.4 Scope
                </h2>
                <ul className="mt-2 space-y-2 text-sm text-slate-600">
                  <li>• Dashboard button added to the header</li>
                  <li>• Dashboard & Reporting pop-out added</li>
                  <li>
                    • Summary cards for open work, overdue tasks, reminders,
                    priority, and Blitzit status
                  </li>
                  <li>
                    • Reporting tables by status, priority, project, person, and
                    team
                  </li>
                  <li>• Recently completed task list added</li>
                  <li>
                    • Quick Add, board views, drag/drop, Open Card, filters,
                    reminders, files, comments, admin, and Blitzit instructions
                    added
                  </li>
                  <li>• Manager role added between Admin and Member</li>
                  <li>
                    • Managers can see all active tasks and manage projects,
                    teams, archives, and task workflow
                  </li>
                  <li>
                    • User management, backup/restore, and permanent delete
                    remain admin-only
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {canManageWorkspace && adminOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40">
          <div className="h-full w-full max-w-6xl overflow-y-auto border-l border-slate-200 bg-slate-50 p-5 shadow-2xl">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-950">
                    {isAdmin
                      ? "Admin: Users, Projects, Teams & Archives"
                      : "Manager: Projects, Teams & Archives"}
                  </h2>
                  <p className="text-sm text-slate-600">
                    {isAdmin
                      ? "Manage users, profile colors, roles, projects, teams, and archived tasks. Archive/deactivate preserves task history."
                      : "Manage projects, teams, active task workflow, and archived task restore. User management, backup/restore, and permanent delete remain admin-only."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={refreshAllData}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {isAdmin ? "Refresh Admin Data" : "Refresh Manager Data"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminOpen(false)}
                    className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    {isAdmin ? "Close Admin" : "Close Manager"}
                  </button>
                </div>
              </div>

              {adminMessage && (
                <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  {adminMessage}
                </div>
              )}

              {isAdmin && (
                <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="max-w-2xl">
                      <h3 className="font-bold text-slate-950">
                        Backup / Restore
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Export a JSON backup or restore a previous TaskBoard
                        backup. Restore uses a merge/upsert approach: matching
                        saved IDs are updated, missing records are added, and
                        records not found in the backup are not deleted.
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Blitzit secrets and uploaded file contents are not
                        included. Attachment metadata is included, but file
                        binaries are not restored.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={handleExportBackup}
                        disabled={exportingBackup || restoringBackup}
                        className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      >
                        {exportingBackup ? "Exporting..." : "Export Backup"}
                      </button>

                      <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Choose Restore File
                        <input
                          type="file"
                          accept="application/json,.json"
                          onChange={handleRestoreFileSelected}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {restoreFileName && (
                    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
                      Restore file selected:{" "}
                      <span className="font-semibold">{restoreFileName}</span>
                    </div>
                  )}

                  {restorePreview && (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-semibold text-slate-950">
                            Restore preview
                          </p>
                          <p className="text-xs text-slate-500">
                            Review these row counts before restoring. Restore
                            does not delete records that are missing from the
                            backup.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleRestoreBackup}
                            disabled={restoringBackup}
                            className="rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
                          >
                            {restoringBackup
                              ? "Restoring..."
                              : "Restore Backup"}
                          </button>
                          <button
                            type="button"
                            onClick={clearRestorePreview}
                            disabled={restoringBackup}
                            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Cancel Restore
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {Object.entries(restorePreview).map(
                          ([tableName, rowCount]) => (
                            <div
                              key={tableName}
                              className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"
                            >
                              <p className="font-semibold text-slate-950">
                                {tableName}
                              </p>
                              <p>{rowCount} rows</p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {backupMessage && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                      {backupMessage}
                    </div>
                  )}
                </div>
              )}

              <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="font-bold text-slate-950">Archived Tasks</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Restore accidentally archived tasks, or permanently delete
                      old archived tasks after a second confirmation. Archived
                      tasks are hidden from the active board until restored.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                      placeholder="Search archived tasks"
                      value={archivedTaskSearch}
                      onChange={(event) =>
                        setArchivedTaskSearch(event.target.value)
                      }
                    />
                    <button
                      type="button"
                      onClick={loadArchivedTasks}
                      disabled={loadingArchivedTasks}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      {loadingArchivedTasks ? "Loading..." : "Refresh Archives"}
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {filteredArchivedTasks.length} archived task
                        {filteredArchivedTasks.length === 1 ? "" : "s"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {visibleSelectedArchivedTaskIds.length} selected on this
                        archived-task view
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {archivedTaskSearch && (
                        <button
                          type="button"
                          onClick={() => setArchivedTaskSearch("")}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Clear Search
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedArchivedTaskIds(
                            filteredArchivedTasks.map((task) => task.id),
                          )
                        }
                        disabled={filteredArchivedTasks.length === 0}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        Select Shown
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedArchivedTaskIds([])}
                        disabled={selectedArchivedTaskIds.length === 0}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        Clear Selection
                      </button>
                      <button
                        type="button"
                        onClick={restoreSelectedArchivedTasks}
                        disabled={
                          selectedArchivedTaskIds.length === 0 ||
                          bulkArchivedAction !== null
                        }
                        className="rounded-lg border border-green-200 bg-white px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:text-green-300"
                      >
                        {bulkArchivedAction === "restore"
                          ? "Restoring..."
                          : "Restore Selected"}
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={permanentlyDeleteSelectedArchivedTasks}
                          disabled={
                            selectedArchivedTaskIds.length === 0 ||
                            bulkArchivedAction !== null
                          }
                          className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
                        >
                          {bulkArchivedAction === "delete"
                            ? "Deleting..."
                            : "Delete Selected Forever"}
                        </button>
                      )}
                    </div>
                  </div>

                  {filteredArchivedTasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                      {archivedTaskSearch
                        ? "No archived tasks match this search."
                        : "No archived tasks found."}
                    </div>
                  ) : (
                    <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                      {filteredArchivedTasks.map((task) => (
                        <div
                          key={task.id}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <label className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={selectedArchivedTaskIds.includes(
                                    task.id,
                                  )}
                                  onChange={() =>
                                    toggleArchivedTaskSelection(task.id)
                                  }
                                  className="h-4 w-4 rounded border-slate-300"
                                />
                                Select
                              </label>
                              <p className="font-semibold text-slate-950">
                                {task.title}
                              </p>
                              <div className="mt-1 grid gap-1 text-xs text-slate-600 md:grid-cols-2 xl:grid-cols-3">
                                <p>
                                  <span className="font-semibold text-slate-800">
                                    Project:
                                  </span>{" "}
                                  {task.project}
                                </p>
                                <p>
                                  <span className="font-semibold text-slate-800">
                                    Assigned:
                                  </span>{" "}
                                  {task.assignees.length > 0
                                    ? task.assignees.join(", ")
                                    : "Unassigned"}
                                </p>
                                <p>
                                  <span className="font-semibold text-slate-800">
                                    Team:
                                  </span>{" "}
                                  {task.team}
                                </p>
                                <p>
                                  <span className="font-semibold text-slate-800">
                                    Status:
                                  </span>{" "}
                                  {describeStatus(task.status)}
                                </p>
                                <p>
                                  <span className="font-semibold text-slate-800">
                                    Priority:
                                  </span>{" "}
                                  {formatPriority(task.priority)}
                                </p>
                                <p>
                                  <span className="font-semibold text-slate-800">
                                    Due:
                                  </span>{" "}
                                  {task.due}
                                </p>
                              </div>
                              <p className="mt-2 text-xs text-slate-500">
                                Last updated / archived:{" "}
                                {task.archivedDisplayDate}
                              </p>
                            </div>

                            <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
                              <button
                                type="button"
                                onClick={() => restoreArchivedTask(task.id)}
                                disabled={
                                  restoringArchivedTaskId === task.id ||
                                  deletingArchivedTaskId === task.id
                                }
                                className="rounded-xl border border-green-200 bg-white px-4 py-2 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:text-green-300"
                              >
                                {restoringArchivedTaskId === task.id
                                  ? "Restoring..."
                                  : "Restore Task"}
                              </button>
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    permanentlyDeleteArchivedTask(task.id)
                                  }
                                  disabled={
                                    restoringArchivedTaskId === task.id ||
                                    deletingArchivedTaskId === task.id
                                  }
                                  className="rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
                                >
                                  {deletingArchivedTaskId === task.id
                                    ? "Deleting..."
                                    : "Delete Forever"}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-3">
                {isAdmin && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="font-bold text-slate-950">Users</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Edit display names, roles, profile colors, and active
                      status.
                    </p>

                    {editingUserId && (
                      <form
                        onSubmit={handleSaveUser}
                        className="mt-3 space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4"
                      >
                        <p className="text-sm font-semibold text-blue-950">
                          Edit user
                        </p>
                        <input
                          className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                          placeholder="Full name"
                          value={editUserFullName}
                          onChange={(event) =>
                            setEditUserFullName(event.target.value)
                          }
                        />
                        <div className="grid gap-3 md:grid-cols-2">
                          <select
                            className="rounded-xl border border-blue-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                            value={editUserRole}
                            onChange={(event) =>
                              setEditUserRole(
                                event.target.value as
                                  | "admin"
                                  | "manager"
                                  | "member",
                              )
                            }
                          >
                            <option value="member">Member</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                          <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-white px-3 py-2">
                            <input
                              type="color"
                              value={editUserColor}
                              onChange={(event) =>
                                setEditUserColor(event.target.value)
                              }
                              className="h-10 w-14 rounded-lg border border-blue-200"
                            />
                            <span className="text-sm text-blue-950">
                              {editUserColor}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button className="rounded-xl bg-blue-950 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-900">
                            Save User
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingUserId("")}
                            className="rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-950 hover:bg-blue-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="mt-4 space-y-2">
                      {adminProfiles.map((userProfile) => (
                        <div
                          key={userProfile.id}
                          className={`rounded-xl border p-3 text-sm ${
                            userProfile.is_active !== false
                              ? "border-slate-200 bg-white"
                              : "border-slate-200 bg-slate-100 opacity-70"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-3 w-8 rounded-full"
                                  style={{
                                    backgroundColor:
                                      userProfile.profile_color || "#2563EB",
                                  }}
                                />
                                <p className="font-semibold text-slate-950">
                                  {displayProfileName(userProfile)}
                                </p>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {userProfile.email || "No email"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Role: {userProfile.role || "member"} ·{" "}
                                {userProfile.is_active !== false
                                  ? "Active"
                                  : "Inactive"}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => startEditUser(userProfile)}
                                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50"
                              >
                                Edit
                              </button>
                              {userProfile.is_active !== false ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setUserActive(userProfile.id, false)
                                  }
                                  className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setUserActive(userProfile.id, true)
                                  }
                                  className="rounded-lg border border-green-200 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50"
                                >
                                  Activate
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="font-bold text-slate-950">Projects</h3>

                  <form
                    onSubmit={handleCreateProject}
                    className="mt-3 space-y-3 rounded-2xl bg-white p-4"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      Add project
                    </p>
                    <input
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                      placeholder="Project name"
                      value={newProjectName}
                      onChange={(event) =>
                        setNewProjectName(event.target.value)
                      }
                    />
                    <textarea
                      className="min-h-20 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                      placeholder="Project description"
                      value={newProjectDescription}
                      onChange={(event) =>
                        setNewProjectDescription(event.target.value)
                      }
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <select
                        className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                        value={newProjectStatus}
                        onChange={(event) =>
                          setNewProjectStatus(event.target.value)
                        }
                      >
                        <option value="planning">Planning</option>
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="completed">Completed</option>
                      </select>
                      <input
                        type="date"
                        className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                        value={newProjectTargetDate}
                        onChange={(event) =>
                          setNewProjectTargetDate(event.target.value)
                        }
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={newProjectColor}
                        onChange={(event) =>
                          setNewProjectColor(event.target.value)
                        }
                        className="h-11 w-16 rounded-lg border border-slate-300"
                      />
                      <span className="text-sm text-slate-600">
                        Project color: {newProjectColor}
                      </span>
                    </div>
                    <button className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
                      Add Project
                    </button>
                  </form>

                  {editingProjectId && (
                    <form
                      onSubmit={handleSaveProject}
                      className="mt-3 space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4"
                    >
                      <p className="text-sm font-semibold text-blue-950">
                        Edit project
                      </p>
                      <input
                        className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                        value={editProjectName}
                        onChange={(event) =>
                          setEditProjectName(event.target.value)
                        }
                      />
                      <textarea
                        className="min-h-20 w-full rounded-xl border border-blue-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                        value={editProjectDescription}
                        onChange={(event) =>
                          setEditProjectDescription(event.target.value)
                        }
                      />
                      <div className="grid gap-3 md:grid-cols-2">
                        <select
                          className="rounded-xl border border-blue-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                          value={editProjectStatus}
                          onChange={(event) =>
                            setEditProjectStatus(event.target.value)
                          }
                        >
                          <option value="planning">Planning</option>
                          <option value="active">Active</option>
                          <option value="paused">Paused</option>
                          <option value="completed">Completed</option>
                          <option value="archived">Archived</option>
                        </select>
                        <input
                          type="date"
                          className="rounded-xl border border-blue-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                          value={editProjectTargetDate}
                          onChange={(event) =>
                            setEditProjectTargetDate(event.target.value)
                          }
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={editProjectColor}
                          onChange={(event) =>
                            setEditProjectColor(event.target.value)
                          }
                          className="h-11 w-16 rounded-lg border border-blue-200"
                        />
                        <span className="text-sm text-blue-950">
                          Project color: {editProjectColor}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button className="rounded-xl bg-blue-950 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-900">
                          Save Project
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingProjectId("")}
                          className="rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-950 hover:bg-blue-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="mt-4 space-y-2">
                    {adminProjects.map((project) => (
                      <div
                        key={project.id}
                        className={`rounded-xl border p-3 text-sm ${
                          project.is_active
                            ? "border-slate-200 bg-white"
                            : "border-slate-200 bg-slate-100 opacity-70"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className="h-3 w-8 rounded-full border border-slate-200"
                                style={{
                                  backgroundColor:
                                    project.project_color || "#CBD5E1",
                                }}
                              />
                              <p className="font-semibold text-slate-950">
                                {project.name}
                              </p>
                            </div>
                            <p className="text-xs text-slate-500">
                              Status: {project.status || "active"} ·{" "}
                              {project.is_active ? "Active" : "Archived"}
                            </p>
                            {project.description && (
                              <p className="mt-1 text-xs text-slate-600">
                                {project.description}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => startEditProject(project)}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            {project.is_active ? (
                              <button
                                type="button"
                                onClick={() => archiveProject(project.id)}
                                className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                              >
                                Archive
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => restoreProject(project.id)}
                                className="rounded-lg border border-green-200 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50"
                              >
                                Restore
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="font-bold text-slate-950">Teams</h3>

                  <form
                    onSubmit={handleCreateTeam}
                    className="mt-3 space-y-3 rounded-2xl bg-white p-4"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      Add team
                    </p>
                    <input
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                      placeholder="Team name"
                      value={newTeamName}
                      onChange={(event) => setNewTeamName(event.target.value)}
                    />
                    <textarea
                      className="min-h-20 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                      placeholder="Team description"
                      value={newTeamDescription}
                      onChange={(event) =>
                        setNewTeamDescription(event.target.value)
                      }
                    />
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={newTeamColor}
                        onChange={(event) =>
                          setNewTeamColor(event.target.value)
                        }
                        className="h-11 w-16 rounded-lg border border-slate-300"
                      />
                      <span className="text-sm text-slate-600">
                        Team color: {newTeamColor}
                      </span>
                    </div>
                    <button className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
                      Add Team
                    </button>
                  </form>

                  {editingTeamId && (
                    <form
                      onSubmit={handleSaveTeam}
                      className="mt-3 space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4"
                    >
                      <p className="text-sm font-semibold text-blue-950">
                        Edit team
                      </p>
                      <input
                        className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                        value={editTeamName}
                        onChange={(event) =>
                          setEditTeamName(event.target.value)
                        }
                      />
                      <textarea
                        className="min-h-20 w-full rounded-xl border border-blue-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                        value={editTeamDescription}
                        onChange={(event) =>
                          setEditTeamDescription(event.target.value)
                        }
                      />
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={editTeamColor}
                          onChange={(event) =>
                            setEditTeamColor(event.target.value)
                          }
                          className="h-11 w-16 rounded-lg border border-blue-200"
                        />
                        <span className="text-sm text-blue-950">
                          Team color: {editTeamColor}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button className="rounded-xl bg-blue-950 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-900">
                          Save Team
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTeamId("")}
                          className="rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-950 hover:bg-blue-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="mt-4 space-y-2">
                    {adminTeams.map((team) => (
                      <div
                        key={team.id}
                        className={`rounded-xl border p-3 text-sm ${
                          team.is_active
                            ? "border-slate-200 bg-white"
                            : "border-slate-200 bg-slate-100 opacity-70"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className="h-3 w-8 rounded-full"
                                style={{ backgroundColor: team.team_color }}
                              />
                              <p className="font-semibold text-slate-950">
                                {team.name}
                              </p>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {team.is_active ? "Active" : "Archived"}
                            </p>
                            {team.description && (
                              <p className="mt-1 text-xs text-slate-600">
                                {team.description}
                              </p>
                            )}

                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Team Members (
                                {getTeamMemberProfileIds(team.id).length})
                              </p>

                              <div className="mt-2 flex flex-wrap gap-2">
                                {getTeamMemberProfileIds(team.id).length ===
                                0 ? (
                                  <span className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500">
                                    No members yet
                                  </span>
                                ) : (
                                  getTeamMemberProfileIds(team.id).map(
                                    (profileId) => (
                                      <span
                                        key={`${team.id}-${profileId}`}
                                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                                      >
                                        {getProfileNameById(profileId)}
                                        <button
                                          type="button"
                                          onClick={() =>
                                            removeTeamMember(team.id, profileId)
                                          }
                                          disabled={
                                            teamMembershipBusy ===
                                            `${team.id}:${profileId}:remove`
                                          }
                                          className="font-bold text-red-600 hover:text-red-800 disabled:text-slate-400"
                                          title="Remove from team"
                                        >
                                          ×
                                        </button>
                                      </span>
                                    ),
                                  )
                                )}
                              </div>

                              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                <select
                                  value={memberToAddByTeam[team.id] ?? ""}
                                  onChange={(event) =>
                                    setMemberToAddByTeam((current) => ({
                                      ...current,
                                      [team.id]: event.target.value,
                                    }))
                                  }
                                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-slate-500"
                                >
                                  <option value="">Add user to team...</option>
                                  {getAvailableTeamMembers(team.id).map(
                                    (profileOption) => (
                                      <option
                                        key={profileOption.id}
                                        value={profileOption.id}
                                      >
                                        {displayProfileName(profileOption)}
                                      </option>
                                    ),
                                  )}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => addTeamMember(team.id)}
                                  disabled={
                                    !memberToAddByTeam[team.id] ||
                                    teamMembershipBusy?.startsWith(
                                      `${team.id}:`,
                                    )
                                  }
                                  className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                                >
                                  Add Member
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => startEditTeam(team)}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            {team.is_active ? (
                              <button
                                type="button"
                                onClick={() => archiveTeam(team.id)}
                                className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                              >
                                Archive
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => restoreTeam(team.id)}
                                className="rounded-lg border border-green-200 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50"
                              >
                                Restore
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Editing task
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">
                  Open Card
                </h2>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  form="task-edit-form"
                  disabled={savingTask || archivingTask}
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {savingTask ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={closeTaskEditor}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>

            <form
              id="task-edit-form"
              onSubmit={saveTaskEdits}
              className="space-y-4"
            >
              <div>
                <label className="text-sm font-semibold text-slate-900">
                  Task title
                </label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-900">
                  Notes / description
                </label>
                <textarea
                  className="mt-1 min-h-32 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  placeholder="Add notes, instructions, background, or next steps."
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-900">
                  Project
                </label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  value={editProjectId}
                  onChange={(event) => setEditProjectId(event.target.value)}
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-semibold text-slate-900">
                      Assign people
                    </label>
                    <span className="text-xs text-slate-500">
                      {editProfileIds.length} selected
                    </span>
                  </div>
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                    {profiles.map((profileOption) => (
                      <label
                        key={profileOption.id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={editProfileIds.includes(profileOption.id)}
                          onChange={() => toggleEditProfile(profileOption.id)}
                          className="h-4 w-4"
                        />
                        <span
                          className="h-3 w-6 rounded-full"
                          style={{
                            backgroundColor:
                              profileOption.profile_color || "#2563EB",
                          }}
                        />
                        <span>{displayProfileName(profileOption)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-semibold text-slate-900">
                      Assign teams
                    </label>
                    <span className="text-xs text-slate-500">
                      {editTeamIds.length} selected
                    </span>
                  </div>
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                    {teams.map((team) => (
                      <label
                        key={team.id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={editTeamIds.includes(team.id)}
                          onChange={() => toggleEditTeam(team.id)}
                          className="h-4 w-4"
                        />
                        <span
                          className="h-3 w-6 rounded-full"
                          style={{
                            backgroundColor: team.team_color || "#F97316",
                          }}
                        />
                        <span>{team.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm font-semibold text-slate-900">
                    Priority
                  </label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                    value={editPriority}
                    onChange={(event) => setEditPriority(event.target.value)}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-900">
                    Status
                  </label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value)}
                  >
                    <option value="backlog">Backlog</option>
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="waiting">Waiting</option>
                    <option value="review">Review</option>
                    <option value="done">Done</option>
                    <option value="canceled">Canceled</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-900">
                    Due date
                  </label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                    value={editDueDate}
                    onChange={(event) => setEditDueDate(event.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
                  <div>
                    <label className="text-sm font-semibold text-slate-900">
                      Reminder date
                    </label>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                      value={editReminderAt}
                      onChange={(event) =>
                        setEditReminderAt(event.target.value)
                      }
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setEditReminderAt(getTomorrowDateInput())
                        }
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Tomorrow
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditReminderAt(getOneWeekDateInput())}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        1 Week
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditReminderAt(getEndOfWeekFridayDateInput())
                        }
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        End of Week / Friday
                      </button>
                      {editReminderAt && (
                        <button
                          type="button"
                          onClick={() => setEditReminderAt("")}
                          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      This stores reminder intent by date only. Actual
                      email/push delivery can be added later.
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-900">
                      Reminder notes
                    </label>
                    <textarea
                      className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                      value={editReminderNote}
                      onChange={(event) =>
                        setEditReminderNote(event.target.value)
                      }
                      placeholder="Example: Follow up before the launch meeting."
                    />
                  </div>
                </div>
                {selectedTask.reminderAt && (
                  <p
                    className={`mt-3 rounded-xl border px-3 py-2 text-sm ${reminderIsDue(selectedTask.reminderAt) ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-600"}`}
                  >
                    Current reminder:{" "}
                    {formatReminderDate(selectedTask.reminderAt)}
                  </p>
                )}
              </div>

              {editMessage && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  {editMessage}
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 md:flex-row md:justify-end">
                <button
                  type="button"
                  onClick={closeTaskEditor}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingTask || archivingTask}
                  className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {savingTask ? "Saving..." : "Save Task"}
                </button>
              </div>
            </form>

            <section className="mt-6 border-t border-slate-200 pt-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-950">Subtasks</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Break this task into smaller checklist items and check them off as they are finished.
                  </p>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                  {subtasks.filter((subtask) => subtask.is_done).length}/{subtasks.length} done
                </div>
              </div>

              <form onSubmit={handleAddSubtask} className="mt-3 flex flex-col gap-3 md:flex-row">
                <input
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  value={newSubtaskTitle}
                  onChange={(event) => setNewSubtaskTitle(event.target.value)}
                  placeholder="Add a subtask..."
                />
                <button
                  type="submit"
                  disabled={savingSubtask}
                  className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {savingSubtask ? "Adding..." : "Add Subtask"}
                </button>
              </form>

              {subtaskMessage && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  {subtaskMessage}
                </div>
              )}

              <div className="mt-4 space-y-2">
                {subtasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                    No subtasks yet.
                  </div>
                ) : (
                  subtasks.map((subtask) => (
                    <div
                      key={subtask.id}
                      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm md:flex-row md:items-center md:justify-between"
                    >
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={subtask.is_done}
                          onChange={() => toggleSubtaskDone(subtask)}
                          className="mt-1 h-4 w-4 rounded border-slate-300"
                        />
                        <span>
                          <span
                            className={`block font-medium ${
                              subtask.is_done
                                ? "text-slate-400 line-through"
                                : "text-slate-900"
                            }`}
                          >
                            {subtask.title}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            Added by {subtask.creator_name || "Unknown user"}
                            {subtask.completed_at
                              ? ` · Completed ${new Date(subtask.completed_at).toLocaleString()}`
                              : ""}
                          </span>
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => deleteSubtask(subtask)}
                        className="self-start rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 md:self-center"
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="mt-6 border-t border-slate-200 pt-5">
              <h3 className="text-lg font-bold text-slate-950">Comments</h3>
              <p className="mt-1 text-sm text-slate-600">
                Add discussion notes, decisions, and updates for this task.
              </p>

              <form onSubmit={handleAddComment} className="mt-3 space-y-3">
                <textarea
                  className="min-h-24 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  value={newCommentText}
                  onChange={(event) => setNewCommentText(event.target.value)}
                  placeholder="Add a comment or update..."
                />
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-xs text-slate-500">
                    Comments are saved to this task and visible to users who can
                    view the task.
                  </p>
                  <button
                    type="submit"
                    disabled={savingComment}
                    className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {savingComment ? "Adding..." : "Add Comment"}
                  </button>
                </div>
              </form>

              {commentMessage && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  {commentMessage}
                </div>
              )}

              <div className="mt-4 space-y-2">
                {comments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                    No comments yet.
                  </div>
                ) : (
                  comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
                    >
                      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <p className="font-semibold text-slate-950">
                          {`Comment by ${comment.commenter_name || "Unknown user"}`}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(comment.created_at).toLocaleString()}
                        </p>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-slate-700">
                        {comment.comment_text || comment.comment_body || ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="mt-6 border-t border-slate-200 pt-5">
              <h3 className="text-lg font-bold text-slate-950">Attachments</h3>
              <p className="mt-1 text-sm text-slate-600">
                Upload files for this task. Files are stored in Supabase Storage
                and opened with temporary signed links.
              </p>

              <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
                <label className="w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <input
                    type="file"
                    onChange={handleAttachmentInput}
                    disabled={uploadingFile}
                    className="hidden"
                  />
                  {selectedAttachmentFile
                    ? selectedAttachmentFile.name
                    : "Click here to add file"}
                </label>
                <button
                  type="button"
                  onClick={handleAddSelectedFile}
                  disabled={uploadingFile || !selectedAttachmentFile}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  {uploadingFile ? "Uploading..." : "Add File"}
                </button>
              </div>

              {attachmentMessage && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  {attachmentMessage}
                </div>
              )}

              <div className="mt-4 space-y-2">
                {attachments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                    No files attached yet.
                  </div>
                ) : (
                  attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-slate-950">
                          {attachment.file_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatFileSize(attachment.file_size_bytes)} ·{" "}
                          {attachment.file_type || "Unknown type"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openAttachment(attachment)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAttachment(attachment)}
                          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="mt-6 border-t border-slate-200 pt-5">
              <button
                type="button"
                onClick={() => setActivityExpanded((current) => !current)}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100"
              >
                <span>
                  <span className="block text-lg font-bold text-slate-950">
                    Activity
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">
                    {activities.length === 0
                      ? "No tracked changes yet."
                      : `${activities.length} tracked change${activities.length === 1 ? "" : "s"}.`}
                  </span>
                </span>
                <span className="text-2xl font-bold leading-none text-slate-500">
                  {activityExpanded ? "⌃" : "⌄"}
                </span>
              </button>

              {activityExpanded && (
                <div className="mt-4">
                  <p className="text-sm text-slate-600">
                    Timeline of tracked changes and actions for this task.
                  </p>

                  {activityMessage && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      {activityMessage}
                    </div>
                  )}

                  <div className="mt-4 space-y-2">
                    {activities.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                        No activity has been logged for this task yet.
                      </div>
                    ) : (
                      activities.map((activity) => (
                        <div
                          key={activity.id}
                          className="rounded-xl border border-slate-200 bg-white p-3 text-sm"
                        >
                          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                            <p className="font-semibold text-slate-950">
                              {activity.actor_name || "System"}
                            </p>
                            <p className="text-xs text-slate-500">
                              {new Date(activity.created_at).toLocaleString()}
                            </p>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-slate-700">
                            {activity.activity_text}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                            {activity.activity_type.replaceAll("_", " ")}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="mt-6 border-t border-slate-200 pt-5">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Need to remove this task?</p>
                <p className="mt-1">
                  Use Archive Task to hide it from the active board while
                  keeping the record, comments, attachments, and activity
                  history for backup/audit purposes.
                </p>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={archiveSelectedTask}
                    disabled={archivingTask || savingTask}
                    className="rounded-xl border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {archivingTask ? "Archiving..." : "Archive Task"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
