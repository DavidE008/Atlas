export type MapboxLocationResult = {
  label: string;
  latitude: number;
  longitude: number;
};

type GeocodingResponse = {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: { full_address?: string; name?: string; place_formatted?: string };
  }>;
  message?: string;
};

export async function searchMapboxLocations(
  query: string,
  accessToken = import.meta.env["VITE_MAPBOX_ACCESS_TOKEN"] as string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<MapboxLocationResult[]> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 3) throw new Error("Enter at least three characters to search.");
  if (!accessToken) throw new Error("Address search needs a Mapbox access token.");

  const params = new URLSearchParams({
    q: trimmedQuery,
    access_token: accessToken,
    permanent: "true",
    limit: "5",
    country: "us",
    proximity: "-95.3698,29.7604",
  });
  const response = await fetcher(
    `https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`,
  );
  const result = (await response.json()) as GeocodingResponse;
  if (!response.ok) {
    throw new Error(result.message ?? "Mapbox could not search for that address.");
  }

  return (result.features ?? []).flatMap((feature) => {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) return [];
    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const properties = feature.properties;
    const label =
      properties?.full_address ??
      [properties?.name, properties?.place_formatted].filter(Boolean).join(", ");
    if (!label) return [];
    return [{ label, latitude, longitude }];
  });
}
