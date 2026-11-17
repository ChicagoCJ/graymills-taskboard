"use client";

import { FormEvent, useState } from "react";
import { authClient } from "../../auth-client";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await authClient.signIn.email({ email, password, callbackURL: "/" });
      if (response.error) {
        setMessage("Sign-in unsuccessful. Confirm your test account credentials.");
        return;
      }
      // The OAuth client continues the signed flow to consent or the approved
      // callback. Never construct navigation from an untrusted returnTo value.
    } catch {
      setMessage("Test authentication is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>TaskBoard connection — test sign-in</h1>
      <p>Only explicitly provisioned test accounts may sign in.</p>
      <form onSubmit={signIn}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" required
          value={email} onChange={(event) => setEmail(event.target.value)}
          style={{ display: "block", width: "100%", marginBottom: 16 }} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" required
          value={password} onChange={(event) => setPassword(event.target.value)}
          style={{ display: "block", width: "100%", marginBottom: 16 }} />
        <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      {message && <p role="alert">{message}</p>}
    </main>
  );
}
