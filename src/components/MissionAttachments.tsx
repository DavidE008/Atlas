import { useEffect, useState } from "react";
import { Download, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { attachmentSize, MISSION_ATTACHMENT_BUCKET } from "@/lib/mission-attachments";
import type { Database } from "@/integrations/supabase/types";

type Attachment = Database["public"]["Tables"]["mission_attachments"]["Row"];

export function MissionAttachments({ missionId }: { missionId: string }) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFiles([]);
    setLoading(true);
    setError(false);
    void supabase
      .from("mission_attachments")
      .select("*")
      .eq("mission_id", missionId)
      .order("created_at")
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        setFiles(data ?? []);
        setError(Boolean(queryError));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [missionId, retry]);

  const download = async (file: Attachment) => {
    setDownloading(file.id);
    try {
      const { data, error: downloadError } = await supabase.storage
        .from(MISSION_ATTACHMENT_BUCKET)
        .download(file.storage_path);
      if (downloadError || !data) throw downloadError;
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.file_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error("Could not download this reference file. Please try again.");
    } finally {
      setDownloading(null);
    }
  };

  if (!loading && !error && !files.length) return null;
  return (
    <section
      className="mt-4 rounded-xl border border-border bg-background p-3"
      aria-label="Mission reference attachments"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Paperclip className="h-4 w-4" /> Mission references
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Sponsor-provided guidance for completing and reviewing this mission. These files are not
        completion evidence.
      </p>
      {loading && (
        <p role="status" className="mt-2 text-xs">
          Loading reference files…
        </p>
      )}
      {error && (
        <button
          type="button"
          className="mt-2 text-xs underline"
          onClick={() => setRetry((value) => value + 1)}
        >
          References could not load. Try again.
        </button>
      )}
      <ul className="mt-2 space-y-2">
        {files.map((file) => (
          <li key={file.id}>
            <button
              type="button"
              disabled={downloading !== null}
              onClick={() => void download(file)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition hover:border-primary/40 disabled:opacity-60"
            >
              {downloading === file.id ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Download className="h-4 w-4 shrink-0 text-primary" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block break-words text-xs font-medium">{file.file_name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {attachmentSize(file.size_bytes)} · Download reference
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
