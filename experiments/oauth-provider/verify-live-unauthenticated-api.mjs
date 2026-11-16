// Read-only live HTTP preflight against the verified Graymills Supabase API.
// Uses NO API key, bearer token, credentials or mutations.
// It only verifies that a caller with no authentication cannot retrieve
// user data, project rows or private attachment content.
import assert from "node:assert/strict";

const base = "https://sxwwxeyclbduovrlvtxx.supabase.co";
const scenarios = [
  { name:"Auth /user", path:"/auth/v1/user" },
  { name:"PostgREST /projects", path:"/rest/v1/projects?select=id&limit=1" },
  { name:"Storage private attachment", path:"/storage/v1/object/authenticated/task-attachments/__chatgpt_nonexistent_readonly_probe__" },
  { name:"Storage bucket metadata", path:"/storage/v1/bucket/task-attachments" },
];
for (const check of scenarios) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(new URL(check.path,base), {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: controller.signal,
      cache: "no-store",
    });
    const body = await response.text();
    assert.ok(body.length <= 20000, check.name + " response unexpectedly large.");
    const deniedStatuses = check.name.startsWith("Storage") ? [400,401,403] : [401,403];
    assert.ok(deniedStatuses.includes(response.status),
      check.name + " must reject unauthenticated GET: received " + response.status);
    assert.ok(response.status !== 200 && response.status !== 206, "Unauthenticated response must not return object content.");
    console.log("PASS " + check.name + " -> HTTP " + response.status);
  } finally {
    clearTimeout(timeout);
  }
}
console.log("PASS: real Supabase API rejects uncredentialed read requests.");
console.log("LIMITATION: does not test authenticated integration RLS, Storage write operations, signed URLs or OAuth.");
