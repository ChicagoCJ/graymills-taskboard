"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const APP_REVISION = "Rev 1.32 — Added password reset flow";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      const { data } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (data.session) {
        setHasRecoverySession(true);
        setMessage("Reset link accepted. Enter your new password below.");
      } else {
        setMessage(
          "No active reset session was found. Use the password reset link from your email, or request a new reset link from the sign-in page."
        );
      }

      setCheckingSession(false);
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(true);
        setMessage("Reset link accepted. Enter your new password below.");
        setCheckingSession(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleUpdatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      if (!password || !confirmPassword) {
        setMessage("Enter and confirm your new password.");
        return;
      }

      if (password.length < 8) {
        setMessage("Use at least 8 characters for the new password.");
        return;
      }

      if (password !== confirmPassword) {
        setMessage("The passwords do not match.");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setMessage(error.message);
        return;
      }

      await supabase.auth.signOut();
      setPassword("");
      setConfirmPassword("");
      setHasRecoverySession(false);
      setMessage("Password updated. Return to the sign-in page and sign in with your new password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-medium text-slate-500">{APP_REVISION}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
          Update Password
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter a new password for your Graymills TaskBoard account.
        </p>

        {checkingSession ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Checking password reset link...
          </div>
        ) : (
          <form onSubmit={handleUpdatePassword} className="mt-5 space-y-4">
            <div>
              <label className="text-sm font-semibold text-slate-900">
                New password
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                disabled={!hasRecoverySession || busy}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-900">
                Confirm new password
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter new password"
                disabled={!hasRecoverySession || busy}
              />
            </div>

            <button
              type="submit"
              disabled={!hasRecoverySession || busy}
              className="w-full rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {busy ? "Updating..." : "Update Password"}
            </button>
          </form>
        )}

        {message && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {message}
          </div>
        )}

        <a
          href="/"
          className="mt-4 inline-block text-sm font-semibold text-slate-700 underline underline-offset-4 hover:text-slate-950"
        >
          Return to sign-in
        </a>
      </div>
    </main>
  );
}
