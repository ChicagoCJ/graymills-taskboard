"use client";

import { useState } from "react";
import { authClient } from "../../auth-client";

export default function ConsentPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function respond(accept: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const response = await authClient.oauth2.consent({ accept });
      if (response.error) throw new Error("Consent failed.");
      // The official client forwards all signed parameters and follows the
      // provider's validated callback. Do not truncate the signed request.
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
