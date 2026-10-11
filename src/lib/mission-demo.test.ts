import { describe, expect, it } from "vitest";
import {
  getMissionDeadlines,
  getMissionDisplayStatus,
  getMissionMapPosition,
  MISSION_LOCATIONS,
  REVIEW_WINDOW_HOURS,
  SUBMISSION_WINDOW_HOURS,
} from "./mission-demo";

describe("mission demo setup", () => {
  it("uses a 72-hour submission period and a 24-hour review period", () => {
    const now = new Date("2026-10-11T12:00:00.000Z");
    const { submitBy, reviewBy } = getMissionDeadlines(now);

    expect(submitBy.getTime() - now.getTime()).toBe(SUBMISSION_WINDOW_HOURS * 60 * 60 * 1000);
    expect(reviewBy.getTime() - submitBy.getTime()).toBe(REVIEW_WINDOW_HOURS * 60 * 60 * 1000);
  });

  it("places the curated Houston areas at distinct in-map positions", () => {
    const positions = MISSION_LOCATIONS.map(({ latitude, longitude }) =>
      getMissionMapPosition(latitude, longitude),
    );
    const distinct = new Set(positions.map(({ left, top }) => `${left.toFixed(2)}:${top.toFixed(2)}`));

    expect(distinct.size).toBe(MISSION_LOCATIONS.length);
    expect(positions.every(({ left, top }) => left >= 10 && left <= 90 && top >= 12 && top <= 88)).toBe(true);
  });

  it("expires open missions at submission and submitted missions at review deadlines", () => {
    const now = Date.parse("2026-10-11T12:00:00.000Z");
    const past = "2026-10-11T11:00:00.000Z";
    const future = "2026-10-12T12:00:00.000Z";

    expect(getMissionDisplayStatus("Funded", past, future, now)).toBe("Expired");
    expect(getMissionDisplayStatus("Submitted", future, past, now)).toBe("Expired");
    expect(getMissionDisplayStatus("Funded", future, future, now)).toBe("Funded");
    expect(getMissionDisplayStatus("Paid", past, past, now)).toBe("Paid");
  });
});
