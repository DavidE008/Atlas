import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Compass,
  Crosshair,
  ExternalLink,
  Loader2,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkles,
  Wallet,
  Wind,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getMissionDeadlines,
  getMissionDisplayStatus,
  getMissionMapPosition,
  MISSION_LOCATIONS,
} from "@/lib/mission-demo";
import {
  ATLAS_PROGRAM_ID,
  claimMission,
  createFundedMission,
  readMissionStatus,
  refundMission,
  resolveMission,
  submitMissionEvidence,
} from "@/lib/atlas-missions";

type Mission = {
  id: string;
  created_by: string;
  mission_key: string;
  sponsor_wallet: string;
  reviewer_wallet: string;
  program_address: string;
  mission_address: string | null;
  terms_hash: string | null;
  title: string;
  description: string;
  is_demo: boolean;
  category: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  reward_lamports: number;
  submit_by: string;
  review_by: string;
  created_at: string;
  settlement_status: string | null;
  settlement_tx_signature: string | null;
  chainStatus?: string | null;
  submission?: {
    participant_wallet: string;
    note: string;
    evidence_hash: string;
    photo_path: string | null;
    tx_signature: string;
  } | null;
};
const CATEGORIES = ["All missions", "Cleanup"] as const;

export const Route = createFileRoute("/missions")({
  head: () => ({
    meta: [
      { title: "Atlas Missions — Houston" },
      {
        name: "description",
        content: "Fund and complete local environmental missions with transparent Solana escrow.",
      },
    ],
  }),
  component: MissionsPage,
});

function MissionsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All missions");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [now, setNow] = useState(() => Date.now());

  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      setUserId(auth.user?.id ?? null);
      const { data, error } = await supabase
        .from("missions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      const rows = (data ?? []) as Mission[];
      const withStatus = await Promise.all(
        rows
          .filter((m) => m.mission_address)
          .map(async (m) => {
            try {
              const onChainStatus = await readMissionStatus(m.mission_address!);
              return { ...m, chainStatus: onChainStatus ?? m.settlement_status ?? "Unavailable" };
            } catch {
              return { ...m, chainStatus: m.settlement_status ?? "Unavailable" };
            }
          }),
      );
      const byId = new Map(withStatus.map((m) => [m.id, m]));
      const complete = rows.map((m) => byId.get(m.id) ?? m);
      const missionIds = complete.map((m) => m.id);
      const { data: submissionRows, error: submissionError } =
        missionIds.length && auth.user
          ? await supabase
              .from("mission_submissions")
              .select("mission_id,participant_wallet,note,evidence_hash,photo_path,tx_signature")
              .in("mission_id", missionIds)
          : { data: [], error: null };
      if (submissionError) throw submissionError;
      const submissionsByMission = new Map(
        (submissionRows ?? []).map((submission) => [submission.mission_id, submission]),
      );
      const submissions = complete.map((m) => ({
        ...m,
        submission: submissionsByMission.get(m.id) ?? null,
      }));
      setMissions(submissions as Mission[]);
      setSelectedId((current) => current ?? submissions[0]?.id ?? null);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : typeof error === "object" && error && "message" in error
            ? String(error.message)
            : "Could not load missions.",
      );
      throw error;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh().catch((error) =>
      toast.error(error instanceof Error ? error.message : "Could not load missions"),
    );
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const filtered = useMemo(
    () => missions.filter((m) => category === "All missions" || m.category === "cleanup"),
    [missions, category],
  );
  const selected = missions.find((m) => m.id === selectedId) ?? filtered[0] ?? null;
  const rawStatus = selected?.chainStatus ?? (selected?.mission_address ? "Checking" : "Draft");
  const status = selected
    ? getMissionDisplayStatus(rawStatus, selected.submit_by, selected.review_by, now)
    : "Draft";
  const active = missions.filter((m) =>
    ["Funded", "Claimed", "Submitted"].includes(
      getMissionDisplayStatus(m.chainStatus, m.submit_by, m.review_by, now),
    ),
  ).length;
  const paid = missions.filter((m) => m.chainStatus === "Paid").length;
  const connectWallet = async () => {
    const publicKey = await (await import("@/lib/atlas-missions")).connectMissionWallet();
    setWallet(publicKey);
    return publicKey;
  };

  const doClaim = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await claimMission({
        sponsorWallet: selected.sponsor_wallet,
        missionId: selected.mission_key,
      });
      setWallet(result.wallet);
      toast.success("Mission claimed on Solana devnet");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusy(false);
    }
  };

  const doSubmit = async () => {
    if (!selected || !userId || !note.trim()) return;
    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      const participantWallet = await connectWallet();
      let photoDigest = "no-photo";
      if (photo) {
        if (
          photo.size > 10 * 1024 * 1024 ||
          !["image/jpeg", "image/png", "image/webp"].includes(photo.type)
        )
          throw new Error("Choose a JPG, PNG, or WebP photo under 10 MB.");
        const bytes = new Uint8Array(await photo.arrayBuffer());
        photoDigest = await digest(bytes);
        uploadedPath = `${userId}/${selected.id}/${crypto.randomUUID()}.${photo.name.split(".").pop() ?? "jpg"}`;
        const { error } = await supabase.storage
          .from("mission-evidence")
          .upload(uploadedPath, photo, { upsert: false, contentType: photo.type });
        if (error) throw error;
      }
      const evidence = JSON.stringify({
        mission: selected.mission_address,
        participantWallet,
        note: note.trim(),
        photoDigest,
        submittedAt: new Date().toISOString(),
      });
      const result = await submitMissionEvidence({
        sponsorWallet: selected.sponsor_wallet,
        missionId: selected.mission_key,
        evidence,
      });
      const { error } = await supabase.from("mission_submissions").insert({
        mission_id: selected.id,
        user_id: userId,
        participant_wallet: participantWallet,
        note: note.trim(),
        evidence_hash: result.evidenceHash,
        photo_path: uploadedPath,
        tx_signature: result.signature,
      });
      if (error)
        throw new Error(
          "The on-chain submission succeeded, but its off-chain receipt could not be saved. Share transaction " +
            result.signature,
        );
      setNote("");
      setPhoto(null);
      toast.success("Evidence submitted and hash committed on Solana");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  };

  const openEvidencePhoto = async () => {
    const path = selected?.submission?.photo_path;
    if (!path) return;
    const { data, error } = await supabase.storage
      .from("mission-evidence")
      .createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast.error("Evidence photo could not be opened");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const doResolve = async (approve: boolean) => {
    if (!selected?.submission) return;
    setBusy(true);
    try {
      const result = await resolveMission({
        sponsorWallet: selected.sponsor_wallet,
        missionId: selected.mission_key,
        participantWallet: selected.submission.participant_wallet,
        approve,
      });
      const { error } = await supabase
        .from("missions")
        .update({
          settlement_status: approve ? "Paid" : "Rejected",
          settlement_tx_signature: result.signature,
        })
        .eq("id", selected.id);
      if (error) toast.error("On-chain review succeeded, but its receipt could not be saved.");
      else toast.success(approve ? "Reward paid on Solana" : "Reward returned to sponsor");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  };

  const doRefund = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await refundMission({
        sponsorWallet: selected.sponsor_wallet,
        missionId: selected.mission_key,
      });
      const { error } = await supabase
        .from("missions")
        .update({ settlement_status: "Refunded", settlement_tx_signature: result.signature })
        .eq("id", selected.id);
      if (error) toast.error("On-chain refund succeeded, but its receipt could not be saved.");
      else toast.success("Expired mission refunded to sponsor");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refund failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="missions-page mx-auto w-full max-w-7xl px-4 md:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            <Compass className="h-4 w-4" /> Atlas field network
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
            Find your next mission.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Find a nearby cleanup, see its reward held in escrow, and follow the work from claim
            through review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                const address = await connectWallet();
                toast.success("Connected " + address.slice(0, 4) + "…" + address.slice(-4));
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Wallet connection failed");
              }
            }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:border-primary/50"
          >
            <Wallet className="h-4 w-4 text-primary" />{" "}
            {wallet ? wallet.slice(0, 4) + "…" + wallet.slice(-4) : "Connect wallet"}
          </button>
          <button
            onClick={() =>
              userId
                ? setShowCreate(true)
                : void navigate({ to: "/auth", search: { mode: "signup" } })
            }
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Fund a mission
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric
          label="Open missions"
          value={loading ? "…" : loadError ? "Unavailable" : String(active)}
          icon={<Wind className="h-4 w-4" />}
        />
        <Metric
          label="Completed & paid"
          value={loading ? "…" : loadError ? "Unavailable" : String(paid)}
          icon={<BadgeCheck className="h-4 w-4" />}
        />
        <Metric label="Network" value="Solana devnet" icon={<ShieldCheck className="h-4 w-4" />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Houston mission field</p>
              <p className="text-xs text-muted-foreground">
                Select a pin to inspect its task and escrow state
              </p>
            </div>
            <button
              onClick={() => void refresh().catch(() => {})}
              disabled={loading}
              className="text-xs text-primary hover:underline"
            >
              Refresh chain
            </button>
          </div>
          <div className="mission-field relative h-[360px] overflow-hidden">
            <img
              src="/images/atlas-landscape.webp"
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-45"
            />
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                aria-label={m.title}
                className={`absolute rounded-full p-2 transition hover:scale-125 ${selected?.id === m.id ? "bg-primary text-primary-foreground shadow-[0_0_24px_#92e3bd99]" : "bg-card text-primary"}`}
                style={{
                  left: `${getMissionMapPosition(m.latitude, m.longitude).left}%`,
                  top: `${getMissionMapPosition(m.latitude, m.longitude).top}%`,
                }}
              >
                <MapPin className="h-4 w-4" />
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center p-5">
                <div className="mission-empty">
                  <h3>
                    {loading
                      ? "Finding local missions…"
                      : loadError
                        ? "We couldn't load the field."
                        : "The next mission starts with you."}
                  </h3>
                  <p>
                    {loading
                      ? "Checking the Atlas mission catalog."
                      : loadError
                        ? loadError
                        : "No missions have been published yet. Help launch a local cleanup with a reward for the work."}
                  </p>
                  {!loading && !loadError && (
                    <button
                      className="button-text"
                      onClick={() =>
                        userId
                          ? setShowCreate(true)
                          : void navigate({ to: "/auth", search: { mode: "signup" } })
                      }
                    >
                      {userId ? "Fund the first mission" : "Join Atlas"} <ArrowUpRight size={16} />
                    </button>
                  )}
                  {!loading && loadError && (
                    <button className="button-text" onClick={() => void refresh().catch(() => {})}>
                      Try again
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="absolute bottom-3 left-3 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white/70">
              <Crosshair className="mr-1 inline h-3 w-3 text-primary" /> Houston, TX ·{" "}
              {loading ? "Loading" : loadError ? "Unavailable" : filtered.length + " missions"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border p-3">
            {CATEGORIES.map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                className={`rounded-full px-3 py-1.5 text-xs ${category === item ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="grid gap-3 p-3 sm:grid-cols-2">
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className={`rounded-xl border p-4 text-left transition hover:border-primary/60 ${selected?.id === m.id ? "border-primary/60 bg-primary/5" : "border-border bg-background/40"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-primary">
                    {m.neighborhood}
                  </span>
                  <div className="flex items-center gap-2">
                    {m.is_demo && <DemoLabel />}
                    <StatusPill
                      status={getMissionDisplayStatus(
                        m.chainStatus ?? "Draft",
                        m.submit_by,
                        m.review_by,
                        now,
                      )}
                    />
                  </div>
                </div>
                <p className="mt-2 font-semibold">{m.title}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {m.description}
                </p>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span>{(Number(m.reward_lamports) / 1e9).toFixed(3)} SOL reward</span>
                  <span className="inline-flex items-center gap-1 text-primary">
                    View mission <ArrowUpRight className="h-3 w-3" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          {selected ? (
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.18em] text-primary">
                  {selected.neighborhood}
                </span>
                <div className="flex items-center gap-2">
                  {selected.is_demo && <DemoLabel />}
                  <StatusPill status={status} />
                </div>
              </div>
              <h2 className="mt-3 text-2xl font-bold">{selected.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {selected.description}
              </p>
              {selected.is_demo && (
                <p className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
                  Devnet demonstration example. This record does not claim verified real-world cleanup.
                </p>
              )}
              <div className="my-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-background p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">Reward escrow</p>
                  <p className="mt-1 text-lg font-semibold">
                    {(Number(selected.reward_lamports) / 1e9).toFixed(3)} SOL
                  </p>
                </div>
                <div className="rounded-xl bg-background p-3">
                  <p className="text-[10px] uppercase text-muted-foreground">Submit by</p>
                  <p className="mt-1 text-sm font-medium">
                    {new Date(selected.submit_by).toLocaleString([], {
                      weekday: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
              <div className="space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
                <p>
                  Reviewer{" "}
                  <span className="float-right font-mono text-foreground">
                    {selected.reviewer_wallet.slice(0, 5)}…{selected.reviewer_wallet.slice(-5)}
                  </span>
                </p>
                <p>
                  Solana mission PDA{" "}
                  <span className="float-right font-mono text-foreground">
                    {selected.mission_address?.slice(0, 5)}…
                    {selected.mission_address?.slice(-5) ?? "pending"}
                  </span>
                </p>
                <p>
                  Terms commitment{" "}
                  <span className="float-right font-mono text-foreground">
                    {selected.terms_hash?.slice(0, 10) ?? "pending"}…
                  </span>
                </p>
              </div>

              <div className="mt-5 space-y-2">
                {!selected.mission_address && selected.created_by === userId && (
                  <p className="rounded-lg bg-amber-400/10 p-3 text-xs text-amber-800">
                    Draft saved. Finish wallet funding to publish this mission.
                  </p>
                )}
                {status === "Funded" && selected.sponsor_wallet !== wallet && (
                  <ActionButton busy={busy} onClick={doClaim}>
                    Claim this cleanup
                  </ActionButton>
                )}
                {status === "Claimed" &&
                  selected.sponsor_wallet !== wallet &&
                  selected.reviewer_wallet !== wallet &&
                  !!userId &&
                  !selected.submission && (
                    <div className="space-y-2">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Describe what you completed and what the photos show"
                        rows={3}
                        className="w-full rounded-xl border border-border bg-background p-3 text-sm"
                      />
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                        className="w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-foreground"
                      />
                      <ActionButton busy={busy} onClick={doSubmit}>
                        Submit evidence on Solana
                      </ActionButton>
                    </div>
                  )}
                {status === "Submitted" && selected.reviewer_wallet === wallet && (
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton busy={busy} onClick={() => void doResolve(true)}>
                      Approve & pay
                    </ActionButton>
                    <button
                      disabled={busy}
                      onClick={() => void doResolve(false)}
                      className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
                    >
                      Reject & refund
                    </button>
                  </div>
                )}
                {["Funded", "Claimed", "Submitted"].includes(selected.chainStatus ?? "") &&
                  status === "Expired" && (
                    <ActionButton busy={busy} onClick={doRefund}>
                      Refund expired mission
                    </ActionButton>
                  )}
                {selected.submission?.photo_path && (
                  <button
                    onClick={() => void openEvidencePhoto()}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-primary"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open evidence photo
                  </button>
                )}
                {selected.submission && (
                  <a
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-primary"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://explorer.solana.com/tx/${selected.submission.tx_signature}?cluster=devnet`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View submitted proof
                  </a>
                )}
                {selected.settlement_tx_signature && (
                  <a
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-primary"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://explorer.solana.com/tx/${selected.settlement_tx_signature}?cluster=devnet`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View settlement
                  </a>
                )}
                {status === "Paid" && (
                  <p className="rounded-lg bg-primary/10 p-3 text-sm text-primary">
                    <BadgeCheck className="mr-2 inline h-4 w-4" /> Reviewed and paid on Solana
                  </p>
                )}
                {status === "Unavailable" && (
                  <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                    Devnet account could not be read. Retry after confirming the program is
                    deployed.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Choose a mission or fund the first one.
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" /> Trust model
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Solana locks the reward and enforces who may claim, submit, and review. A person still
              judges the cleanup. The evidence hash protects the submitted record; it does not prove
              the physical work happened.
            </p>
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
            Devnet prototype. Wallet transactions require a deployed Atlas program and devnet SOL.
            Mission details and photos stay in Supabase.
          </p>
        </aside>
      </div>
      {showCreate && (
        <CreateMission
          onClose={() => setShowCreate(false)}
          userId={userId}
          onCreated={async () => {
            setShowCreate(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <span className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</span>
      <span>
        <span className="block text-xs text-muted-foreground">{label}</span>
        <strong className="text-sm">{value}</strong>
      </span>
    </div>
  );
}
function StatusPill({ status }: { status: string }) {
  const settled = status === "Paid";
  const expired = status === "Expired";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${settled ? "bg-primary/15 text-primary" : expired ? "bg-amber-100 text-amber-800" : status === "Unavailable" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}
function DemoLabel() {
  return (
    <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-primary">
      Devnet demo
    </span>
  );
}
function ActionButton({
  children,
  busy,
  onClick,
}: {
  children: React.ReactNode;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {children}
    </button>
  );
}

function CreateMission({
  userId,
  onClose,
  onCreated,
}: {
  userId: string | null;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);
  const [title, setTitle] = useState("UH campus litter sweep");
  const [description, setDescription] = useState(
    "Collect visible litter along the marked campus path. Submit a clear completion photo. A designated reviewer checks the work.",
  );
  const [locationName, setLocationName] = useState<string>(MISSION_LOCATIONS[0].name);
  const [reviewer, setReviewer] = useState("");
  const [reward, setReward] = useState("0.05");
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId) {
      toast.error("Sign in before funding a mission");
      return;
    }
    setBusy(true);
    const missionId = [...crypto.getRandomValues(new Uint8Array(16))]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    const { submitBy, reviewBy } = getMissionDeadlines();
    const location = MISSION_LOCATIONS.find((item) => item.name === locationName) ?? MISSION_LOCATIONS[0];
    try {
      const walletAddress = await (await import("@/lib/atlas-missions")).connectMissionWallet();
      const terms = JSON.stringify({
        title,
        description,
        location: location.name,
        isDemo,
        reward,
        submitBy: submitBy.toISOString(),
        reviewBy: reviewBy.toISOString(),
      });
      const termsHash = await digest(new TextEncoder().encode(terms));
      const { data: draft, error } = await supabase
        .from("missions")
        .insert({
          created_by: userId,
          mission_key: missionId,
          sponsor_wallet: walletAddress,
          reviewer_wallet: reviewer,
          program_address: ATLAS_PROGRAM_ID,
          title,
          description,
          is_demo: isDemo,
          category: "cleanup",
          neighborhood: location.name,
          latitude: location.latitude,
          longitude: location.longitude,
          reward_lamports: Math.round(Number(reward) * 1e9),
          submit_by: submitBy.toISOString(),
          review_by: reviewBy.toISOString(),
          terms_hash: termsHash,
        })
        .select("id")
        .single();
      if (error || !draft) throw error ?? new Error("Mission draft could not be saved");
      const result = await createFundedMission({
        missionId,
        reviewerWallet: reviewer,
        rewardSol: reward,
        submitBy: Math.floor(submitBy.getTime() / 1000),
        reviewBy: Math.floor(reviewBy.getTime() / 1000),
        terms,
      });
      const { error: publishError } = await supabase
        .from("missions")
        .update({ mission_address: result.missionAddress, terms_hash: result.termsHash })
        .eq("id", draft.id);
      if (publishError)
        throw new Error(
          "Mission was funded on-chain, but its catalog entry needs repair. Transaction: " +
            result.signature,
        );
      toast.success("Mission funded and published");
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Funding failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      aria-labelledby="fund-title"
      className="mission-dialog"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary">New field mission</p>
            <h2 id="fund-title" className="mt-1 text-xl font-bold">
              Fund a local cleanup
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {!userId && (
          <p className="mb-3 rounded-lg bg-amber-400/10 p-3 text-xs text-amber-800">
            Sign in before creating and funding a mission.
          </p>
        )}
        <div className="space-y-3">
          <Field label="Mission title">
            <input
              required
              minLength={4}
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
          <Field label="What counts as complete?">
            <textarea
              required
              minLength={10}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Houston area">
              <select
                required
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                {MISSION_LOCATIONS.map((location) => (
                  <option key={location.name} value={location.name}>{location.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Reward in SOL">
              <input
                required
                type="number"
                min="0.000000001"
                max="1"
                step="0.000000001"
                inputMode="decimal"
                value={reward}
                onChange={(e) => setReward(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
          </div>
          <Field label="Independent reviewer wallet">
            <input
              required
              minLength={32}
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value.trim())}
              placeholder="Base58 public key"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Funding opens a 72-hour submission window and a 24-hour review window after submissions
            close. The reviewer must be different from the sponsor and participant.
          </p>
          <label className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
            <input
              type="checkbox"
              checked={isDemo}
              onChange={(event) => setIsDemo(event.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span>
              <strong className="text-foreground">Devnet demo example.</strong> This mission uses
              sample details and must not be presented as verified real-world environmental work.
            </span>
          </label>
          <button
            disabled={busy || !userId}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Fund {reward} SOL in escrow
          </button>
        </div>
      </form>
    </dialog>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
async function digest(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer))]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
