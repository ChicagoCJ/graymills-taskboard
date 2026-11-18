// Log only fixed categories. Exception messages/URLs/parameters and stacks
// can contain private configuration, so they must never reach runtime logs.
export function authFailureCode(error: unknown): string {
  if (!(error instanceof Error)) return "AUTH_RUNTIME_FAILURE";
  if (error.message === "OAuth authentication is disabled until its server-only configuration is complete.") {
    return "AUTH_SETTINGS_MISSING";
  }
  if (error.message === "The isolated OAuth server is not authorized for this deployment.") {
    return "AUTH_SETTINGS_REJECTED";
  }
  if (error.message === "The hosted database CA certificate is missing or invalid.") {
    return "DATABASE_CA_INVALID";
  }
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ERR_INVALID_URL") return "AUTH_URL_INVALID";
  if (["MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED"].includes(code ?? "")) {
    return "AUTH_RUNTIME_MODULE_UNAVAILABLE";
  }
  if (["SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(code ?? "")) {
    return "DATABASE_TLS_VERIFICATION_FAILED";
  }
  if (code === "28P01") return "DATABASE_LOGIN_REJECTED";
  if (code === "42P01" || code === "42501") return "DATABASE_SCHEMA_OR_PERMISSION_ERROR";
  if (["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT"].includes(code ?? "")) return "DATABASE_CONNECTION_UNAVAILABLE";
  return "AUTH_RUNTIME_FAILURE";
}

export function logAuthFailure(error: unknown) {
  console.error("TASKBOARD_OAUTH_FAILURE", authFailureCode(error));
}
