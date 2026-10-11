export const ATLAS_ADMIN_WALLET = "DPAkaGkBxuHJYr8rSd2QdQwTwLppykq1GZWPaxY4Q5G3";

export type ReviewerAdminAction = "list-pending-reviewers" | "approve-reviewer";

export function createReviewerAdminMessage(input: {
  action: ReviewerAdminAction;
  requestId?: string;
  trustedInviteConfirmed?: boolean;
  timestamp?: number;
  nonce?: string;
  wallet?: string;
}) {
  return [
    "Atlas reviewer operations authorization",
    `Action: ${input.action}`,
    `Wallet: ${input.wallet ?? ATLAS_ADMIN_WALLET}`,
    `Timestamp: ${input.timestamp ?? Date.now()}`,
    `Nonce: ${input.nonce ?? crypto.randomUUID()}`,
    `Request: ${input.requestId ?? "none"}`,
    ...(input.action === "approve-reviewer"
      ? [
          `Pilot trust confirmation: ${input.trustedInviteConfirmed === true ? "confirmed" : "missing"}`,
        ]
      : []),
  ].join("\n");
}
