export const MISSION_LOCATIONS = [
  { name: "University of Houston", latitude: 29.7199, longitude: -95.3422 },
  { name: "Downtown", latitude: 29.7604, longitude: -95.3698 },
  { name: "Hermann Park", latitude: 29.7075, longitude: -95.3905 },
  { name: "Buffalo Bayou Park", latitude: 29.7633, longitude: -95.3875 },
  { name: "EaDo", latitude: 29.747, longitude: -95.343 },
  { name: "Third Ward", latitude: 29.7227, longitude: -95.3625 },
  { name: "Memorial Park", latitude: 29.765, longitude: -95.446 },
  { name: "Montrose", latitude: 29.741, longitude: -95.391 },
  { name: "Gulfton", latitude: 29.711, longitude: -95.497 },
  { name: "Midtown", latitude: 29.74, longitude: -95.372 },
] as const;

export const SUBMISSION_WINDOW_HOURS = 72;
export const REVIEW_WINDOW_HOURS = 24;
export const MAX_REVIEW_WINDOW_HOURS = 96;

export function getMissionDeadlines(now = new Date()) {
  const submitBy = new Date(now.getTime() + SUBMISSION_WINDOW_HOURS * 60 * 60 * 1000);
  const reviewBy = new Date(submitBy.getTime() + MAX_REVIEW_WINDOW_HOURS * 60 * 60 * 1000);
  return { submitBy, reviewBy };
}

export function getMissionDisplayStatus(
  status: string | null | undefined,
  submitBy: string,
  reviewBy: string,
  now = Date.now(),
) {
  const submitWindow = status === "Funded" || status === "Claimed";
  if (submitWindow && now > Date.parse(submitBy)) return "Expired";
  // Reviews can move through a backup, appeal, or operator escalation. The
  // deadline is advanced by the chain one 24-hour slot at a time.
  void reviewBy;
  return status ?? "Unavailable";
}
