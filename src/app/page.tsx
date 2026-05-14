"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  DndContext,
  type DragEndEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { supabase } from "@/lib/supabaseClient";

const APP_REVISION = "Rev 1.31 — Production security hardening pass";

const statusColumns = [
  { id: "backlog", name: "Backlog", description: "Ideas, requests, and tasks not ready to start." },
  { id: "todo", name: "To Do", description: "Ready to be worked on." },
  { id: "in_progress", name: "In Progress", description: "Currently active work." },
  { id: "waiting", name: "Waiting", description: "Blocked by another person, vendor, or decision." },
  { id: "review", name: "Review", description: "Ready for approval or final check." },
  { id: "done", name: "Done", description: "Completed work." },
];

const calendarColumns = [
  { id: "overdue", name: "Overdue", description: "Tasks with due dates before today." },
  { id: "today", name: "Today", description: "Tasks due today." },
  { id: "tomorrow", name: "Tomorrow", description: "Tasks due tomorrow." },
  { id: "next7", name: "Next 7 Days", description: "Tasks due in the next week." },
  { id: "later", name: "Later", description: "Tasks due more than a week from now." },
  { id: "no-date", name: "No Due Date", description: "Tasks with no due date assigned." },
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
  role: "admin" | "member";
  profile_color: string;
  is_active: boolean;
};

type ProjectRow = {
  id: string;
  name: string;
  description?: string | null;
  status?: string;
  target_date?: string | null;
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
  role?: "admin" | "member";
  is_active?: boolean;
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
  comment_text: string;
  created_at: string;
  commenter_name?: string;
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

type BoardTask = {
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  project: string;
  assignees: string[];
  team: string;
  priority: string;
  due: string;
  dueRaw: string | null;
  reminderAt: string | null;
  reminderNote: string | null;
  tags: string[];
  colors: string[];
  status: string;
  sortOrder: number;
  primaryProfileId: string;
  primaryTeamId: string;
  assignedProfileIds: string[];
  assignedTeamIds: string[];
  attachmentCount: number;
  commentCount: number;
  blitzitCopiedAt: string | null;
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
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

  const daysFromToday = Math.round((dueDate.getTime() - today.getTime()) / 86400000);

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
    <span className={`rounded-full border px-2 py-1 text-xs font-medium ${style}`}>
      {formatPriority(priority)}
    </span>
  );
}

function AssigneeColorBar({ colors }: { colors: string[] }) {
  const safeColors = colors.length > 0 ? colors : ["#CBD5E1"];

  return (
    <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-slate-200">
      {safeColors.map((color, index) => (
        <div
          key={`${color}-${index}`}
          className="h-full"
          style={{ width: `${100 / safeColors.length}%`, backgroundColor: color }}
        />
      ))}
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
}: {
  task: BoardTask;
  columnId: string;
  onOpen: (task: BoardTask) => void;
  onCopyToBlitzit: (task: BoardTask) => void;
  copyingTaskId: string | null;
  blitzitReady: boolean;
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
      className={`rounded-2xl border bg-white p-3 shadow-sm transition hover:shadow-md ${
        isDragging ? "border-blue-300 opacity-70 shadow-xl" : isOver ? "border-blue-300" : "border-slate-200"
      }`}
    >
      <AssigneeColorBar colors={task.colors} />

      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-snug text-slate-950">
          {task.title}
        </h3>
        <PriorityBadge priority={task.priority} />
      </div>

      <div className="space-y-0.5 text-xs text-slate-600">
        <p><span className="font-semibold text-slate-800">Project:</span> {task.project}</p>
        <p><span className="font-semibold text-slate-800">Assigned:</span> {task.assignees.length > 0 ? task.assignees.join(", ") : "Unassigned"}</p>
        <p><span className="font-semibold text-slate-800">Team:</span> {task.team}</p>
        <p><span className="font-semibold text-slate-800">Status:</span> {statusColumns.find((column) => column.id === task.status)?.name || task.status}</p>
        <p><span className="font-semibold text-slate-800">Due:</span> {task.due}</p>
        <p><span className="font-semibold text-slate-800">Reminder:</span> {formatReminderDate(task.reminderAt)}</p>
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
          <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
            #{tag}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
        <div className="flex gap-3">
          <span>Files: {task.attachmentCount}</span>
          <span>Comments: {task.commentCount}</span>
        </div>

        <div className="flex gap-2">
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
            title={blitzitReady ? "Copy this task to Blitzit" : "Save your Blitzit webhook settings first"}
          >
            {copyingTaskId === task.id ? "Copying..." : task.blitzitCopiedAt ? "Re-copy" : "Copy"}
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
}: {
  column: DisplayColumn;
  tasks: BoardTask[];
  onOpen: (task: BoardTask) => void;
  onCopyToBlitzit: (task: BoardTask) => void;
  copyingTaskId: string | null;
  blitzitReady: boolean;
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
            />
          ))
        )}
      </div>
    </div>
  );
}

