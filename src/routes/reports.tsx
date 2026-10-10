import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Camera,
  Crosshair,
  ExternalLink,
  Loader2,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

import { listReports, recordVerification, submitReport } from "@/lib/airquality.functions";
import { supabase } from "@/integrations/supabase/client";
import { attestReport, explorerUrl, isPhantomInstalled } from "@/lib/solana";

const reportsQuery = queryOptions({
  queryKey: ["reports"],
  queryFn: () => listReports(),
  staleTime: 30 * 1000,
});

export const Route = createFileRoute("/reports")({
  loader: ({ context }) => context.queryClient.ensureQueryData(reportsQuery),
  head: () => ({
    meta: [
      { title: "Community Reports — AirWatch Houston" },
      {
        name: "description",
        content:
          "Crowdsourced air-quality observations across Houston, with optional on-chain verification on Solana.",
      },
      { property: "og:title", content: "Community Reports — AirWatch Houston" },
      {
        property: "og:description",
        content:
          "Crowdsourced air-quality observations across Houston, with optional on-chain verification on Solana.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

const CATEGORIES = [
  { value: "smoke", label: "Smoke" },
  { value: "odor", label: "Chemical odor" },
  { value: "dust", label: "Dust / particulates" },
  { value: "visible-pollution", label: "Visible pollution" },
  { value: "other", label: "Other" },
] as const;

function ReportsPage() {
  const { data: reports } = useSuspenseQuery(reportsQuery);
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Community Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Crowdsourced air-quality observations. Verify your own report on Solana
          devnet to create a tamper-proof public record.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          {userId ? (
            <ReportForm
              userId={userId}
              onSubmitted={() => queryClient.invalidateQueries({ queryKey: ["reports"] })}
            />
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Sign in to submit an observation and record it on-chain.
              </p>
              <Link
                to="/auth"
                className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Sign in to report
              </Link>
            </div>
          )}
        </div>

        <div className="space-y-3 lg:col-span-2">
          {reports.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No reports yet — be the first to log an observation.
            </div>
          )}
          {reports.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              isOwner={r.status !== "verified" && userId != null && r.author != null}
              ownerId={userId}
              onVerified={() => queryClient.invalidateQueries({ queryKey: ["reports"] })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportForm({
  userId,
  onSubmitted,
}: {
  userId: string;
  onSubmitted: () => void;
}) {
  const submit = useServerFn(submitReport);
  const [category, setCategory] = useState<string>("smoke");
  const [description, setDescription] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const useMyLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => toast.error("Could not get your location"),
      { enableHighAccuracy: true },
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coords) {
      toast.error("Set a location first");
      return;
    }
    setBusy(true);
    try {
      let photoPath: string | undefined;
      if (photo) {
        const ext = photo.name.split(".").pop() ?? "jpg";
        photoPath = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("report-photos")
          .upload(photoPath, photo);
        if (upErr) throw upErr;
      }
      await submit({
        data: {
          category: category as "smoke" | "odor" | "dust" | "visible-pollution" | "other",
          description,
          latitude: coords.lat,
          longitude: coords.lng,
          neighborhood: neighborhood || undefined,
          photoPath,
        },
      });
      toast.success("Report submitted");
      setDescription("");
      setNeighborhood("");
      setPhoto(null);
      onSubmitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-border bg-card p-5"
    >
      <h2 className="font-display text-lg font-semibold">Log an observation</h2>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Category
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          What did you observe?
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          minLength={3}
          rows={3}
          placeholder="e.g. Strong chemical smell near the Ship Channel…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Neighborhood (optional)
        </label>
        <input
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
          placeholder="e.g. Third Ward"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={useMyLocation}
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
        >
          <Crosshair className="h-4 w-4" />
          {coords ? "Location set" : "Use my location"}
        </button>
        {coords && (
          <span className="font-mono text-xs text-muted-foreground">
            {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
          </span>
        )}
      </div>

      <div>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-input px-3 py-2 text-sm text-muted-foreground hover:bg-accent">
          <Camera className="h-4 w-4" />
          {photo ? photo.name : "Attach a photo (optional)"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit report"}
      </button>
    </form>
  );
}

function ReportCard({
  report,
  isOwner,
  ownerId,
  onVerified,
}: {
  report: {
    id: string;
    category: string;
    description: string;
    neighborhood: string | null;
    status: string;
    created_at: string;
    author: string | null;
    photo_path: string | null;
    verification: { tx_signature: string; wallet_address: string } | null;
  };
  isOwner: boolean;
  ownerId: string | null;
  onVerified: () => void;
}) {
  const record = useServerFn(recordVerification);
  const [verifying, setVerifying] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!report.photo_path || !ownerId) return;
    supabase.storage
      .from("report-photos")
      .createSignedUrl(report.photo_path, 3600)
      .then(({ data }) => setPhotoUrl(data?.signedUrl ?? null));
  }, [report.photo_path, ownerId]);

  const handleVerify = async () => {
    if (!isPhantomInstalled()) {
      toast.error("Install the Phantom wallet extension to verify on-chain");
      return;
    }
    setVerifying(true);
    try {
      const { signature } = await attestReport({
        reportId: report.id,
        category: report.category,
        neighborhood: report.neighborhood,
      });
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sign in to record the verification");
      // attestReport connected the wallet; read address from signature flow
      const wallet = (window as unknown as { solana?: { publicKey?: { toBase58(): string } } })
        .solana?.publicKey?.toBase58();
      if (!wallet) throw new Error("Wallet disconnected");
      await record({
        data: { reportId: report.id, txSignature: signature, walletAddress: wallet },
      });
      toast.success("Report verified on Solana devnet");
      onVerified();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium capitalize">
              {report.category.replace("-", " ")}
            </span>
            {report.status === "verified" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
                <BadgeCheck className="h-3.5 w-3.5" /> Verified on-chain
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed">{report.description}</p>
        </div>
        {photoUrl && (
          <img
            src={photoUrl}
            alt="Report photo"
            className="h-16 w-16 rounded-md object-cover"
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {report.neighborhood && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {report.neighborhood}
          </span>
        )}
        {report.author && <span>by {report.author}</span>}
        <span>{new Date(report.created_at).toLocaleString()}</span>
      </div>

      {report.verification ? (
        <a
          href={explorerUrl(report.verification.tx_signature)}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View proof on Solana Explorer
        </a>
      ) : (
        isOwner && (
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {verifying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <BadgeCheck className="h-3.5 w-3.5" />
            )}
            Verify on Solana (devnet)
          </button>
        )
      )}
    </article>
  );
}
