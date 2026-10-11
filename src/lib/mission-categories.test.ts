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

  it("keeps every Other mission under the shared label", () => {
    expect(missionCategoryLabel("other", "Waste Systems")).toBe("Other");
    expect(missionCategoryLabel("other")).toBe("Other");
  });

  it("uses one fixed color per category even for legacy custom colors", () => {
    expect(missionCategoryColor("other", "#C16A45")).toBe(CATEGORY_COLORS.other);
    expect(missionCategoryColor("community", "green")).toBe(CATEGORY_COLORS.community);
  });
});