function LoginScreen() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
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
          setMessage(error.message);
          return;
        }

        setMessage("Signup submitted. If email confirmation is enabled, check your email before signing in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
          setMessage(error.message);
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
        <p className="text-xs font-medium text-slate-500">{APP_REVISION}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
          Graymills TaskBoard
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to view your shared marketing task board.
        </p>

        <div className="mt-5 grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => { setMode("sign-in"); setMessage(""); }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              mode === "sign-in" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode("sign-up"); setMessage(""); }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              mode === "sign-up" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"
            }`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleAuth} className="mt-5 space-y-4">
          {mode === "sign-up" && (
            <div>
              <label className="text-sm font-semibold text-slate-900">Full name</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Craig Shields"
              />
            </div>
          )}

          <div>
            <label className="text-sm font-semibold text-slate-900">Email</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@graymills.com"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Password</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Use a strong password"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {busy ? "Working..." : mode === "sign-up" ? "Create Account" : "Sign In"}
          </button>
        </form>

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
  const [activeSmartFilter, setActiveSmartFilter] = useState<SmartFilterId>("all");
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [boardTasks, setBoardTasks] = useState<BoardTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskMessage, setTaskMessage] = useState("");

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);

  const [adminProjects, setAdminProjects] = useState<ProjectRow[]>([]);
  const [adminTeams, setAdminTeams] = useState<TeamRow[]>([]);
  const [adminProfiles, setAdminProfiles] = useState<ProfileRow[]>([]);
  const [adminMessage, setAdminMessage] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [exportingBackup, setExportingBackup] = useState(false);
  const [restoreFileName, setRestoreFileName] = useState("");
  const [restorePreview, setRestorePreview] = useState<Record<string, number> | null>(null);
  const [restoreBackupData, setRestoreBackupData] = useState<Record<string, unknown[]> | null>(null);
  const [restoringBackup, setRestoringBackup] = useState(false);

  const [editingUserId, setEditingUserId] = useState("");
  const [editUserFullName, setEditUserFullName] = useState("");
  const [editUserRole, setEditUserRole] = useState<"admin" | "member">("member");
  const [editUserColor, setEditUserColor] = useState("#2563EB");

  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectStatus, setNewProjectStatus] = useState("active");
  const [newProjectTargetDate, setNewProjectTargetDate] = useState("");

  const [editingProjectId, setEditingProjectId] = useState("");
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectDescription, setEditProjectDescription] = useState("");
  const [editProjectStatus, setEditProjectStatus] = useState("active");
  const [editProjectTargetDate, setEditProjectTargetDate] = useState("");

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
  const [quickAddMessage, setQuickAddMessage] = useState("");

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
  const [editMessage, setEditMessage] = useState("");

  const [attachments, setAttachments] = useState<TaskAttachmentRow[]>([]);
  const [selectedAttachmentFile, setSelectedAttachmentFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachmentMessage, setAttachmentMessage] = useState("");

  const [comments, setComments] = useState<TaskCommentRow[]>([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [commentMessage, setCommentMessage] = useState("");

  const [activities, setActivities] = useState<TaskActivityRow[]>([]);
  const [activityMessage, setActivityMessage] = useState("");

  const [blitzitWebhookUrl, setBlitzitWebhookUrl] = useState("");
  const [blitzitSigningSecret, setBlitzitSigningSecret] = useState("");
  const [savingBlitzitSettings, setSavingBlitzitSettings] = useState(false);
  const [blitzitMessage, setBlitzitMessage] = useState("");
  const [copyingTaskId, setCopyingTaskId] = useState<string | null>(null);

  const accountInactive = profile?.is_active === false;
  const isAdmin = profile?.role === "admin" && !accountInactive;
  const currentEmail = session?.user.email ?? "Unknown user";

  const supabaseStatusStyle =
    supabaseUrl && supabaseKey
      ? "border-green-200 bg-green-50 text-green-800"
      : "border-red-200 bg-red-50 text-red-800";

  const roleLabel = useMemo(() => {
    if (!profile) return "Profile loading";
    if (profile.is_active === false) return "Inactive";
    return profile.role === "admin" ? "Admin" : "Member";
  }, [profile]);

  const blitzitReady = Boolean(blitzitWebhookUrl.trim() && blitzitSigningSecret.trim());

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
        { id: "unassigned-person", name: "No Person", description: "Tasks with no assigned person." },
      ];
    }

    if (boardView === "team") {
      return [
        ...teams.map((team) => ({
          id: `team:${team.id}`,
          name: team.name,
          description: "Tasks assigned to this team.",
        })),
        { id: "unassigned-team", name: "No Team", description: "Tasks with no assigned team." },
      ];
    }

    return [
      ...projects.map((project) => ({
        id: `project:${project.id}`,
        name: project.name,
        description: "Tasks assigned to this project.",
      })),
      { id: "no-project", name: "No Project", description: "Tasks with no project selected." },
    ];
  }, [boardView, profiles, teams, projects]);

  function getDefaultProjectId(projectRows: ProjectRow[]) {
    return projectRows.find((project) => project.name === "TaskBoard Setup")?.id || projectRows[0]?.id || "";
  }

  function getDefaultTeamId(teamRows: TeamRow[]) {
    return teamRows.find((team) => team.name === "Marketing")?.id || teamRows[0]?.id || "";
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
    return projects.find((project) => project.id === projectId)?.name || "Project";
  }

  function describeProfiles(profileIds: string[]) {
    if (profileIds.length === 0) return "No people";
    return profileIds
      .map((profileId) => profiles.find((profileRow) => profileRow.id === profileId))
      .filter(Boolean)
      .map((profileRow) => displayProfileName(profileRow as ProfileRow))
      .join(", ") || "No people";
  }

  function describeTeams(teamIds: string[]) {
    if (teamIds.length === 0) return "No teams";
    return teamIds
      .map((teamId) => teams.find((team) => team.id === teamId)?.name)
      .filter(Boolean)
      .join(", ") || "No teams";
  }

  function arraysAreSame(left: string[], right: string[]) {
    if (left.length !== right.length) return false;
    const rightSet = new Set(right);
    return left.every((item) => rightSet.has(item));
  }

  function buildTaskEditActivityText(task: BoardTask) {
    const changes: string[] = [];

    if (task.title !== editTitle.trim()) changes.push("title");
    if ((task.description ?? "") !== editDescription.trim()) changes.push("notes");
    if (task.priority !== editPriority) changes.push(`priority from ${formatPriority(task.priority)} to ${formatPriority(editPriority)}`);
    if (task.status !== editStatus) changes.push(`status from ${describeStatus(task.status)} to ${describeStatus(editStatus)}`);
    if ((task.dueRaw ?? "") !== editDueDate) changes.push(`due date from ${task.dueRaw || "none"} to ${editDueDate || "none"}`);
    if (toReminderDateInput(task.reminderAt) !== editReminderAt) changes.push(`reminder from ${formatReminderDate(task.reminderAt)} to ${editReminderAt || "none"}`);
    if ((task.reminderNote ?? "") !== editReminderNote.trim()) changes.push("reminder note");
    if ((task.projectId ?? "") !== editProjectId) changes.push(`project from ${task.project} to ${describeProject(editProjectId || null)}`);
    if (!arraysAreSame(task.assignedProfileIds, editProfileIds)) changes.push(`people from ${describeProfiles(task.assignedProfileIds)} to ${describeProfiles(editProfileIds)}`);
    if (!arraysAreSame(task.assignedTeamIds, editTeamIds)) changes.push(`teams from ${describeTeams(task.assignedTeamIds)} to ${describeTeams(editTeamIds)}`);

    if (changes.length === 0) return "Task saved with no tracked field changes.";
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
        return task.assignedProfileIds.includes(columnId.replace("person:", ""));
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
      smartFilterOptions.find((filterOption) => filterOption.id === filterId)?.label ||
      "All Tasks"
    );
  }

  function isDateWithinNextSevenDays(dateValue: string | null) {
    if (!dateValue) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDate = new Date(`${dateValue}T00:00:00`);
    dueDate.setHours(0, 0, 0, 0);

    const daysFromToday = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
    return daysFromToday >= 0 && daysFromToday <= 7;
  }

  function taskMatchesSmartFilter(task: BoardTask) {
    if (activeSmartFilter === "all") return true;

    if (activeSmartFilter === "my") {
      return Boolean(session?.user.id && task.assignedProfileIds.includes(session.user.id));
    }

    if (activeSmartFilter === "due-today") return getCalendarColumnId(task.dueRaw) === "today";
    if (activeSmartFilter === "due-week") return isDateWithinNextSevenDays(task.dueRaw);
    if (activeSmartFilter === "overdue") return getCalendarColumnId(task.dueRaw) === "overdue";
    if (activeSmartFilter === "high") return task.priority === "high" || task.priority === "urgent";
    if (activeSmartFilter === "waiting") return task.status === "waiting";
    if (activeSmartFilter === "review") return task.status === "review";
    if (activeSmartFilter === "no-assignee") return task.assignedProfileIds.length === 0 && task.assignedTeamIds.length === 0;
    if (activeSmartFilter === "not-copied") return !task.blitzitCopiedAt;
    if (activeSmartFilter === "has-files") return task.attachmentCount > 0;
    if (activeSmartFilter === "no-due-date") return !task.dueRaw;
    if (activeSmartFilter === "has-reminder") return Boolean(task.reminderAt);
    if (activeSmartFilter === "reminder-due") return reminderIsDue(task.reminderAt);

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
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(cleanQuery);
  }

  const filteredBoardTasks = useMemo(
    () =>
      boardTasks.filter(
        (task) => taskMatchesSmartFilter(task) && taskMatchesSearchQuery(task)
      ),
    [boardTasks, activeSmartFilter, taskSearchQuery, session?.user.id]
  );

  async function loadProfile(userId: string) {
    setProfileMessage("");

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, profile_color, is_active")
      .eq("id", userId)
      .single();

    if (error) {
      setProfile(null);
      setProfileMessage(`Signed in, but profile could not be loaded yet: ${error.message}`);
      return;
    }

    setProfile(data as Profile);
  }

  async function loadAdminData() {
    if (!isAdmin) return;

    const [projectResult, teamResult, profileResult] = await Promise.all([
      supabase
        .from("projects")
        .select("id, name, description, status, target_date, is_active")
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
    ]);

    if (projectResult.error) {
      setAdminMessage(`Could not load admin projects: ${projectResult.error.message}`);
      return;
    }

    if (teamResult.error) {
      setAdminMessage(`Could not load admin teams: ${teamResult.error.message}`);
      return;
    }

    if (profileResult.error) {
      setAdminMessage(`Could not load admin users: ${profileResult.error.message}`);
      return;
    }

    setAdminProjects((projectResult.data ?? []) as ProjectRow[]);
    setAdminTeams((teamResult.data ?? []) as TeamRow[]);
    setAdminProfiles((profileResult.data ?? []) as ProfileRow[]);
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
      setAdminMessage("You cannot deactivate your own active admin account from here.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ is_active: active })
      .eq("id", userId);

    if (error) {
      setAdminMessage(`Could not ${active ? "activate" : "deactivate"} user: ${error.message}`);
      return;
    }

    setAdminMessage(active ? "User activated." : "User deactivated. Existing task history is preserved.");
    await refreshAllData();
  }

  async function loadAttachments(taskId: string) {
    setAttachmentMessage("");

    const { data, error } = await supabase
      .from("task_attachments")
      .select("id, task_id, uploaded_by_profile_id, file_name, file_path, file_type, file_size_bytes, created_at")
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
      .select("id, task_id, profile_id, comment_text, created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    if (error) {
      setCommentMessage(`Could not load comments: ${error.message}`);
      setComments([]);
      return;
    }

    const rawComments = (data ?? []) as TaskCommentRow[];
    const profileIds = Array.from(
      new Set(rawComments.map((comment) => comment.profile_id).filter(Boolean) as string[])
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
        ])
      );
    }

    setComments(
      rawComments.map((comment) => ({
        ...comment,
        commenter_name: comment.profile_id
          ? commenterMap.get(comment.profile_id) ?? "Unknown user"
          : "Unknown user",
      }))
    );
  }

  async function loadActivity(taskId: string) {
    setActivityMessage("");

    const { data, error } = await supabase
      .from("activity_log")
      .select("id, task_id, profile_id, activity_type, activity_text, metadata, created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });

    if (error) {
      setActivityMessage(`Could not load activity: ${error.message}`);
      setActivities([]);
      return;
    }

    const rawActivities = (data ?? []) as TaskActivityRow[];
    const profileIds = Array.from(
      new Set(rawActivities.map((activity) => activity.profile_id).filter(Boolean) as string[])
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
        ])
      );
    }

    setActivities(
      rawActivities.map((activity) => ({
        ...activity,
        actor_name: activity.profile_id
          ? actorMap.get(activity.profile_id) ?? "Unknown user"
          : "System",
      }))
    );
  }

  async function logTaskActivity(
    taskId: string,
    activityType: string,
    activityText: string,
    metadata?: Record<string, unknown>
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
        .select("id, project_id, title, description, status, priority, due_date, reminder_at, reminder_note, sort_order, blitzit_copied_at")
        .eq("is_archived", false)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (taskError) {
        setTaskMessage(`Could not load tasks: ${taskError.message}`);
        setBoardTasks([]);
        return;
      }

      const [projectsResult, assigneesResult, profilesResult, teamsResult, taskTagsResult, tagsResult, attachmentsResult, commentsResult] =
        await Promise.all([
          supabase.from("projects").select("id, name, is_active").eq("is_active", true).order("name"),
          supabase.from("task_assignees").select("task_id, assignment_type, profile_id, team_id"),
          supabase.from("profiles").select("id, email, full_name, profile_color, role, is_active").eq("is_active", true).order("full_name"),
          supabase.from("teams").select("id, name, team_color, is_active").eq("is_active", true).order("name"),
          supabase.from("task_tags").select("task_id, tag_id"),
          supabase.from("tags").select("id, name, tag_color"),
          supabase.from("task_attachments").select("task_id"),
          supabase.from("task_comments").select("task_id"),
        ]);

      if (projectsResult.error) {
        setTaskMessage(`Could not load projects: ${projectsResult.error.message}`);
        return;
      }
      if (assigneesResult.error) {
        setTaskMessage(`Could not load task assignees: ${assigneesResult.error.message}`);
        return;
      }
      if (profilesResult.error) {
        setTaskMessage(`Could not load profiles: ${profilesResult.error.message}`);
        return;
      }
      if (teamsResult.error) {
        setTaskMessage(`Could not load teams: ${teamsResult.error.message}`);
        return;
      }
      if (taskTagsResult.error) {
        setTaskMessage(`Could not load task tags: ${taskTagsResult.error.message}`);
        return;
      }
      if (tagsResult.error) {
        setTaskMessage(`Could not load tags: ${tagsResult.error.message}`);
        return;
      }
      if (attachmentsResult.error) {
        setTaskMessage(`Could not load attachment counts: ${attachmentsResult.error.message}`);
        return;
      }
      if (commentsResult.error) {
        setTaskMessage(`Could not load comment counts: ${commentsResult.error.message}`);
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
      if (!quickProfileId && session?.user.id) setQuickProfileId(session.user.id);
      if (!quickTeamId) setQuickTeamId(getDefaultTeamId(teamRows));

      const projectMap = new Map(projectRows.map((project) => [project.id, project]));
      const profileMap = new Map(profileRows.map((profileRow) => [profileRow.id, profileRow]));
      const teamMap = new Map(teamRows.map((team) => [team.id, team]));
      const tagMap = new Map(((tagsResult.data ?? []) as TagRow[]).map((tag) => [tag.id, tag]));

      const attachmentCountByTask = new Map<string, number>();
      ((attachmentsResult.data ?? []) as { task_id: string }[]).forEach((row) => {
        attachmentCountByTask.set(row.task_id, (attachmentCountByTask.get(row.task_id) ?? 0) + 1);
      });

      const commentCountByTask = new Map<string, number>();
      ((commentsResult.data ?? []) as { task_id: string }[]).forEach((row) => {
        commentCountByTask.set(row.task_id, (commentCountByTask.get(row.task_id) ?? 0) + 1);
      });

      const assigneesByTask = new Map<string, TaskAssigneeRow[]>();
      ((assigneesResult.data ?? []) as TaskAssigneeRow[]).forEach((assignee) => {
        const existing = assigneesByTask.get(assignee.task_id) ?? [];
        existing.push(assignee);
        assigneesByTask.set(assignee.task_id, existing);
      });

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
        const colors: string[] = [];
        const teamNames: string[] = [];
        const profileIds = Array.from(new Set(taskAssignees.map((assignee) => assignee.profile_id).filter(Boolean) as string[]));
        const teamIds = Array.from(new Set(taskAssignees.map((assignee) => assignee.team_id).filter(Boolean) as string[]));
        const firstProfileId = profileIds[0] || "";
        const firstTeamId = teamIds[0] || "";

        taskAssignees.forEach((assignee) => {
          if (assignee.profile_id) {
            const assignedProfile = profileMap.get(assignee.profile_id);
            if (assignedProfile) {
              assigneeNames.push(displayProfileName(assignedProfile));
              colors.push(assignedProfile.profile_color || "#2563EB");
            }
          }

          if (assignee.team_id) {
            const assignedTeam = teamMap.get(assignee.team_id);
            if (assignedTeam) {
              teamNames.push(assignedTeam.name);
              if (!assignee.profile_id) {
                assigneeNames.push(assignedTeam.name);
                colors.push(assignedTeam.team_color || "#F97316");
              }
            }
          }
        });

        return {
          id: task.id,
          projectId: task.project_id,
          title: task.title,
          description: task.description,
          project: task.project_id
            ? projectMap.get(task.project_id)?.name ?? "Archived or missing project"
            : "No project",
          assignees: Array.from(new Set(assigneeNames)),
          team: teamNames.length > 0 ? Array.from(new Set(teamNames)).join(", ") : "No team",
          priority: task.priority,
          due: formatDate(task.due_date),
          dueRaw: task.due_date,
          reminderAt: task.reminder_at,
          reminderNote: task.reminder_note,
          tags: tagsByTask.get(task.id) ?? [],
          colors,
          status: task.status,
          sortOrder: task.sort_order,
          primaryProfileId: firstProfileId,
          primaryTeamId: firstTeamId,
          assignedProfileIds: profileIds,
          assignedTeamIds: teamIds,
          attachmentCount: attachmentCountByTask.get(task.id) ?? 0,
          commentCount: commentCountByTask.get(task.id) ?? 0,
          blitzitCopiedAt: task.blitzit_copied_at,
        };
      });

      setBoardTasks(formattedTasks);
    } finally {
      setLoadingTasks(false);
    }
  }

  async function refreshAllData() {
    await loadBoardTasks();
    await loadAdminData();
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
        "task_attachments",
        "custom_fields",
        "task_custom_field_values",
      ];

      const tableEntries = await Promise.all(
        tableNames.map(async (tableName) => [tableName, await readBackupTable(tableName)] as const)
      );

      const data = Object.fromEntries(tableEntries);

      // Export integration presence without exposing webhook URLs or signing secrets in the JSON file.
      const { data: integrations, error: integrationsError } = await supabase
        .from("user_integrations")
        .select("id, profile_id, integration_name, is_enabled, created_at, updated_at");

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

      setBackupMessage("Backup exported. Check your Downloads folder for the JSON file.");
    } catch (error) {
      setBackupMessage(
        error instanceof Error ? `Backup export failed: ${error.message}` : "Backup export failed."
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
    { tableName: "task_attachments", onConflict: "id" },
    { tableName: "task_custom_field_values", onConflict: "id" },
  ] as const;

  function clearRestorePreview() {
    setRestoreFileName("");
    setRestorePreview(null);
    setRestoreBackupData(null);
  }

  async function handleRestoreFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
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
        throw new Error("This does not look like a Graymills TaskBoard backup file.");
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
      setBackupMessage("Backup file loaded for preview. Review the counts before restoring.");
    } catch (error) {
      clearRestorePreview();
      setBackupMessage(
        error instanceof Error ? `Backup preview failed: ${error.message}` : "Backup preview failed."
      );
    } finally {
      event.target.value = "";
    }
  }

  async function upsertRestoreRows(tableName: string, rows: unknown[], onConflict: string) {
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
      "Restore this backup now? This will merge records into Supabase using their saved IDs. It will not delete records that are not in the backup. Blitzit secrets and uploaded file contents are not restored."
    );

    if (!confirmed) return;

    setRestoringBackup(true);
    setBackupMessage("Restoring backup...");

    try {
      for (const { tableName, onConflict } of restoreTablePlan) {
        await upsertRestoreRows(tableName, restoreBackupData[tableName] ?? [], onConflict);
      }

      setBackupMessage("Backup restored. Existing matching records were updated and missing records were added. Refreshing app data...");
      clearRestorePreview();
      await refreshAllData();
    } catch (error) {
      setBackupMessage(
        error instanceof Error ? `Backup restore failed: ${error.message}` : "Backup restore failed."
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
      setBlitzitMessage("You must be signed in before saving Blitzit settings.");
      return;
    }

    if (!blitzitWebhookUrl.trim() || !blitzitSigningSecret.trim()) {
      setBlitzitMessage("Paste both the Blitzit Webhook URL and Signing Secret.");
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
      { onConflict: "profile_id,integration_name" }
    );

    if (error) {
      setBlitzitMessage(`Could not save Blitzit settings: ${error.message}`);
      setSavingBlitzitSettings(false);
      return;
    }

    setBlitzitMessage("Blitzit settings saved.");
    setSavingBlitzitSettings(false);
  }

  async function copyTaskToBlitzit(task: BoardTask) {
    if (!session?.access_token) {
      setBlitzitMessage("You must be signed in before copying to Blitzit.");
      return;
    }

    if (!blitzitReady) {
      setBlitzitMessage("Save your Blitzit Webhook URL and Signing Secret first.");
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

      await logTaskActivity(task.id, task.blitzitCopiedAt ? "blitzit_recopied" : "blitzit_copied", `${task.blitzitCopiedAt ? "Re-copied" : "Copied"} task to Blitzit.`, {
        title: task.title,
      });

      setBlitzitMessage(`Copied to Blitzit: ${task.title}`);
      await loadBoardTasks();
    } catch (error) {
      setBlitzitMessage(
        error instanceof Error ? `Blitzit copy failed: ${error.message}` : "Blitzit copy failed."
      );
    } finally {
      setCopyingTaskId(null);
    }
  }

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;

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
    setAdminMessage("Project created.");
    await refreshAllData();
  }

  function startEditProject(project: ProjectRow) {
    setEditingProjectId(project.id);
    setEditProjectName(project.name);
    setEditProjectDescription(project.description ?? "");
    setEditProjectStatus(project.status ?? "active");
    setEditProjectTargetDate(project.target_date ?? "");
  }

  async function handleSaveProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || !editingProjectId) return;

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
    if (!isAdmin) return;

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
    if (!isAdmin) return;

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

  async function handleCreateTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;

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
    if (!isAdmin || !editingTeamId) return;

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
    if (!isAdmin) return;

    const { error } = await supabase.from("teams").update({ is_active: false }).eq("id", teamId);

    if (error) {
      setAdminMessage(`Could not archive team: ${error.message}`);
      return;
    }

    setAdminMessage("Team archived. Existing task history is preserved.");
    await refreshAllData();
  }

  async function restoreTeam(teamId: string) {
    if (!isAdmin) return;

    const { error } = await supabase.from("teams").update({ is_active: true }).eq("id", teamId);

    if (error) {
      setAdminMessage(`Could not restore team: ${error.message}`);
      return;
    }

    setAdminMessage("Team restored.");
    await refreshAllData();
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
      const nextSortOrder = boardTasks.filter((task) => task.status === "backlog").length * 10 + 100;

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

      const { error: assigneeError } = await supabase.from("task_assignees").insert({
        task_id: newTask.id,
        profile_id: selectedProfileId || null,
        team_id: selectedTeamId || null,
        assignment_type: buildAssignmentType(selectedProfileId, selectedTeamId),
      });

      if (assigneeError) {
        setQuickAddMessage(`Task was created, but assignment failed: ${assigneeError.message}`);
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
    setActivityMessage("");
    setActivities([]);
    await Promise.all([loadAttachments(task.id), loadComments(task.id), loadActivity(task.id)]);
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
    setActivityMessage("");
    setActivities([]);
  }

  function toggleEditProfile(profileId: string) {
    setEditProfileIds((current) =>
      current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [...current, profileId]
    );
  }

  function toggleEditTeam(teamId: string) {
    setEditTeamIds((current) =>
      current.includes(teamId)
        ? current.filter((id) => id !== teamId)
        : [...current, teamId]
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
          reminder_at: editReminderAt ? reminderDateToIso(editReminderAt) : null,
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
        setEditMessage(`Task details saved, but old assignment could not be cleared: ${deleteError.message}`);
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
        setEditMessage(`Task details saved, but new assignments could not be saved: ${insertError.message}`);
        return;
      }

      await logTaskActivity(selectedTask.id, "updated", buildTaskEditActivityText(selectedTask), {
        title: cleanTitle,
        priority: editPriority,
        status: editStatus,
        due_date: editDueDate || null,
        project_id: editProjectId || null,
        profile_ids: editProfileIds,
        team_ids: editTeamIds,
      });

      await loadBoardTasks();
      await loadActivity(selectedTask.id);
      closeTaskEditor();
    } finally {
      setSavingTask(false);
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

      const { error: insertError } = await supabase.from("task_attachments").insert({
        task_id: selectedTask.id,
        uploaded_by_profile_id: session.user.id,
        file_name: file.name,
        file_path: storagePath,
        file_type: file.type || null,
        file_size_bytes: file.size,
      });

      if (insertError) {
        setAttachmentMessage(`File uploaded, but attachment record failed: ${insertError.message}`);
        return;
      }

      await logTaskActivity(selectedTask.id, "attachment_added", `Added attachment: ${file.name}.`, {
        file_name: file.name,
        file_size_bytes: file.size,
      });

      setSelectedAttachmentFile(null);
      setAttachmentMessage("File attached.");
      await loadAttachments(selectedTask.id);
      await loadActivity(selectedTask.id);
      await loadBoardTasks();
    } finally {
      setUploadingFile(false);
    }
  }

  async function handleAddComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session?.user.id || !selectedTask) {
      setCommentMessage("You must be signed in and have a task open to comment.");
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
      });

      if (error) {
        setCommentMessage(`Could not add comment: ${error.message}`);
        return;
      }

      await logTaskActivity(selectedTask.id, "comment_added", "Added a comment.", {
        comment_preview: cleanComment.slice(0, 120),
      });

      setNewCommentText("");
      await Promise.all([loadComments(selectedTask.id), loadActivity(selectedTask.id), loadBoardTasks()]);
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
      setAttachmentMessage(`Could not delete file from storage: ${storageError.message}`);
      return;
    }

    const { error: recordError } = await supabase
      .from("task_attachments")
      .delete()
      .eq("id", attachment.id);

    if (recordError) {
      setAttachmentMessage(`File deleted, but attachment record remained: ${recordError.message}`);
      return;
    }

    await logTaskActivity(selectedTask.id, "attachment_deleted", `Deleted attachment: ${attachment.file_name}.`, {
      file_name: attachment.file_name,
    });

    setAttachmentMessage("Attachment deleted.");
    await loadAttachments(selectedTask.id);
    await loadActivity(selectedTask.id);
    await loadBoardTasks();
  }

  function getDragTarget(event: DragEndEvent) {
    const activeTaskId = event.active.data.current?.taskId as string | undefined;
    const sourceColumnId = event.active.data.current?.columnId as string | undefined;
    const targetColumnId = event.over?.data.current?.columnId as string | undefined;
    const overTaskId = event.over?.data.current?.type === "card"
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
    overTaskId?: string
  ) {
    const destinationTasks = filteredBoardTasks
      .filter((task) => taskBelongsToColumn(task, columnId) && task.id !== movedTask.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (!overTaskId) {
      return [...destinationTasks, movedTask];
    }

    const overIndex = destinationTasks.findIndex((task) => task.id === overTaskId);

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
    movedTaskUpdates: Record<string, unknown> = {}
  ) {
    const results = await Promise.all(
      orderedTasks.map((task, index) =>
        supabase
          .from("tasks")
          .update({
            sort_order: (index + 1) * 10,
            ...(task.id === movedTaskId ? movedTaskUpdates : {}),
          })
          .eq("id", task.id)
      )
    );

    const failedUpdate = results.find((result) => result.error);

    if (failedUpdate?.error) {
      throw new Error(failedUpdate.error.message);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { activeTaskId, sourceColumnId, targetColumnId, overTaskId } = getDragTarget(event);

    if (!activeTaskId || !targetColumnId) return;

    const movedTask = boardTasks.find((task) => task.id === activeTaskId);
    if (!movedTask) return;

    if (sourceColumnId === targetColumnId && overTaskId === activeTaskId) return;

    setMovingTaskId(activeTaskId);
    setTaskMessage("");

    const previousTasks = boardTasks;
    const orderedDestinationTasks = buildOrderedColumnTasks(targetColumnId, movedTask, overTaskId);

    try {
      if (boardView === "status") {
        const validStatus = statusColumns.some((column) => column.id === targetColumnId);
        if (!validStatus) {
          setMovingTaskId(null);
          return;
        }

        setBoardTasks((currentTasks) =>
          currentTasks.map((task) => {
            if (task.id === activeTaskId) return { ...task, status: targetColumnId };

            const orderedIndex = orderedDestinationTasks.findIndex((orderedTask) => orderedTask.id === task.id);
            if (orderedIndex >= 0) return { ...task, sortOrder: (orderedIndex + 1) * 10 };

            return task;
          })
        );

        await saveSortOrderForTasks(orderedDestinationTasks, activeTaskId, {
          status: targetColumnId,
          completed_at: targetColumnId === "done" ? new Date().toISOString() : null,
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
              return { ...task, dueRaw: newDueDate, due: formatDate(newDueDate) };
            }

            const orderedIndex = orderedDestinationTasks.findIndex((orderedTask) => orderedTask.id === task.id);
            if (orderedIndex >= 0) return { ...task, sortOrder: (orderedIndex + 1) * 10 };

            return task;
          })
        );

        await saveSortOrderForTasks(orderedDestinationTasks, activeTaskId, {
          due_date: newDueDate,
        });
      }

      if (boardView === "project") {
        const newProjectId = targetColumnId.startsWith("project:")
          ? targetColumnId.replace("project:", "")
          : null;

        const newProjectName = newProjectId
          ? projects.find((project) => project.id === newProjectId)?.name || "Project"
          : "No project";

        setBoardTasks((currentTasks) =>
          currentTasks.map((task) => {
            if (task.id === activeTaskId) {
              return { ...task, projectId: newProjectId, project: newProjectName };
            }

            const orderedIndex = orderedDestinationTasks.findIndex((orderedTask) => orderedTask.id === task.id);
            if (orderedIndex >= 0) return { ...task, sortOrder: (orderedIndex + 1) * 10 };

            return task;
          })
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
            setTaskMessage(`Could not clear old assignment: ${deleteError.message}`);
            setMovingTaskId(null);
            return;
          }

          const newAssignments = [
            ...(newProfileId
              ? [{ task_id: activeTaskId, profile_id: newProfileId, team_id: null, assignment_type: "person" }]
              : []),
            ...existingTeamIds.map((teamId) => ({
              task_id: activeTaskId,
              profile_id: null,
              team_id: teamId,
              assignment_type: "team",
            })),
          ];

          if (newAssignments.length > 0) {
            const { error: insertError } = await supabase.from("task_assignees").insert(newAssignments);

            if (insertError) {
              setTaskMessage(`Could not save new person assignment: ${insertError.message}`);
              setMovingTaskId(null);
              return;
            }
          }
        }

        setBoardTasks((currentTasks) =>
          currentTasks.map((task) => {
            const orderedIndex = orderedDestinationTasks.findIndex((orderedTask) => orderedTask.id === task.id);
            if (orderedIndex >= 0) return { ...task, sortOrder: (orderedIndex + 1) * 10 };
            return task;
          })
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
            setTaskMessage(`Could not clear old assignment: ${deleteError.message}`);
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
              ? [{ task_id: activeTaskId, profile_id: null, team_id: newTeamId, assignment_type: "team" }]
              : []),
          ];

          if (newAssignments.length > 0) {
            const { error: insertError } = await supabase.from("task_assignees").insert(newAssignments);

            if (insertError) {
              setTaskMessage(`Could not save new team assignment: ${insertError.message}`);
              setMovingTaskId(null);
              return;
            }
          }
        }

        setBoardTasks((currentTasks) =>
          currentTasks.map((task) => {
            const orderedIndex = orderedDestinationTasks.findIndex((orderedTask) => orderedTask.id === task.id);
            if (orderedIndex >= 0) return { ...task, sortOrder: (orderedIndex + 1) * 10 };
            return task;
          })
        );

        await saveSortOrderForTasks(orderedDestinationTasks, activeTaskId);
      }

      await logTaskActivity(activeTaskId, "moved", `Moved task in ${boardView} view.`, {
        board_view: boardView,
        source_column: sourceColumnId ?? null,
        target_column: targetColumnId,
      });

      await loadBoardTasks();
      setMovingTaskId(null);
    } catch (error) {
      setBoardTasks(previousTasks);
      setTaskMessage(error instanceof Error ? `Move failed: ${error.message}` : "Move failed.");
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
        setProfileMessage(error instanceof Error ? `Session failed to load: ${error.message}` : "Session failed to load.");
        setSession(null);
        setLoadingSession(false);
      }
    }

    initializeSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
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
    }
  }, [session]);

  useEffect(() => {
    if (isAdmin) loadAdminData();
  }, [isAdmin]);

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
            Your TaskBoard account is inactive. Contact an admin to reactivate your account.
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
          <div>
            <p className="text-xs font-medium text-slate-500">{APP_REVISION}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
              Graymills TaskBoard
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Shared marketing project tasks, ad hoc teams, due dates, priorities,
              files, comments, attachments, and one-way Blitzit copying.
            </p>
          </div>

          <div className="space-y-2">
            <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${supabaseStatusStyle}`}>
              {supabaseStatus}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Signed in as</p>
              <p>{currentEmail}</p>
              <p className="mt-1">Role: <span className="font-semibold">{roleLabel}</span></p>
              {profile?.profile_color && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="h-3 w-8 rounded-full border border-slate-200" style={{ backgroundColor: profile.profile_color }} />
                  <span className="text-xs text-slate-500">Profile color: {profile.profile_color}</span>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setAdminOpen(true)}
                    className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Admin
                  </button>
                )}
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
          <form onSubmit={handleQuickAdd} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-sm font-semibold text-slate-900">Quick Add</label>

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
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
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
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
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
              Creates a real Backlog task with project, person, and team assignment.
            </p>
            {quickAddMessage && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {quickAddMessage}
              </div>
            )}
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Board Controls</h2>
            <div className="mt-3 space-y-2">
              <label className="text-xs font-semibold text-slate-600" htmlFor="board-view-select">
                View
              </label>
              <select
                id="board-view-select"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-slate-500"
                value={boardView}
                onChange={(event) => setBoardView(event.target.value as BoardView)}
              >
                <option value="status">Status View</option>
                <option value="assigned">Assigned To View</option>
                <option value="team">By Team View</option>
                <option value="project">Project View</option>
                <option value="calendar">Calendar View</option>
              </select>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Dragging cards changes status, person assignment, team assignment, project, or due date depending on the selected view.
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
                  . Dragging cards changes the field represented by the current view. In Calendar View, dropping into a date bucket updates the due date.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Showing: <span className="font-semibold">{getSmartFilterLabel(activeSmartFilter)}</span>
                  {taskSearchQuery.trim() ? (
                    <span> · Search: <span className="font-semibold">{taskSearchQuery.trim()}</span></span>
                  ) : null}
                  {" "}· {filteredBoardTasks.length} of {boardTasks.length} tasks
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <label className="text-xs font-semibold text-slate-600" htmlFor="task-search">
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
                  <label className="text-xs font-semibold text-slate-600" htmlFor="smart-filter">
                    Filter
                  </label>
                  <select
                    id="smart-filter"
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 outline-none focus:border-slate-500"
                    value={activeSmartFilter}
                    onChange={(event) => setActiveSmartFilter(event.target.value as SmartFilterId)}
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

            <DndContext onDragEnd={handleDragEnd}>
              <div className="overflow-x-auto pb-4">
                <div className="flex min-w-max gap-4">
                  {currentBoardColumns.map((column) => {
                    const columnTasks = filteredBoardTasks.filter((task) => taskBelongsToColumn(task, column.id));

                    return (
                      <BoardColumn
                        key={column.id}
                        column={column}
                        tasks={columnTasks}
                        onOpen={openTaskEditor}
                        onCopyToBlitzit={copyTaskToBlitzit}
                        copyingTaskId={copyingTaskId}
                        blitzitReady={blitzitReady}
                      />
                    );
                  })}
                </div>
              </div>
            </DndContext>
          </section>


        </div>
      </section>

      {settingsOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40">
          <div className="h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500">{APP_REVISION}</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Settings</h2>
                <p className="mt-1 text-sm text-slate-600">Database status, Blitzit settings, attachment notes, smart filters, and revision notes live here. The main board now uses a wider, cleaner layout.</p>
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
              <h2 className="text-sm font-semibold text-slate-900">Database Status</h2>
              <p className="mt-2 text-sm text-slate-600">The board is loading real task records from Supabase.</p>
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                <p>Loaded tasks: <span className="font-semibold">{boardTasks.length}</span></p>
                <p>Filtered tasks: <span className="font-semibold">{filteredBoardTasks.length}</span></p>
                <p>Active projects: <span className="font-semibold">{projects.length}</span></p>
                <p>Active teams: <span className="font-semibold">{teams.length}</span></p>
                <p>People: <span className="font-semibold">{profiles.length}</span></p>
              </div>
            </div>

            <form onSubmit={saveBlitzitSettings} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Blitzit Settings</h2>
              <p className="mt-2 text-sm text-slate-600">
                Paste your Blitzit list webhook details here. Saved settings now reload automatically when you sign in.
              </p>
              <div className="mt-3 space-y-3">
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-500"
                  placeholder="Blitzit Webhook URL"
                  value={blitzitWebhookUrl}
                  onChange={(event) => setBlitzitWebhookUrl(event.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-500"
                  placeholder="Signing Secret value"
                  type="password"
                  value={blitzitSigningSecret}
                  onChange={(event) => setBlitzitSigningSecret(event.target.value)}
                />
                <button
                  type="submit"
                  disabled={savingBlitzitSettings}
                  className="w-full rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {savingBlitzitSettings ? "Saving..." : "Save Blitzit Settings"}
                </button>
              </div>
              {blitzitMessage && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  {blitzitMessage}
                </div>
              )}
            </form>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Security / Reliability</h2>
              <p className="mt-2 text-sm text-slate-600">
                Inactive users are now blocked from the app UI. Admin controls only appear for active admins. Blitzit secrets remain excluded from backup export/restore.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Activity History</h2>
              <p className="mt-2 text-sm text-slate-600">
                Open a card to see a timeline of important task actions, including comments, attachments, status moves, edits, and Blitzit copies.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">File Attachments</h2>
              <p className="mt-2 text-sm text-slate-600">
                Open a card to upload Word docs, PDFs, images, spreadsheets, or other task files.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Reminders</h2>
              <p className="mt-2 text-sm text-slate-600">
                Open a card to set a reminder date and reminder notes. Use Smart Filter for Has Reminder or Reminder Due.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Rev 1.31 Scope</h2>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                <li>• Production RLS hardening SQL added</li>
                <li>• Inactive-user handling retained</li>
                <li>• Admin-only controls retained</li>
                <li>• Blitzit secrets remain excluded from backup/restore</li>
                <li>• Reminder date-only improvements retained</li>
                <li>• Search, comments, activity, attachments, and board views retained</li>
                <li>• Still staying in Rev 1 until go-live</li>
              </ul>
            </div>

            </div>
          </div>
        </div>
      )}

      {isAdmin && adminOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40">
          <div className="h-full w-full max-w-6xl overflow-y-auto border-l border-slate-200 bg-slate-50 p-5 shadow-2xl">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">Admin: Users, Projects & Teams</h2>
                <p className="text-sm text-slate-600">
                  Manage users, profile colors, roles, projects, and teams. Archive/deactivate preserves task history.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={refreshAllData}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Refresh Admin Data
                </button>
                <button
                  type="button"
                  onClick={() => setAdminOpen(false)}
                  className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Close Admin
                </button>
              </div>
            </div>

            {adminMessage && (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {adminMessage}
              </div>
            )}

            <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-2xl">
                  <h3 className="font-bold text-slate-950">Backup / Restore</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Export a JSON backup or restore a previous TaskBoard backup. Restore uses a merge/upsert approach: matching saved IDs are updated, missing records are added, and records not found in the backup are not deleted.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Blitzit secrets and uploaded file contents are not included. Attachment metadata is included, but file binaries are not restored.
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
                  Restore file selected: <span className="font-semibold">{restoreFileName}</span>
                </div>
              )}

              {restorePreview && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">Restore preview</p>
                      <p className="text-xs text-slate-500">
                        Review these row counts before restoring. Restore does not delete records that are missing from the backup.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleRestoreBackup}
                        disabled={restoringBackup}
                        className="rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
                      >
                        {restoringBackup ? "Restoring..." : "Restore Backup"}
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
                    {Object.entries(restorePreview).map(([tableName, rowCount]) => (
                      <div key={tableName} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                        <p className="font-semibold text-slate-950">{tableName}</p>
                        <p>{rowCount} rows</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {backupMessage && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                  {backupMessage}
                </div>
              )}
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="font-bold text-slate-950">Users</h3>
                <p className="mt-1 text-sm text-slate-600">Edit display names, roles, profile colors, and active status.</p>

                {editingUserId && (
                  <form onSubmit={handleSaveUser} className="mt-3 space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-sm font-semibold text-blue-950">Edit user</p>
                    <input
                      className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                      placeholder="Full name"
                      value={editUserFullName}
                      onChange={(event) => setEditUserFullName(event.target.value)}
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <select
                        className="rounded-xl border border-blue-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                        value={editUserRole}
                        onChange={(event) => setEditUserRole(event.target.value as "admin" | "member")}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                      <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-white px-3 py-2">
                        <input
                          type="color"
                          value={editUserColor}
                          onChange={(event) => setEditUserColor(event.target.value)}
                          className="h-10 w-14 rounded-lg border border-blue-200"
                        />
                        <span className="text-sm text-blue-950">{editUserColor}</span>
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
                              style={{ backgroundColor: userProfile.profile_color || "#2563EB" }}
                            />
                            <p className="font-semibold text-slate-950">
                              {displayProfileName(userProfile)}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {userProfile.email || "No email"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Role: {userProfile.role || "member"} · {userProfile.is_active !== false ? "Active" : "Inactive"}
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
                              onClick={() => setUserActive(userProfile.id, false)}
                              className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setUserActive(userProfile.id, true)}
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

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="font-bold text-slate-950">Projects</h3>

                <form onSubmit={handleCreateProject} className="mt-3 space-y-3 rounded-2xl bg-white p-4">
                  <p className="text-sm font-semibold text-slate-900">Add project</p>
                  <input
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                    placeholder="Project name"
                    value={newProjectName}
                    onChange={(event) => setNewProjectName(event.target.value)}
                  />
                  <textarea
                    className="min-h-20 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                    placeholder="Project description"
                    value={newProjectDescription}
                    onChange={(event) => setNewProjectDescription(event.target.value)}
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                      value={newProjectStatus}
                      onChange={(event) => setNewProjectStatus(event.target.value)}
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
                      onChange={(event) => setNewProjectTargetDate(event.target.value)}
                    />
                  </div>
                  <button className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
                    Add Project
                  </button>
                </form>

                {editingProjectId && (
                  <form onSubmit={handleSaveProject} className="mt-3 space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-sm font-semibold text-blue-950">Edit project</p>
                    <input
                      className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                      value={editProjectName}
                      onChange={(event) => setEditProjectName(event.target.value)}
                    />
                    <textarea
                      className="min-h-20 w-full rounded-xl border border-blue-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                      value={editProjectDescription}
                      onChange={(event) => setEditProjectDescription(event.target.value)}
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <select
                        className="rounded-xl border border-blue-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                        value={editProjectStatus}
                        onChange={(event) => setEditProjectStatus(event.target.value)}
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
                        onChange={(event) => setEditProjectTargetDate(event.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button className="rounded-xl bg-blue-950 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-900">Save Project</button>
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
                        project.is_active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-100 opacity-70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">{project.name}</p>
                          <p className="text-xs text-slate-500">
                            Status: {project.status || "active"} · {project.is_active ? "Active" : "Archived"}
                          </p>
                          {project.description && <p className="mt-1 text-xs text-slate-600">{project.description}</p>}
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

                <form onSubmit={handleCreateTeam} className="mt-3 space-y-3 rounded-2xl bg-white p-4">
                  <p className="text-sm font-semibold text-slate-900">Add team</p>
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
                    onChange={(event) => setNewTeamDescription(event.target.value)}
                  />
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={newTeamColor}
                      onChange={(event) => setNewTeamColor(event.target.value)}
                      className="h-11 w-16 rounded-lg border border-slate-300"
                    />
                    <span className="text-sm text-slate-600">Team color: {newTeamColor}</span>
                  </div>
                  <button className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
                    Add Team
                  </button>
                </form>

                {editingTeamId && (
                  <form onSubmit={handleSaveTeam} className="mt-3 space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-sm font-semibold text-blue-950">Edit team</p>
                    <input
                      className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                      value={editTeamName}
                      onChange={(event) => setEditTeamName(event.target.value)}
                    />
                    <textarea
                      className="min-h-20 w-full rounded-xl border border-blue-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                      value={editTeamDescription}
                      onChange={(event) => setEditTeamDescription(event.target.value)}
                    />
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={editTeamColor}
                        onChange={(event) => setEditTeamColor(event.target.value)}
                        className="h-11 w-16 rounded-lg border border-blue-200"
                      />
                      <span className="text-sm text-blue-950">Team color: {editTeamColor}</span>
                    </div>
                    <div className="flex gap-2">
                      <button className="rounded-xl bg-blue-950 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-900">Save Team</button>
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
                        team.is_active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-100 opacity-70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-8 rounded-full" style={{ backgroundColor: team.team_color }} />
                            <p className="font-semibold text-slate-950">{team.name}</p>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{team.is_active ? "Active" : "Archived"}</p>
                          {team.description && <p className="mt-1 text-xs text-slate-600">{team.description}</p>}
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
                <p className="text-xs font-medium text-slate-500">Editing task</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Open Card</h2>
              </div>
              <button
                type="button"
                onClick={closeTaskEditor}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <form onSubmit={saveTaskEdits} className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-900">Task title</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-900">Notes / description</label>
                <textarea
                  className="mt-1 min-h-32 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  placeholder="Add notes, instructions, background, or next steps."
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-900">Project</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  value={editProjectId}
                  onChange={(event) => setEditProjectId(event.target.value)}
                >
                  <option value="">No project</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-semibold text-slate-900">Assign people</label>
                    <span className="text-xs text-slate-500">{editProfileIds.length} selected</span>
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
                          style={{ backgroundColor: profileOption.profile_color || "#2563EB" }}
                        />
                        <span>{displayProfileName(profileOption)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-semibold text-slate-900">Assign teams</label>
                    <span className="text-xs text-slate-500">{editTeamIds.length} selected</span>
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
                          style={{ backgroundColor: team.team_color || "#F97316" }}
                        />
                        <span>{team.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm font-semibold text-slate-900">Priority</label>
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
                  <label className="text-sm font-semibold text-slate-900">Status</label>
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
                  <label className="text-sm font-semibold text-slate-900">Due date</label>
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
                    <label className="text-sm font-semibold text-slate-900">Reminder date</label>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                      value={editReminderAt}
                      onChange={(event) => setEditReminderAt(event.target.value)}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setEditReminderAt(getTomorrowDateInput())}
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
                        onClick={() => setEditReminderAt(getEndOfWeekFridayDateInput())}
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
                      This stores reminder intent by date only. Actual email/push delivery can be added later.
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-900">Reminder notes</label>
                    <textarea
                      className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                      value={editReminderNote}
                      onChange={(event) => setEditReminderNote(event.target.value)}
                      placeholder="Example: Follow up before the launch meeting."
                    />
                  </div>
                </div>
                {selectedTask.reminderAt && (
                  <p className={`mt-3 rounded-xl border px-3 py-2 text-sm ${reminderIsDue(selectedTask.reminderAt) ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-600"}`}>
                    Current reminder: {formatReminderDate(selectedTask.reminderAt)}
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
                  disabled={savingTask}
                  className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {savingTask ? "Saving..." : "Save Task"}
                </button>
              </div>
            </form>

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
                    Comments are saved to this task and visible to users who can view the task.
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
                    <div key={comment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <p className="font-semibold text-slate-950">{comment.commenter_name || "Unknown user"}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(comment.created_at).toLocaleString()}
                        </p>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-slate-700">{comment.comment_text}</p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="mt-6 border-t border-slate-200 pt-5">
              <h3 className="text-lg font-bold text-slate-950">Activity</h3>
              <p className="mt-1 text-sm text-slate-600">
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
                    <div key={activity.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <p className="font-semibold text-slate-950">{activity.actor_name || "System"}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(activity.created_at).toLocaleString()}
                        </p>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-slate-700">{activity.activity_text}</p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">{activity.activity_type.replaceAll("_", " ")}</p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="mt-6 border-t border-slate-200 pt-5">
              <h3 className="text-lg font-bold text-slate-950">Attachments</h3>
              <p className="mt-1 text-sm text-slate-600">
                Upload files for this task. Files are stored in Supabase Storage and opened with temporary signed links.
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
                        <p className="font-semibold text-slate-950">{attachment.file_name}</p>
                        <p className="text-xs text-slate-500">
                          {formatFileSize(attachment.file_size_bytes)} · {attachment.file_type || "Unknown type"}
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
          </div>
        </div>
      )}
    </main>
  );
}
