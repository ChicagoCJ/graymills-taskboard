"use client";

import { useState } from "react";

export default function ConsentPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function respond(accept: boolean) {
    setBusy(true);
    setMessage("");
    try {
      // Better Auth carries a signed OAuth request in the query parameters.
      const signed = new URLSearchParams(window.location.search);
      const allowed = new URLSearchParams();
      for (const key of ["sig", "ba_param"]) {
        for (const value of signed.getAll(key)) allowed.append(key, value);
      }
      if (![...allowed.keys()].length) {
        throw new Error("Missing signed authorization request.");
      }
      const response = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accept, oauth_query: allowed.toString() }),
      });
      if (!response.ok) throw new Error("Consent failed.");
      const data: { url?: string } = await response.json();
      if (!data.url) throw new Error("Authorization callback missing.");
      // The OAuth provider validates the client's registered callback URL.
      window.location.assign(data.url);
    } catch {
      setMessage("The authorization request could not be completed.");
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Authorize test connection</h1>
      <p>This test requests access to the designated TaskBoard MCP resource.</p>
      <p>Approving consent does not grant access to other TaskBoard projects or employees.</p>
      <div style={{ display: "flex", gap: 12 }}>
        <button disabled={busy} onClick={() => respond(true)}>Allow</button>
        <button disabled={busy} onClick={() => respond(false)}>Deny</button>
      </div>
      {message && <p role="alert">{message}</p>}
    </main>
  );
}
