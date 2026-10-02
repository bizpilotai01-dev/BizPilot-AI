"use client";

import { useEffect, useState, type FormEvent } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";

export function AuthCard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseBrowser) {
      return;
    }

    supabaseBrowser.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });

    const { data: subscription } = supabaseBrowser.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
      window.dispatchEvent(new Event("bizpilot-auth-change"));
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabaseBrowser) {
      setMessage("Supabase auth is not configured yet.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const result =
        mode === "sign-in"
          ? await supabaseBrowser.auth.signInWithPassword({ email, password })
          : await supabaseBrowser.auth.signUp({ email, password });

      if (result.error) {
        throw new Error(result.error.message);
      }

      const nextEmail = result.data.user?.email ?? email;
      if (result.data.session) {
        setUserEmail(nextEmail);
        window.dispatchEvent(new Event("bizpilot-auth-change"));
      }
      setMessage(
        mode === "sign-in"
          ? "Signed in successfully."
          : result.data.session
            ? "Account created and signed in."
            : "Check your inbox to confirm the sign-up, then sign in.",
      );
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    if (!supabaseBrowser) return;
    const { error } = await supabaseBrowser.auth.signOut();
    if (error) {
      setMessage(error.message);
      return;
    }
    setUserEmail(null);
    setMessage("Signed out successfully.");
  }

  if (userEmail) {
    return (
      <section className="module-surface">
        <h2 className="section-heading">Account</h2>
        <p className="mt-2 text-sm text-secondary">Signed in as {userEmail}</p>
        <button type="button" className="button-secondary mt-4 min-h-11 px-4 text-sm" onClick={handleSignOut}>
          Sign out
        </button>
      </section>
    );
  }

  return (
    <section className="module-surface" aria-label="Authentication form">
      <h2 className="section-heading">{mode === "sign-in" ? "Sign in" : "Create account"}</h2>
      <p className="mt-1 text-sm leading-relaxed text-secondary">
        {mode === "sign-in"
          ? "Access your BizPilot workspace and manage leads securely."
          : "Create an account to lock your business dashboard to a real user."}
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className="form-label" htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            className="form-control"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <div>
          <label className="form-label" htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            className="form-control"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
          />
        </div>

        {message && (
          <p className="feedback-message feedback-success" role="status">
            <span>{message}</span>
          </p>
        )}

        <button type="submit" className="button-primary min-h-11 w-full px-4 text-sm" disabled={loading}>
          {loading ? (mode === "sign-in" ? "Signing in..." : "Creating account...") : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        className="button-secondary mt-3 min-h-11 w-full px-4 text-sm"
        onClick={() => setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"))}
      >
        {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
      </button>
    </section>
  );
}
