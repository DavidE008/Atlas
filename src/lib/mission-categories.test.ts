import { describe, expect, it } from "vitest";
import {
  CATEGORY_COLORS,
  missionCategoryColor,
  missionCategoryLabel,
  normalizeMissionCategory,
} from "./mission-categories";

describe("mission category presentation", () => {
  it("keeps legacy cleanup missions under Environment", () => {
    expect(normalizeMissionCategory("cleanup")).toBe("environment");
    expect(missionCategoryLabel("cleanup")).toBe("Environment");
  });

  it("shows sponsor-defined labels for Other", () => {
    expect(missionCategoryLabel("other", "Waste Systems")).toBe("Waste Systems");
    expect(missionCategoryLabel("other")).toBe("Other");
  });

  it("accepts valid hex colors and falls back for invalid values", () => {
    expect(missionCategoryColor("other", "#C16A45")).toBe("#C16A45");
    expect(missionCategoryColor("community", "green")).toBe(CATEGORY_COLORS.community);
  });
});
