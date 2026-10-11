import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, Copy, Loader2, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signSolanaMessage } from "@/lib/solana";
import {
  approveReviewerRequest,
  listPendingReviewerRequests,
} from "@/lib/reviewer-admin.functions";
import { ATLAS_ADMIN_WALLET, createReviewerAdminMessage } from "@/lib/reviewer-admin-message";

type ReviewerRequest = {
  id: string;
  wallet_address: string;
  pseudonym: string;
  conflict_attested: boolean;
  status: string;
  created_at: string;
};

export const Route = createFileRoute("/admin/reviewers")({
  head: () => ({ meta: [{ title: "Reviewer operations · Atlas" }] }),
  component: ReviewerAdminPage,
});

function ReviewerAdminPage() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [operatorWallet, setOperatorWallet] = useState<string | null>(null);
  const [requests, setRequests] = useState<ReviewerRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [trustedPilotConfirmed, setTrustedPilotConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let live = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (live) setSignedIn(Boolean(data.user));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (live) setSignedIn(Boolean(session));
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signAdminAction = useCallback(
    async (input: {
      action: "list-pending-reviewers" | "approve-reviewer";
      requestId?: string;
      trustedInviteConfirmed?: boolean;
    }) => {
      const message = createReviewerAdminMessage(input);
      const authorization = await signSolanaMessage(message);
      if (authorization.walletAddress !== ATLAS_ADMIN_WALLET) {
        throw new Error("Connect the Atlas operator wallet ending in 4Q5G3 to continue.");
      }
      return { ...authorization, message };
    },
    [],
  );

  const refreshRequests = useCallback(async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const authorization = await signAdminAction({ action: "list-pending-reviewers" });
      setOperatorWallet(authorization.walletAddress);
      const result = await listPendingReviewerRequests({ data: authorization });
      setRequests(result as ReviewerRequest[]);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not load reviewer requests.");
    } finally {
      setBusy(false);
    }
  }, [signAdminAction]);

  async function approveRequest(request: ReviewerRequest) {
    if (!window.confirm(`Approve “${request.pseudonym}” for future Atlas review assignments?`))
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!trustedPilotConfirmed) return;
      const authorization = await signAdminAction({
        action: "approve-reviewer",
        requestId: request.id,
        trustedInviteConfirmed: true,
      });
      await approveReviewerRequest({
        data: { ...authorization, id: request.id, trustedInviteConfirmed: true },
      });
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setTrustedPilotConfirmed(false);
      setNotice(`${request.pseudonym} is approved for future reviewer assignments.`);
      toast.success("Reviewer approved");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not approve this request.");
    } finally {
      setBusy(false);
    }
  }

  async function copyWallet(wallet: string) {
    try {
      await navigator.clipboard.writeText(wallet);
      toast.success("Wallet address copied");
    } catch {
      toast.error("Could not copy the wallet address");
    }
  }

  if (signedIn === null) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-4xl items-center justify-center px-4">
        <Loader2
          className="h-5 w-5 animate-spin text-primary"
          aria-label="Checking Atlas account"
        />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 md:px-6">
        <RestrictedPanel
          title="Sign in to Atlas first"
          description="Reviewer operations are limited to the Atlas operator account and wallet."
          action={
            <Link
              to="/auth"
              search={{ mode: "signin" }}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Sign in
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 md:px-6 md:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Atlas operator</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Reviewer operations
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Review volunteer requests before they can receive mission assignments. Each approval
            requires a fresh signature from the configured operator wallet. Add only people you
            personally invited or already know for this small pilot.
          </p>
        </div>
        <Link
          to="/missions"
          className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:border-primary/40"
        >
          Back to missions
        </Link>
      </div>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Pending volunteers</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Approving a volunteer makes them eligible for future assignments. It does not
                approve evidence or release mission funds. Pilot approval does not certify expertise
                or verify mission completion.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refreshRequests()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {operatorWallet ? "Refresh requests" : "Verify operator wallet"}
          </button>
        </div>

        {operatorWallet && requests.length > 0 && (
          <label className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-50/50 p-4 text-sm leading-6 text-foreground dark:bg-amber-950/10">
            <input
              type="checkbox"
              checked={trustedPilotConfirmed}
              onChange={(event) => setTrustedPilotConfirmed(event.target.checked)}
              className="mt-1"
            />
            <span>
              I personally invited or already know the selected applicant. I am approving them as a
              trusted pilot participant, not certifying reviewer expertise.
            </span>
          </label>
        )}

        <div className="mt-5 rounded-2xl border border-primary/15 bg-primary/[0.035] px-4 py-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <UsersRound className="h-4 w-4 text-primary" /> Pseudonymous review
          </div>
          <p className="mt-1 leading-6">
            Applicant names and email addresses are not shown here or to sponsors. The reviewer’s
            wallet remains public on Solana, so this is pseudonymous in Atlas rather than fully
            anonymous on-chain.
          </p>
        </div>

        {operatorWallet && (
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="h-4 w-4 text-emerald-700" /> Verified operator wallet
            <span className="font-mono">
              {operatorWallet.slice(0, 8)}…{operatorWallet.slice(-6)}
            </span>
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-emerald-700/20 bg-emerald-700/5 px-4 py-3 text-sm text-emerald-800"
          >
            {notice}
          </p>
        )}

        {operatorWallet && (
          <div className="mt-6">
            {requests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
                <Check className="mx-auto h-6 w-6 text-emerald-700" />
                <p className="mt-3 font-semibold text-foreground">You’re all caught up</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  There are no pending reviewer requests.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {requests.map((request) => (
                  <li
                    key={request.id}
                    className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-foreground">{request.pseudonym}</h3>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-700/10 px-2.5 py-1 text-xs font-medium text-emerald-800">
                          <Check className="h-3 w-3" /> Conflict attested
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono">{request.wallet_address}</span>
                        <button
                          type="button"
                          aria-label={`Copy ${request.pseudonym} wallet address`}
                          onClick={() => void copyWallet(request.wallet_address)}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Copy className="h-3 w-3" /> Copy
                        </button>
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" /> Requested{" "}
                        {new Date(request.created_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void approveRequest(request)}
                      disabled={busy || !request.conflict_attested || !trustedPilotConfirmed}
                      className="shrink-0 rounded-full border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Approve volunteer
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!operatorWallet && !busy && (
          <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
            The wallet will ask you to sign a short authorization message. It does not create a
            transaction or move SOL.
          </p>
        )}
      </section>
    </main>
  );
}

function RestrictedPanel({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <section className="rounded-3xl border border-border bg-card px-6 py-12 text-center shadow-sm">
      <ShieldCheck className="mx-auto h-7 w-7 text-primary" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-5 flex justify-center gap-3">
        {action ?? (
          <button
            type="button"
            onClick={() => void navigate({ to: "/missions" })}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium"
          >
            Return to missions
          </button>
        )}
      </div>
    </section>
  );
}
