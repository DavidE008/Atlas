export type MissionCategory = "environment" | "community" | "other";

export const MISSION_CATEGORIES: readonly MissionCategory[] = ["environment", "community", "other"];

export const CATEGORY_COLORS: Record<MissionCategory, string> = {
  environment: "#2B7453",
  community: "#2F6B8A",
  other: "#805DAA",
};

export const SPONSOR_CATEGORY_COLORS = [
  { name: "Forest", value: "#45735B" },
  { name: "River", value: "#367A9A" },
  { name: "Clay", value: "#C16A45" },
  { name: "Iris", value: "#805DAA" },
  { name: "Berry", value: "#B14A68" },
  { name: "Amber", value: "#A87C27" },
] as const;

export function normalizeMissionCategory(value: string): MissionCategory {
  if (value === "cleanup") return "environment";
  return MISSION_CATEGORIES.includes(value as MissionCategory)
    ? (value as MissionCategory)
    : "other";
}

export function missionCategoryLabel(category: string, customCategory?: string | null): string {
  const normalized = normalizeMissionCategory(category);
  if (normalized === "other") return customCategory?.trim() || "Other";
  return normalized === "environment" ? "Environment" : "Community";
}

export function missionCategoryColor(category: string, color?: string | null): string {
  const normalized = normalizeMissionCategory(category);
  return color && /^#[\da-fA-F]{6}$/.test(color) ? color : CATEGORY_COLORS[normalized];
}
