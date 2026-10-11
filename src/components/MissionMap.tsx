import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap, Marker as MapboxMarker } from "mapbox-gl";

const HOUSTON: [number, number] = [-95.3698, 29.7604];
const ACCESS_TOKEN = import.meta.env["VITE_MAPBOX_ACCESS_TOKEN"];

export type MapCoordinate = { latitude: number; longitude: number };
export type MissionMapPoint = MapCoordinate & { id: string; label: string; color?: string };

export function MissionMap({
  points = [],
  selectedId,
  pickable = false,
  location,
  onSelect,
  onLocationChange,
  className = "",
}: {
  points?: MissionMapPoint[];
  selectedId?: string | null;
  pickable?: boolean;
  location?: MapCoordinate;
  onSelect?: (id: string) => void;
  onLocationChange?: (coordinate: MapCoordinate) => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const initialLocationRef = useRef(location);
  const pickMarkerRef = useRef<MapboxMarker | null>(null);
  const pointMarkersRef = useRef<MapboxMarker[]>([]);
  const onLocationChangeRef = useRef(onLocationChange);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
    onSelectRef.current = onSelect;
  }, [onLocationChange, onSelect]);

  useEffect(() => {
    let cancelled = false;
    if (!ACCESS_TOKEN) {
      setError("Mapbox access token is not configured.");
      return;
    }

    void import("mapbox-gl")
      .then(({ default: mapboxgl }) => {
        if (cancelled || !hostRef.current) return;
        mapboxgl.accessToken = ACCESS_TOKEN;
        const map = new mapboxgl.Map({
          container: hostRef.current,
          style: "mapbox://styles/mapbox/light-v11",
          center: initialLocationRef.current
            ? [initialLocationRef.current.longitude, initialLocationRef.current.latitude]
            : HOUSTON,
          zoom: initialLocationRef.current ? 15 : 10.5,
          attributionControl: true,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => {
          if (!cancelled) setReady(true);
        });
        map.on("error", (event) => {
          if (cancelled) return;
          const mapError = event.error as (Error & { status?: number }) | undefined;
          if (mapError?.status === 401 || mapError?.message?.includes("401")) {
            setError("Mapbox rejected this token. Check that it is active and current.");
          } else if (mapError?.status === 403 || mapError?.message?.includes("403")) {
            setError("Mapbox denied this request. Check token scopes and allowed website URLs.");
          }
        });
        if (pickable) {
          map.getCanvas().style.cursor = "crosshair";
          map.on("click", (event) => {
            onLocationChangeRef.current?.({
              latitude: event.lngLat.lat,
              longitude: event.lngLat.lng,
            });
          });
        }
        mapRef.current = map;
      })
      .catch(() => {
        if (!cancelled) setError("Mapbox could not load. Check your connection and refresh.");
      });

    return () => {
      cancelled = true;
      setReady(false);
      pickMarkerRef.current?.remove();
      pickMarkerRef.current = null;
      pointMarkersRef.current.forEach((marker) => marker.remove());
      pointMarkersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [pickable]);

  useEffect(() => {
    if (!ready || !mapRef.current || !location || !pickable) return;
    void import("mapbox-gl").then(({ default: mapboxgl }) => {
      const coordinate: [number, number] = [location.longitude, location.latitude];
      if (!pickMarkerRef.current) {
        pickMarkerRef.current = new mapboxgl.Marker({ color: "#155540", draggable: true })
          .setLngLat(coordinate)
          .addTo(mapRef.current!);
        pickMarkerRef.current.on("dragend", () => {
          const point = pickMarkerRef.current?.getLngLat();
          if (point) {
            onLocationChangeRef.current?.({ latitude: point.lat, longitude: point.lng });
          }
        });
      } else {
        pickMarkerRef.current.setLngLat(coordinate);
      }
      const map = mapRef.current;
      map?.flyTo({ center: coordinate, zoom: 16, essential: true });
    });
  }, [location, pickable, ready]);

  useEffect(() => {
    if (!ready || !mapRef.current || pickable) return;
    let disposed = false;
    void import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (disposed || !mapRef.current) return;
      pointMarkersRef.current.forEach((marker) => marker.remove());
      pointMarkersRef.current = points.map((point) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = `atlas-map-pin${point.id === selectedId ? " is-selected" : ""}`;
        if (point.color) element.style.setProperty("--mission-category-color", point.color);
        element.setAttribute("aria-label", `View mission: ${point.label}`);
        element.title = point.label;
        element.addEventListener("click", () => onSelectRef.current?.(point.id));
        return new mapboxgl.Marker({ element, anchor: "bottom" })
          .setLngLat([point.longitude, point.latitude])
          .addTo(mapRef.current!);
      });
    });
    return () => {
      disposed = true;
    };
  }, [points, pickable, ready, selectedId]);

  return (
    <div className={`atlas-map-shell ${className}`}>
      <div
        ref={hostRef}
        className="atlas-map-canvas"
        aria-label={pickable ? "Choose a mission location on the map" : "Houston mission map"}
      />
      {(!ready || error) && (
        <div className="atlas-map-state" role={error ? "alert" : "status"}>
          <span>{error ?? "Loading map…"}</span>
        </div>
      )}
    </div>
  );
}
