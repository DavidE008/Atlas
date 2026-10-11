import { describe, expect, it } from "vitest";
import { profileCropRect } from "./profile-photo-crop-utils";

describe("profileCropRect", () => {
  it("centers a square crop within a landscape image", () => {
    expect(profileCropRect(1920, 1080, 1, { x: 0, y: 0 })).toEqual({
      x: 420,
      y: 0,
      size: 1080,
    });
  });

  it("moves and zooms the crop in source image coordinates", () => {
    const crop = profileCropRect(1920, 1080, 2, { x: 50, y: -25 });
    expect(crop.size).toBe(540);
    expect(crop.x).toBeCloseTo(605.625);
    expect(crop.y).toBeCloseTo(312.1875);
  });

  it("keeps the crop inside the source image", () => {
    expect(profileCropRect(640, 480, 1, { x: 1000, y: 1000 })).toEqual({
      x: 0,
      y: 0,
      size: 480,
    });
  });
});
