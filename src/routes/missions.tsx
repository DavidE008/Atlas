import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  ArrowUpRight,
  Compass,
  Crosshair,
  ExternalLink,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
  Wallet,
  Wind,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ATLAS_ADMIN_WALLET } from "@/lib/reviewer-admin-message";
import * as exifr from "exifr";
import { supabase } from "@/integrations/supabase/client";
import { MissionMap, type MapCoordinate } from "@/components/MissionMap";
import {
  getMissionDeadlines,
  getMissionDisplayStatus,
  MISSION_LOCATIONS,
} from "@/lib/mission-demo";
import {
  ATLAS_PROGRAM_ID,
  acceptMissionReview,
  appealMission,
  claimMission,
  createFundedMission,
  isAtlasProgramDeployed,
  readMissionConfig,
  refundMission,
  initializeMissionConfig,
  renewMissionAssignmentAuthority,
  resolveEscalatedMission,
  resolveMission,
  submitMissionEvidence,
} from "@/lib/atlas-missions";
import { searchMapboxLocations, type MapboxLocationResult } from "@/lib/mapbox-location";
import { readMissionStatuses } from "@/lib/mission-status.functions";
import {
  MISSION_CATEGORIES,
  missionCategoryColor,
  missionCategoryLabel,
  normalizeMissionCategory,
  type MissionCategory,
} from "@/lib/mission-categories";
import {
  advanceMissionReview,
  enrollAsReviewer,
  getServerAssignmentAddress,
  listMyReviewAssignments,
  markMissionReviewAccepted,
  recordFallbackDecision,
  recordMissionAppeal,
  recordMissionDecision,
} from "@/lib/mission-review.functions";

