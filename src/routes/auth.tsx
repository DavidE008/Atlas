import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CompassScene } from "@/components/CompassScene";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { mode?: "signin" | "signup" } => ({
    mode: search["mode"] === "signup" ? "signup" : "signin",
  }),
  head: () => ({
    meta: [
      { title: "Your Atlas account" },
      {
        name: "description",
        content: "Join Atlas to fund environmental missions and document meaningful local action.",
      },
    ],
  }),
  component: AuthPage,
});
function AuthPage() {
  const navigate = useNavigate();
  const mode = Route.useSearch().mode ?? "signin";
  const signup = mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  useEffect(() => {
    let live = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (live && data.session) void navigate({ to: "/missions", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) void navigate({ to: "/missions", replace: true });
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, [navigate]);
  useEffect(() => {
    setError("");
    setConfirmation(false);
    setPassword("");
  }, [mode]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (signup) {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() },
            emailRedirectTo: window.location.origin + "/missions",
          },
        });
        if (authError) throw authError;
        if (data.session) await navigate({ to: "/missions" });
        else setConfirmation(true);
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
        await navigate({ to: "/missions" });
      }
    } catch (issue) {
      setError(
        issue instanceof Error
          ? issue.message
          : "We couldn't complete that request. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <aside className="auth-story" aria-label="Local action, lasting purpose">
        <img className="auth-landscape" src="/images/atlas-landscape.webp" alt="" />
        <div className="auth-story-copy">
          <span className="eyebrow">Your next chapter starts here</span>
          <h1>
            Small actions.
            <br />
            <em>Shared purpose.</em>
          </h1>
          <p>Find your place in a community that turns care for the planet into action.</p>
        </div>
        <CompassScene compact />
        <p className="auth-story-foot">
          <ShieldCheck size={18} /> Purpose you can see. Rewards you can follow.
        </p>
      </aside>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          {confirmation ? (
            <div className="confirmation-panel">
              <Mail size={36} />
              <h2>Check your inbox.</h2>
              <p>
                We sent a confirmation link to <strong>{email}</strong>. Follow it to activate your
                Atlas account.
              </p>
              <p className="form-help">If it doesn't arrive, check your spam folder.</p>
              <Link to="/auth" search={{ mode: "signin" }} className="button-primary">
                Back to sign in <ArrowRight size={18} />
              </Link>
            </div>
          ) : (
            <>
              <span className="eyebrow">
                {signup ? "Begin your Atlas journey" : "Your next mission awaits"}
              </span>
              <h2>{signup ? "Make room for impact." : "Welcome back."}</h2>
              <p className="auth-subtitle">
                {signup
                  ? "Create an account to fund missions and share the work you do."
                  : "Sign in to pick up where you left off."}
              </p>
              <form onSubmit={submit} className="atlas-form">
                {signup && (
                  <label htmlFor="atlas-name">
                    Your name
                    <input
                      id="atlas-name"
                      name="name"
                      autoComplete="name"
                      required
                      maxLength={80}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="How should we call you?"
                    />
                  </label>
                )}
                <label htmlFor="atlas-email">
                  Email address
                  <input
                    id="atlas-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                <label htmlFor="atlas-password">
                  Password
                  <span className="password-input">
                    <input
                      id="atlas-password"
                      aria-label="Password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={signup ? "new-password" : "current-password"}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={signup ? "At least 6 characters" : "Enter your password"}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <button type="submit" className="button-primary" disabled={busy}>
                  {busy ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <>
                      {signup ? "Create account" : "Sign in"}
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
              <p className="auth-switch">
                {signup ? "Already part of Atlas?" : "New to Atlas?"}{" "}
                <Link to="/auth" search={{ mode: signup ? "signin" : "signup" }}>
                  {signup ? "Sign in" : "Create an account"}
                </Link>
              </p>
              <p className="form-help">
                You can explore without a wallet. Connect one when you're ready to fund or take on a
                mission.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
