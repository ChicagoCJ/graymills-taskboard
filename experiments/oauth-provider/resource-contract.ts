/** Runtime contract for the separately hosted OAuth authorization server.
 * This validator is deliberately independent of the production TaskBoard app.
 * A valid resource URL does not, by itself, authorize access to Supabase data.
 */
export function isApprovedTaskBoardResource(
  resource: string,
  issuerBase: string,
  approvedHost: string | undefined,
): boolean {
  if (!approvedHost || !/^[a-z0-9.-]+$/.test(approvedHost) ||
      approvedHost.startsWith(".") || approvedHost.endsWith(".")) return false;

  try {
    const url = new URL(resource);
    const issuer = new URL(issuerBase);
    return url.protocol === "https:" &&
      url.hostname === approvedHost &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/api/integrations/chatgpt/mcp" &&
      url.search === "" &&
      url.hash === "" &&
      url.origin !== issuer.origin &&
      url.toString() === resource;
  } catch {
    return false;
  }
}
