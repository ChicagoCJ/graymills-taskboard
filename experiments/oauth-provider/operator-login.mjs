// Local operator helper. Never imported by the website or exposed as an API.
// The caller owns the transaction; only the private OAuth login tables are used.
import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";

export class OperatorSetupError extends Error {}

export function hostedOperatorDatabaseUrl(raw, host, projectRef) {
  let url;
  try { url = new URL(raw); } catch { throw new OperatorSetupError("Invalid saved database URL."); }
  if (!/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host ?? "") ||
      !/^[a-z0-9]{20}$/.test(projectRef ?? "") ||
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== host || url.port !== "5432" || url.pathname !== "/postgres" ||
      decodeURIComponent(url.username) !== `chatgpt_oauth_runtime.${projectRef}` || !url.password) {
    throw new OperatorSetupError("Use the saved restricted-role session-pooler URL for the approved project.");
  }
  // Do not inherit driver overrides from a pasted connection string.
  url.search = "";
  url.hash = "";
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

export async function prepareOperatorLogin(client, { email, password }) {
  if (typeof email !== "string" || email !== email.trim().toLowerCase() ||
      email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) ||
      typeof password !== "string" || password.length < 16 || password.length > 128 || !password.trim()) {
    throw new OperatorSetupError("Use a lowercase email and an OAuth password of 16 to 128 characters.");
  }
  const role = await client.query(`select current_user as identity,
    rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit
    from pg_roles where rolname=current_user`);
  const expected = { identity: "chatgpt_oauth_runtime", rolcanlogin: true,
    rolsuper: false, rolcreatedb: false, rolcreaterole: false,
    rolreplication: false, rolbypassrls: false, rolinherit: false };
  if (role.rowCount !== 1 || Object.entries(expected).some(([key, value]) => role.rows[0][key] !== value)) {
    throw new OperatorSetupError("Database identity is not the restricted OAuth role.");
  }
  // Serializes repeat invocations. Must be called inside an explicit transaction.
  await client.query("select pg_advisory_xact_lock(hashtext('chatgpt_oauth.operator-bootstrap'))");
  const users = await client.query('select "id", "email" from "chatgpt_oauth"."user" limit 2');
  const accounts = await client.query('select "userId", "accountId", "providerId", "password" from "chatgpt_oauth"."account" limit 2');
  if (users.rowCount || accounts.rowCount) {
    const user = users.rows[0];
    const account = accounts.rows[0];
    if (users.rowCount !== 1 || accounts.rowCount !== 1 || user.email !== email ||
        account.userId !== user.id || account.accountId !== user.id ||
        account.providerId !== "credential" || typeof account.password !== "string") {
      throw new OperatorSetupError("An existing OAuth login needs review. Nothing was reset.");
    }
    if (!await verifyPassword({ hash: account.password, password })) {
      throw new OperatorSetupError("The existing OAuth password does not match. Nothing was reset.");
    }
    return { id: user.id, created: false };
  }
  const id = randomUUID();
  const hash = await hashPassword(password);
  await client.query(`insert into "chatgpt_oauth"."user"
    ("id", "name", "email", "emailVerified") values ($1,$2,$3,false)`,
  [id, "TaskBoard OAuth Integration", email]);
  await client.query(`insert into "chatgpt_oauth"."account"
    ("id", "accountId", "providerId", "userId", "password", "updatedAt")
    values ($1,$2,'credential',$2,$3,now())`, [randomUUID(), id, hash]);
  return { id, created: true };
}
