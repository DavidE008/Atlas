// Client-safe AQI helpers. Colors reference design-system tokens.

export type AqiBand = {
  key: "good" | "moderate" | "usg" | "unhealthy" | "very" | "hazardous";
  label: string;
  hex: string;
  guidance: string;
};

export function aqiBand(aqi: number | null | undefined): AqiBand {
  if (aqi == null || Number.isNaN(aqi)) {
    return {
      key: "good",
      label: "No data",
      hex: "#6b7280",
      guidance: "Air quality data is unavailable for this location right now.",
    };
  }
  if (aqi <= 50)
    return {
      key: "good",
      label: "Good",
      hex: "#34d399",
      guidance: "Air quality is satisfactory. Enjoy outdoor activities.",
    };
  if (aqi <= 100)
    return {
      key: "moderate",
      label: "Moderate",
      hex: "#facc15",
      guidance:
        "Acceptable for most. Unusually sensitive people should watch for symptoms.",
    };
  if (aqi <= 150)
    return {
      key: "usg",
      label: "Unhealthy for Sensitive Groups",
      hex: "#fb923c",
      guidance:
        "Children, older adults, and people with lung disease should reduce prolonged outdoor exertion.",
    };
  if (aqi <= 200)
    return {
      key: "unhealthy",
      label: "Unhealthy",
      hex: "#f87171",
      guidance:
        "Everyone may begin to experience health effects. Sensitive groups should avoid outdoor exertion.",
    };
  if (aqi <= 300)
    return {
      key: "very",
      label: "Very Unhealthy",
      hex: "#c084fc",
      guidance:
        "Health alert: risk of serious effects for everyone. Avoid outdoor activity.",
    };
  return {
    key: "hazardous",
    label: "Hazardous",
    hex: "#9f1239",
    guidance: "Emergency conditions. Stay indoors and keep windows closed.",
  };
}

export const AQI_BAND_ORDER = [
  "good",
  "moderate",
  "usg",
  "unhealthy",
  "very",
  "hazardous",
] as const;
