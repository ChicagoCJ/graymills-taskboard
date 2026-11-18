export const VERCEL_STEPS = {
  project: "project lookup", inventory: "environment inventory",
  save: "client settings save", verify: "saved-settings verification",
} as const;
export type VercelStep = keyof typeof VERCEL_STEPS;

// Classify diagnostics without copying any CLI/API text, which may contain
// private request values. Even an unexpected API error code is never echoed.
export function safeVercelFailure(step: VercelStep, exitCode: number | null, output: string, diagnostics: string): string {
  const codes = new Set(["unauthorized", "forbidden", "not_found", "bad_request", "invalid_token",
    "invalid_request", "validation_error", "env_already_exists", "environment_variable_already_exists",
    "too_many_requests", "rate_limited", "internal_server_error"]);
  let apiCode = "";
  try {
    const parsed = JSON.parse(output) as { error?: { code?: unknown } };
    if (typeof parsed.error?.code === "string" && codes.has(parsed.error.code)) apiCode = parsed.error.code;
  } catch { /* Never print an unparsed response. */ }
  let reason = apiCode || "unclassified CLI failure";
  if (/specified token is not valid|not authenticated|please log in|unauthorized/i.test(diagnostics)) reason = "CLI authentication rejected";
  else if (/not recognized as an internal|command not found|ENOENT/i.test(diagnostics)) reason = "CLI command could not be found";
  else if (/unknown or unexpected option|unknown option/i.test(diagnostics)) reason = "CLI option rejected";
  else if (/SELF_SIGNED_CERT|UNABLE_TO_VERIFY|certificate/i.test(diagnostics)) reason = "CLI certificate verification failed";
  else if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed/i.test(diagnostics)) reason = "CLI network failure";
  else if (/visibility/i.test(diagnostics) && /invalid|unexpected|not allowed|additional|unsupported/i.test(diagnostics)) reason = "API visibility field rejected";
  const exit = Number.isInteger(exitCode) ? String(exitCode) : "terminated";
  return `Vercel ${VERCEL_STEPS[step]} failed (exit ${exit}; ${reason}). No secret values were printed.`;
}
