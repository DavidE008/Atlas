import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, useState } from "react";
import { Activity, AlertTriangle, MapPin, RefreshCw } from "lucide-react";

import { getAirQualityGrid, listReports } from "@/lib/airquality.functions";
import { aqiBand } from "@/lib/aqi";

const AqiMap = lazy(() => import("@/components/AqiMap"));

const gridQuery = queryOptions({
  queryKey: ["aq-grid"],
  queryFn: () => getAirQualityGrid(),
  staleTime: 10 * 60 * 1000,
  refetchInterval: 10 * 60 * 1000,
});

const reportsQuery = queryOptions({
  queryKey: ["reports"],
  queryFn: () => listReports(),
  staleTime: 60 * 1000,
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(gridQuery);
    context.queryClient.ensureQueryData(reportsQuery);
  },
  head: () => ({
    meta: [
      { title: "AirWatch Houston — Live Air Quality Dashboard" },
      {
        name: "description",
        content:
          "Real-time air quality across Houston neighborhoods, with community-reported pollution observations verified on-chain.",
      },
      { property: "og:title", content: "AirWatch Houston — Live Air Quality Dashboard" },
      {
        property: "og:description",
        content:
          "Real-time air quality across Houston neighborhoods, with community-reported pollution observations verified on-chain.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: grid } = useSuspenseQuery(gridQuery);
  const { data: reports } = useSuspenseQuery(reportsQuery);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const withData = grid.points.filter((p) => p.aqi != null);
  const avgAqi = withData.length
    ? Math.round(withData.reduce((s, p) => s + (p.aqi ?? 0), 0) / withData.length)
    : null;
  const worst = withData.reduce(
    (max, p) => ((p.aqi ?? 0) > (max.aqi ?? 0) ? p : max),
    withData[0] ?? null,
  );
  const selected = grid.points.find((p) => p.id === selectedId) ?? worst;
  const selectedBand = aqiBand(selected?.aqi);
  const avgBand = aqiBand(avgAqi);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Summary strip */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4" /> City average AQI
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-display text-4xl font-bold" style={{ color: avgBand.hex }}>
              {avgAqi ?? "—"}
            </span>
            <span className="text-sm font-medium" style={{ color: avgBand.hex }}>
              {avgAqi != null ? avgBand.label : "No data"}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4" /> Worst neighborhood
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-display text-2xl font-semibold">
              {worst?.name ?? "—"}
            </span>
            {worst?.aqi != null && (
              <span
                className="text-sm font-medium"
                style={{ color: aqiBand(worst.aqi).hex }}
              >
                AQI {worst.aqi}
              </span>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4" /> Last updated
          </div>
          <div className="mt-2 font-display text-2xl font-semibold">
            {new Date(grid.fetchedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {reports.length} community reports · {reports.filter((r) => r.status === "verified").length} verified on-chain
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Map */}
        <div className="lg:col-span-2">
          <div className="h-[520px] overflow-hidden rounded-xl border border-border bg-card p-1">
            <ClientOnly
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading map…
                </div>
              }
            >
              <AqiMap
                points={grid.points}
                reports={reports}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
              />
            </ClientOnly>
          </div>
          {/* Legend */}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {(
              [
                ["Good", "#34d399"],
                ["Moderate", "#facc15"],
                ["USG", "#fb923c"],
                ["Unhealthy", "#f87171"],
                ["Very Unhealthy", "#c084fc"],
                ["Hazardous", "#9f1239"],
              ] as const
            ).map(([label, color]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="aqi-dot" style={{ backgroundColor: color }} />
                {label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="aqi-dot" style={{ backgroundColor: "#8fa3b8" }} />
              Community report
            </span>
          </div>
        </div>

        {/* Detail panel */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {selected?.name ?? "Select a location"}
            </div>
            {selected && (
              <>
                <div className="mt-3 flex items-baseline gap-3">
                  <span
                    className="font-display text-5xl font-bold"
                    style={{ color: selectedBand.hex }}
                  >
                    {selected.aqi ?? "—"}
                  </span>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: selectedBand.hex }}
                  >
                    {selectedBand.label}
                  </span>
                </div>
                {selected.dominantPollutant && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Dominant pollutant: {selected.dominantPollutant.toUpperCase()}
                  </p>
                )}
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {selectedBand.guidance}
                </p>
              </>
            )}
          </div>

          {selected && selected.pollutants.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold">Pollutant breakdown</h3>
              <div className="mt-3 space-y-2">
                {selected.pollutants.slice(0, 6).map((p) => (
                  <div
                    key={p.code}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">{p.displayName}</span>
                    <span className="font-mono text-xs">
                      {p.concentration.toFixed(1)} {p.units}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold">All neighborhoods</h3>
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
              {[...grid.points]
                .sort((a, b) => (b.aqi ?? -1) - (a.aqi ?? -1))
                .map((p) => {
                  const band = aqiBand(p.aqi);
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                        selected?.id === p.id ? "bg-accent" : ""
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="aqi-dot"
                          style={{ backgroundColor: band.hex }}
                        />
                        {p.name}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {p.aqi ?? "—"}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
