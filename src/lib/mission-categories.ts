export type MissionCategory = "environment" | "community" | "other";

export const MISSION_CATEGORIES: readonly MissionCategory[] = ["environment", "community", "other"];

export const CATEGORY_COLORS: Record<MissionCategory, string> = {
  environment: "#2B7453",
  community: "#2F6B8A",
  other: "#805DAA",
};

export function normalizeMissionCategory(value: string): MissionCategory {
  if (value === "cleanup") return "environment";
  return MISSION_CATEGORIES.includes(value as MissionCategory)
    ? (value as MissionCategory)
    : "other";
}

export function missionCategoryLabel(category: string, _customCategory?: string | null): string {
  const normalized = normalizeMissionCategory(category);
  if (normalized === "other") return "Other";
  return normalized === "environment" ? "Environment" : "Community";
}

export function missionCategoryColor(category: string, _color?: string | null): string {
  const normalized = normalizeMissionCategory(category);
  return CATEGORY_COLORS[normalized];
}
