import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import ts from "typescript";

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://taskboard.test/" });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
const localRequire = createRequire(import.meta.url);
const React = localRequire("react");
const { createRoot } = localRequire("react-dom/client");
const { act } = React;
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = {};

// Load the actual TS/TSX source without a second test-only copy of the component.
function loadSource(file) {
  if (cache[file]) return cache[file].exports;
  const loaded = new Module(file);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = id => id.startsWith("@/")
    ? loadSource(path.join(repository, "src", id.slice(2)) + ".ts")
    : originalRequire(id);
  cache[file] = loaded;
  loaded._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
  return loaded.exports;
}

const { parseEmailTaskDraft, emailTaskDescription, emailTaskReviewUrl, emailTaskDraftFromHash } = loadSource(path.join(repository, "src/lib/emailTaskDraft.ts"));
const Review = loadSource(path.join(repository, "src/components/EmailTaskReview.tsx")).default;
const draft = {
  version: 1, title: "Confirm vendor shipment", description: "Confirm delivery status; receipt is not established.",
  suggestedOwner: "Buyer One", status: "waiting", priority: "normal",
  source: { subject: "Initial stocking order", from: "Vendor contact", url: "https://outlook.office365.com/owa/?ItemID=test" },
};
const label = name => {
  const found = [...document.querySelectorAll("label")].find(el => el.firstChild.textContent.trim() === name);
  assert(found, `Missing label: ${name}`);
  return found.querySelector("input,select,textarea");
};
const button = name => [...document.querySelectorAll("button")].find(el => el.textContent === name);
const checkbox = () => document.querySelector('input[type="checkbox"]');
async function change(element, value) {
  await act(async () => {
    const prototype = element instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype
      : element instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
    element.dispatchEvent(new window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function click(element) { await act(async () => element.click()); }
async function mount(onCreate) {
  const root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(Review, {
    projects: [{ id: "p1", name: "Vendor follow-ups" }], people: [{ id: "u1", name: "Buyer One" }],
    teams: [{ id: "t1", name: "Purchasing" }], onCreate,
  })));
  return async () => act(async () => root.unmount());
}
async function openDraft() {
  await change(label("Paste a task draft from ChatGPT"), JSON.stringify(draft));
  await click(button("Review draft"));
}
async function completeSelections() {
  await change(label("Owner"), "u1");
  await change(label("Project"), "p1");
  await change(label("Due date"), "none");
  await change(label("Reminder"), "none");
}

test("untrusted task drafts reject invalid dates, unknown fields, and unsafe source links", () => {
  assert.equal(parseEmailTaskDraft(JSON.stringify(draft)).title, draft.title);
  for (const url of ["javascript:alert(1)", "https://outlook.office365.com.evil.test/", "https://user:secret@outlook.office.com/"]) {
    assert.throws(() => parseEmailTaskDraft(JSON.stringify({ ...draft, source: { ...draft.source, url } })));
  }
  assert.throws(() => parseEmailTaskDraft(JSON.stringify({ ...draft, dueDate: "2027-02-30" })));
  assert.throws(() => parseEmailTaskDraft(JSON.stringify({ ...draft, ownerId: "untrusted-id" })));
});

test("task notes retain the source email link and provenance", () => {
  const description = emailTaskDescription({ ...draft, source: draft.source });
  assert(description.includes(draft.description));
  assert(description.includes(draft.source.subject));
  assert(description.includes(draft.source.url));
});

test("Outlook handoff links round-trip Unicode without putting email content in the query string", () => {
  const input = { ...draft, title: "SRI — confirmer l’expédition & arrival" };
  const link = new URL(emailTaskReviewUrl("https://taskboard.test/", input));
  assert.equal(link.search, "");
  assert.deepEqual(emailTaskDraftFromHash(link.hash), parseEmailTaskDraft(JSON.stringify(input)));
  assert.equal(emailTaskDraftFromHash("#unrelated"), null);
  assert.throws(() => emailTaskDraftFromHash("#email-task=%broken"));
  assert.throws(() => emailTaskDraftFromHash("#email-task=" + "a".repeat(12001)));
  assert.throws(() => emailTaskReviewUrl("http://taskboard.test/", input));
});

test("opening a ChatGPT review link populates the form and removes the fragment without creating a task", async () => {
  let saves = 0;
  window.history.replaceState(null, "", emailTaskReviewUrl("https://taskboard.test/", draft));
  const unmount = await mount(async () => { saves++; return { taskId: "unused" }; });
  try {
    assert.equal(label("Task title").value, draft.title);
    assert.equal(label("Outlook message link").value, draft.source.url);
    assert.equal(label("Owner").value, "");
    assert.equal(window.location.hash, "");
    assert.equal(saves, 0);
    assert(button("Confirm & create task").disabled);
  } finally { await unmount(); }
});

test("review gates saves, resets after edits, and submits final selections only once", async () => {
  const saved = [];
  const unmount = await mount(async (task, file, id) => {
    saved.push({ task, file, id });
    await new Promise(resolve => setTimeout(resolve, 20));
    return { taskId: id };
  });
  try {
    await openDraft();
    assert.equal(label("Owner").value, "");
    assert.equal(label("Project").value, "");
    assert(button("Confirm & create task").disabled);
    await click(checkbox());
    await click(button("Confirm & create task"));
    assert.match(document.querySelector('[role="alert"]').textContent, /project/i);
    assert.equal(saved.length, 0);
    await completeSelections();
    assert(!checkbox().checked);
    await click(checkbox());
    await change(label("Priority"), "high");
    assert(!checkbox().checked);
    await click(checkbox());
    await act(async () => {
      const create = button("Confirm & create task");
      create.click(); create.click();
      await new Promise(resolve => setTimeout(resolve, 40));
    });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].task.profileId, "u1");
    assert.equal(saved[0].task.projectId, "p1");
    assert.equal(saved[0].task.priority, "high");
    assert.equal(saved[0].task.dueDate, "");
    assert.equal(saved[0].task.source.url, draft.source.url);
    assert.match(saved[0].id, /^[0-9a-f-]{36}$/);
    assert(document.querySelector('[role="status"]').textContent.includes("Email task created"));
    assert.equal(button("Confirm & create task"), undefined);
  } finally { await unmount(); }
});