type Mission = {
  id: string;
  created_by: string;
  mission_key: string;
  sponsor_wallet: string;
  program_address: string;
  mission_address: string | null;
  terms_hash: string | null;
  title: string;
  description: string;
  is_demo: boolean;
  category: string;
  custom_category: string | null;
  category_color: string;
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
  reviewAssignment?: {
    reviewer_wallet: string;
    review_round: number;
    status: string;
    deadline: string;
    tx_signature: string | null;
  } | null;
  submission?: {
    user_id: string;
    participant_wallet: string;
    note: string;
    evidence_hash: string;
    photo_path: string | null;
    tx_signature: string;
  } | null;
};
type AtlasReviewConfig = Awaited<ReturnType<typeof readMissionConfig>>;
const CATEGORY_FILTERS = [
  { key: "all", label: "All missions" },
  { key: "environment", label: "Environment" },
  { key: "community", label: "Community" },
  { key: "other", label: "Other" },
] as const;

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
  const [assignmentLoadWarning, setAssignmentLoadWarning] = useState("");
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [category, setCategory] = useState<(typeof CATEGORY_FILTERS)[number]["key"]>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showReviewerJoin, setShowReviewerJoin] = useState(false);
  const [reviewerAlias, setReviewerAlias] = useState("");
  const [reviewerConflictAttested, setReviewerConflictAttested] = useState(false);
  const [reviewerEnrollmentStatus, setReviewerEnrollmentStatus] = useState<string | null>(null);
  const [reviewConfig, setReviewConfig] = useState<AtlasReviewConfig | null>(null);
  const [operatorSetupError, setOperatorSetupError] = useState("");
  const [assignmentAuthorityInput, setAssignmentAuthorityInput] = useState("");
  const [fallbackAuthorityInput, setFallbackAuthorityInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [programStatus, setProgramStatus] = useState("Checking");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const missionDetailsRef = useRef<HTMLElement>(null);
  const missionDetailsCardRef = useRef<HTMLDivElement>(null);

  const viewMission = (missionId: string) => {
    setSelectedId(missionId);
    requestAnimationFrame(() => {
      missionDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      const mission = missions.find((item) => item.id === missionId);
      const card = missionDetailsCardRef.current;
      if (!mission || !card || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      card.getAnimations().forEach((animation) => animation.cancel());
      const color = missionCategoryColor(mission.category, mission.category_color);
      card.animate(
        [
          {
            boxShadow: `0 0 0 0 color-mix(in srgb, ${color} 0%, transparent)`,
          },
          {
            boxShadow: `0 0 0 5px color-mix(in srgb, ${color} 28%, transparent), 0 12px 28px color-mix(in srgb, ${color} 14%, transparent)`,
          },
          {
            boxShadow: `0 0 0 0 color-mix(in srgb, ${color} 0%, transparent)`,
          },
        ],
        { duration: 850, easing: "ease-out" },
      );
    });
  };

  async function refresh() {
    setLoading(true);
    setLoadError("");
    setAssignmentLoadWarning("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      setUserId(auth.user?.id ?? null);
      try {
        const config = await readMissionConfig();
        setReviewConfig(config);
        if (config.configured) {
          setAssignmentAuthorityInput(config.assignmentAuthority ?? "");
          setFallbackAuthorityInput(config.fallbackAuthority ?? "");
        }
      } catch {
        setReviewConfig(null);
      }
      const { data, error } = await supabase
        .from("missions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      const rows = (data ?? []) as Mission[];
      let reviewerAssignments: Awaited<ReturnType<typeof listMyReviewAssignments>> = [];
      if (auth.user) {
        try {
          reviewerAssignments = await listMyReviewAssignments();
        } catch (error) {
          console.error("Could not load this account’s reviewer assignments", error);
          setAssignmentLoadWarning(
            "Your reviewer queue could not be loaded. Mission browsing and funding are still available.",
          );
        }
      }
      const assignmentsByMission = new Map(
        reviewerAssignments.map((assignment) => [assignment.mission_id, assignment]),
      );
      const chainRows = rows.filter((m) => m.mission_address);
      let chainStatuses: Awaited<ReturnType<typeof readMissionStatuses>> = [];
      try {
        chainStatuses = await readMissionStatuses({
          data: { addresses: chainRows.map((m) => m.mission_address!) },
        });
      } catch {
        toast.error("Devnet status could not be refreshed. Try Refresh chain again.");
      }
      const statusByAddress = new Map(chainStatuses.map((item) => [item.address, item.status]));
      const withStatus = chainRows.map((m) => ({
        ...m,
        chainStatus:
          statusByAddress.get(m.mission_address!) ?? m.settlement_status ?? "Unavailable",
      }));
      const byId = new Map(withStatus.map((m) => [m.id, m]));
      const complete = rows.map((m) => ({
        ...(byId.get(m.id) ?? m),
        reviewAssignment: assignmentsByMission.get(m.id) ?? null,
      }));
      const missionIds = complete.map((m) => m.id);
      const { data: submissionRows, error: submissionError } =
        missionIds.length && auth.user
          ? await supabase
              .from("mission_submissions")
              .select(
                "mission_id,user_id,participant_wallet,note,evidence_hash,photo_path,tx_signature",
              )
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

  const refreshProgramStatus = useCallback(async () => {
    setProgramStatus("Checking");
    try {
      setProgramStatus((await isAtlasProgramDeployed()) ? "Active" : "Unavailable");
    } catch {
      setProgramStatus("Unavailable");
    }
  }, []);

  useEffect(() => {
    void refresh().catch((error) =>
      toast.error(error instanceof Error ? error.message : "Could not load missions"),
    );
    void refreshProgramStatus();
  }, [refreshProgramStatus]);
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      setWallet(null);
      setUserId(null);
      setShowCreate(false);
      setNote("");
      setPhoto(null);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const filtered = useMemo(
    () =>
      missions.filter(
        (m) => category === "all" || normalizeMissionCategory(m.category) === category,
      ),
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
  const requireWalletAccount = async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      setUserId(data.user.id);
      return data.user.id;
    }
    setWallet(null);
    toast.info("Create an Atlas account or sign in before connecting a wallet.");
    void navigate({ to: "/auth", search: { mode: "signup" } });
    return null;
  };

  const connectWallet = async (authenticatedUserId?: string) => {
    const accountId = authenticatedUserId ?? (await requireWalletAccount());
    if (!accountId) return null;
    const publicKey = await (await import("@/lib/atlas-missions")).connectMissionWallet();
    setWallet(publicKey);
    return publicKey;
  };

  const doClaim = async () => {
    if (!selected) return;
    if (!(await requireWalletAccount())) return;
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
    if (!selected || !note.trim()) return;
    const authenticatedUserId = await requireWalletAccount();
    if (!authenticatedUserId) return;
    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      const participantWallet = await connectWallet(authenticatedUserId);
      if (!participantWallet) return;
      let photoDigest = "no-photo";
      if (photo) {
        if (
          photo.size > 10 * 1024 * 1024 ||
          !["image/jpeg", "image/png", "image/webp"].includes(photo.type)
        )
          throw new Error("Choose a JPG, PNG, or WebP photo under 10 MB.");
        const bytes = new Uint8Array(await photo.arrayBuffer());
        photoDigest = await digest(bytes);
        uploadedPath = `${authenticatedUserId}/${selected.id}/${crypto.randomUUID()}.${photo.name.split(".").pop() ?? "jpg"}`;
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
        user_id: authenticatedUserId,
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
      let assignmentMessage = "Atlas will assign an independent reviewer.";
      try {
        const assignment = await advanceMissionReview({ data: { missionId: selected.id } });
        if (assignment.status === "assigned")
          assignmentMessage = "An independent reviewer has been assigned.";
        else if (assignment.status === "waiting_for_review_pool")
          assignmentMessage =
            "Evidence is secured. Atlas will route it to the volunteer review pool.";
      } catch {
        assignmentMessage =
          "Evidence is secured. Atlas will assign a reviewer when the review service is available.";
      }
      setNote("");
      setPhoto(null);
      toast.success("Evidence submitted and hash committed on Solana", {
        description: assignmentMessage,
      });
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
    if (!(await requireWalletAccount())) return;
    setBusy(true);
    try {
      const result = await resolveMission({
        sponsorWallet: selected.sponsor_wallet,
        missionId: selected.mission_key,
        participantWallet: selected.submission.participant_wallet,
        approve,
      });
      await recordMissionDecision({
        data: { missionId: selected.id, approve, txSignature: result.signature },
      });
      toast.success(
        approve
          ? "Reward paid on Solana"
          : "Decision recorded. The participant has 24 hours to appeal.",
      );
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  };

  const doAcceptReview = async () => {
    if (!selected) return;
    if (!(await requireWalletAccount())) return;
    setBusy(true);
    try {
      await acceptMissionReview({
        sponsorWallet: selected.sponsor_wallet,
        missionId: selected.mission_key,
      });
      await markMissionReviewAccepted({ data: { missionId: selected.id } });
      toast.success("You accepted this anonymous Atlas review assignment.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not accept review assignment");
    } finally {
      setBusy(false);
    }
  };

  const doAppeal = async () => {
    if (!selected) return;
    if (!(await requireWalletAccount())) return;
    setBusy(true);
    try {
      const result = await appealMission({
        sponsorWallet: selected.sponsor_wallet,
        missionId: selected.mission_key,
      });
      await recordMissionAppeal({
        data: { missionId: selected.id, txSignature: result.signature },
      });
      let assignmentDescription = "A different reviewer will make the final decision.";
      try {
        const assignment = await advanceMissionReview({ data: { missionId: selected.id } });
        if (assignment.status === "assigned")
          assignmentDescription = "A different independent reviewer has been assigned.";
        else if (assignment.status === "waiting_for_review_pool")
          assignmentDescription =
            "Your appeal is recorded. Atlas is waiting for an eligible different reviewer.";
        else if (assignment.status === "escalated")
          assignmentDescription =
            "No eligible backup reviewer was available. This case was escalated to Atlas fallback review.";
      } catch {
        assignmentDescription =
          "Your appeal is recorded. Use Check backup reviewer if assignment does not appear.";
      }
      toast.success("Appeal submitted", { description: assignmentDescription });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit appeal");
    } finally {
      setBusy(false);
    }
  };

  const doFallbackResolve = async (approve: boolean) => {
    if (!selected?.submission) return;
    if (!(await requireWalletAccount())) return;
    setBusy(true);
    try {
      const result = await resolveEscalatedMission({
        sponsorWallet: selected.sponsor_wallet,
        missionId: selected.mission_key,
        participantWallet: selected.submission.participant_wallet,
        approve,
      });
      await recordFallbackDecision({
        data: { missionId: selected.id, approve, txSignature: result.signature },
      });
      toast.success(
        approve
          ? "Atlas fallback review paid the reward."
          : "Atlas fallback review returned the escrow.",
      );
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fallback decision failed");
    } finally {
      setBusy(false);
    }
  };

  const doAdvanceReview = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await advanceMissionReview({ data: { missionId: selected.id } });
      toast.info(
        result.status === "escalated"
          ? "This case has been escalated to Atlas fallback review."
          : result.status === "assigned"
            ? "An independent reviewer is assigned."
            : result.status === "waiting_for_review_pool"
              ? "Waiting for the approved reviewer pool."
              : "Review status checked.",
      );
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update review assignment");
    } finally {
      setBusy(false);
    }
  };

  const doJoinReviewerPool = async () => {
    if (!(await requireWalletAccount())) return;
    if (!reviewerConflictAttested) {
      toast.error("Confirm the conflict attestation first.");
      return;
    }
    setBusy(true);
    try {
      const reviewerWallet = await connectWallet();
      if (!reviewerWallet) return;
      const result = await enrollAsReviewer({
        data: {
          walletAddress: reviewerWallet,
          pseudonym: reviewerAlias.trim() || "Atlas volunteer",
          conflictAttested: true,
        },
      });
      setReviewerEnrollmentStatus(result.status);
      setShowReviewerJoin(false);
      toast.success(
        "Reviewer request sent. Atlas will review your wallet and conflict attestation.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not join reviewer pool");
    } finally {
      setBusy(false);
    }
  };

  const doVerifyOperatorSetup = async () => {
    setBusy(true);
    setOperatorSetupError("");
    try {
      const address = await connectWallet();
      if (!address) return;
      const config = await readMissionConfig();
      setReviewConfig(config);
      if (config.upgradeAuthority !== address) {
        throw new Error(
          "Connect the program authority wallet ending in 4Q5G3 to configure Atlas reviews.",
        );
      }
      if (config.configured) {
        setAssignmentAuthorityInput(config.assignmentAuthority ?? "");
        setFallbackAuthorityInput(config.fallbackAuthority ?? "");
      }
      toast.success("Program authority verified. Atlas review controls are available below.");
    } catch (e) {
      setOperatorSetupError(
        e instanceof Error ? e.message : "Could not load program authority. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const doLoadServerAssignmentAddress = async () => {
    setBusy(true);
    try {
      const { publicAddress } = await getServerAssignmentAddress();
      setAssignmentAuthorityInput(publicAddress);
      toast.success(
        "Server public address loaded. Renew the assignment key to authorize it on Solana.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load server assignment address");
    } finally {
      setBusy(false);
    }
  };

  const doConfigureReviewKeys = async () => {
    if (!(await requireWalletAccount())) return;
    if (!assignmentAuthorityInput.trim()) {
      toast.error("Enter the restricted assignment wallet’s public address.");
      return;
    }
    if (!reviewConfig?.configured && !fallbackAuthorityInput.trim()) {
      toast.error("Enter a separate Atlas fallback wallet address.");
      return;
    }
    setBusy(true);
    try {
      const { publicAddress } = await getServerAssignmentAddress();
      if (assignmentAuthorityInput.trim() !== publicAddress) {
        setAssignmentAuthorityInput(publicAddress);
        toast.error(
          "The address differed from the server key. The correct address is now loaded; review it and try again.",
        );
        return;
      }
      const expiresAt = Math.floor(Date.now() / 1000) + 6 * 24 * 60 * 60;
      if (reviewConfig?.configured) {
        await renewMissionAssignmentAuthority({
          assignmentAuthority: assignmentAuthorityInput.trim(),
          assignmentExpiresAt: expiresAt,
        });
      } else {
        await initializeMissionConfig({
          assignmentAuthority: assignmentAuthorityInput.trim(),
          fallbackAuthority: fallbackAuthorityInput.trim(),
          assignmentExpiresAt: expiresAt,
        });
      }
      setReviewConfig(await readMissionConfig());
      toast.success("Atlas reviewer controls are configured on Devnet.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not configure reviewer controls");
    } finally {
      setBusy(false);
    }
  };

  const doRefund = async () => {
    if (!selected) return;
    if (!(await requireWalletAccount())) return;
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
            Find a local mission, see its reward held in escrow, and follow the work from claim
            through review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                const address = await connectWallet();
                if (!address) return;
                toast.success("Connected " + address.slice(0, 4) + "…" + address.slice(-4));
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Wallet connection failed");
              }
            }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:border-primary/50"
          >
            <Wallet className="h-4 w-4 text-primary" />{" "}
            {wallet
              ? wallet.slice(0, 4) + "…" + wallet.slice(-4)
              : userId
                ? "Connect wallet"
                : "Sign in to connect"}
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
          {userId && (
            <button
              onClick={() => setShowReviewerJoin((value) => !value)}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:border-primary/50"
            >
              {reviewerEnrollmentStatus === "pending"
                ? "Reviewer request pending"
                : "Volunteer to review"}
            </button>
          )}
        </div>
      </div>

      {showReviewerJoin && userId && (
        <div className="mb-5 max-w-2xl rounded-2xl border border-primary/20 bg-card p-5">
          <h2 className="font-semibold">Join Atlas’s independent reviewer pool</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The reviewer pool is an invite-only pilot. Atlas may approve people the operator
            personally invited or already knows; approval is not a certification. Your identity and
            alias stay private in Atlas, while the assigned wallet is public on Solana.
          </p>
          <label className="mt-3 block text-xs font-medium text-muted-foreground">
            Private reviewer alias
            <input
              value={reviewerAlias}
              onChange={(event) => setReviewerAlias(event.target.value)}
              maxLength={40}
              placeholder="Optional alias, visible only to you and Atlas"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <input
              type="checkbox"
              checked={reviewerConflictAttested}
              onChange={(event) => setReviewerConflictAttested(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              I will decline cases where I have a personal, financial, or organizational conflict
              with the sponsor or participant.
            </span>
          </label>
          <button
            disabled={busy || !reviewerConflictAttested}
            onClick={() => void doJoinReviewerPool()}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Connect reviewer wallet and request approval
          </button>
        </div>
      )}

      {userId &&
        missions.some((mission) =>
          ["assigned", "accepted"].includes(mission.reviewAssignment?.status ?? ""),
        ) && (
          <section className="mb-5 rounded-2xl border border-primary/20 bg-card p-5">
            <h2 className="font-semibold">Your review assignments</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a mission below, then connect its assigned wallet to accept or decide the
              review.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {missions
                .filter((mission) =>
                  ["assigned", "accepted"].includes(mission.reviewAssignment?.status ?? ""),
                )
                .map((mission) => (
                  <button
                    key={mission.id}
                    type="button"
                    onClick={() => viewMission(mission.id)}
                    className="rounded-full border border-primary/25 px-4 py-2 text-sm font-medium text-primary"
                  >
                    {mission.title} ·{" "}
                    {mission.reviewAssignment?.status === "accepted"
                      ? "Ready for decision"
                      : "Awaiting acceptance"}
                  </button>
                ))}
            </div>
          </section>
        )}

      {userId &&
        (!wallet || wallet === ATLAS_ADMIN_WALLET || reviewConfig?.upgradeAuthority === wallet) && (
          <div className="mb-5 max-w-2xl rounded-2xl border border-amber-500/25 bg-amber-50/60 p-5 dark:bg-amber-950/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Atlas review controls · program authority</h2>
              <Link
                to="/admin/reviewers"
                className="rounded-full border border-primary/25 bg-background px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
              >
                Manage reviewer requests
              </Link>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void doVerifyOperatorSetup()}
              className="mt-3 rounded-lg border border-primary/25 bg-background px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50"
            >
              Verify program authority wallet
            </button>
            {operatorSetupError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {operatorSetupError}
              </p>
            )}
            {(!wallet || reviewConfig?.upgradeAuthority !== wallet) && (
              <p className="mt-3 text-sm text-muted-foreground">
                Operator setup requires the wallet ending in 4Q5G3. Verify it here to load the
                controls, even if you connected it on another page.
              </p>
            )}
            {wallet && reviewConfig?.upgradeAuthority === wallet && (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  This setup is available only to the wallet that can upgrade the Atlas program. The
                  assignment key expires in seven days at most and cannot accept reviews, decide
                  cases, or move escrow.
                </p>
                <label className="mt-3 block text-xs font-medium text-muted-foreground">
                  Restricted assignment wallet · public address
                  <input
                    value={assignmentAuthorityInput}
                    onChange={(event) => setAssignmentAuthorityInput(event.target.value)}
                    placeholder="Public address for the server assignment key"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void doLoadServerAssignmentAddress()}
                  className="mt-2 rounded-lg border border-primary/25 bg-background px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50"
                >
                  Load server assignment address
                </button>
                {!reviewConfig.configured && (
                  <label className="mt-3 block text-xs font-medium text-muted-foreground">
                    Separate Atlas fallback wallet · public address
                    <input
                      value={fallbackAuthorityInput}
                      onChange={(event) => setFallbackAuthorityInput(event.target.value)}
                      placeholder="Public address controlled by the Atlas operator"
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
                    />
                  </label>
                )}
                {reviewConfig.configured && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Fallback wallet:{" "}
                    <span className="font-mono">{reviewConfig.fallbackAuthority}</span> · assignment
                    key expires{" "}
                    {new Date((reviewConfig.assignmentExpiresAt ?? 0) * 1000).toLocaleString()}.
                  </p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Keep the assignment wallet’s secret only in Vercel as{" "}
                  <code>ATLAS_ASSIGNMENT_KEYPAIR</code>. Never paste or commit it. Set the
                  corresponding 64-byte JSON secret in Vercel before assignments can be signed.
                </p>
                <button
                  disabled={busy || !assignmentAuthorityInput.trim()}
                  onClick={() => void doConfigureReviewKeys()}
                  className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {reviewConfig.configured
                    ? "Renew assignment key · 6 days"
                    : "Initialize reviewer controls"}
                </button>
              </>
            )}
          </div>
        )}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric
          label="Open missions"
          value={loading ? "…" : loadError ? "Unavailable" : String(active)}
          icon={<Wind className="h-4 w-4" />}
        />
        <Metric
          label="Completed & paid"
          value={loading ? "…" : loadError ? "Unavailable" : String(paid)}
          icon={<SolanaMark className="h-4 w-5" />}
        />
        <Metric
          label="Program · Devnet"
          value={programStatus}
          icon={<SolanaMark className="h-4 w-5" />}
        />
      </div>

      {loadError && (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <span>Mission data could not be loaded: {loadError}</span>
          <button
            type="button"
            onClick={() => void refresh().catch(() => {})}
            disabled={loading}
            className="font-semibold underline underline-offset-2 disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      )}
      {assignmentLoadWarning && !loadError && (
        <p
          role="status"
          className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {assignmentLoadWarning}
        </p>
      )}

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
              onClick={() => {
                void refresh().catch(() => {});
                void refreshProgramStatus();
              }}
              disabled={loading}
              className="text-xs text-primary hover:underline"
            >
              Refresh chain
            </button>
          </div>
          <div className="mission-field relative h-[360px] overflow-hidden">
            <MissionMap
              points={filtered.map((mission) => ({
                id: mission.id,
                label: mission.title,
                latitude: mission.latitude,
                longitude: mission.longitude,
                color: missionCategoryColor(mission.category, mission.category_color),
              }))}
              selectedId={selected?.id ?? null}
              onSelect={viewMission}
              className="absolute inset-0"
            />
            <div className="mission-map-location pointer-events-none absolute rounded-lg border border-white/70 bg-white/90 px-3 py-2 text-xs text-slate-700 shadow-sm">
              <Crosshair className="mr-1 inline h-3 w-3 text-primary" /> Houston, TX ·{" "}
              {loading ? "Loading" : loadError ? "Unavailable" : filtered.length + " missions"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border p-3">
            {CATEGORY_FILTERS.map((item) => (
              <button
                key={item.key}
                onClick={() => setCategory(item.key)}
                className={`rounded-full px-3 py-1.5 text-xs ${category === item.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 p-3 sm:grid-cols-2">
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => viewMission(m.id)}
                aria-current={selected?.id === m.id ? "true" : undefined}
                className={`mission-browse-card min-w-0 rounded-xl border p-4 text-left transition hover:border-primary/60 ${selected?.id === m.id ? "border-primary/60 bg-primary/5" : "border-border bg-background/40"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 basis-32 break-words text-[10px] uppercase tracking-[0.15em] text-primary">
                    {m.neighborhood}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
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
                <span
                  className="mission-category mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold"
                  style={
                    {
                      "--mission-category-color": missionCategoryColor(
                        m.category,
                        m.category_color,
                      ),
                    } as React.CSSProperties
                  }
                >
                  {missionCategoryLabel(m.category, m.custom_category)}
                </span>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {m.description}
                </p>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span>{(Number(m.reward_lamports) / 1e9).toFixed(3)} SOL reward</span>
                  <span className="inline-flex items-center gap-1 text-primary">
                    {selected?.id === m.id ? "Viewing details" : "View mission"}
                    <ArrowUpRight className="h-3 w-3" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside ref={missionDetailsRef} id="mission-details" className="space-y-4">
          {selected ? (
            <div
              ref={missionDetailsCardRef}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className="min-w-0 flex-1 basis-48 break-words text-xs uppercase tracking-[0.18em] text-primary">
                  {selected.neighborhood}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  {selected.is_demo && <DemoLabel />}
                  <StatusPill status={status} />
                </div>
              </div>
              <h2 className="mt-3 text-2xl font-bold">{selected.title}</h2>
              <span
                className="mission-category mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold"
                style={
                  {
                    "--mission-category-color": missionCategoryColor(
                      selected.category,
                      selected.category_color,
                    ),
                  } as React.CSSProperties
                }
              >
                {missionCategoryLabel(selected.category, selected.custom_category)}
              </span>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {selected.description}
              </p>
              {selected.is_demo && (
                <p className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
                  Devnet demonstration example. This record does not claim verified real-world
                  impact.
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
                  Review routing{" "}
                  <span className="float-right text-foreground">Atlas independent volunteers</span>
                </p>
                {selected.reviewAssignment && (
                  <p>
                    Your reviewer assignment{" "}
                    <span className="float-right text-foreground">
                      Round {selected.reviewAssignment.review_round + 1} ·{" "}
                      {selected.reviewAssignment.status}
                    </span>
                  </p>
                )}
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

              {selected.submission && (
                <section
                  className="mt-5 rounded-xl border border-border bg-background p-4"
                  aria-label="Participant submission"
                >
                  <h3 className="font-semibold">Participant submission</h3>
                  <p className="mt-3 text-xs font-medium text-muted-foreground">Evidence note</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                    {selected.submission.note || "No evidence note was provided."}
                  </p>
                  {selected.submission.photo_path ? (
                    <button
                      type="button"
                      onClick={() => void openEvidencePhoto()}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-primary hover:bg-secondary"
                    >
                      <ExternalLink className="h-4 w-4" /> View submitted photo · full size
                    </button>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">No photo attached.</p>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">
                    Compare this submission with the mission requirements above before making a
                    decision.
                  </p>
                </section>
              )}

              <div className="mt-5 space-y-2">
                {!selected.mission_address && selected.created_by === userId && (
                  <p className="rounded-lg bg-amber-400/10 p-3 text-xs text-amber-800">
                    Draft saved. Finish wallet funding to publish this mission.
                  </p>
                )}
                {["Funded", "Claimed"].includes(status) &&
                  selected.sponsor_wallet !== wallet &&
                  !selected.submission && (
                    <div className="space-y-3">
                      {status === "Funded" && (
                        <p className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground">
                          Start an evidence draft now, then claim the mission. Your note and photos
                          stay private until you submit the completed work for review.
                        </p>
                      )}
                      <label className="block space-y-1.5 text-sm">
                        <span className="block font-medium">
                          {status === "Funded" ? "Evidence note (draft)" : "Evidence note"}
                        </span>
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Describe what you completed and what the photos show"
                          rows={3}
                          className="mission-evidence-note block min-h-32 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm leading-relaxed"
                        />
                      </label>
                      <label className="block space-y-1.5 text-sm">
                        <span className="font-medium">
                          Photos {status === "Funded" ? "(draft)" : "for the reviewer"}
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                          className="w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-foreground"
                        />
                        {photo && (
                          <span className="block truncate text-xs text-muted-foreground">
                            Selected: {photo.name}
                          </span>
                        )}
                      </label>
                      {status === "Funded" ? (
                        <ActionButton busy={busy} onClick={doClaim}>
                          Claim mission
                        </ActionButton>
                      ) : (
                        <ActionButton busy={busy} onClick={doSubmit}>
                          Submit evidence on Solana
                        </ActionButton>
                      )}
                    </div>
                  )}
                {selected.reviewAssignment &&
                  ["assigned", "accepted"].includes(selected.reviewAssignment.status) &&
                  ["Submitted", "Appealed"].includes(status) &&
                  selected.reviewAssignment.reviewer_wallet !== wallet && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
                      <p>
                        This review is assigned to your account. Connect wallet{" "}
                        {selected.reviewAssignment.reviewer_wallet.slice(0, 5)}…
                        {selected.reviewAssignment.reviewer_wallet.slice(-5)} to continue.
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        className="mt-2 font-semibold text-primary underline disabled:opacity-50"
                        onClick={async () => {
                          try {
                            const address = await connectWallet();
                            if (address && address !== selected.reviewAssignment?.reviewer_wallet)
                              toast.error(
                                "Switch your wallet to the assigned reviewer account, then connect again.",
                              );
                          } catch (e) {
                            toast.error(
                              e instanceof Error ? e.message : "Could not connect reviewer wallet",
                            );
                          }
                        }}
                      >
                        Connect reviewer wallet
                      </button>
                    </div>
                  )}
                {selected.reviewAssignment?.reviewer_wallet === wallet &&
                  selected.reviewAssignment.status === "assigned" &&
                  ["Submitted", "Appealed"].includes(status) && (
                    <ActionButton busy={busy} onClick={() => void doAcceptReview()}>
                      Accept independent review
                    </ActionButton>
                  )}
                {selected.reviewAssignment?.reviewer_wallet === wallet &&
                  selected.reviewAssignment.status === "accepted" &&
                  ["Submitted", "Appealed"].includes(status) && (
                    <div className="grid grid-cols-2 gap-2">
                      <ActionButton busy={busy} onClick={() => void doResolve(true)}>
                        Approve & pay
                      </ActionButton>
                      <button
                        disabled={busy}
                        onClick={() => void doResolve(false)}
                        className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
                      >
                        {status === "Appealed" ? "Reject as final" : "Reject · appeal available"}
                      </button>
                    </div>
                  )}
                {["Submitted", "Appealed"].includes(status) &&
                  selected.submission &&
                  (selected.submission.user_id === userId || selected.created_by === userId) && (
                    <ActionButton busy={busy} onClick={() => void doAdvanceReview()}>
                      {status === "Appealed"
                        ? "Check backup reviewer assignment"
                        : "Check reviewer assignment"}
                    </ActionButton>
                  )}
                {status === "RejectedPendingAppeal" && selected.submission?.user_id === userId && (
                  <div className="space-y-2">
                    <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                      The reward remains escrowed. You have 24 hours from the decision to appeal
                      once.
                    </p>
                    <ActionButton busy={busy} onClick={() => void doAppeal()}>
                      Appeal for a second reviewer
                    </ActionButton>
                  </div>
                )}
                {status === "Escalated" && (
                  <div className="space-y-2">
                    <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                      Atlas fallback review. Only the separately configured operator wallet can
                      resolve this escalated case.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <ActionButton busy={busy} onClick={() => void doFallbackResolve(true)}>
                        Fallback approve
                      </ActionButton>
                      <button
                        disabled={busy}
                        onClick={() => void doFallbackResolve(false)}
                        className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
                      >
                        Fallback reject
                      </button>
                    </div>
                  </div>
                )}
                {["Funded", "Claimed", "Submitted"].includes(selected.chainStatus ?? "") &&
                  status === "Expired" && (
                    <ActionButton busy={busy} onClick={doRefund}>
                      Refund expired mission
                    </ActionButton>
                  )}
                {selected.submission && (
                  <a
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-primary"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://explorer.solana.com/tx/${selected.submission.tx_signature}?cluster=devnet`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View submission transaction
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
                    <SolanaMark className="mr-2 inline h-4 w-5 align-[-3px]" /> Reviewed and paid on
                    Solana
                  </p>
                )}
                {status === "Unavailable" && (
                  <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                    Devnet status could not be read. Use Refresh chain to retry; this does not mean
                    the mission transaction failed.
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
              <SolanaMark className="h-4 w-5" /> Trust model
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Solana locks the reward and enforces who may claim, submit, and review. A person still
              reviews the work. The evidence hash protects the submitted record; it does not prove
              the task was completed in the physical world.
            </p>
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
            Devnet prototype. Atlas escrow runs on Solana Devnet; mission details and photos stay in
            Supabase.
          </p>
        </aside>
      </div>
      {showCreate && (
        <CreateMission
          userId={userId}
          onClose={() => setShowCreate(false)}
          requireAccount={requireWalletAccount}
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

function SolanaMark({ className = "" }: { className?: string }) {
  return (
    <img
      src="/solana-logo-mark.svg"
      alt=""
      aria-hidden="true"
      className={`inline-block shrink-0 object-contain ${className}`}
    />
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
  requireAccount,
  onClose,
  onCreated,
}: {
  userId: string | null;
  requireAccount: () => Promise<string | null>;
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
  const [location, setLocation] = useState<MapCoordinate>({
    latitude: MISSION_LOCATIONS[0].latitude,
    longitude: MISSION_LOCATIONS[0].longitude,
  });
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<MapboxLocationResult[]>([]);
  const [locationPhotoName, setLocationPhotoName] = useState("");
  const [locationSearchBusy, setLocationSearchBusy] = useState(false);
  const [locationSourceNote, setLocationSourceNote] = useState("");
  const [missionCategory, setMissionCategory] = useState<MissionCategory>("environment");
  const [reward, setReward] = useState("0.05");
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const findLocation = async () => {
    setLocationSearchBusy(true);
    try {
      const results = await searchMapboxLocations(locationQuery);
      setLocationResults(results);
      if (results.length === 0) toast.info("No matching addresses found.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Address search failed");
    } finally {
      setLocationSearchBusy(false);
    }
  };
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("This browser does not support location access.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setLocationName("Current location");
        setLocationSourceNote("Pin placed from this device’s location.");
      },
      () => toast.error("Location access was unavailable. You can still search or move the pin."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };
  const handlePhotoLocation = async (file: File | undefined) => {
    if (!file) return;
    setLocationPhotoName(file.name);
    setLocationSourceNote("");
    try {
      const gps = await exifr.gps(file);
      if (!gps || !Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude)) {
        setLocationSourceNote(
          "No GPS data was found in this photo. Search or place the pin on the map.",
        );
        return;
      }
      setLocation({ latitude: gps.latitude, longitude: gps.longitude });
      setLocationName("Photo location");
      setLocationSourceNote(
        "Pin placed from the photo’s embedded GPS. The photo stays on this device.",
      );
    } catch {
      setLocationSourceNote(
        "This photo’s GPS data could not be read. Search or place the pin on the map.",
      );
    }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const authenticatedUserId = await requireAccount();
    if (!authenticatedUserId) return;
    setBusy(true);
    const missionId = [...crypto.getRandomValues(new Uint8Array(16))]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    const { submitBy, reviewBy } = getMissionDeadlines();
    const categoryColor = missionCategoryColor(missionCategory);
    try {
      const walletAddress = await (await import("@/lib/atlas-missions")).connectMissionWallet();
      const terms = JSON.stringify({
        title,
        description,
        category: missionCategory,
        customCategory: null,
        categoryColor,
        location: locationName,
        latitude: location.latitude,
        longitude: location.longitude,
        isDemo,
        reward,
        submitBy: submitBy.toISOString(),
        reviewBy: reviewBy.toISOString(),
      });
      const termsHash = await digest(new TextEncoder().encode(terms));
      const { data: draft, error } = await supabase
        .from("missions")
        .insert({
          created_by: authenticatedUserId,
          mission_key: missionId,
          sponsor_wallet: walletAddress,
          program_address: ATLAS_PROGRAM_ID,
          title,
          description,
          is_demo: isDemo,
          category: missionCategory,
          custom_category: null,
          category_color: categoryColor,
          neighborhood: locationName,
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
        rewardSol: reward,
        submitBy: Math.floor(submitBy.getTime() / 1000),
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
              Fund a local mission
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
          <Field label="Mission category">
            <select
              value={missionCategory}
              onChange={(event) => setMissionCategory(event.target.value as MissionCategory)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {MISSION_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {missionCategoryLabel(item)}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Find the exact location">
              <div className="flex gap-2">
                <input
                  value={locationQuery}
                  onChange={(event) => setLocationQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void findLocation();
                    }
                  }}
                  placeholder="Search an address or place in Houston"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => void findLocation()}
                  disabled={locationSearchBusy || locationQuery.trim().length < 3}
                  className="rounded-lg border border-border px-3 text-sm font-medium hover:border-primary/50 disabled:opacity-50"
                >
                  {locationSearchBusy ? "Searching…" : "Search"}
                </button>
              </div>
              {locationResults.length > 0 && (
                <div className="mt-2 overflow-hidden rounded-lg border border-border bg-background">
                  {locationResults.map((result) => (
                    <button
                      type="button"
                      key={`${result.label}-${result.latitude}-${result.longitude}`}
                      onClick={() => {
                        setLocation({ latitude: result.latitude, longitude: result.longitude });
                        setLocationName(result.label);
                        setLocationResults([]);
                        setLocationSourceNote(
                          "Address pinned. Drag the marker or click the map to fine-tune it.",
                        );
                      }}
                      className="block w-full border-b border-border px-3 py-2 text-left text-xs last:border-b-0 hover:bg-primary/5"
                    >
                      {result.label}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Field label="Displayed location">
                <input
                  required
                  maxLength={160}
                  value={locationName}
                  onChange={(event) => setLocationName(event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
              <button
                type="button"
                onClick={useCurrentLocation}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:border-primary/50"
              >
                <Crosshair className="h-4 w-4" /> My location
              </button>
              <label className="mt-5 inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:border-primary/50">
                <MapPin className="h-4 w-4" /> Photo GPS
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => void handlePhotoLocation(event.currentTarget.files?.[0])}
                />
              </label>
            </div>
            <MissionMap
              pickable
              location={location}
              onLocationChange={(coordinate) => {
                setLocation(coordinate);
                setLocationSourceNote("Pin moved. Click or drag the marker to place it precisely.");
              }}
              className="h-56 overflow-hidden rounded-xl border border-border"
            />
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>Click the map or drag the pin to set the exact spot.</span>
              <span>
                {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
              </span>
              {locationPhotoName && <span>Photo checked: {locationPhotoName}</span>}
              {locationSourceNote && <span className="basis-full">{locationSourceNote}</span>}
            </div>
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
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Funding opens a 72-hour submission window. Atlas assigns an independent volunteer after
            evidence is submitted. Each review stage receives 24 hours; a rejection can be appealed
            once for a different final reviewer. Appeals and fallback review keep the reward
            escrowed.
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
              sample details and must not be presented as verified real-world impact.
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
