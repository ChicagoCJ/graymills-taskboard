import assert from "node:assert/strict";
import { authFailureCode, logAuthFailure } from "./auth-failure";

assert.equal(authFailureCode(new Error("The hosted database CA certificate is missing or invalid.")), "DATABASE_CA_INVALID");
assert.equal(authFailureCode(new Error("The isolated OAuth server is not authorized for this deployment.")), "AUTH_SETTINGS_REJECTED");
const sentinel = "fixture-private-value-must-not-appear";
for (const code of ["ERR_INVALID_URL", "ERR_MODULE_NOT_FOUND", "SELF_SIGNED_CERT_IN_CHAIN", "28P01", "42501", "ETIMEDOUT", sentinel]) {
  const error = Object.assign(new Error(sentinel), { code, input: sentinel, stack: sentinel });
  assert(!authFailureCode(error).includes(sentinel));
  const messages: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { messages.push(args); };
  try { logAuthFailure(error); } finally { console.error = original; }
  assert.equal(messages.length, 1);
  assert.equal(messages[0][0], "TASKBOARD_OAUTH_FAILURE");
  assert.equal(messages[0].length, 2);
  assert(!JSON.stringify(messages).includes(sentinel));
}
console.log("PASS: auth failure logging emits only fixed codes without private messages, inputs or stacks.");