test("a failed request reuses its task ID and requires fresh confirmation", async () => {
  const ids = [];
  const unmount = await mount(async (_task, _file, id) => {
    ids.push(id);
    if (ids.length === 1) throw new Error("Connection interrupted");
    return { taskId: id, warning: "This draft already created a task. Check its assignment." };
  });
  try {
    await openDraft(); await completeSelections(); await click(checkbox());
    await click(button("Confirm & create task"));
    assert(!checkbox().checked);
    assert(button("Confirm & create task").disabled);
    await click(checkbox()); await click(button("Confirm & create task"));
    assert.equal(ids.length, 2);
    assert.equal(ids[0], ids[1]);
    assert.match(document.querySelector('[role="status"]').textContent, /follow-up needed/);
    assert.equal(button("Confirm & create task"), undefined);
  } finally { await unmount(); }
});

test("selecting an email file opens review without saving or inferring ownership", async () => {
  let saves = 0;
  const unmount = await mount(async () => { saves++; return { taskId: "unused" }; });
  try {
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", { value: [new window.File(["Subject: Example"], "Vendor follow-up.eml")], configurable: true });
    await act(async () => input.dispatchEvent(new window.Event("change", { bubbles: true })));
    assert.equal(label("Task title").value, "Vendor follow-up");
    assert.equal(label("Owner").value, "");
    assert.equal(label("Status").value, "");
    assert.equal(saves, 0);
    await click(button("Cancel"));
    assert.equal(saves, 0);
  } finally { await unmount(); }
});
