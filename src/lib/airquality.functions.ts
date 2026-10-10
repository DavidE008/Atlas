import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

function publicDb() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export type GridReading = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  aqi: number | null;
  category: string | null;
  dominantPollutant: string | null;
  pollutants: { code: string; displayName: string; concentration: number; units: string }[];
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

async function lookupAirQuality(
  lat: number,
  lng: number,
): Promise<Omit<GridReading, "id" | "name" | "latitude" | "longitude">> {
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  const GOOGLE_MAPS_API_KEY = process.env["GOOGLE_MAPS_API_KEY"];
  if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
    return { aqi: null, category: null, dominantPollutant: null, pollutants: [] };
  }
  try {
    const res = await fetch(`${GATEWAY_URL}/airquality/v1/currentConditions:lookup`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ location: { latitude: lat, longitude: lng } }),
    });
    if (!res.ok) {
      console.error(`Air quality lookup failed [${res.status}]: ${await res.text()}`);
      return { aqi: null, category: null, dominantPollutant: null, pollutants: [] };
    }
    const json = (await res.json()) as {
      indexes?: { code: string; aqi: number; category: string; dominantPollutant?: string }[];
      pollutants?: { code: string; displayName: string; concentration: { value: number; units: string } }[];
    };
    const uaqi =
      json.indexes?.find((i) => i.code === "uaqi") ?? json.indexes?.[0];
    return {
      aqi: uaqi?.aqi ?? null,
      category: uaqi?.category ?? null,
      dominantPollutant: uaqi?.dominantPollutant ?? null,
      pollutants: (json.pollutants ?? []).map((p) => ({
        code: p.code,
        displayName: p.displayName,
        concentration: p.concentration?.value ?? 0,
        units: p.concentration?.units ?? "",
      })),
    };
  } catch (e) {
    console.error("Air quality lookup error:", e);
    return { aqi: null, category: null, dominantPollutant: null, pollutants: [] };
  }
}

export const getAirQualityGrid = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ points: GridReading[]; fetchedAt: string }> => {
    const db = publicDb();
    const { data: points, error } = await db
      .from("aq_grid_points")
      .select("id, name, latitude, longitude")
      .order("name");
    if (error) throw new Error(error.message);

    // Bounded fan-out: one request per seeded grid point (16 max).
    const readings = await Promise.all(
      (points ?? []).map(async (p) => ({
        id: p.id,
        name: p.name,
        latitude: p.latitude,
        longitude: p.longitude,
        ...(await lookupAirQuality(p.latitude, p.longitude)),
      })),
    );
    return { points: readings, fetchedAt: new Date().toISOString() };
  },
);

export type ReportRow = {
  id: string;
  category: string;
  description: string;
  latitude: number;
  longitude: number;
  neighborhood: string | null;
  photo_path: string | null;
  status: string;
  created_at: string;
  author: string | null;
  verification: { tx_signature: string; wallet_address: string } | null;
};

export const listReports = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReportRow[]> => {
    const db = publicDb();
    const { data, error } = await db
      .from("reports")
      .select(
        "id, category, description, latitude, longitude, neighborhood, photo_path, status, created_at, profiles(display_name), report_verifications(tx_signature, wallet_address)",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => {
      const profile = r.profiles as { display_name: string | null } | null;
      const ver = (r.report_verifications as
        | { tx_signature: string; wallet_address: string }[]
        | null)?.[0];
      return {
        id: r.id,
        category: r.category,
        description: r.description,
        latitude: r.latitude,
        longitude: r.longitude,
        neighborhood: r.neighborhood,
        photo_path: r.photo_path,
        status: r.status,
        created_at: r.created_at,
        author: profile?.display_name ?? null,
        verification: ver ?? null,
      };
    });
  },
);

const submitSchema = z.object({
  category: z.enum(["smoke", "odor", "dust", "visible-pollution", "other"]),
  description: z.string().min(3).max(1000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  neighborhood: z.string().max(120).optional(),
  photoPath: z.string().max(300).optional(),
});

export const submitReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => submitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("reports")
      .insert({
        user_id: userId,
        category: data.category,
        description: data.description,
        latitude: data.latitude,
        longitude: data.longitude,
        neighborhood: data.neighborhood ?? null,
        photo_path: data.photoPath ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

const verifySchema = z.object({
  reportId: z.string().uuid(),
  txSignature: z.string().min(32).max(120),
  walletAddress: z.string().min(32).max(60),
});

export const recordVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => verifySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Only the report owner can attest their own report.
    const { data: report, error: readErr } = await supabase
      .from("reports")
      .select("id, user_id")
      .eq("id", data.reportId)
      .single();
    if (readErr || !report) throw new Error("Report not found");
    if (report.user_id !== userId) throw new Error("Forbidden");

    const { error } = await supabase.from("report_verifications").insert({
      report_id: data.reportId,
      tx_signature: data.txSignature,
      wallet_address: data.walletAddress,
    });
    if (error) throw new Error(error.message);

    const { error: updErr } = await supabase
      .from("reports")
      .update({ status: "verified" })
      .eq("id", data.reportId);
    if (updErr) throw new Error(updErr.message);
    return { ok: true };
  });
