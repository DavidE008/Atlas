import { describe, expect, it, vi } from "vitest";
import { searchMapboxLocations } from "./mapbox-location";

describe("searchMapboxLocations", () => {
  it("requests permanent Houston results and returns display labels with coordinates", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            {
              geometry: { coordinates: [-95.3422, 29.7199] },
              properties: { full_address: "Houston, Texas" },
            },
          ],
        }),
      ),
    );

    await expect(
      searchMapboxLocations("University of Houston", "test-token", fetcher),
    ).resolves.toEqual([{ label: "Houston, Texas", latitude: 29.7199, longitude: -95.3422 }]);
    const [requestUrl] = fetcher.mock.calls[0] ?? [];
    const params = new URL(String(requestUrl)).searchParams;
    expect(params.get("permanent")).toBe("true");
    expect(params.get("country")).toBe("us");
    expect(params.get("proximity")).toBe("-95.3698,29.7604");
  });

  it("rejects short queries without making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(searchMapboxLocations("UH", "test-token", fetcher)).rejects.toThrow(
      "Enter at least three characters to search.",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns a useful message for a denied request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "Permanent geocoding is not enabled." }), {
        status: 403,
      }),
    );
    await expect(searchMapboxLocations("Hermann Park", "test-token", fetcher)).rejects.toThrow(
      "Permanent geocoding is not enabled.",
    );
  });
});
