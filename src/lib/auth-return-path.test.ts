import { describe, expect, it } from "vitest";
import { getAuthReturnPath } from "@/lib/auth-return-path";

describe("auth return path", () => {
  it("returns an operator to reviewer operations after signing in", () => {
    expect(getAuthReturnPath("admin-reviewers")).toBe("/admin/reviewers");
  });

  it("uses the missions page for all other return targets", () => {
    expect(getAuthReturnPath(undefined)).toBe("/missions");
  });
});
