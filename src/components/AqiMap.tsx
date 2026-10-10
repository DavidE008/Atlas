// Browser-only Google Map. Load via <ClientOnly> + React.lazy from routes.
import { useEffect, useRef, useState } from "react";
import type { GridReading } from "@/lib/airquality.functions";
import type { ReportRow } from "@/lib/airquality.functions";
import { aqiBand } from "@/lib/aqi";

declare global {
  interface Window {
    __airwatchMapInit?: () => void;
    gm_authFailure?: () => void;
    google?: any;
  }
}

const DARK_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#1d2c3f" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8fa3b8" }] },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0e1626" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#2c3e54" }],
  },
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
];

let mapsPromise: Promise<void> | undefined;

function loadMapsApi(): Promise<void> {
  if (typeof window.google?.maps?.Map === "function") return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"];
    const channel = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"];
    if (!key) return reject(new Error("Google Maps browser key is not configured"));
    const timeout = window.setTimeout(() => fail("Google Maps took too long to load. Please refresh to try again."), 15000);
    function fail(message: string) {
      window.clearTimeout(timeout);
      reject(new Error(message));
    }
    window.gm_authFailure = () => fail("Google Maps could not authorize this website.");
    window.__airwatchMapInit = () => {
      window.clearTimeout(timeout);
      if (typeof window.google?.maps?.Map !== "function") {
        fail("Google Maps could not initialize.");
        return;
      }
      resolve();
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__airwatchMapInit&channel=${channel}`;
    script.async = true;
    script.onerror = () => fail("Google Maps could not load. Check your connection and refresh.");
    document.head.appendChild(script);
  });
  return mapsPromise;
}

export default function AqiMap({
  points,
  reports,
  selectedId,
  onSelect,
}: {
  points: GridReading[];
  reports: ReportRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMapsApi().then(() => {
      if (cancelled || !ref.current) return;
      mapRef.current = new window.google.maps.Map(ref.current, {
        center: { lat: 29.7604, lng: -95.42 },
        zoom: 10,
        styles: DARK_STYLES,
        clickableIcons: false,
        disableDefaultUI: true,
        zoomControl: true,
        backgroundColor: "#0e1626",
      });
      window.gm_authFailure = () => {
        if (!cancelled) setError("Google Maps could not authorize this website.");
      };
      setReady(true);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Google Maps is unavailable.");
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let markers: any[] = [];

    if (!ready || !mapRef.current) return;
      const map = mapRef.current;

      for (const p of points) {
        const band = aqiBand(p.aqi);
        const marker = new window.google.maps.Marker({
          map,
          position: { lat: p.latitude, lng: p.longitude },
          title: `${p.name} — AQI ${p.aqi ?? "n/a"}`,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: selectedId === p.id ? 14 : 10,
            fillColor: band.hex,
            fillOpacity: 0.95,
            strokeColor: "#0e1626",
            strokeWeight: 2,
          },
        });
        marker.addListener("click", () => onSelect(p.id));
        markers.push(marker);
      }

      for (const r of reports) {
        const marker = new window.google.maps.Marker({
          map,
          position: { lat: r.latitude, lng: r.longitude },
          title: `Report: ${r.category}`,
          icon: {
            path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            scale: 5,
            fillColor: r.status === "verified" ? "#34d399" : "#8fa3b8",
            fillOpacity: 0.9,
            strokeColor: "#0e1626",
            strokeWeight: 1,
          },
        });
        markers.push(marker);
      }

    return () => {
      cancelled = true;
      markers.forEach((m) => m.setMap(null));
    };
  }, [points, reports, selectedId, onSelect, ready]);

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full rounded-xl" aria-label="Houston air-quality map" />
      {(!ready || error) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card px-6 text-center" role={error ? "alert" : "status"}>
          <p className="text-sm font-semibold">{error ? "Houston map unavailable" : "Loading Houston map…"}</p>
          {error && <p className="max-w-sm text-sm text-muted-foreground">{error} Neighborhood readings are still available beside the map.</p>}
        </div>
      )}
    </div>
  );
}
